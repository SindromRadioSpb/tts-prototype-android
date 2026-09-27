"""A media job must never hang in a working state because its manifest could not be replaced.

Owner-live 2026-09-27 (Fauda S05E01, 2.0 GiB): progress stopped at 77.5% at 23:28:00 with a
stray job.tmp beside job.json, no ffmpeg left running, and cancel answered CANCEL_REQUESTED
forever. On Windows os.replace refuses while another handle (the Studio poll every 500 ms, an
antivirus scan) has the target open; that one PermissionError escaped the progress callback,
killed the prepare task and left the manifest in TRANSCODING. After a restart nothing
reconciled it, so the job also held one of the two queue slots for a day.
"""

import asyncio
import json
import os

import pytest

from ai_local import media_jobs
from ai_local.media_jobs import MediaJobManager

JOB = "11111111-1111-4111-8111-111111111111"


def _seed(root, job_id=JOB, **fields):
    job_dir = root / job_id
    job_dir.mkdir(parents=True)
    manifest = {"job_id": job_id, "state": "TRANSCODING", "progress": 0.5, "source_bytes": 1,
                "created_at": 1.0, "updated_at": 9e12}
    manifest.update(fields)
    (job_dir / "job.json").write_text(json.dumps(manifest), encoding="utf-8")
    return job_dir


def test_manifest_replace_survives_a_briefly_locked_target(tmp_path, monkeypatch):
    real_replace = os.replace
    calls = {"n": 0}

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] <= 2:
            raise PermissionError(13, "The process cannot access the file")
        return real_replace(src, dst)

    monkeypatch.setattr(media_jobs.os, "replace", flaky)
    monkeypatch.setattr(media_jobs.time, "sleep", lambda _s: None)
    manager = MediaJobManager(tmp_path)
    _seed(tmp_path, state="WAITING_FOR_DECISION")
    manifest = manager.get(JOB)
    manifest["progress"] = 0.7
    manager._write(JOB, manifest)
    assert calls["n"] == 3
    assert manager.get(JOB)["progress"] == 0.7
    assert not (tmp_path / JOB / "job.tmp").exists()


def test_manifest_read_retries_while_the_file_is_being_replaced(tmp_path, monkeypatch):
    manager = MediaJobManager(tmp_path)
    _seed(tmp_path, state="WAITING_FOR_DECISION")
    path = tmp_path / JOB / "job.json"
    real_read = type(path).read_text
    calls = {"n": 0}

    def flaky(self, *args, **kwargs):
        if self.name == "job.json":
            calls["n"] += 1
            if calls["n"] == 1:
                raise PermissionError(13, "locked")
        return real_read(self, *args, **kwargs)

    monkeypatch.setattr(type(path), "read_text", flaky)
    monkeypatch.setattr(media_jobs.time, "sleep", lambda _s: None)
    assert manager.get(JOB)["state"] == "WAITING_FOR_DECISION"


@pytest.mark.asyncio
async def test_a_failed_progress_write_does_not_kill_the_preparation(tmp_path, monkeypatch):
    seen = {}

    async def prepare(source, partial, mode, cancel, progress, **_kw):
        await progress(0.5)  # this write fails
        await progress(0.8)  # and this one lands
        partial.write_bytes(b"prepared")
        seen["done"] = True
        return {"mode": mode}

    async def probe(_path):
        return {"outcome": "READY"}

    manager = MediaJobManager(tmp_path, prepare_fn=prepare, probe_fn=probe)
    job_dir = _seed(tmp_path, state="TRANSCODING", progress=0.21)
    (job_dir / "source.media").write_bytes(b"source")
    manager._cancel[JOB] = asyncio.Event()
    real_write = manager._write
    writes = {"n": 0}

    def flaky_write(job_id, manifest):
        writes["n"] += 1
        if writes["n"] == 1:
            raise PermissionError(13, "locked beyond the retry budget")
        return real_write(job_id, manifest)

    monkeypatch.setattr(manager, "_write", flaky_write)
    await manager._prepare(JOB, "transcode", {}, "full", None)
    assert seen.get("done") is True
    assert manager.get(JOB)["state"] != "TRANSCODING"


def test_start_up_settles_jobs_that_no_process_is_running(tmp_path):
    _seed(tmp_path, "22222222-2222-4222-8222-222222222222", state="TRANSCODING")
    _seed(tmp_path, "33333333-3333-4333-8333-333333333333", state="CANCEL_REQUESTED")
    _seed(tmp_path, "44444444-4444-4444-8444-444444444444", state="WAITING_FOR_DECISION")
    _seed(tmp_path, "55555555-5555-4555-8555-555555555555", state="COMPLETE")
    manager = MediaJobManager(tmp_path)
    assert manager.get("22222222-2222-4222-8222-222222222222")["state"] == "FAILED"
    assert manager.get("22222222-2222-4222-8222-222222222222")["error"] == "MEDIA_JOB_INTERRUPTED"
    assert manager.get("33333333-3333-4333-8333-333333333333")["state"] == "CANCELED"
    # A job waiting for the person's decision is not work in flight; it keeps its state.
    assert manager.get("44444444-4444-4444-8444-444444444444")["state"] == "WAITING_FOR_DECISION"
    assert manager.get("55555555-5555-4555-8555-555555555555")["state"] == "COMPLETE"
    assert manager._nonterminal_count() == 1


@pytest.mark.asyncio
async def test_cancel_of_a_job_without_a_live_task_ends_it_at_once(tmp_path):
    manager = MediaJobManager(tmp_path)
    _seed(tmp_path, state="TRANSCODING")
    # Settled at start-up already; re-seed a working state as if it stalled after start.
    manifest = manager.get(JOB)
    manifest["state"] = "TRANSCODING"
    manager._write(JOB, manifest)
    result = await manager.cancel(JOB)
    assert result["state"] == "CANCELED"


def test_asr_job_record_replace_survives_a_briefly_locked_target(tmp_path, monkeypatch):
    from ai_local import asr_jobs

    real_replace = os.replace
    calls = {"n": 0}

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] == 1:
            raise PermissionError(13, "locked")
        return real_replace(src, dst)

    monkeypatch.setattr(asr_jobs.os, "replace", flaky)
    monkeypatch.setattr(asr_jobs.time, "sleep", lambda _s: None)
    target = tmp_path / "job.json"
    asr_jobs._atomic_json(target, {"state": "RUNNING"})
    assert json.loads(target.read_text(encoding="utf-8")) == {"state": "RUNNING"}
    assert calls["n"] == 2
