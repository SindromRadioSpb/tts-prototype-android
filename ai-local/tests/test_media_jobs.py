import asyncio
import hashlib

import pytest

from ai_local.media_jobs import MediaJobConflict, MediaJobManager


async def chunks(data):
    yield data[:3]
    yield data[3:]


@pytest.mark.asyncio
async def test_job_hashes_upload_and_waits_for_explicit_prepare(tmp_path):
    payload = b"actual-media-bytes"

    async def probe(path):
        if path.name == "output.partial.mp4":
            return {"outcome": "READY", "target_contract": "linguistpro-mobile-v1"}
        return {
            "outcome": "LOSSLESS_REPAIR",
            "plan": {"mode": "lossless_repair", "video_encoder": None, "audio_encoder": None},
            "plan_sha256": "a" * 64,
            "estimated_output_bytes": len(payload),
        }

    async def prepare(source, output, mode, _cancel, _progress):
        assert mode == "lossless_repair"
        output.write_bytes(source.read_bytes() + b"-fixed")

    manager = MediaJobManager(tmp_path, probe_fn=probe, prepare_fn=prepare)
    job = await manager.create(chunks(payload), filename="lesson.mp4", content_type="video/mp4")
    await manager.wait(job["job_id"])
    waiting = manager.get(job["job_id"])
    assert waiting["state"] == "WAITING_FOR_DECISION"
    assert waiting["source_sha256"] == hashlib.sha256(payload).hexdigest()

    with pytest.raises(MediaJobConflict):
        await manager.prepare(job["job_id"], mode="lossless_repair", plan_sha256="b" * 64)

    await manager.prepare(job["job_id"], mode="lossless_repair", plan_sha256="a" * 64)
    await manager.wait(job["job_id"])
    complete = manager.get(job["job_id"])
    assert complete["state"] == "COMPLETE"
    assert complete["output_sha256"] != complete["source_sha256"]
    assert manager.file_path(job["job_id"]).read_bytes().endswith(b"-fixed")


@pytest.mark.asyncio
async def test_cancel_and_delete_remove_partial_job_files(tmp_path):
    release = asyncio.Event()

    async def probe(_path):
        await release.wait()
        return {"outcome": "READY", "plan": None, "plan_sha256": None}

    manager = MediaJobManager(tmp_path, probe_fn=probe)
    job = await manager.create(chunks(b"video"), filename="lesson.mp4", content_type="video/mp4")
    await manager.cancel(job["job_id"])
    release.set()
    await manager.wait(job["job_id"])
    assert manager.get(job["job_id"])["state"] == "CANCELED"
    receipt = await manager.delete(job["job_id"])
    assert receipt["schema"] == "media-job-delete-receipt-v1"
    assert receipt["deleted_source"] is True
    assert not (tmp_path / job["job_id"]).exists()


@pytest.mark.asyncio
async def test_media_queue_is_bounded_to_one_active_plus_one_waiting(tmp_path):
    release = asyncio.Event()

    async def probe(_path):
        await release.wait()
        return {"outcome": "BLOCKED", "next_action": "choose-another-file"}

    manager = MediaJobManager(tmp_path, probe_fn=probe)
    first = await manager.create(chunks(b"first"), filename="first.mp4", content_type="video/mp4")
    second = await manager.create(chunks(b"second"), filename="second.mp4", content_type="video/mp4")
    with pytest.raises(MediaJobConflict):
        await manager.create(chunks(b"third"), filename="third.mp4", content_type="video/mp4")
    release.set()
    await manager.wait(first["job_id"])
    await manager.wait(second["job_id"])
