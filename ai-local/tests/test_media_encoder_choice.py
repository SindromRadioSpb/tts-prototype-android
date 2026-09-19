"""Studio may choose the encoder for one conversion, and the result says which one ran.

Owner request 2026-09-19: the encoder was invisible in the browser - the report carried the
field, the dialog never showed it, so the only way to know what a conversion had used was to
read the API by hand. Two things follow, and both are tested here: the choice is offered only
where the machine proved it works, and the finished copy still names the encoder that made it
even when the plan it came from has been replaced by the output probe.
"""

from __future__ import annotations

import asyncio

import pytest

from ai_local import companion_settings, config, media_compat
from ai_local.media_compat import (
    TRANSCODE_REQUIRED,
    classify_probe,
    select_requested_video_encoder,
    video_encoder_options,
)
from ai_local.media_jobs import MediaJobConflict, MediaJobManager
from tests.test_media_compat import video_probe


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE_DIR", tmp_path / "state")
    monkeypatch.delenv("AI_LOCAL_MEDIA_HW_ENCODER", raising=False)


def transcodable_probe():
    """A source the target contract cannot accept as it is: HEVC forces a real re-encode."""
    probe = video_probe()
    probe["video_streams"][0]["codec_name"] = "hevc"
    return probe


async def chunks(payload=b"source-bytes"):
    yield payload


def test_the_fixture_really_needs_a_video_re_encode():
    assert classify_probe(transcodable_probe())["outcome"] == TRANSCODE_REQUIRED


def test_an_explicit_cpu_request_never_pays_for_a_gpu_probe():
    probed = []

    def probe():
        probed.append(1)
        return True

    choice = select_requested_video_encoder("cpu", probe=probe)
    assert choice["choice"] == "cpu" and choice["encoder"] == "libx264"
    assert probed == []


def test_an_explicit_gpu_request_is_still_proved_before_it_is_used():
    assert select_requested_video_encoder("gpu", probe=lambda: True)["encoder"] == "h264_nvenc"
    fallback = select_requested_video_encoder("gpu", probe=lambda: False)
    assert fallback["encoder"] == "libx264"
    assert fallback["fallback_reason"] == "NVENC_UNAVAILABLE"


def test_no_request_means_whatever_this_companion_is_set_to():
    companion_settings.update_setting("media_hw_encoder", "auto")
    assert select_requested_video_encoder(None, probe=lambda: True)["choice"] == "gpu"
    companion_settings.update_setting("media_hw_encoder", "off")
    assert select_requested_video_encoder(None, probe=lambda: True)["choice"] == "cpu"


def test_the_stored_setting_reaches_the_plan_with_no_environment_variable_involved():
    companion_settings.update_setting("media_hw_encoder", "auto")
    plan = classify_probe(transcodable_probe(), gpu_encoder_available=True)["plan"]
    assert plan["video_encoder"] == "h264_nvenc"
    assert plan["video_encoder_choice"] == "gpu"
    assert plan["video_quality"] == "cq 22 · preset p5"


def test_the_plan_offers_both_choices_and_names_what_this_machine_cannot_do():
    result = classify_probe(transcodable_probe(), gpu_encoder_available=False)
    assert result["outcome"] == TRANSCODE_REQUIRED
    options = {option["value"]: option for option in result["plan"]["video_encoder_options"]}
    assert options["cpu"]["available"] is True
    assert options["gpu"]["available"] is False
    assert options["gpu"]["reason"] == "NVENC_UNAVAILABLE"
    assert result["plan"]["video_encoder"] == "libx264"


def test_a_machine_that_was_never_asked_is_reported_as_unknown_not_as_no():
    options = {option["value"]: option for option in video_encoder_options(None)}
    assert options["gpu"]["available"] is None
    assert options["gpu"]["reason"] == "NOT_PROBED"


def test_the_plan_hash_changes_with_the_offer_so_a_stale_screen_cannot_confirm_it():
    with_gpu = classify_probe(transcodable_probe(), gpu_encoder_available=True)
    without_gpu = classify_probe(transcodable_probe(), gpu_encoder_available=False)
    assert with_gpu["plan_sha256"] != without_gpu["plan_sha256"]


def _manager(tmp_path, prepared, gpu_available=True):
    async def probe(path):
        if path.name.startswith("output.partial"):
            return {"outcome": "READY", "target_contract": "linguistpro-mobile-v1"}
        report = classify_probe(transcodable_probe(), gpu_encoder_available=gpu_available)
        report["probe"] = transcodable_probe()
        report["gpu_encoder_available"] = gpu_available
        return report

    async def prepare(_source, output, mode, _cancel, _progress, plan=None, video_encoder=None):
        prepared.append({"mode": mode, "video_encoder": video_encoder, "plan": plan})
        output.write_bytes(b"prepared")
        resolved = "gpu" if video_encoder == "gpu" else "cpu"
        return {"mode": mode, "skip_equivalence_for_test": True, "encoding": {
            "requested": video_encoder or "companion_default", "choice": resolved,
            "encoder": "h264_nvenc" if resolved == "gpu" else "libx264",
            "quality": "cq 22 · preset p5", "fallback_reason": None,
        }}

    async def no_subtitles(*_args, **_kwargs):
        return []

    return MediaJobManager(tmp_path, probe_fn=probe, prepare_fn=prepare, extract_fn=no_subtitles)


async def _waiting_job(manager):
    created = await manager.create(chunks(), filename="clip.mkv", content_type="video/x-matroska")
    await manager.wait(created["job_id"])
    return manager.get(created["job_id"])


@pytest.mark.asyncio
async def test_an_encoder_the_machine_could_not_prove_is_refused(tmp_path):
    prepared: list[dict] = []
    manager = _manager(tmp_path, prepared, gpu_available=False)
    job = await _waiting_job(manager)
    with pytest.raises(MediaJobConflict):
        await manager.prepare(job["job_id"], mode="transcode",
                              plan_sha256=job["report"]["plan_sha256"], video_encoder="gpu")
    assert prepared == [], "a refused choice must not start a conversion"
    assert manager.get(job["job_id"])["state"] == "WAITING_FOR_DECISION"


@pytest.mark.asyncio
async def test_the_chosen_encoder_reaches_the_executor_and_the_finished_report(tmp_path):
    prepared: list[dict] = []
    manager = _manager(tmp_path, prepared)
    job = await _waiting_job(manager)
    await manager.prepare(job["job_id"], mode="transcode",
                          plan_sha256=job["report"]["plan_sha256"], video_encoder="gpu")
    await manager.wait(job["job_id"])
    assert prepared and prepared[0]["video_encoder"] == "gpu"
    report = manager.get(job["job_id"])["report"]
    assert report["encoding"]["encoder"] == "h264_nvenc"
    assert report["encoding"]["requested"] == "gpu"


@pytest.mark.asyncio
async def test_without_a_choice_the_job_still_records_which_encoder_ran(tmp_path):
    prepared: list[dict] = []
    manager = _manager(tmp_path, prepared)
    job = await _waiting_job(manager)
    await manager.prepare(job["job_id"], mode="transcode",
                          plan_sha256=job["report"]["plan_sha256"])
    await manager.wait(job["job_id"])
    assert prepared[0]["video_encoder"] is None
    assert manager.get(job["job_id"])["report"]["encoding"]["encoder"] == "libx264"


@pytest.mark.asyncio
async def test_choosing_an_audio_stream_does_not_narrow_the_encoder_offer(tmp_path):
    """Re-classifying the stored probe must not forget what the machine already proved."""
    manager = _manager(tmp_path, [])
    job = await _waiting_job(manager)
    stream_index = job["report"]["audio_selection"]["index"]
    updated = await manager.choose_audio_stream(job["job_id"], stream_index)
    options = {option["value"]: option
               for option in updated["report"]["plan"]["video_encoder_options"]}
    assert options["gpu"]["available"] is True


@pytest.mark.asyncio
async def test_a_fallback_is_named_in_the_receipt_not_hidden(tmp_path, monkeypatch):
    """The case the receipt exists for: the owner asked for the GPU and did not get it."""
    used: list[list[str]] = []

    async def fake_ffmpeg(args, _cancel, _progress, _duration):
        used.append(args)

    async def fake_probe(_path):
        report = classify_probe(transcodable_probe(), gpu_encoder_available=True)
        report["probe"] = transcodable_probe()
        return report

    monkeypatch.setattr(media_compat, "_run_ffmpeg_with_progress", fake_ffmpeg)
    monkeypatch.setattr(media_compat, "probe_media", fake_probe)
    monkeypatch.setattr(media_compat, "_probe_nvenc", lambda: False)
    source, output = tmp_path / "in.mkv", tmp_path / "out.mp4"
    source.write_bytes(b"x")

    async def progress(_value):
        return None

    plan = classify_probe(transcodable_probe(), gpu_encoder_available=True)["plan"]
    receipt = await media_compat.prepare_media(
        source, output, "transcode", asyncio.Event(), progress, plan=plan, video_encoder="gpu",
    )
    assert receipt["encoding"]["requested"] == "gpu"
    assert receipt["encoding"]["encoder"] == "libx264"
    assert receipt["encoding"]["fallback_reason"] == "NVENC_UNAVAILABLE"
    assert "libx264" in used[0] and "h264_nvenc" not in used[0]
