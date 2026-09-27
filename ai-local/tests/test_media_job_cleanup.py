"""Temporary copies are released as soon as nothing can use them (owner decision 2026-09-28).

On 2026-09-28 eight finished, cancelled and refused jobs held 13.7 GB on C: while a 3.8 GB film
failed for lack of space; the only cleanup was a 24-hour age limit. A job can be prepared only
from WAITING_FOR_DECISION, so the bytes of a FAILED, CANCELED or BLOCKED job are dead at once.
"""

import json
import time

from ai_local.media_jobs import MediaJobManager


def _seed(root, job_id, state, idle_seconds=0.0, files=("source.media", "ready.mp4")):
    job_dir = root / job_id
    job_dir.mkdir(parents=True)
    now = time.time()
    (job_dir / "job.json").write_text(json.dumps({
        "job_id": job_id, "state": state, "created_at": now - idle_seconds, "updated_at": now - idle_seconds,
    }), encoding="utf-8")
    for name in files:
        (job_dir / name).write_bytes(b"x" * 16)
    (job_dir / "subtitles").mkdir()
    (job_dir / "subtitles" / "3.srt").write_text("1", encoding="utf-8")
    return job_dir


IDS = {state: "%08d-0000-4000-8000-000000000000" % i for i, state in enumerate(
    ["FAILED", "CANCELED", "BLOCKED", "WAITING_FOR_DECISION", "COMPLETE", "WAITING_OLD", "COMPLETE_OLD"], 1)}


def test_dead_jobs_lose_their_bytes_but_keep_their_status(tmp_path):
    for state in ("FAILED", "CANCELED", "BLOCKED"):
        _seed(tmp_path, IDS[state], state)
    manager = MediaJobManager(tmp_path)
    for state in ("FAILED", "CANCELED", "BLOCKED"):
        job_dir = tmp_path / IDS[state]
        assert sorted(p.name for p in job_dir.iterdir()) == ["job.json"], state
        assert manager.get(IDS[state])["state"] == state
        assert manager.get(IDS[state])["files_released"] is True


def test_fresh_work_is_kept_and_abandoned_work_is_released(tmp_path):
    _seed(tmp_path, IDS["WAITING_FOR_DECISION"], "WAITING_FOR_DECISION", idle_seconds=60)
    _seed(tmp_path, IDS["COMPLETE"], "COMPLETE", idle_seconds=60)
    _seed(tmp_path, IDS["WAITING_OLD"], "WAITING_FOR_DECISION", idle_seconds=MediaJobManager.WAITING_IDLE_SECONDS + 5)
    _seed(tmp_path, IDS["COMPLETE_OLD"], "COMPLETE", idle_seconds=MediaJobManager.COMPLETE_IDLE_SECONDS + 5)
    manager = MediaJobManager(tmp_path)
    assert (tmp_path / IDS["WAITING_FOR_DECISION"] / "source.media").is_file()
    assert (tmp_path / IDS["COMPLETE"] / "ready.mp4").is_file()
    old_wait = manager.get(IDS["WAITING_OLD"])
    assert old_wait["state"] == "CANCELED" and old_wait["error"] == "MEDIA_JOB_ABANDONED"
    assert not (tmp_path / IDS["WAITING_OLD"] / "source.media").exists()
    assert not (tmp_path / IDS["COMPLETE_OLD"]).exists()
    assert MediaJobManager.WAITING_IDLE_SECONDS == 2 * 60 * 60
    assert MediaJobManager.COMPLETE_IDLE_SECONDS == 6 * 60 * 60


def test_sweep_also_covers_a_previous_work_folder(tmp_path):
    old_root, new_root = tmp_path / "old", tmp_path / "new"
    _seed(old_root, IDS["FAILED"], "FAILED")
    MediaJobManager(new_root, extra_roots=[old_root])
    assert sorted(p.name for p in (old_root / IDS["FAILED"]).iterdir()) == ["job.json"]


def test_cancelling_a_waiting_job_releases_it_immediately(tmp_path):
    import asyncio

    manager = MediaJobManager(tmp_path)
    _seed(tmp_path, IDS["WAITING_FOR_DECISION"], "WAITING_FOR_DECISION")
    asyncio.run(manager.cancel(IDS["WAITING_FOR_DECISION"]))
    assert sorted(p.name for p in (tmp_path / IDS["WAITING_FOR_DECISION"]).iterdir()) == ["job.json"]
