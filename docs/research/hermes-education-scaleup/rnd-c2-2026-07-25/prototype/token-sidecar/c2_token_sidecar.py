#!/usr/bin/env python3
"""Loopback-only ephemeral-token broker for the C2 Hermes WebUI extension."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODEL = "gemini-3.1-flash-live-preview"
RUN_IDS = frozenset({"RT1", "RT2", "RT3"})
TOKEN_PURPOSES = frozenset({"practice"})
TOKEN_URL = "https://generativelanguage.googleapis.com/v1alpha/auth_tokens"
KEY_NAMES = ("C2_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")
ENV_CANDIDATES = (
    Path("/home/hermeswebui/.hermes/.env"),
    Path("/home/hermeswebui/.hermes/profiles/default/.env"),
)
RESULTS_DIR = Path("/home/hermeswebui/.hermes/webui/c2-live-results")
_CACHED_API_KEY = ""


def _read_key() -> str:
    for name in KEY_NAMES:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    for path in ENV_CANDIDATES:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
            if not match or match.group(1) not in KEY_NAMES:
                continue
            value = match.group(2).strip().strip('"').strip("'")
            if value:
                return value
    return ""


def _get_key() -> str:
    """Return the startup-cached secret, falling back for unit tests/dev use."""
    return _CACHED_API_KEY or _read_key()


def _cache_key_then_drop_privileges(user: str = "hermeswebui") -> None:
    """Read the owner-only credential, then serve as the unprivileged WebUI user.

    Hermes intentionally stores provider keys in a mode-0600 .env file. The C2
    launcher starts as root only long enough to read that exact allowlist of
    files; the HTTP server itself never runs as root.
    """
    global _CACHED_API_KEY
    _CACHED_API_KEY = _read_key()
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        return
    import pwd

    account = pwd.getpwnam(user)
    os.initgroups(account.pw_name, account.pw_gid)
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)


def _create_token(api_key: str) -> dict:
    now = datetime.now(timezone.utc)
    payload = {
        "uses": 1,
        "expireTime": (now + timedelta(minutes=12)).isoformat().replace("+00:00", "Z"),
        "newSessionExpireTime": (now + timedelta(seconds=55)).isoformat().replace("+00:00", "Z"),
        # AuthToken now uses BidiGenerateContentSetup plus a field mask. Lock
        # only the model here; the browser still supplies the remaining Live
        # setup (transcription, voice, VAD and system instruction).
        "fieldMask": "model",
        "bidiGenerateContentSetup": {"model": f"models/{MODEL}"},
    }
    request = urllib.request.Request(
        TOKEN_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        result = json.loads(response.read())
    token = str(result.get("name") or "")
    if not token:
        raise RuntimeError("TOKEN_RESPONSE_MISSING_NAME")
    return {"token": token, "expiresInSeconds": 55, "model": MODEL}


def _result_from_query(query: dict) -> dict:
    run_id = query.get("run", [""])[0]
    if run_id not in RUN_IDS:
        raise ValueError("C2_RUN_NOT_PREREGISTERED")
    result = {
        "schema": 1,
        "id": run_id.lower(),
        "run": run_id,
        "mode": "realtime",
        "surface": "desktop_web" if run_id == "RT1" else "iphone_web",
        "scenario": {"RT1": "cafe", "RT2": "directions", "RT3": "plans"}[run_id],
        "durationSec": int(query.get("durationSec", [""])[0]),
        "turns": int(query.get("turns", [""])[0]),
        "breakdowns": int(query.get("breakdowns", [""])[0]),
        "transportIncidents": int(query.get("transportIncidents", [""])[0]),
        "actualCostUsd": None,
        "containsContent": False,
        "status": query.get("status", [""])[0],
    }
    if not (0 <= result["durationSec"] <= 600):
        raise ValueError("INVALID_DURATION")
    if any(result[field] < 0 for field in ("turns", "breakdowns", "transportIncidents")):
        raise ValueError("INVALID_COUNT")
    if result["status"] not in {"COMPLETE", "QUOTA_FALLBACK", "TRANSPORT_CLOSED"}:
        raise ValueError("INVALID_STATUS")
    return result


def _token_request_allowed(query: dict) -> bool:
    """Accept product practice while retaining old benchmark compatibility."""
    purpose = query.get("purpose", [""])[0]
    run_id = query.get("run", [""])[0]
    return purpose in TOKEN_PURPOSES or run_id in RUN_IDS


class Handler(BaseHTTPRequestHandler):
    server_version = "C2TokenSidecar/1"

    def log_message(self, _format: str, *_args) -> None:
        return

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/health":
            self._json(200, {"ok": True, "runtime": {"sidecar": "c2-live-token", "bridge": "ephemeral-token", "configured": bool(_get_key())}})
            return
        if parsed.path == "/result":
            query = urllib.parse.parse_qs(parsed.query)
            try:
                result = _result_from_query(query)
                RESULTS_DIR.mkdir(parents=True, exist_ok=True)
                target = RESULTS_DIR / f"{result['run'].lower()}.json"
                temporary = target.with_suffix(".json.tmp")
                temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                temporary.replace(target)
            except (OSError, TypeError, ValueError):
                self._json(400, {"error": "INVALID_CONTENT_FREE_RESULT"})
                return
            self._json(200, {"ok": True, "run": result["run"]})
            return
        if parsed.path != "/token":
            self._json(404, {"error": "NOT_FOUND"})
            return
        query = urllib.parse.parse_qs(parsed.query)
        if not _token_request_allowed(query):
            self._json(400, {"error": "C2_TOKEN_PURPOSE_NOT_ALLOWED"})
            return
        api_key = _get_key()
        if not api_key:
            self._json(503, {"error": "GEMINI_FREE_TIER_KEY_NOT_CONFIGURED"})
            return
        try:
            result = _create_token(api_key)
        except urllib.error.HTTPError as error:
            if error.code == 429:
                self._json(429, {"error": "FREE_TIER_QUOTA_EXHAUSTED", "fallback": "H2.6 async"})
            elif error.code == 400:
                self._json(502, {"error": "GEMINI_TOKEN_REQUEST_SCHEMA_REJECTED", "providerStatus": 400})
            elif error.code in {401, 403}:
                self._json(502, {"error": "GEMINI_KEY_NOT_AUTHORIZED_FOR_LIVE", "providerStatus": error.code})
            else:
                self._json(502, {"error": "GEMINI_TOKEN_SERVICE_REJECTED_REQUEST", "providerStatus": error.code})
            return
        except (OSError, ValueError, RuntimeError):
            self._json(502, {"error": "GEMINI_TOKEN_SERVICE_UNAVAILABLE"})
            return
        self._json(200, result)


def main() -> None:
    _cache_key_then_drop_privileges()
    server = ThreadingHTTPServer(("127.0.0.1", 18787), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
