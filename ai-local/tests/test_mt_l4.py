from __future__ import annotations

import asyncio
import hashlib
import sys
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
        self.calls: list[list[str]] = []

    def translate_batch(self, texts: list[str], target: str) -> list[str]:
        self.calls.append(list(texts))
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

    translator = _FakeTranslator()
    slot = SimpleNamespace(impl=translator)
    monkeypatch.setattr(jobs, "heavy_gpu_scheduler", _FakeScheduler())
    monkeypatch.setattr(jobs, "registry", SimpleNamespace(slot=lambda _name: slot))
    monkeypatch.setattr(jobs, "use_model", _fake_use_model)
    manager = MtJobManager()
    segments = [{"index": i, "text": value} for i, value in enumerate(["א", "", " \t", "א", "ב"])]
    checksum = canonical_input_checksum("he", "ru", segments)
    created = await manager.create(
        source_lang="he", target_lang="ru", segments=segments,
        request_id="a" * 64, input_checksum=checksum,
    )
    status = await _wait_terminal(manager, created["job_id"])
    assert status["state"] == "COMPLETE"
    result = manager.result(created["job_id"])
    assert [row["index"] for row in result["results"]] == [0, 1, 2, 3, 4]
    assert len(result["results"]) == len(segments)
    assert [row["text"] for row in result["results"]] == ["ru:א", "", " \t", "ru:א", "ru:ב"]
    assert translator.calls == [["א", "א"], ["ב"]]
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


def test_mt_converter_uses_bounded_memory_and_exact_quantization(monkeypatch, tmp_path):
    import ai_local.mt_convert_worker as worker

    captured = {}

    class FakeConverter:
        def __init__(self, **kwargs):
            captured["init"] = kwargs

        def convert(self, **kwargs):
            captured["convert"] = kwargs

    monkeypatch.setitem(
        sys.modules,
        "ctranslate2.converters",
        SimpleNamespace(TransformersConverter=FakeConverter),
    )
    worker.convert(tmp_path / "source", tmp_path / "output")
    assert captured["init"]["low_cpu_mem_usage"] is True
    assert captured["init"]["load_as_float16"] is True
    assert captured["convert"]["quantization"] == "int8_float16"
    assert captured["convert"]["force"] is False


def test_mt_conversion_ram_gate_matches_fp16_weights_plus_overhead():
    import ai_local.mt_constants as constants

    assert constants.MT_CONVERSION_MIN_AVAILABLE_RAM_BYTES == 22 * 1024**3


def test_companion_build_collects_low_memory_converter_dependency():
    root = Path(__file__).resolve().parents[1]
    script = (
        root / "scripts" / "build_companion.ps1"
    ).read_text(encoding="utf-8")
    project = (root / "pyproject.toml").read_text(encoding="utf-8")

    assert '"$AiLocalRoot[runtime]"' in script
    assert "--collect-all accelerate" in script
    assert "$VersionExitCode = $LASTEXITCODE" in script
    assert "AI_LOCAL_BUILD_SMOKE_PORT" in script
    assert "source_input_dirty" in script
    assert '"accelerate==1.13.0"' in project
    assert '"torch==2.5.1"' in project


def test_companion_build_runs_frozen_mt_runtime_self_check():
    root = Path(__file__).resolve().parents[1]
    script = (root / "scripts" / "build_companion.ps1").read_text(encoding="utf-8")
    companion = (root / "ai_local" / "companion.py").read_text(encoding="utf-8")

    assert '"--mt-runtime-check"' in companion
    assert 'os.environ.get("AI_LOCAL_BUILD_SMOKE_PORT"' in companion
    assert "--mt-runtime-check" in script
    assert "mt_runtime_check" in script
    assert 'Where-Object { $_.Name -eq $InstallerName }' in script


def test_companion_beta5_version_is_consistent_across_binary_and_installer():
    root = Path(__file__).resolve().parents[1]
    script = (root / "scripts" / "build_companion.ps1").read_text(encoding="utf-8")
    companion = (root / "ai_local" / "companion.py").read_text(encoding="utf-8")
    installer = (root / "installer" / "LinguistProLocalAsr.iss").read_text(encoding="utf-8-sig")

    for source in (script, companion, installer):
        assert "0.3.0-beta.5" in source
    assert "0.3.0-beta.4-unsigned-internal.exe" not in script
    assert "0.3.0-beta.4-unsigned-internal" not in installer


def test_companion_builder_proves_frozen_media_readiness_contract():
    root = Path(__file__).resolve().parents[1]
    script = (root / "scripts" / "build_companion.ps1").read_text(encoding="utf-8")

    assert '"/v1/media/jobs?filename=frozen-ready-fixture.mp4"' in script
    assert 'report.outcome -ne "READY"' in script
    assert 'schema -ne "media-job-delete-receipt-v1"' in script
    assert "frozen_media_readiness" in script


def test_frozen_conversion_worker_uses_companion_dispatch(monkeypatch, tmp_path):
    import ai_local.mt_model_install as install

    monkeypatch.setattr(install.sys, "frozen", True, raising=False)
    monkeypatch.setattr(install.sys, "executable", r"C:\Program Files\LinguistPro\Companion.exe")
    command = install.MtModelInstallManager._conversion_command(
        tmp_path / "source", tmp_path / "output"
    )

    assert command == [
        r"C:\Program Files\LinguistPro\Companion.exe",
        "--convert-mt-worker",
        str(tmp_path / "source"),
        str(tmp_path / "output"),
    ]


def test_remote_install_fails_before_download_when_conversion_ram_is_low(monkeypatch, tmp_path):
    import ai_local.mt_model_install as install

    target = tmp_path / "models" / "mt" / "snapshot"
    monkeypatch.setattr(install, "inspect_mt_model", lambda **_kwargs: SimpleNamespace(verified=False))
    monkeypatch.setattr(install, "expected_mt_model_dir", lambda: target)
    monkeypatch.setattr(install.config, "MADLAD_LEGACY_MODEL_DIR", tmp_path / "absent")
    monkeypatch.setattr(install.psutil, "virtual_memory", lambda: SimpleNamespace(available=1))
    manager = install.MtModelInstallManager()
    with pytest.raises(RuntimeError, match="MODEL_CONVERSION_MEMORY_LOW"):
        manager.start(accepted_license=True, revision=install.MT_MODEL_REVISION)
    assert not target.exists()
    assert manager._thread is None
