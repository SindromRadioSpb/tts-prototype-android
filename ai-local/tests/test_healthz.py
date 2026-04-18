from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ai_local.state import ModelSlot, registry

from .helpers import MockImpl


@pytest.fixture
def client(monkeypatch):
    """Build a test app without the real lifespan (no eager-load, no monitor)."""
    from fastapi import FastAPI

    import ai_local.main as main

    app = FastAPI()
    # Re-register routes on a fresh app so we don't invoke the real lifespan.
    app.router.routes.extend(main.app.router.routes)

    registry.slots.clear()
    nakdan_impl = MockImpl(load_delay=0, warmup_delay=0, version="mock-nakdan")
    translator_impl = MockImpl(load_delay=0, warmup_delay=0, version="mock-translator")

    registry.register(
        ModelSlot(name="nakdan", factory=lambda: nakdan_impl, device="cpu")
    )
    registry.register(
        ModelSlot(
            name="translator",
            factory=lambda: translator_impl,
            device="cuda",
            idle_timeout_sec=10,
        )
    )
    registry._accepting = True

    with TestClient(app) as c:
        yield c

    registry.slots.clear()


def test_healthz_reports_registered_models(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert set(body["models"].keys()) == {"nakdan", "translator"}
    assert body["models"]["translator"] == "unloaded"


def test_models_status_has_details(client):
    r = client.get("/models/status")
    assert r.status_code == 200
    body = r.json()
    assert body["translator"]["state"] == "unloaded"
    assert body["translator"]["device"] == "cuda"
    assert body["translator"]["idle_timeout_sec"] == 10
    assert body["nakdan"]["device"] == "cpu"


def test_warmup_loads_model(client):
    r = client.post("/models/warmup", json={"name": "nakdan"})
    assert r.status_code == 200
    assert r.json()["state"] == "ready"

    r = client.get("/models/status")
    body = r.json()
    assert body["nakdan"]["state"] == "ready"
    assert body["nakdan"]["version"] == "mock-nakdan"


def test_unload_known_model(client):
    client.post("/models/warmup", json={"name": "translator"})
    r = client.post("/models/unload", json={"name": "translator"})
    assert r.status_code == 200
    assert r.json()["unloaded"] is True
    assert r.json()["state"] == "unloaded"


def test_unload_unknown_model_returns_404(client):
    r = client.post("/models/unload", json={"name": "no-such"})
    assert r.status_code == 404
