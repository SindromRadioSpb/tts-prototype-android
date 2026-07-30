"""Browser-to-loopback security boundary for versioned local APIs."""

from __future__ import annotations

import hmac
import os
import secrets
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, Response

from . import config

PAIRING_TOKEN_BYTES = 32


def _normalized_origins(values: Iterable[str]) -> frozenset[str]:
    return frozenset(value.strip().rstrip("/") for value in values if value.strip())


def allowed_origins() -> frozenset[str]:
    return _normalized_origins(config.ASR_ALLOWED_ORIGINS)


def _write_private(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(value + "\n", encoding="utf-8")
    try:
        os.chmod(temp, 0o600)
    except OSError:
        pass
    temp.replace(path)


def pairing_token() -> str:
    configured = os.environ.get("AI_LOCAL_PAIRING_TOKEN", "").strip()
    if configured:
        return configured
    path = config.ASR_PAIRING_TOKEN_FILE
    try:
        existing = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        existing = ""
    if existing:
        return existing
    value = secrets.token_urlsafe(PAIRING_TOKEN_BYTES)
    _write_private(path, value)
    return value


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    return origin.rstrip("/") in allowed_origins()


def _bearer_token(request: Request) -> str:
    raw = request.headers.get("authorization", "")
    scheme, _, value = raw.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return ""
    return value.strip()


def require_asr_enabled() -> None:
    if not config.ASR_ENABLED:
        raise HTTPException(status_code=404, detail="local ASR is disabled")


def require_browser_auth(request: Request) -> None:
    require_asr_enabled()
    origin = request.headers.get("origin")
    if not origin_allowed(origin):
        raise HTTPException(status_code=403, detail="origin is not allowed")
    expected = pairing_token()
    actual = _bearer_token(request)
    if not actual or not hmac.compare_digest(actual, expected):
        raise HTTPException(status_code=401, detail="pairing token required")


def _cors_headers(origin: str) -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
    }


async def loopback_security_middleware(request: Request, call_next):
    """Strict CORS/PNA handling for /v1; legacy server-to-sidecar APIs stay unchanged."""
    if not request.url.path.startswith("/v1/"):
        return await call_next(request)

    origin = request.headers.get("origin")
    if request.method == "OPTIONS":
        if not origin_allowed(origin):
            return JSONResponse({"error": "origin is not allowed"}, status_code=403)
        headers = _cors_headers(origin or "")
        if request.headers.get("access-control-request-private-network", "").lower() == "true":
            headers["Access-Control-Allow-Private-Network"] = "true"
        return Response(status_code=204, headers=headers)

    response = await call_next(request)
    if origin_allowed(origin):
        for name, value in _cors_headers(origin or "").items():
            response.headers[name] = value
        if request.headers.get("access-control-request-private-network", "").lower() == "true":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response
