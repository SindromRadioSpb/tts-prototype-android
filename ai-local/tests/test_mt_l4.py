from __future__ import annotations

import asyncio
import hashlib
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from ai_local import config
from ai_local.mt_jobs import MtJobConflict, MtJobManager, canonical_input_checksum
from ai_local.security import (
    loopback_security_middleware,
    require_companion_auth,
    require_mt_browser_auth,
)


def _security_app() -> FastAPI:
    app = FastAPI()
    app.middleware("http")(loopback_security_middleware)

    @app.get("/v1/capabilities", dependencies=[Depends(require_companion_auth)])
    async def capabilities():
        return {"local_mt": {"enabled": config.MT_ENABLED}}

    @app.post("/v1/mt/protected", dependencies=[Depends(require_mt_browser_auth)])
    async def protected():
        return {"ok": True}

    return app


def _headers(token: str = "correct-token") -> dict[str, str]:
    return {"Origin": "https://studio.test", "Authorization": f"Bearer {token}"}


def test_capabilities_and_mt_output_require_shared_pairing_auth(monkeypatch):
    monkeypatch.setattr(config, "ASR_ALLOWED_ORIGINS", ("https://studio.test",))
    monkeypatch.setattr(config, "MT_ENABLED", True)
    monkeypatch.setenv("AI_LOCAL_PAIRING_TOKEN", "correct-token")
    with TestClient(_security_app()) as client:
        assert client.get("/v1/capabilities", headers={"Origin": "https://studio.test"}).status_code == 401
        assert client.get("/v1/capabilities", headers=_headers("wrong")).status_code == 401
        assert client.get("/v1/capabilities", headers=_headers()).status_code == 200
        assert client.post("/v1/mt/protected", headers=_headers()).status_code == 200


def test_mt_gate_is_independent_and_default_off_does_not_weaken_auth(monkeypatch):
    monkeypatch.setattr(config, "ASR_ALLOWED_ORIGINS", ("https://studio.test",))
    monkeypatch.setattr(config, "ASR_ENABLED", True)
    monkeypatch.setattr(config, "MT_ENABLED", False)
    monkeypatch.setenv("AI_LOCAL_PAIRING_TOKEN", "correct-token")
    with TestClient(_security_app()) as client:
        assert client.get("/v1/capabilities", headers=_headers()).status_code == 200
        assert client.post("/v1/mt/protected", headers=_headers()).status_code == 404
        assert client.post("/v1/mt/protected", headers=_headers("wrong")).status_code == 404


def test_mt_model_activation_requires_every_exact_hash(monkeypatch, tmp_path):
    import ai_local.mt_model_store as store

    source = tmp_path / "source"
    source.mkdir()
    files = {"model.bin": b"approved-model", "spiece.model": b"approved-tokenizer"}
    for name, payload in files.items():
        (source / name).write_bytes(payload)
    hashes = {name: hashlib.sha256(payload).hexdigest() for name, payload in files.items()}
    sizes = {name: len(payload) for name, payload in files.items()}
    monkeypatch.setattr(store, "MT_RUNTIME_FILE_SHA256", hashes)
    monkeypatch.setattr(store, "MT_RUNTIME_FILE_BYTES", sizes)

    status = store.activate_mt_from_directory(source, tmp_path / "models")
    assert status.verified is True
    public = status.public_dict()
    assert "path" not in public
    assert store.inspect_mt_model(tmp_path / "models", verify_hash=True).verified is True

    (status.path / "spiece.model").write_bytes(b"tampered")
    assert store.inspect_mt_model(tmp_path / "models", verify_hash=True).reason in {
        "RUNTIME_FILE_SIZE_MISMATCH",
        "RUNTIME_FILE_HASH_MISMATCH",
    }


class _FakeTranslator:
    def __init__(self, *, short_result: bool = False) -> None:
        self.short_result = short_result

    def translate_batch(self, texts: list[str], target: str) -> list[str]:
        results = [f"{target}:{text}" for text in texts]
        return results[:-1] if self.short_result else results


class _FakeScheduler:
    @asynccontextmanager
    async def lease(self, _name: str, *, cancel=None):
        if cancel is not None and cancel.is_set():
            raise asyncio.CancelledError
        yield


@asynccontextmanager
async def _fake_use_model(_slot):
    yield


async def _wait_terminal(manager: MtJobManager, job_id: str) -> dict:
    for _ in range(100):
        status = manager.status(job_id)
        if status["state"] in {"COMPLETE", "FAILED", "CANCELED"}:
            return status
        await asyncio.sleep(0.005)
    raise AssertionError("MT job did not terminate")


@pytest.mark.asyncio
async def test_mt_job_preserves_exact_cardinality_order_and_provenance(monkeypatch):
    import ai_local.mt_jobs as jobs

    slot = SimpleNamespace(impl=_FakeTranslator())
    monkeypatch.setattr(jobs, "heavy_gpu_scheduler", _FakeScheduler())
    monkeypatch.setattr(jobs, "registry", SimpleNamespace(slot=lambda _name: slot))
    monkeypatch.setattr(jobs, "use_model", _fake_use_model)
    manager = MtJobManager()
    segments = [{"index": i, "text": value} for i, value in enumerate(["א", "", "א", "ב"])]
    checksum = canonical_input_checksum("he", "ru", segments)
    created = await manager.create(
        source_lang="he", target_lang="ru", segments=segments,
        request_id="a" * 64, input_checksum=checksum,
    )
    status = await _wait_terminal(manager, created["job_id"])
    assert status["state"] == "COMPLETE"
    result = manager.result(created["job_id"])
    assert [row["index"] for row in result["results"]] == [0, 1, 2, 3]
    assert len(result["results"]) == len(segments)
    assert result["provider"] == "madlad"
    assert result["local_execution"] is True
    assert result["model"]["revision"]


@pytest.mark.asyncio
async def test_mt_job_rejects_replay_conflict_and_cardinality_loss(monkeypatch):
    import ai_local.mt_jobs as jobs

    slot = SimpleNamespace(impl=_FakeTranslator(short_result=True))
    monkeypatch.setattr(jobs, "heavy_gpu_scheduler", _FakeScheduler())
    monkeypatch.setattr(jobs, "registry", SimpleNamespace(slot=lambda _name: slot))
    monkeypatch.setattr(jobs, "use_model", _fake_use_model)
    manager = MtJobManager()
    first = [{"index": 0, "text": "א"}]
    created = await manager.create(
        source_lang="he", target_lang="ru", segments=first,
        request_id="b" * 64,
        input_checksum=canonical_input_checksum("he", "ru", first),
    )
    assert (await _wait_terminal(manager, created["job_id"]))["error_code"] == "MT_RESULT_CARDINALITY_MISMATCH"

    second = [{"index": 0, "text": "ב"}]
    with pytest.raises(MtJobConflict, match="REPLAY_CONFLICT"):
        await manager.create(
            source_lang="he", target_lang="ru", segments=second,
            request_id="b" * 64,
            input_checksum=canonical_input_checksum("he", "ru", second),
        )


@pytest.mark.asyncio
async def test_mt_job_rejects_direction_indexes_and_checksum_before_execution():
    manager = MtJobManager()
    segments = [{"index": 2, "text": "text"}]
    with pytest.raises(ValueError, match="DIRECTION"):
        await manager.create(
            source_lang="en", target_lang="ru", segments=segments,
            request_id="c" * 64, input_checksum="0" * 64,
        )
    with pytest.raises(ValueError, match="INDEX"):
        await manager.create(
            source_lang="he", target_lang="ru", segments=segments,
            request_id="c" * 64,
            input_checksum=canonical_input_checksum("he", "ru", segments),
        )


def test_mt_source_download_resumes_partial_and_verifies_exact_hash(monkeypatch, tmp_path):
    import ai_local.mt_model_install as install

    payload = b"approved-exact-source"
    partial_bytes = payload[:8]
    source = tmp_path / "source"
    source.mkdir()
    (source / "fixture.bin.part").write_bytes(partial_bytes)
    monkeypatch.setattr(install, "MT_SOURCE_FILE_BYTES", {"fixture.bin": len(payload)})
    monkeypatch.setattr(
        install, "MT_SOURCE_FILE_SHA256",
        {"fixture.bin": hashlib.sha256(payload).hexdigest()},
    )

    class Response:
        status = 206
        def __init__(self): self._sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def geturl(self): return "https://cdn-lfs.hf.co/exact"
        def read(self, _size):
            if self._sent: return b""
            self._sent = True
            return payload[len(partial_bytes):]

    requests = []
    monkeypatch.setattr(install.urllib.request, "urlopen", lambda request, timeout: requests.append(request) or Response())
    manager = install.MtModelInstallManager()
    completed = manager._download_source_file(source, "fixture.bin", 0)
    assert completed == len(payload)
    assert (source / "fixture.bin").read_bytes() == payload
    assert not (source / "fixture.bin.part").exists()
    assert requests[0].headers["Range"] == f"bytes={len(partial_bytes)}-"


def test_mt_source_download_cancel_keeps_resumable_partial(monkeypatch, tmp_path):
    import ai_local.mt_model_install as install

    payload = b"0123456789"
    source = tmp_path / "source"
    source.mkdir()
    monkeypatch.setattr(install, "MT_SOURCE_FILE_BYTES", {"fixture.bin": len(payload)})
    monkeypatch.setattr(
        install, "MT_SOURCE_FILE_SHA256",
        {"fixture.bin": hashlib.sha256(payload).hexdigest()},
    )
    manager = install.MtModelInstallManager()

    class Response:
        status = 200
        def __init__(self): self._count = 0
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def geturl(self): return "https://cdn-lfs.hf.co/exact"
        def read(self, _size):
            self._count += 1
            if self._count == 1:
                manager._cancel.set()
                return payload[:5]
            return payload[5:] if self._count == 2 else b""

    monkeypatch.setattr(install.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())
    with pytest.raises(InterruptedError):
        manager._download_source_file(source, "fixture.bin", 0)
    partial = source / "fixture.bin.part"
    assert partial.exists()
    assert partial.read_bytes() == payload[:5]
