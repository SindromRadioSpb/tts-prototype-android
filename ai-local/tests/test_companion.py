from __future__ import annotations

import json
from pathlib import Path

import pytest

import ai_local.companion_model as model_ops
import ai_local.companion_preflight as preflight
from ai_local.asr_constants import ASR_MODEL_REVISION, ASR_RUNTIME_FILE_SHA256
from ai_local.companion_diagnostics import diagnostic_payload


class _FakeResponse:
    def __init__(self, payload: bytes, url: str = "https://cdn.hf.co/model"):
        self._payload = payload
        self._offset = 0
        self._url = url

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self):
        return self._url

    def read(self, size: int):
        if self._offset >= len(self._payload):
            return b""
        chunk = self._payload[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk


def test_model_urls_are_full_revision_only():
    for filename in ASR_RUNTIME_FILE_SHA256:
        url = model_ops._download_url(filename)
        assert ASR_MODEL_REVISION in url
        assert "/resolve/main/" not in url
        assert url.startswith("https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ct2/")


def test_model_install_requires_license_and_exact_revision(monkeypatch):
    manager = model_ops.ModelInstallManager()
    monkeypatch.setattr(model_ops, "inspect_model", lambda **_kwargs: type("S", (), {"verified": False})())
    with pytest.raises(ValueError, match="LICENSE"):
        manager.start(accepted_license=False, revision=ASR_MODEL_REVISION)
    with pytest.raises(ValueError, match="REVISION"):
        manager.start(accepted_license=True, revision="main")


def test_model_install_fails_before_download_when_disk_is_low(monkeypatch, tmp_path):
    manager = model_ops.ModelInstallManager()
    monkeypatch.setattr(model_ops, "DOWNLOAD_ROOT", tmp_path / "downloads")
    monkeypatch.setattr(model_ops, "inspect_model", lambda **_kwargs: type("S", (), {"verified": False})())
    monkeypatch.setattr(model_ops, "expected_model_dir", lambda: tmp_path / "models" / "exact")
    monkeypatch.setattr(model_ops.shutil, "disk_usage", lambda _path: type("D", (), {"free": 1024})())
    with pytest.raises(RuntimeError, match="MODEL_DISK_LOW"):
        manager.start(accepted_license=True, revision=ASR_MODEL_REVISION)
    assert manager.status()["state"] != "DOWNLOADING"


def test_corrupt_download_fails_and_removes_partial(monkeypatch, tmp_path):
    manager = model_ops.ModelInstallManager()
    monkeypatch.setattr(model_ops, "DOWNLOAD_ROOT", tmp_path / "downloads")
    monkeypatch.setattr(model_ops, "inspect_model", lambda **_kwargs: type("S", (), {
        "verified": False,
        "public_dict": lambda self: {"model": {"installed": False, "verified": False}},
    })())
    monkeypatch.setattr(model_ops, "expected_model_dir", lambda: tmp_path / "models" / "exact")
    monkeypatch.setattr(model_ops, "ASR_RUNTIME_FILE_SHA256", {"model.bin": "0" * 64})
    monkeypatch.setattr(model_ops, "ASR_RUNTIME_FILE_BYTES", {"model.bin": 3})
    monkeypatch.setattr(model_ops.urllib.request, "urlopen", lambda *_args, **_kwargs: _FakeResponse(b"bad"))
    manager._run()
    assert manager.status()["error_code"] == "MODEL_INTEGRITY_FAILED"
    assert not (tmp_path / "downloads" / f"{ASR_MODEL_REVISION}.partial").exists()


def test_cancel_download_removes_partial(monkeypatch, tmp_path):
    manager = model_ops.ModelInstallManager()
    monkeypatch.setattr(model_ops, "DOWNLOAD_ROOT", tmp_path / "downloads")
    monkeypatch.setattr(model_ops, "ASR_RUNTIME_FILE_SHA256", {"model.bin": "0" * 64})
    monkeypatch.setattr(model_ops, "ASR_RUNTIME_FILE_BYTES", {"model.bin": 4})

    class _CancelingResponse(_FakeResponse):
        def read(self, size: int):
            manager.cancel()
            return super().read(size)

    monkeypatch.setattr(model_ops.urllib.request, "urlopen", lambda *_args, **_kwargs: _CancelingResponse(b"data"))
    manager._run()
    assert manager.status()["state"] == "CANCELED"
    assert not (tmp_path / "downloads" / f"{ASR_MODEL_REVISION}.partial").exists()


def test_managed_tree_rejects_escape_and_reparse(monkeypatch, tmp_path):
    root = tmp_path / "managed"
    root.mkdir()
    child = root / "child"
    child.mkdir()
    assert model_ops._assert_managed_tree(child, root) == child.resolve()
    with pytest.raises(ValueError, match="escaped"):
        model_ops._assert_managed_tree(tmp_path / "outside", root)
    monkeypatch.setattr(model_ops, "_is_reparse", lambda path: path == child)
    with pytest.raises(ValueError, match="link or junction"):
        model_ops._assert_managed_tree(child, root)


def test_delete_all_jobs_returns_content_free_receipt(monkeypatch, tmp_path):
    jobs = tmp_path / "jobs"
    job = jobs / "00000000-0000-0000-0000-000000000001"
    job.mkdir(parents=True)
    (job / "source.bin").write_bytes(b"private-media")
    receipts = tmp_path / "receipts"
    monkeypatch.setattr(model_ops.config, "ASR_JOB_ROOT", jobs)
    monkeypatch.setattr(model_ops, "RECEIPT_ROOT", receipts)
    receipt = model_ops.delete_all_jobs()
    assert receipt["deleted_entries"] == 1
    assert receipt["absent_after"] is True
    assert not list(jobs.iterdir())
    encoded = json.dumps(receipt)
    assert "private-media" not in encoded
    assert "source.bin" not in encoded


def test_preflight_fails_closed_when_nvidia_is_unavailable(monkeypatch, tmp_path):
    monkeypatch.setattr(preflight, "_windows_check", lambda: preflight._result("WINDOWS_11", True, {}))
    monkeypatch.setattr(preflight, "_gpu_check", lambda: (
        preflight._result("NVIDIA_GPU", False, {"error": "missing"}),
        preflight._result("FREE_VRAM", False, {"error": "missing"}),
        preflight._result("CUDA_DRIVER", False, {"error": "missing"}),
    ))
    monkeypatch.setattr(preflight, "_ffmpeg_check", lambda name: preflight._result(name.upper(), True, {}))
    monkeypatch.setattr(preflight, "_cuda_runtime_check", lambda: preflight._result("CUDA_RUNTIME", True, {}))
    monkeypatch.setattr(preflight, "_disk_check", lambda: preflight._result("DISK_SPACE", True, {}))
    monkeypatch.setattr(preflight, "_port_check", lambda: preflight._result("PORT_8799", True, {"state": "free"}))
    report = preflight.preflight_report()
    assert report["supported"] is False
    assert {item["code"] for item in report["checks"] if not item["ok"]} == {
        "NVIDIA_GPU", "FREE_VRAM", "CUDA_DRIVER"
    }


def test_disk_low_and_foreign_port_fail_closed(monkeypatch, tmp_path):
    monkeypatch.setattr(preflight.config, "MODELS_DIR", tmp_path / "models")
    monkeypatch.setattr(preflight, "inspect_model", lambda verify_hash: type("S", (), {"installed": False})())
    monkeypatch.setattr(preflight.shutil, "disk_usage", lambda _path: type("D", (), {"free": 1024})())
    disk = preflight._disk_check()
    assert disk["ok"] is False
    assert disk["required"]["minimum_free_bytes"] > disk["observed"]["free_bytes"]

    class _OccupiedSocket:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def settimeout(self, _value): return None
        def connect_ex(self, _address): return 0

    monkeypatch.setattr(preflight.socket, "socket", lambda *_args, **_kwargs: _OccupiedSocket())
    monkeypatch.setattr(preflight, "_capability_probe", lambda: None)
    port = preflight._port_check()
    assert port["ok"] is False
    assert port["observed"]["state"] == "foreign_listener"


def test_diagnostics_are_allowlisted_and_redacted(monkeypatch, tmp_path):
    monkeypatch.setattr("ai_local.companion_diagnostics.preflight_report", lambda: {"supported": True, "checks": []})
    monkeypatch.setattr(
        "ai_local.companion_diagnostics.inspect_model",
        lambda verify_hash: type("S", (), {"installed": True, "verified": True, "reason": None})(),
    )
    monkeypatch.setattr("ai_local.companion_diagnostics.config.ASR_PAIRING_TOKEN_FILE", tmp_path / "pairing-token")
    monkeypatch.setattr("ai_local.companion_diagnostics.config.ASR_JOB_ROOT", tmp_path / "jobs")
    monkeypatch.setattr("ai_local.companion_diagnostics.config.STATE_DIR", tmp_path / "state")
    monkeypatch.setattr("ai_local.companion_diagnostics.model_install_manager.status", lambda: {
        "state": "FAILED", "downloaded_bytes": 1, "total_bytes": 2,
        "current_file": "model.bin", "error_code": "TEST_ERROR",
        "error_detail": r"C:\Users\Alice\private-model-path",
    })
    payload = diagnostic_payload("test", {"state": "RUNNING", "health": "ok", "port_state": "companion"})
    encoded = json.dumps(payload)
    assert payload["privacy"] == {
        "contains_pairing_token": False,
        "contains_media": False,
        "contains_transcript": False,
        "contains_original_filename": False,
        "contains_job_payload": False,
    }
    assert "pairing-token" not in encoded
    assert "transcript_text" not in encoded
    assert "Alice" not in encoded


def test_protocol_listener_without_owned_pid_is_not_accepted_as_running(monkeypatch):
    import ai_local.companion as supervisor

    monkeypatch.setattr(supervisor, "_capability", lambda: {"protocol": "studio-local-asr-v1"})
    monkeypatch.setattr(supervisor, "_owned_pid", lambda: None)
    monkeypatch.setattr(supervisor, "preflight_report", lambda: {
        "checks": [{"code": "PORT_8799", "observed": {"state": "companion"}}]
    })
    assert supervisor.service_status()["state"] == "UNOWNED_COMPANION"
    with pytest.raises(RuntimeError, match="UNOWNED_COMPANION_PROCESS"):
        supervisor.start_service()
