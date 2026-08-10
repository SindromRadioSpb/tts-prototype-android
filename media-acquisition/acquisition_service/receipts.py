"""Content-free signed contracts shared by the acquisition worker endpoints."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Iterable


class TokenError(ValueError):
    pass


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except Exception as exc:  # pragma: no cover - exact decoder errors vary by Python
        raise TokenError("TOKEN_MALFORMED") from exc


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _issue(payload: dict[str, Any], secret: str) -> str:
    if len(str(secret)) < 32:
        raise TokenError("SECRET_TOO_SHORT")
    body = _b64encode(canonical_json(payload))
    signature = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return body + "." + _b64encode(signature)


def _verify(token: str, secret: str, *, expected_type: str, now: int | None = None) -> dict[str, Any]:
    if len(str(secret)) < 32:
        raise TokenError("SECRET_TOO_SHORT")
    parts = str(token or "").split(".")
    if len(parts) != 2:
        raise TokenError("TOKEN_MALFORMED")
    body, encoded_signature = parts
    expected = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _b64decode(encoded_signature)):
        raise TokenError("TOKEN_SIGNATURE")
    try:
        payload = json.loads(_b64decode(body))
    except Exception as exc:
        raise TokenError("TOKEN_MALFORMED") from exc
    if not isinstance(payload, dict) or payload.get("typ") != expected_type:
        raise TokenError("TOKEN_TYPE")
    current = int(time.time()) if now is None else int(now)
    if not isinstance(payload.get("exp"), int) or current > payload["exp"]:
        raise TokenError("TOKEN_EXPIRED")
    return payload


def issue_capability(secret: str, *, subject: str, origin: str, scopes: Iterable[str],
                     now: int | None = None, ttl_seconds: int = 300, nonce: str) -> str:
    current = int(time.time()) if now is None else int(now)
    allowed_scopes = sorted(set(str(scope) for scope in scopes))
    if not subject or not origin.startswith(("https://", "http://localhost", "http://127.0.0.1")):
        raise TokenError("CAPABILITY_INVALID")
    if ttl_seconds < 30 or ttl_seconds > 600:
        raise TokenError("CAPABILITY_TTL")
    return _issue({
        "typ": "lp_media_capability_v1",
        "sub": str(subject),
        "origin": str(origin),
        "scopes": allowed_scopes,
        "iat": current,
        "exp": current + int(ttl_seconds),
        "nonce": str(nonce),
    }, secret)


def verify_capability(token: str, secret: str, *, origin: str, required_scope: str,
                      now: int | None = None) -> dict[str, Any]:
    payload = _verify(token, secret, expected_type="lp_media_capability_v1", now=now)
    if not hmac.compare_digest(str(payload.get("origin", "")), str(origin or "")):
        raise TokenError("CAPABILITY_ORIGIN")
    if required_scope not in payload.get("scopes", []):
        raise TokenError("CAPABILITY_SCOPE")
    if not payload.get("sub") or not payload.get("nonce"):
        raise TokenError("CAPABILITY_INVALID")
    return payload


def issue_plan_token(secret: str, plan: dict[str, Any], *, now: int | None = None,
                     ttl_seconds: int = 600) -> str:
    current = int(time.time()) if now is None else int(now)
    safe = dict(plan)
    safe.update({"typ": "lp_media_plan_v1", "iat": current, "exp": current + int(ttl_seconds)})
    return _issue(safe, secret)


def verify_plan_token(token: str, secret: str, *, now: int | None = None) -> dict[str, Any]:
    payload = _verify(token, secret, expected_type="lp_media_plan_v1", now=now)
    if not payload.get("sub") or not payload.get("video_id") or not isinstance(payload.get("options"), list):
        raise TokenError("PLAN_INVALID")
    return payload


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()
