"""Paid recognition hears only the speech track (owner decision 2026-09-28).

Studio sent the whole prepared video to Gemini: audio plus low-resolution frames cost about 2.6x
the audio alone, and a film above 2 GiB could not be sent at all. The Companion extracts the
selected audio stream as small mono MP3, which Studio also slices per window (the S12.5 transport).
"""

import asyncio
import hashlib
import json

import pytest

from ai_local.media_jobs import MediaJobConflict, MediaJobManager

JOB = "77777777-7777-4777-8777-777777777777"


def _seed(root, state="COMPLETE", audio_index=2):
    job_dir = root / JOB
    job_dir.mkdir(parents=True)
    (job_dir / "source.media").write_bytes(b"video")
    (job_dir / "job.json").write_text(json.dumps({
        "job_id": JOB, "state": state, "report": {"audio_selection": {"index": audio_index}},
    }), encoding="utf-8")
    return job_dir


def test_speech_audio_is_extracted_once_from_the_selected_stream(tmp_path):
    calls = []

    async def extract(source, out, stream_index, cancel):
        calls.append(stream_index)
        out.write_bytes(b"ID3mp3-bytes")

    manager = MediaJobManager(tmp_path, speech_fn=extract)
    _seed(tmp_path)
    first = asyncio.run(manager.speech_audio(JOB))
    second = asyncio.run(manager.speech_audio(JOB))
    assert calls == [2], "a second request reuses the verified file"
    assert first["path"].name == "speech.mp3"
    assert first["sha256"] == hashlib.sha256(b"ID3mp3-bytes").hexdigest() == second["sha256"]
    assert manager.get(JOB)["speech_audio"]["stream_index"] == 2


def test_a_changed_audio_choice_extracts_again(tmp_path):
    calls = []

    async def extract(source, out, stream_index, cancel):
        calls.append(stream_index)
        out.write_bytes(b"mp3-%d" % stream_index)

    manager = MediaJobManager(tmp_path, speech_fn=extract)
    job_dir = _seed(tmp_path, audio_index=1)
    asyncio.run(manager.speech_audio(JOB))
    manifest = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    manifest["report"]["audio_selection"]["index"] = 2
    (job_dir / "job.json").write_text(json.dumps(manifest), encoding="utf-8")
    asyncio.run(manager.speech_audio(JOB))
    assert calls == [1, 2]


@pytest.mark.parametrize("state", ["FAILED", "CANCELED", "UPLOADING"])
def test_speech_audio_needs_a_checked_job_with_its_source(tmp_path, state):
    async def extract(*_args):
        raise AssertionError("must not run")

    manager = MediaJobManager(tmp_path, speech_fn=extract)
    _seed(tmp_path, state=state)
    with pytest.raises(MediaJobConflict):
        asyncio.run(manager.speech_audio(JOB))


def test_the_speech_route_serves_mp3_with_its_digest(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from ai_local import main
    from ai_local.security import require_companion_auth

    async def extract(source, out, stream_index, cancel):
        out.write_bytes(b"mp3!")

    manager = MediaJobManager(tmp_path, speech_fn=extract)
    _seed(tmp_path)
    monkeypatch.setattr(main, "media_job_manager", manager)
    monkeypatch.setitem(main.app.dependency_overrides, require_companion_auth, lambda: None)
    app = FastAPI()
    app.router.routes.extend(main.app.router.routes)
    with TestClient(app) as client:
        response = client.get(f"/v1/media/jobs/{JOB}/speech-audio")
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["x-lp-media-sha256"] == hashlib.sha256(b"mp3!").hexdigest()
    assert response.content == b"mp3!"
