"""O-031a (2026-09-28): ffmpeg ran out of space on C: at 79% and the job said only
MEDIA_PREPARE_OR_VERIFY_FAILED / RuntimeError; Studio could not tell the owner to free space."""

import asyncio
import json
from collections import namedtuple

from ai_local import media_jobs
from ai_local.media_jobs import MediaJobManager

JOB = "99999999-9999-4999-8999-999999999999"
Usage = namedtuple("Usage", "total used free")


def test_a_preparation_that_dies_on_a_full_disk_names_the_disk(tmp_path, monkeypatch):
    async def prepare(*_args, **_kwargs):
        raise RuntimeError("ffmpeg exited 1")

    manager = MediaJobManager(tmp_path, prepare_fn=prepare)
    job_dir = tmp_path / JOB
    job_dir.mkdir()
    (job_dir / "source.media").write_bytes(b"s")
    (job_dir / "job.json").write_text(json.dumps({"job_id": JOB, "state": "TRANSCODING", "progress": 0.5}), encoding="utf-8")
    manager._cancel[JOB] = asyncio.Event()
    monkeypatch.setattr(media_jobs.shutil, "disk_usage", lambda _p: Usage(100, 100, 10 * 1024 * 1024))
    asyncio.run(manager._prepare(JOB, "transcode", {}, "full", None))
    manifest = manager.get(JOB)
    assert manifest["state"] == "FAILED"
    assert manifest["error"] == "MEDIA_DISK_FULL"
    assert "free" in manifest["error_detail"]
