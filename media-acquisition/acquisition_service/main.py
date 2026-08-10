"""Small first-party HTTP boundary for the isolated acquisition worker."""

from __future__ import annotations

import importlib.metadata
import json
import os
import re
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .jobs import JobError, JobRegistry, YtDlpBackend
from .planner import PlannerError, build_resolved_source, canonicalize_youtube_url
from .receipts import TokenError, verify_capability


MAX_JSON_BYTES = 64 * 1024
JOB_PATH = re.compile(r"^/v1/jobs/(rma_[a-f0-9]{32})(?:/(stream|device-receipt))?$")


def _tool_version(command: list[str]) -> str | None:
    try:
        out = subprocess.run(command, capture_output=True, text=True, timeout=5, check=True)
        return (out.stdout or out.stderr).splitlines()[0][:160]
    except Exception:
        return None


def runtime_report() -> dict[str, Any]:
    def package(name: str) -> str | None:
        try:
            return importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            return None
    return {
        "worker": "0.1.0",
        "yt_dlp": package("yt-dlp"),
        "yt_dlp_ejs": package("yt-dlp-ejs"),
        "deno": _tool_version(["deno", "--version"]),
        "ffmpeg": _tool_version(["ffmpeg", "-version"]),
    }


class WorkerApplication:
    def __init__(self, *, secret: str, allowed_origins: set[str], temp_root: str,
                 backend: Any | None = None):
        if len(str(secret)) < 32:
            raise RuntimeError("LP_MEDIA_SHARED_SECRET must contain at least 32 characters")
        if not allowed_origins:
            raise RuntimeError("LP_MEDIA_ALLOWED_ORIGINS must be an exact non-empty allowlist")
        self.secret = str(secret)
        self.allowed_origins = set(allowed_origins)
        self.backend = backend or YtDlpBackend()
        self.jobs = JobRegistry(secret=self.secret, root=temp_root, backend=self.backend, ttl_seconds=1800)
        self.runtime = runtime_report()
        self._rate_lock = threading.Lock()
        self._rate_events: dict[str, list[float]] = {}

    def authenticate(self, headers: Any, *, scope: str) -> dict[str, Any]:
        origin = str(headers.get("Origin") or "").rstrip("/")
        # Same-origin path routing does not consistently send Origin on GET/HEAD.
        # Only when it is absent, reconstruct the origin from the trusted reverse
        # proxy headers. An explicit hostile Origin is never replaced.
        if not origin:
            forwarded_proto = str(headers.get("X-Forwarded-Proto") or "").split(",", 1)[0].strip().lower()
            forwarded_host = str(headers.get("X-Forwarded-Host") or "").split(",", 1)[0].strip().lower()
            if forwarded_proto in {"http", "https"} and forwarded_host and not any(
                    char in forwarded_host for char in "/\\@#?"):
                origin = f"{forwarded_proto}://{forwarded_host}"
        if origin not in self.allowed_origins:
            raise TokenError("CAPABILITY_ORIGIN")
        authorization = str(headers.get("Authorization") or "")
        if not authorization.startswith("Bearer "):
            raise TokenError("CAPABILITY_REQUIRED")
        return verify_capability(authorization[7:], self.secret, origin=origin, required_scope=scope)

    def require_rate(self, subject: str, action: str, *, maximum: int, window_seconds: int = 60) -> None:
        now = time.monotonic()
        key = f"{subject}:{action}"
        with self._rate_lock:
            recent = [stamp for stamp in self._rate_events.get(key, []) if now - stamp < window_seconds]
            if len(recent) >= maximum:
                self._rate_events[key] = recent
                raise JobError("RATE_LIMIT")
            recent.append(now)
            self._rate_events[key] = recent


class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "LinguistProMediaAcquisition/0.1"

    @property
    def app(self) -> WorkerApplication:
        return self.server.application  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: Any) -> None:
        # Path and status only. Request bodies, source URLs, tokens and headers are never logged.
        print(json.dumps({"at": int(time.time()), "method": self.command,
                          "path": self.path.split("?", 1)[0], "message": fmt % args}, separators=(",", ":")))

    def _cors(self) -> None:
        origin = str(self.headers.get("Origin") or "")
        if origin in self.app.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Type, Content-Disposition, X-LP-Media-SHA256")
            self.send_header("Vary", "Origin")

    def _json(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        if not str(self.headers.get("Content-Type") or "").lower().startswith("application/json"):
            raise JobError("JSON_REQUIRED")
        try:
            size = int(self.headers.get("Content-Length") or "0")
        except ValueError as exc:
            raise JobError("BODY_INVALID") from exc
        if size < 2 or size > MAX_JSON_BYTES:
            raise JobError("BODY_SIZE_INVALID")
        try:
            value = json.loads(self.rfile.read(size))
        except Exception as exc:
            raise JobError("JSON_INVALID") from exc
        if not isinstance(value, dict):
            raise JobError("JSON_OBJECT_REQUIRED")
        return value

    def _error(self, exc: Exception) -> None:
        code = str(getattr(exc, "code", None) or (exc.args[0] if exc.args else "WORKER_FAILED"))
        status = 400
        if code in {"CAPABILITY_REQUIRED", "TOKEN_SIGNATURE", "TOKEN_EXPIRED", "TOKEN_MALFORMED"}:
            status = 401
        elif code in {"CAPABILITY_ORIGIN", "CAPABILITY_SCOPE", "PLAN_SUBJECT_MISMATCH"}:
            status = 403
        elif code == "JOB_NOT_FOUND":
            status = 404
        elif code in {"QUEUE_FULL", "JOB_NOT_READY", "STREAM_RETRY_LIMIT"}:
            status = 409
        elif code == "RATE_LIMIT":
            status = 429
        elif code in {"PREPARE_FAILED", "OUTPUT_FILE_INVALID"}:
            status = 502
        self._json(status, {"ok": False, "error_code": code})

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = str(self.headers.get("Origin") or "")
        if origin not in self.app.allowed_origins:
            return self._json(403, {"ok": False, "error_code": "CAPABILITY_ORIGIN"})
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        try:
            if self.path == "/healthz":
                return self._json(200, {"ok": True, "service": "media-acquisition"})
            if self.path == "/v1/runtime":
                self.app.authenticate(self.headers, scope="resolve")
                return self._json(200, {"ok": True, "worker_runtime": self.app.runtime})
            match = JOB_PATH.fullmatch(self.path)
            if not match:
                return self._json(404, {"ok": False, "error_code": "NOT_FOUND"})
            job_id, suffix = match.groups()
            capability = self.app.authenticate(self.headers, scope="stream" if suffix == "stream" else "prepare")
            if suffix == "stream":
                result = self.app.jobs.open_stream(subject=capability["sub"], job_id=job_id)
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", result.mime_type)
                self.send_header("Content-Length", str(result.size_bytes))
                self.send_header("Content-Disposition", f'attachment; filename="{result.download_name}"')
                self.send_header("X-LP-Media-SHA256", result.sha256)
                self.send_header("Cache-Control", "private, no-store, max-age=0")
                self.end_headers()
                with result.path.open("rb") as stream:
                    while chunk := stream.read(1024 * 1024):
                        self.wfile.write(chunk)
                return
            self._json(200, {"ok": True, **self.app.jobs.status(capability["sub"], job_id)})
        except (JobError, PlannerError, TokenError) as exc:
            self._error(exc)

    def do_POST(self) -> None:  # noqa: N802
        try:
            if self.path == "/v1/resolve":
                capability = self.app.authenticate(self.headers, scope="resolve")
                self.app.require_rate(capability["sub"], "resolve", maximum=20)
                body = self._read_json()
                source = canonicalize_youtube_url(body.get("url"))
                info = self.app.backend.resolve(source.url)
                resolved = build_resolved_source(info, canonical_url=source.url, subject=capability["sub"],
                                                 secret=self.app.secret)
                return self._json(200, {"ok": True, **resolved})
            if self.path == "/v1/jobs":
                capability = self.app.authenticate(self.headers, scope="prepare")
                body = self._read_json()
                job = self.app.jobs.create(subject=capability["sub"], plan_token=body.get("plan_token"),
                                           option_id=body.get("option_id"), rights_basis=body.get("rights_basis") or {})
                return self._json(202, {"ok": True, **job})
            match = JOB_PATH.fullmatch(self.path)
            if not match or match.group(2) != "device-receipt":
                return self._json(404, {"ok": False, "error_code": "NOT_FOUND"})
            capability = self.app.authenticate(self.headers, scope="stream")
            body = self._read_json()
            receipt = self.app.jobs.confirm_device(subject=capability["sub"], job_id=match.group(1),
                                                   sha256=body.get("sha256"), size_bytes=body.get("size_bytes"))
            receipt["worker_runtime"] = self.app.runtime
            self._json(200, {"ok": True, **receipt})
        except (JobError, PlannerError, TokenError, TypeError, ValueError) as exc:
            self._error(exc)

    def do_DELETE(self) -> None:  # noqa: N802
        try:
            match = JOB_PATH.fullmatch(self.path)
            if not match or match.group(2):
                return self._json(404, {"ok": False, "error_code": "NOT_FOUND"})
            capability = self.app.authenticate(self.headers, scope="prepare")
            self._json(200, {"ok": True, **self.app.jobs.cancel(capability["sub"], match.group(1))})
        except (JobError, TokenError) as exc:
            self._error(exc)


class WorkerServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], application: WorkerApplication):
        super().__init__(address, WorkerHandler)
        self.application = application


def main() -> None:
    secret = os.environ.get("LP_MEDIA_SHARED_SECRET", "")
    allowed = {item.strip().rstrip("/") for item in os.environ.get("LP_MEDIA_ALLOWED_ORIGINS", "").split(",") if item.strip()}
    temp_root = os.environ.get("LP_MEDIA_WORKER_TEMP") or os.path.join(tempfile.gettempdir(), "linguistpro-media-acquisition")
    host = os.environ.get("LP_MEDIA_WORKER_HOST", "127.0.0.1")
    port = int(os.environ.get("LP_MEDIA_WORKER_PORT", "8097"))
    app = WorkerApplication(secret=secret, allowed_origins=allowed, temp_root=temp_root)

    def janitor():
        while True:
            time.sleep(60)
            app.jobs.cleanup()

    threading.Thread(target=janitor, name="lp-media-janitor", daemon=True).start()
    WorkerServer((host, port), app).serve_forever(poll_interval=0.25)


if __name__ == "__main__":
    main()
