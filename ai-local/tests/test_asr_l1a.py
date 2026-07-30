from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from ai_local import config
from ai_local.asr_worker import AsrWorkerManager
from ai_local.security import loopback_security_middleware, require_browser_auth


def _security_app() -> FastAPI:
    app = FastAPI()
    app.middleware("http")(loopback_security_middleware)

    @app.post("/v1/protected", dependencies=[Depends(require_browser_auth)])
    async def protected():
        return {"ok": True}

    return app


def test_v1_preflight_requires_allowlisted_origin_and_emits_pna(monkeypatch):
    monkeypatch.setattr(config, "ASR_ALLOWED_ORIGINS", ("https://studio.test",))
    with TestClient(_security_app()) as client:
        denied = client.options("/v1/protected", headers={"Origin": "https://evil.test"})
        assert denied.status_code == 403

        allowed = client.options(
            "/v1/protected",
            headers={
                "Origin": "https://studio.test",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        assert allowed.status_code == 204
        assert allowed.headers["access-control-allow-origin"] == "https://studio.test"
        assert allowed.headers["access-control-allow-private-network"] == "true"


def test_v1_mutation_requires_origin_feature_and_pairing_token(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ASR_ENABLED", True)
    monkeypatch.setattr(config, "ASR_ALLOWED_ORIGINS", ("https://studio.test",))
    monkeypatch.setattr(config, "ASR_PAIRING_TOKEN_FILE", tmp_path / "pairing-token")
    monkeypatch.setenv("AI_LOCAL_PAIRING_TOKEN", "correct-token")
    with TestClient(_security_app()) as client:
        no_origin = client.post(
            "/v1/protected", headers={"Authorization": "Bearer correct-token"}
        )
        assert no_origin.status_code == 403

        bad_token = client.post(
            "/v1/protected",
            headers={"Origin": "https://studio.test", "Authorization": "Bearer wrong"},
        )
        assert bad_token.status_code == 401

        good = client.post(
            "/v1/protected",
            headers={
                "Origin": "https://studio.test",
                "Authorization": "Bearer correct-token",
            },
        )
        assert good.status_code == 200
        assert good.headers["access-control-allow-origin"] == "https://studio.test"

        monkeypatch.setattr(config, "ASR_ENABLED", False)
        disabled = client.post(
            "/v1/protected",
            headers={
                "Origin": "https://studio.test",
                "Authorization": "Bearer correct-token",
            },
        )
        assert disabled.status_code == 404


def test_pairing_token_is_generated_in_private_state_file(monkeypatch, tmp_path):
    from ai_local.security import pairing_token

    token_file = tmp_path / "private" / "pairing-token"
    monkeypatch.delenv("AI_LOCAL_PAIRING_TOKEN", raising=False)
    monkeypatch.setattr(config, "ASR_PAIRING_TOKEN_FILE", token_file)
    first = pairing_token()
    second = pairing_token()
    assert first == second
    assert len(first) >= 32
    assert token_file.read_text(encoding="utf-8").strip() == first
    if os.name != "nt":
        assert token_file.stat().st_mode & 0o077 == 0


def test_model_activation_is_exact_and_atomic(monkeypatch, tmp_path):
    import ai_local.model_store as store

    source = tmp_path / "source"
    source.mkdir()
    payload = b"approved-model-fixture"
    (source / "model.bin").write_bytes(payload)
    config_payload = b"{}\n"
    (source / "config.json").write_bytes(config_payload)
    digest = hashlib.sha256(payload).hexdigest()
    monkeypatch.setattr(store, "ASR_MODEL_BIN_REPOSITORY_BYTES", len(payload))
    monkeypatch.setattr(store, "ASR_MODEL_BIN_SHA256", digest)
    monkeypatch.setattr(store, "ASR_RUNTIME_FILE_SHA256", {
        "model.bin": digest,
        "config.json": hashlib.sha256(config_payload).hexdigest(),
    })

    models = tmp_path / "models"
    status = store.activate_from_directory(source, models)
    assert status.installed and status.verified
    assert store.inspect_model(models, verify_hash=True).verified
    assert not list(status.path.parent.glob("asr-activate-*"))

    (status.path / "model.bin").write_bytes(b"tampered")
    broken = store.inspect_model(models, verify_hash=True)
    assert not broken.verified
    assert broken.reason in {"MODEL_SIZE_MISMATCH", "RUNTIME_FILE_HASH_MISMATCH"}


def test_model_activation_rejects_wrong_pin(monkeypatch, tmp_path):
    import ai_local.model_store as store

    source = tmp_path / "source"
    source.mkdir()
    (source / "model.bin").write_bytes(b"wrong")
    monkeypatch.setattr(store, "ASR_MODEL_BIN_REPOSITORY_BYTES", 5)
    monkeypatch.setattr(store, "ASR_MODEL_BIN_SHA256", "0" * 64)
    monkeypatch.setattr(store, "ASR_RUNTIME_FILE_SHA256", {"model.bin": "0" * 64})
    try:
        store.activate_from_directory(source, tmp_path / "models")
    except ValueError as exc:
        assert "hash" in str(exc)
    else:
        raise AssertionError("wrong model pin was activated")


def test_worker_control_plane_is_process_isolated_and_hard_cancellable():
    worker = AsrWorkerManager()
    try:
        response = worker.ping()
        status = worker.status()
        assert response["ok"] is True
        assert status.pid is not None and status.pid != os.getpid()
        worker.hard_cancel()
        assert worker.status().state == "unloaded"
    finally:
        worker.hard_cancel()
