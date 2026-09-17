from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_local_model_failure_keeps_cors_and_a_retry_can_succeed(monkeypatch):
    import ai_local.main as main
    from ai_local.security import loopback_security_middleware, require_companion_auth

    calls = []

    async def model(body):
        calls.append(body.texts)
        if len(calls) == 1:
            raise OSError(22, "Invalid argument at private-local-model-path")
        return main.NakdanResponse(results=["שָׁלוֹם"], model_version="fixture")

    monkeypatch.setattr(main, "nakdan", model)
    monkeypatch.setitem(main.app.dependency_overrides, require_companion_auth, lambda: None)
    app = FastAPI()
    app.router.routes.extend(main.app.router.routes)
    app.middleware("http")(loopback_security_middleware)
    origin = "http://127.0.0.1:3000"
    with TestClient(app, raise_server_exceptions=False) as client:
        headers = {"Origin": origin}
        failed = client.post("/v1/niqqud", headers=headers, json={"texts": ["שלום"]})
        assert failed.status_code == 503
        assert failed.headers["Access-Control-Allow-Origin"] == origin
        assert failed.json() == {"detail": "LOCAL_NIQQUD_MODEL_UNAVAILABLE"}
        assert "private-local-model-path" not in failed.text
        retry = client.post("/v1/niqqud", headers=headers, json={"texts": ["שלום"]})
        assert retry.status_code == 200
        assert retry.headers["Access-Control-Allow-Origin"] == origin
        assert retry.json()["results"] == ["שָׁלוֹם"]
        oversized = client.post("/v1/niqqud", headers=headers, json={"texts": ["שלום"] * 17})
        assert oversized.status_code == 413
        assert len(calls) == 2
