"""One-click pairing (owner decision 2026-10-18): the token leaves only after "Allow" in the
Companion window, only once, and only to the origin that asked."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_local import config, pairing

STUDIO = "https://studio.test"


@pytest.fixture
def state(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "STATE_DIR", tmp_path)
    monkeypatch.setattr(config, "ASR_ALLOWED_ORIGINS", (STUDIO,))
    monkeypatch.setattr(config, "ASR_PAIRING_TOKEN_FILE", tmp_path / "pairing-token")
    monkeypatch.delenv("AI_LOCAL_PAIRING_TOKEN", raising=False)
    monkeypatch.setattr(pairing, "open_window", lambda: True)
    return tmp_path


@pytest.fixture
def client(state):
    import ai_local.main as main
    from ai_local.security import loopback_security_middleware

    app = FastAPI()
    app.middleware("http")(loopback_security_middleware)
    app.router.routes.extend(main.app.router.routes)
    with TestClient(app) as c:
        yield c


def test_token_is_handed_over_once_after_allow(state):
    created = pairing.create_request(STUDIO, now=1000)
    assert len(created["code"]) == 4 and created["code"].isdigit()
    assert pairing.status(created["id"], STUDIO, now=1001) == {"state": "pending"}
    assert [r["id"] for r in pairing.pending_requests(now=1001)] == [created["id"]]
    assert pairing.decide(created["id"], True, now=1002) == "approved"
    first = pairing.status(created["id"], STUDIO, now=1003)
    assert first["state"] == "approved"
    assert first["token"] == (state / "pairing-token").read_text(encoding="utf-8").strip()
    assert pairing.status(created["id"], STUDIO, now=1004) == {"state": "delivered"}, "never a second time"


def test_denied_expired_and_foreign_origin_get_no_token(state):
    denied = pairing.create_request(STUDIO, now=1000)
    pairing.decide(denied["id"], False, now=1001)
    assert pairing.status(denied["id"], STUDIO, now=1002) == {"state": "denied"}

    late = pairing.create_request(STUDIO, now=2000)
    assert pairing.status(late["id"], STUDIO, now=2000 + pairing.REQUEST_TTL_SEC + 1) == {"state": "expired"}
    assert pairing.decide(late["id"], True, now=2000 + pairing.REQUEST_TTL_SEC + 1) == "expired"

    other = pairing.create_request(STUDIO, now=3000)
    pairing.decide(other["id"], True, now=3001)
    assert pairing.status(other["id"], "https://evil.test", now=3002) == {"state": "unknown"}
    assert pairing.status("../pairing-token", STUDIO, now=3002) == {"state": "unknown"}


def test_pending_requests_are_capped(state):
    for i in range(pairing.MAX_PENDING):
        pairing.create_request(STUDIO, now=1000 + i)
    with pytest.raises(RuntimeError, match="TOO_MANY"):
        pairing.create_request(STUDIO, now=1010)


def test_revoke_all_rotates_the_token(state):
    from ai_local.security import pairing_token

    before = pairing_token()
    pairing.revoke_all()
    assert pairing_token() != before


def test_window_heartbeat(state):
    assert pairing.window_alive(now=100) is False
    pairing.write_window_heartbeat(now=100)
    assert pairing.window_alive(now=105) is True
    assert pairing.window_alive(now=200) is False


def test_routes_require_an_allowed_origin_and_carry_no_token(client):
    assert client.get("/v1/hello").status_code == 403
    assert client.get("/v1/hello", headers={"Origin": "https://evil.test"}).status_code == 403
    hello = client.get("/v1/hello", headers={"Origin": STUDIO})
    assert hello.status_code == 200
    assert hello.json()["pairing"] == "v1"
    assert "token" not in hello.text

    assert client.post("/v1/pair/request", headers={"Origin": "https://evil.test"}).status_code == 403
    created = client.post("/v1/pair/request", headers={"Origin": STUDIO})
    assert created.status_code == 201
    body = created.json()
    assert body["window"] == "open" and "token" not in body

    pending = client.get(f"/v1/pair/status/{body['id']}", headers={"Origin": STUDIO})
    assert pending.json() == {"state": "pending"}
    assert pending.headers["cache-control"] == "no-store"
    pairing.decide(body["id"], True)
    approved = client.get(f"/v1/pair/status/{body['id']}", headers={"Origin": STUDIO}).json()
    assert approved["state"] == "approved" and len(approved["token"]) >= 32
    # The token it carries really opens the protected API.
    caps = client.get("/v1/capabilities", headers={"Origin": STUDIO, "Authorization": "Bearer " + approved["token"]})
    assert caps.status_code == 200


def test_no_console_child_can_flash_a_terminal_window():
    """Owner report 2026-10-18: a window opened by the service had no console, and every
    nvidia-smi/ffmpeg poll flashed a terminal. Every console child must ask for no window."""
    import ast
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1] / "ai_local"
    offenders = []
    for path in root.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                    and node.func.attr in ("run", "Popen") and getattr(node.func.value, "id", "") == "subprocess":
                if not any(k.arg == "creationflags" for k in node.keywords):
                    first = node.args[0] if node.args else None
                    if isinstance(first, ast.List) and first.elts and getattr(first.elts[0], "value", "") == "notepad.exe":
                        continue  # a GUI program, it is meant to open a window
                    offenders.append(f"{path.name}:{node.lineno}")
    assert offenders == []


def test_service_opens_the_window_like_the_start_menu(monkeypatch):
    import subprocess
    import sys

    calls = []
    monkeypatch.setattr(pairing, "window_alive", lambda now=None: False)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(subprocess, "Popen", lambda args, **kw: calls.append((args, kw)))
    assert pairing.open_window() is True
    args, kw = calls[0]
    if pairing.os.name == "nt":
        assert args[0] == "explorer.exe"
    assert not (kw.get("creationflags", 0) & getattr(subprocess, "DETACHED_PROCESS", 0x8))
