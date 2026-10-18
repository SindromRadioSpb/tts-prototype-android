"""One-click browser pairing confirmed by a person in the Companion window.

Owner decision 2026-10-18 (Companion out of beta): the browser no longer copies the token by
hand. It asks for pairing; the Companion window shows the requesting site and a 4-digit code
that the Studio shows too; only "Allow" hands the token over, once, to that same origin.

Why not hand the token to any allowed Origin automatically: then the token would add nothing
on top of the Origin check. A person in front of the window is the second factor.

The service and the window are separate processes, so the state lives in small files and no
file has two writers: the service writes ``<id>.json`` (request) and ``<id>.delivered``; the
window writes ``<id>.decision``.
"""

from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

from . import config
from .security import pairing_token

REQUEST_TTL_SEC = 120
MAX_PENDING = 3
_ID_ALPHABET_BYTES = 18


def _root() -> Path:
    return Path(config.STATE_DIR) / "pairing"


def _write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
    try:
        os.chmod(temp, 0o600)
    except OSError:
        pass
    temp.replace(path)


def _read(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError, OSError):
        return None


def _valid_id(request_id: str) -> bool:
    return bool(request_id) and len(request_id) <= 64 and all(c.isalnum() or c in "-_" for c in request_id)


def _purge(now: float) -> None:
    root = _root()
    if not root.is_dir():
        return
    for path in root.glob("*.json"):
        request = _read(path)
        # Keep finished requests a little longer so a slow poll still learns the outcome.
        if request is None or now - float(request.get("created_at", 0)) > REQUEST_TTL_SEC * 3:
            for suffix in (".json", ".decision", ".delivered"):
                try:
                    path.with_suffix(suffix).unlink()
                except OSError:
                    pass


def _state(request: dict[str, Any], now: float) -> str:
    request_id = request["id"]
    root = _root()
    if (root / f"{request_id}.delivered").exists():
        return "delivered"
    decision = _read(root / f"{request_id}.decision") or {}
    if decision.get("approve") is True:
        return "approved"
    if decision.get("approve") is False:
        return "denied"
    if now > float(request["expires_at"]):
        return "expired"
    return "pending"


def create_request(origin: str, now: float | None = None) -> dict[str, Any]:
    now = time.time() if now is None else now
    _purge(now)
    pending = [r for r in list_requests(now) if r["state"] == "pending"]
    if len(pending) >= MAX_PENDING:
        raise RuntimeError("PAIRING_TOO_MANY_PENDING")
    request = {
        "id": secrets.token_urlsafe(_ID_ALPHABET_BYTES),
        "code": f"{secrets.randbelow(10000):04d}",
        "origin": origin.rstrip("/"),
        "created_at": now,
        "expires_at": now + REQUEST_TTL_SEC,
    }
    _write(_root() / f"{request['id']}.json", request)
    return {"id": request["id"], "code": request["code"], "expires_in": REQUEST_TTL_SEC}


def list_requests(now: float | None = None) -> list[dict[str, Any]]:
    now = time.time() if now is None else now
    root = _root()
    if not root.is_dir():
        return []
    out = []
    for path in sorted(root.glob("*.json")):
        request = _read(path)
        if not request or not _valid_id(str(request.get("id", ""))):
            continue
        out.append({**request, "state": _state(request, now)})
    return sorted(out, key=lambda r: r["created_at"])


def pending_requests(now: float | None = None) -> list[dict[str, Any]]:
    return [r for r in list_requests(now) if r["state"] == "pending"]


def decide(request_id: str, approve: bool, now: float | None = None) -> str:
    """Called by the Companion window only."""
    now = time.time() if now is None else now
    if not _valid_id(request_id):
        raise KeyError(request_id)
    request = _read(_root() / f"{request_id}.json")
    if not request:
        raise KeyError(request_id)
    if _state(request, now) != "pending":
        return _state(request, now)
    _write(_root() / f"{request_id}.decision", {"approve": bool(approve), "at": now})
    return "approved" if approve else "denied"


def status(request_id: str, origin: str, now: float | None = None) -> dict[str, Any]:
    """Called by the service for the browser. The token leaves exactly once, to the same origin."""
    now = time.time() if now is None else now
    if not _valid_id(request_id):
        return {"state": "unknown"}
    request = _read(_root() / f"{request_id}.json")
    if not request or request.get("origin") != origin.rstrip("/"):
        return {"state": "unknown"}
    state = _state(request, now)
    if state != "approved":
        return {"state": state}
    _write(_root() / f"{request_id}.delivered", {"at": now})
    return {"state": "approved", "token": pairing_token()}


def revoke_all() -> None:
    """Disconnect every browser: a new token makes every stored copy useless."""
    path = Path(config.ASR_PAIRING_TOKEN_FILE)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    pairing_token()


# ---------- the Companion window must be there to ask the person ----------

def window_heartbeat_path() -> Path:
    return Path(config.STATE_DIR) / "control" / "window.json"


def write_window_heartbeat(pid: int | None = None, now: float | None = None) -> None:
    _write(window_heartbeat_path(), {"pid": int(pid or os.getpid()), "at": time.time() if now is None else now})


def window_alive(now: float | None = None) -> bool:
    beat = _read(window_heartbeat_path())
    if not beat:
        return False
    now = time.time() if now is None else now
    if now - float(beat.get("at", 0)) > 10:
        return False
    try:
        import psutil
        return psutil.pid_exists(int(beat.get("pid", 0)))
    except Exception:
        return True


def open_window() -> bool:
    """Start the Companion window when only the background service runs (frozen build only)."""
    import subprocess
    import sys

    if window_alive() or not getattr(sys, "frozen", False):
        return window_alive()
    # Through explorer.exe, exactly like the Start menu: the window then hides its own console
    # and its nvidia-smi/ffmpeg children inherit it. Started as a detached child of the service
    # it had no console at all, and every status poll flashed a terminal window (2026-10-18).
    args = ["explorer.exe", sys.executable] if os.name == "nt" else [sys.executable]
    try:
        subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, close_fds=True,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return True
    except OSError:
        return False
