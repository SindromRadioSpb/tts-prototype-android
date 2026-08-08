import asyncio
import json
import shutil
import subprocess

import pytest

from ai_local.media_compat import (
    READY,
    LOSSLESS_REPAIR,
    TRANSCODE_REQUIRED,
    BLOCKED,
    classify_probe,
    minimum_h264_level,
    prepare_media,
    probe_media,
    prove_lossless_equivalence,
)


def video_probe(**overrides):
    probe = {
        "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": 120.0, "size": 1_000_000},
        "video_streams": [{
            "index": 0, "codec_name": "h264", "profile": "Main", "level": 32,
            "pix_fmt": "yuv420p", "width": 1280, "height": 720,
            "avg_frame_rate": "50/1", "field_order": "progressive",
        }],
        "audio_streams": [{
            "index": 1, "codec_name": "aac", "profile": "LC", "sample_rate": "48000",
            "channels": 2,
        }],
    }
    for key, value in overrides.items():
        if key in {"format", "video_streams", "audio_streams"}:
            probe[key] = value
        else:
            probe[key] = value
    return probe


def test_target_v1_accepts_known_720p50_main_level_32():
    assert minimum_h264_level(1280, 720, 50.0) == 32
    result = classify_probe(video_probe())
    assert result["outcome"] == READY
    assert result["target_contract"] == "linguistpro-mobile-v1"

    probe = video_probe(faststart=False)  # actual episodes 1-3; concrete packet acceptance is READY
    result = classify_probe(probe)
    assert result["outcome"] == READY
    assert result["codec_summary"]["faststart"] is False


def test_episode_five_level_62_is_lossless_repair_not_transcode():
    probe = video_probe()
    probe["video_streams"][0]["level"] = 62
    probe["audio_streams"][0]["profile"] = "HE-AAC"  # actual episode-5 ffprobe state
    result = classify_probe(probe)
    assert result["outcome"] == LOSSLESS_REPAIR
    assert result["plan"]["mode"] == "lossless_repair"
    assert result["plan"]["video_encoder"] is None
    assert result["plan"]["audio_encoder"] is None
    assert result["plan_sha256"]

    probe["video_streams"][0]["level"] = 32
    assert classify_probe(probe)["outcome"] == READY


def test_hevc_ten_bit_requires_explicit_transcode():
    probe = video_probe()
    probe["video_streams"][0].update(codec_name="hevc", profile="Main 10", pix_fmt="yuv420p10le")
    result = classify_probe(probe)
    assert result["outcome"] == TRANSCODE_REQUIRED
    assert result["plan"]["mode"] == "transcode"

    hdr = video_probe()
    hdr["video_streams"][0].update(color_transfer="smpte2084", color_primaries="bt2020")
    assert classify_probe(hdr)["outcome"] == TRANSCODE_REQUIRED


def test_missing_or_ambiguous_video_is_blocked_with_next_action():
    missing = classify_probe(video_probe(video_streams=[]))
    ambiguous = classify_probe(video_probe(video_streams=[video_probe()["video_streams"][0]] * 2))
    assert missing["outcome"] == BLOCKED
    assert ambiguous["outcome"] == BLOCKED
    assert missing["next_action"]
    assert ambiguous["next_action"]
    assert classify_probe(video_probe(encrypted=True))["outcome"] == BLOCKED


@pytest.mark.asyncio
async def test_real_ffmpeg_lossless_repair_is_level_32_faststart_and_essence_equal(tmp_path):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("Companion FFmpeg runtime is not installed")
    source, output = tmp_path / "source.mp4", tmp_path / "output.partial.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=50",
        "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000",
        "-t", "2", "-c:v", "libx264", "-profile:v", "main", "-level:v", "6.2",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-profile:a", "aac_low",
        "-movflags", "-faststart", str(source),
    ], check=True)
    before = await probe_media(source)
    assert before["outcome"] == LOSSLESS_REPAIR
    serialized = json.dumps(before)
    assert str(tmp_path) not in serialized
    assert '"tags"' not in serialized

    async def progress(_value):
        return None

    await prepare_media(source, output, "lossless_repair", asyncio.Event(), progress)
    after = await probe_media(output)
    proof = await prove_lossless_equivalence(source, output)
    assert after["outcome"] == READY
    assert after["codec_summary"]["declared_level"] == 32
    assert after["probe"]["faststart"] is True
    assert proof["verified"] is True


@pytest.mark.asyncio
async def test_real_ffmpeg_transcode_produces_target_mp4_without_upscale(tmp_path):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("Companion FFmpeg runtime is not installed")
    source, output = tmp_path / "source.avi", tmp_path / "output.partial.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
        "-t", "2", "-c:v", "mpeg4", "-c:a", "mp3", str(source),
    ], check=True)
    assert (await probe_media(source))["outcome"] == TRANSCODE_REQUIRED

    async def progress(_value):
        return None

    await prepare_media(source, output, "transcode", asyncio.Event(), progress)
    after = await probe_media(output)
    assert after["outcome"] == READY
    assert after["codec_summary"]["width"] == 640
    assert after["codec_summary"]["height"] == 360
    assert after["codec_summary"]["video_codec"] == "h264"
    assert after["codec_summary"]["audio_codec"] == "aac"
