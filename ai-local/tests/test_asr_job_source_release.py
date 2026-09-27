"""Local recognition may take a 15 GiB source (owner decision 2026-09-27); its copy must not sit
in the work folder for a day after the job can no longer use it (owner decision 2026-09-28)."""

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest

from ai_local import asr_jobs
from ai_local.asr_jobs import AsrJobManager


def _seed(root, job_id, state, hours_idle):
    path = root / job_id
    path.mkdir(parents=True)
    updated = (datetime.now(timezone.utc) - timedelta(hours=hours_idle)).isoformat()
    (path / asr_jobs.MANIFEST_NAME).write_text(json.dumps({"job_id": job_id, "state": state, "updated_at": updated}), encoding="utf-8")
    (path / asr_jobs.SOURCE_NAME).write_bytes(b"x" * 8)
    return path


def test_idle_finished_jobs_release_their_source_and_say_so(tmp_path):
    manager = AsrJobManager(root_provider=lambda: tmp_path)
    old = {state: _seed(tmp_path, "0000000%d-0000-4000-8000-000000000000" % i, state, 7) for i, state in enumerate(("COMPLETE", "FAILED", "CANCELED", "RECOVERABLE"), 1)}
    fresh = _seed(tmp_path, "00000005-0000-4000-8000-000000000000", "COMPLETE", 1)
    running = _seed(tmp_path, "00000006-0000-4000-8000-000000000000", "RUNNING", 7)
    released = asyncio.run(manager.release_idle_sources())
    assert released == 4
    for path in old.values():
        assert not (path / asr_jobs.SOURCE_NAME).exists()
        assert json.loads((path / asr_jobs.MANIFEST_NAME).read_text(encoding="utf-8"))["source_released"] is True
    assert (fresh / asr_jobs.SOURCE_NAME).exists()
    assert (running / asr_jobs.SOURCE_NAME).exists()
    assert asr_jobs.ASR_SOURCE_IDLE_SEC == 6 * 60 * 60


def test_a_released_job_refuses_resume_with_a_plain_reason(tmp_path, monkeypatch):
    manager = AsrJobManager(root_provider=lambda: tmp_path)
    path = _seed(tmp_path, "00000007-0000-4000-8000-000000000000", "FAILED", 7)
    asyncio.run(manager.release_idle_sources())
    with pytest.raises(ValueError, match="source copy was released"):
        asyncio.run(manager.resume("00000007-0000-4000-8000-000000000000"))
