import asyncio
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from ai_local.media_compat import (
    AUDIO_STREAM_CHOICE_REQUIRED,
    AUDIO_TRANSCODE_REQUIRED,
    BLOCKED,
    LOSSLESS_REPAIR,
    MAX_BYTES,
    READY,
    TRANSCODE_REQUIRED,
    prove_video_copy_equivalence,
    _normalize_probe,
    classify_probe,
    extract_text_subtitles,
    normalize_language,
    prepare_media,
    probe_media,
)
from ai_local.media_jobs import MediaJobConflict, MediaJobManager, MediaJobNotFound, MediaTooLarge

GIB = 1024 ** 3
RLE, PDF = "‫", "‬"


def raw_stream(index, codec_type, codec_name, language=None, title=None, **disposition):
    tags = {}
    if language:
        tags["language"] = language
    if title:
        tags["title"] = title
    flags = {"default": 0, "forced": 0, "hearing_impaired": 0, "visual_impaired": 0, "comment": 0, "attached_pic": 0}
    flags.update(disposition)
    return {"index": index, "codec_type": codec_type, "codec_name": codec_name, "tags": tags, "disposition": flags}


def owner_shaped_raw_probe(size=2_181_255_313):
    """Stream layout of the owner-supplied MKV recorded in docs/research/studio-subtitle-video-material."""
    video = raw_stream(0, "video", "h264", "heb", default=1)
    video.update(profile="Main", level=40, pix_fmt="yuv420p", width=1920, height=1080,
                 avg_frame_rate="25/1", field_order="progressive", color_transfer="bt709")
    video["tags"]["BPS"] = "4786958"
    audio = [
        raw_stream(1, "audio", "ac3", "rus", "Studio dub", default=1),
        raw_stream(2, "audio", "eac3", "heb"),
        raw_stream(3, "audio", "eac3", "eng"),
    ]
    for stream, bps in zip(audio, (448000, 640000, 640000)):
        stream.update(channels=6, sample_rate="48000", bit_rate=str(bps))
    subtitles = [
        raw_stream(4, "subtitle", "subrip", "rus"),
        raw_stream(5, "subtitle", "subrip", "ukr"),
        raw_stream(6, "subtitle", "subrip", "heb", "Forced"),
        raw_stream(7, "subtitle", "subrip", "heb"),
        raw_stream(8, "subtitle", "subrip", "heb", "SDH", hearing_impaired=1),
        raw_stream(9, "subtitle", "hdmv_pgs_subtitle", "eng"),
    ]
    cover = raw_stream(10, "video", "png", attached_pic=1)
    return {
        "format": {"format_name": "matroska,webm", "duration": "2672.68", "size": str(size)},
        "streams": [video, *audio, *subtitles, cover],
    }


def mp4_two_aac_raw_probe():
    video = raw_stream(0, "video", "h264", default=1)
    video.update(profile="Main", level=32, pix_fmt="yuv420p", width=1280, height=720,
                 avg_frame_rate="50/1", field_order="progressive")
    first = raw_stream(1, "audio", "aac", "rus", default=1)
    second = raw_stream(2, "audio", "aac", "heb")
    for stream in (first, second):
        stream.update(profile="LC", channels=2, sample_rate="48000")
    return {"format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": "120", "size": "1000000"},
            "streams": [video, first, second]}


def test_language_codes_normalize_to_iso_639_1():
    assert normalize_language("heb") == "he"
    assert normalize_language("iw") == "he"
    assert normalize_language("he-IL") == "he"
    assert normalize_language("RUS") == "ru"
    assert normalize_language("ara") == "ar"
    assert normalize_language("und") is None
    assert normalize_language("") is None
    assert normalize_language(None) is None
    assert normalize_language("tlh") == "tlh"


def test_owner_shaped_mkv_is_inventoried_and_selects_hebrew_audio_not_the_default_dub():
    probe = _normalize_probe(owner_shaped_raw_probe())
    assert [stream["index"] for stream in probe["video_streams"]] == [0]
    assert [stream["language"] for stream in probe["audio_streams"]] == ["ru", "he", "en"]
    subtitles = {stream["index"]: stream for stream in probe["subtitle_streams"]}
    assert subtitles[6]["title"] == "Forced"
    assert subtitles[6]["disposition"]["forced"] == 0
    assert subtitles[8]["disposition"]["hearing_impaired"] == 1
    assert subtitles[7]["text_based"] is True
    assert subtitles[9]["text_based"] is False
    assert '"tags"' not in json.dumps(probe)

    report = classify_probe(probe)
    # Video already satisfies the target contract; only the 5.1 E-AC3 track must be re-encoded.
    assert report["outcome"] == AUDIO_TRANSCODE_REQUIRED
    assert report["plan"]["mode"] == "audio_transcode"
    assert report["plan"]["quality_impact"] == "audio_reencoded_video_copied"
    assert report["plan"]["video_encoder"] is None
    assert report["audio_selection"] == {
        "index": 2, "type_index": 1, "language": "he", "title": None, "reason": "target_language_tag",
    }
    assert report["plan"]["selected_audio_stream"] == 2
    inventory = report["track_inventory"]
    assert inventory["schema"] == "media-track-inventory-v1"
    assert [track["index"] for track in inventory["audio"]] == [1, 2, 3]
    assert [track["type_index"] for track in inventory["audio"]] == [0, 1, 2]
    assert [track["index"] for track in inventory["subtitles"]] == [4, 5, 6, 7, 8, 9]


def test_video_that_misses_the_target_still_requires_a_full_transcode():
    probe = owner_shaped_raw_probe()
    probe["streams"][0].update(codec_name="hevc", profile="Main 10", pix_fmt="yuv420p10le")
    report = classify_probe(_normalize_probe(probe))
    assert report["outcome"] == TRANSCODE_REQUIRED
    assert report["plan"]["mode"] == "transcode"


def test_audio_transcode_keeps_video_bytes_and_estimates_from_stream_bitrates():
    report = classify_probe(_normalize_probe(owner_shaped_raw_probe()))
    plan = report["plan"]
    assert plan["selected_audio_stream"] == 2
    assert plan["audio_encoder"] == "aac"
    assert plan["h264_level"] == "auto"
    assert plan["operations"] == [
        "copy the selected video stream",
        "keep only the selected audio stream",
        "encode AAC",
        "set H.264 level metadata to auto",
        "MP4 faststart remux",
    ]
    # 4.79 Mbit/s video plus a 160 kbit/s AAC track over 2672.68 s, not the 2.18 GiB source size.
    assert 1_550_000_000 < report["estimated_output_bytes"] < 1_750_000_000
    assert report["estimated_time_seconds"] < 0.2 * report["duration_seconds"]
    assert report["next_action"] == "review-and-confirm-audio-transcode"


def test_multiple_audio_streams_never_classify_ready():
    report = classify_probe(_normalize_probe(mp4_two_aac_raw_probe()))
    assert report["outcome"] == LOSSLESS_REPAIR
    assert report["reason"] == "single_audio_stream_required"
    assert report["audio_selection"]["index"] == 2
    assert report["plan"]["selected_audio_stream"] == 2
    assert "keep only the selected audio stream" in report["plan"]["operations"]


def test_ambiguous_missing_or_commentary_target_audio_is_resolved_or_asks_once():
    two_hebrew = owner_shaped_raw_probe()
    two_hebrew["streams"][3]["tags"]["language"] = "heb"
    report = classify_probe(_normalize_probe(two_hebrew))
    assert report["outcome"] == AUDIO_STREAM_CHOICE_REQUIRED
    assert report["reason"] == "target_language_ambiguous"
    assert report["next_action"] == "choose-audio-stream"
    assert report["plan"] is None and report["plan_sha256"] is None
    assert [choice["index"] for choice in report["audio_choices"]] == [1, 2, 3]

    commentary = owner_shaped_raw_probe()
    commentary["streams"][3]["tags"].update(language="heb", title="Director commentary")
    assert classify_probe(_normalize_probe(commentary))["audio_selection"]["index"] == 2

    default_hebrew = owner_shaped_raw_probe()
    default_hebrew["streams"][3]["tags"]["language"] = "heb"
    default_hebrew["streams"][3]["disposition"]["default"] = 1
    selected = classify_probe(_normalize_probe(default_hebrew))["audio_selection"]
    assert selected["index"] == 3 and selected["reason"] == "target_language_default"

    no_hebrew = owner_shaped_raw_probe()
    no_hebrew["streams"][2]["tags"]["language"] = "ara"
    missing = classify_probe(_normalize_probe(no_hebrew))
    assert missing["outcome"] == AUDIO_STREAM_CHOICE_REQUIRED
    assert missing["reason"] == "target_language_missing"


def test_explicit_audio_selection_is_honoured_or_blocked():
    probe = _normalize_probe(owner_shaped_raw_probe())
    chosen = classify_probe(probe, selected_audio_stream_index=3)
    assert chosen["audio_selection"]["reason"] == "explicit_selection"
    assert chosen["plan"]["selected_audio_stream"] == 3
    unavailable = classify_probe(probe, selected_audio_stream_index=7)
    assert unavailable["outcome"] == BLOCKED
    assert unavailable["reason"] == "selected_audio_stream_unavailable"


def test_video_size_boundary_is_three_gib():
    assert MAX_BYTES == 3 * GIB
    assert classify_probe(_normalize_probe(owner_shaped_raw_probe(size=3 * GIB)))["outcome"] != BLOCKED
    too_large = classify_probe(_normalize_probe(owner_shaped_raw_probe(size=3 * GIB + 1)))
    assert too_large["outcome"] == BLOCKED
    assert too_large["reason"] == "invalid_or_excessive_size"


def test_undecodable_selected_audio_blocks_but_an_unused_dub_does_not():
    probe = _normalize_probe(owner_shaped_raw_probe())
    probe["audio_streams"][0]["decode_ok"] = False
    assert classify_probe(probe)["outcome"] != BLOCKED
    probe["audio_streams"][1]["decode_ok"] = False
    blocked = classify_probe(probe)
    assert blocked["outcome"] == BLOCKED
    assert blocked["reason"] == "selected_audio_stream_not_decodable"


ASS_EVENTS = """[Script Info]
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,16,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.50,0:00:01.50,Default,,0,0,0,,What is it?
"""


def _srt(cues):
    return "".join(f"{number}\n{start} --> {end}\n{text}\n\n" for number, (start, end, text) in enumerate(cues, 1))


def build_multitrack_mkv(tmp_path: Path) -> Path:
    files = {
        "rus.srt": _srt([("00:00:00,500", "00:00:01,500", "Что это?"), ("00:00:01,800", "00:00:02,600", "[По-арабски]")]),
        "heb_forced.srt": _srt([("00:00:01,800", "00:00:02,600", f"{RLE}[בערבית]{PDF}")]),
        "heb.srt": _srt([("00:00:00,500", "00:00:01,500", f"{RLE}מה זה?{PDF}"), ("00:00:01,800", "00:00:02,600", f"{RLE}שלום{PDF}")]),
        "heb_sdh.srt": _srt([("00:00:00,100", "00:00:00,400", f"{RLE}[מוזיקה]{PDF}"), ("00:00:00,500", "00:00:01,500", f"{RLE}מה זה?{PDF}")]),
        "eng.ass": ASS_EVENTS,
    }
    for name, text in files.items():
        (tmp_path / name).write_text(text, encoding="utf-8")
    cover = tmp_path / "cover.png"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", str(cover)], check=True)
    source = tmp_path / "episode.mkv"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25",
        "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
        "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000",
        "-i", str(tmp_path / "rus.srt"), "-i", str(tmp_path / "heb_forced.srt"), "-i", str(tmp_path / "heb.srt"),
        "-i", str(tmp_path / "heb_sdh.srt"), "-i", str(tmp_path / "eng.ass"),
        "-map", "0:v", "-map", "1:a", "-map", "2:a", "-map", "3:a",
        "-map", "4", "-map", "5", "-map", "6", "-map", "7", "-map", "8",
        "-t", "3", "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p",
        "-c:a:0", "ac3", "-c:a:1", "eac3", "-c:a:2", "eac3", "-c:s", "copy",
        "-metadata:s:a:0", "language=rus", "-metadata:s:a:0", "title=Dub",
        "-metadata:s:a:1", "language=heb", "-metadata:s:a:2", "language=eng",
        "-disposition:a:0", "default", "-disposition:a:1", "0", "-disposition:a:2", "0",
        "-metadata:s:s:0", "language=rus", "-metadata:s:s:1", "language=heb", "-metadata:s:s:1", "title=Forced",
        "-metadata:s:s:2", "language=heb", "-metadata:s:s:3", "language=heb", "-metadata:s:s:3", "title=SDH",
        "-metadata:s:s:4", "language=eng",
        "-disposition:s:0", "0", "-disposition:s:1", "0", "-disposition:s:2", "0",
        "-disposition:s:3", "hearing_impaired", "-disposition:s:4", "0",
        "-attach", str(cover), "-metadata:s:t:0", "mimetype=image/png", "-metadata:s:t:0", "filename=cover.png",
        str(source),
    ], check=True)
    return source


@pytest.mark.asyncio
@pytest.mark.timeout(120)
async def test_real_multitrack_mkv_inventory_extraction_and_selected_audio_output(tmp_path):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("Companion FFmpeg runtime is not installed")
    source = build_multitrack_mkv(tmp_path)
    report = await probe_media(source)
    probe = report["probe"]
    assert [stream["index"] for stream in probe["video_streams"]] == [0]
    assert [(stream["index"], stream["language"]) for stream in probe["audio_streams"]] == [(1, "ru"), (2, "he"), (3, "en")]
    assert report["audio_selection"]["index"] == 2
    assert report["outcome"] == AUDIO_TRANSCODE_REQUIRED
    subtitles = probe["subtitle_streams"]
    assert [(stream["index"], stream["language"], stream["title"]) for stream in subtitles] == [
        (4, "ru", None), (5, "he", "Forced"), (6, "he", None), (7, "he", "SDH"), (8, "en", None),
    ]
    assert subtitles[3]["disposition"]["hearing_impaired"] == 1

    out_dir = tmp_path / "subtitles"
    tracks = await extract_text_subtitles(source, subtitles, out_dir)
    by_index = {track["index"]: track for track in tracks}
    assert all(track["status"] == "extracted" for track in tracks)
    hebrew = by_index[6]
    raw = (out_dir / hebrew["file"]).read_bytes()
    assert hebrew["sha256"] == hashlib.sha256(raw).hexdigest()
    assert hebrew["bytes"] == len(raw)
    assert hebrew["format"] == "srt" and hebrew["conversion"] is None
    text = raw.decode("utf-8")
    assert "00:00:00,500 --> 00:00:01,500" in text
    assert RLE in text
    assert by_index[8]["format"] == "srt" and by_index[8]["conversion"] == "ffmpeg-srt"
    assert "What is it?" in (out_dir / by_index[8]["file"]).read_text(encoding="utf-8")
    assert str(tmp_path) not in json.dumps(tracks)

    output = tmp_path / "output.partial.mp4"

    async def progress(_value):
        return None

    await prepare_media(source, output, report["plan"]["mode"], asyncio.Event(), progress, plan=report["plan"])
    after = await probe_media(output)
    assert [stream["language"] for stream in after["probe"]["audio_streams"]] == ["he"]
    assert after["probe"]["audio_streams"][0]["codec_name"] == "aac"
    assert after["probe"]["audio_streams"][0]["channels"] <= 2
    assert after["outcome"] == READY
    # The picture is copied, so every sampled frame must be bit-identical to the source.
    proof = await prove_video_copy_equivalence(
        source, output,
        source_video_index=report["plan"]["selected_video_stream"],
    )
    assert proof["decoded_frame_hash_equal"] is True
    assert proof["timeline_equal"] is True
    assert proof["audio_reencoded"] is True
    assert proof["verified"] is True


async def chunks(data):
    yield data


async def no_subtitles(*_args, **_kwargs):
    return []


def report_for(raw):
    normalized = _normalize_probe(raw)
    report = classify_probe(normalized)
    report["probe"] = normalized
    return report


@pytest.mark.asyncio
async def test_job_extracts_subtitles_and_serves_only_verified_tracks(tmp_path):
    report = report_for(owner_shaped_raw_probe())

    async def probe(_path):
        return json.loads(json.dumps(report))

    seen = {}

    async def extract(_source, streams, out_dir, cancel=None):
        seen["indexes"] = [stream["index"] for stream in streams]
        out_dir.mkdir(parents=True, exist_ok=True)
        data = "1\n00:00:00,500 --> 00:00:01,500\nשלום\n\n".encode("utf-8")
        (out_dir / "7.srt").write_bytes(data)
        return [
            {"index": 7, "status": "extracted", "format": "srt", "conversion": None, "bytes": len(data),
             "sha256": hashlib.sha256(data).hexdigest(), "file": "7.srt"},
            {"index": 9, "status": "image_based", "format": None, "conversion": None, "bytes": 0,
             "sha256": None, "file": None},
        ]

    manager = MediaJobManager(tmp_path, probe_fn=probe, extract_fn=extract)
    job = await manager.create(chunks(b"mkv"), filename="episode.mkv", content_type="video/x-matroska")
    await manager.wait(job["job_id"])
    waiting = manager.get(job["job_id"])
    assert waiting["state"] == "WAITING_FOR_DECISION"
    assert seen["indexes"] == [4, 5, 6, 7, 8, 9]
    assert [track["index"] for track in waiting["report"]["subtitle_tracks"]] == [7, 9]

    path, track = manager.subtitle_file(job["job_id"], 7)
    assert path.read_bytes().startswith(b"1\n")
    assert track["format"] == "srt"
    with pytest.raises(MediaJobConflict):
        manager.subtitle_file(job["job_id"], 9)
    with pytest.raises(MediaJobNotFound):
        manager.subtitle_file(job["job_id"], 99)
    path.write_bytes(b"tampered")
    with pytest.raises(MediaJobConflict):
        manager.subtitle_file(job["job_id"], 7)


@pytest.mark.asyncio
async def test_waiting_job_accepts_one_probed_audio_choice_and_rebinds_plan(tmp_path):
    raw = owner_shaped_raw_probe()
    raw["streams"][3]["tags"]["language"] = "heb"
    report = report_for(raw)

    async def probe(_path):
        return json.loads(json.dumps(report))

    manager = MediaJobManager(tmp_path, probe_fn=probe, extract_fn=no_subtitles)
    job = await manager.create(chunks(b"mkv"), filename="episode.mkv", content_type="video/x-matroska")
    await manager.wait(job["job_id"])
    waiting = manager.get(job["job_id"])
    assert waiting["state"] == "WAITING_FOR_DECISION"
    assert waiting["report"]["outcome"] == AUDIO_STREAM_CHOICE_REQUIRED
    with pytest.raises(MediaJobConflict):
        await manager.prepare(job["job_id"], mode="transcode", plan_sha256="a" * 64)
    with pytest.raises(MediaJobConflict):
        await manager.choose_audio_stream(job["job_id"], 5)

    chosen = await manager.choose_audio_stream(job["job_id"], 3)
    assert chosen["state"] == "WAITING_FOR_DECISION"
    assert chosen["report"]["audio_selection"]["index"] == 3
    assert chosen["report"]["plan"]["selected_audio_stream"] == 3
    assert chosen["report"]["plan_sha256"]
    assert chosen["report"]["source_sha256"] == hashlib.sha256(b"mkv").hexdigest()


@pytest.mark.asyncio
async def test_prepare_receives_the_confirmed_plan(tmp_path):
    report = report_for(owner_shaped_raw_probe())

    async def probe(path):
        if path.name == "output.partial.mp4":
            return {"outcome": READY}
        return json.loads(json.dumps(report))

    received = {}

    async def prepare(_source, output, _mode, _cancel, _progress, plan=None):
        received["plan"] = plan
        output.write_bytes(b"prepared")

    async def prove(_source, _output, source_video_index=None):
        return {"decoded_frame_hash_equal": True, "timeline_equal": True, "audio_reencoded": True, "verified": True}

    manager = MediaJobManager(tmp_path, probe_fn=probe, prepare_fn=prepare, extract_fn=no_subtitles,
                              video_proof_fn=prove)
    job = await manager.create(chunks(b"mkv"), filename="episode.mkv", content_type="video/x-matroska")
    await manager.wait(job["job_id"])
    waiting = manager.get(job["job_id"])
    await manager.prepare(job["job_id"], mode=waiting["report"]["plan"]["mode"], plan_sha256=waiting["report"]["plan_sha256"])
    await manager.wait(job["job_id"])
    assert received["plan"]["selected_audio_stream"] == 2
    assert manager.get(job["job_id"])["state"] == "COMPLETE"


@pytest.mark.asyncio
async def test_audio_transcode_job_verifies_the_copied_picture(tmp_path):
    report = report_for(owner_shaped_raw_probe())
    assert report["plan"]["mode"] == "audio_transcode"

    async def probe(path):
        if path.name == "output.partial.mp4":
            return {"outcome": READY}
        return json.loads(json.dumps(report))

    async def prepare(_source, output, mode, _cancel, _progress, plan=None):
        assert mode == "audio_transcode"
        assert plan["selected_audio_stream"] == 2
        output.write_bytes(b"prepared")

    proofs = {}

    async def prove(source, output, source_video_index=None):
        proofs["video_index"] = source_video_index
        return {"decoded_frame_hash_equal": True, "timeline_equal": True, "audio_reencoded": True, "verified": True}

    manager = MediaJobManager(tmp_path, probe_fn=probe, prepare_fn=prepare, extract_fn=no_subtitles,
                              video_proof_fn=prove)
    job = await manager.create(chunks(b"mkv"), filename="episode.mkv", content_type="video/x-matroska")
    await manager.wait(job["job_id"])
    waiting = manager.get(job["job_id"])
    await manager.prepare(job["job_id"], mode="audio_transcode", plan_sha256=waiting["report"]["plan_sha256"])
    await manager.wait(job["job_id"])
    complete = manager.get(job["job_id"])
    assert complete["state"] == "COMPLETE"
    assert proofs["video_index"] == 0
    assert complete["verification"]["decoded_frame_hash_equal"] is True
    assert complete["verification"]["audio_reencoded"] is True
    assert complete["report"]["timeline_verdict"] == "picture-equivalent"


@pytest.mark.asyncio
async def test_audio_transcode_job_fails_when_the_picture_changed(tmp_path):
    report = report_for(owner_shaped_raw_probe())

    async def probe(path):
        if path.name == "output.partial.mp4":
            return {"outcome": READY}
        return json.loads(json.dumps(report))

    async def prepare(_source, output, _mode, _cancel, _progress, plan=None):
        output.write_bytes(b"prepared")

    async def prove(_source, _output, source_video_index=None):
        return {"decoded_frame_hash_equal": False, "timeline_equal": True, "audio_reencoded": True, "verified": False}

    manager = MediaJobManager(tmp_path, probe_fn=probe, prepare_fn=prepare, extract_fn=no_subtitles,
                              video_proof_fn=prove)
    job = await manager.create(chunks(b"mkv"), filename="episode.mkv", content_type="video/x-matroska")
    await manager.wait(job["job_id"])
    waiting = manager.get(job["job_id"])
    await manager.prepare(job["job_id"], mode="audio_transcode", plan_sha256=waiting["report"]["plan_sha256"])
    await manager.wait(job["job_id"])
    failed = manager.get(job["job_id"])
    assert failed["state"] == "FAILED"
    assert failed["error"] == "MEDIA_PREPARE_OR_VERIFY_FAILED"
    assert not (tmp_path / job["job_id"] / "ready.mp4").exists()


@pytest.mark.asyncio
async def test_upload_limit_is_three_gib_and_reports_too_large(tmp_path):
    assert MediaJobManager.MAX_BYTES == 3 * GIB
    manager = MediaJobManager(tmp_path, extract_fn=no_subtitles)
    manager.MAX_BYTES = 4
    with pytest.raises(MediaTooLarge):
        await manager.create(chunks(b"12345"), filename="big.mkv", content_type="video/x-matroska")
    assert not any(tmp_path.iterdir())


def test_media_routes_serve_subtitles_accept_audio_choice_and_expose_hash_headers(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import ai_local.main as main
    from ai_local.security import _cors_headers, require_companion_auth

    raw = owner_shaped_raw_probe()
    raw["streams"][3]["tags"]["language"] = "heb"
    report = report_for(raw)

    async def probe(_path):
        return json.loads(json.dumps(report))

    data = "1\n00:00:00,500 --> 00:00:01,500\nשלום\n\n".encode("utf-8")

    async def extract(_source, _streams, out_dir, cancel=None):
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "7.srt").write_bytes(data)
        return [{"index": 7, "status": "extracted", "format": "srt", "conversion": None, "bytes": len(data),
                 "sha256": hashlib.sha256(data).hexdigest(), "file": "7.srt"}]

    monkeypatch.setattr(main, "media_job_manager", MediaJobManager(tmp_path, probe_fn=probe, extract_fn=extract))
    app = FastAPI()
    # Routes keep the override provider of the app they were declared on, so the pairing
    # boundary is relaxed there; the copied app only avoids the real lifespan.
    monkeypatch.setitem(main.app.dependency_overrides, require_companion_auth, lambda: None)
    app.router.routes.extend(main.app.router.routes)
    with TestClient(app) as client:
        created = client.post("/v1/media/jobs?filename=episode.mkv", content=b"mkv",
                              headers={"content-type": "video/x-matroska"})
        assert created.status_code == 202
        job_id = created.json()["job_id"]
        for _ in range(200):
            state = client.get(f"/v1/media/jobs/{job_id}").json()["state"]
            if state == "WAITING_FOR_DECISION":
                break
        assert state == "WAITING_FOR_DECISION"

        served = client.get(f"/v1/media/jobs/{job_id}/subtitles/7")
        assert served.status_code == 200
        assert served.content == data
        assert served.headers["x-lp-subtitle-sha256"] == hashlib.sha256(data).hexdigest()
        assert client.get(f"/v1/media/jobs/{job_id}/subtitles/99").status_code == 404

        chosen = client.post(f"/v1/media/jobs/{job_id}/audio-stream", json={"stream_index": 3})
        assert chosen.status_code == 200
        assert chosen.json()["report"]["plan"]["selected_audio_stream"] == 3
        assert client.post(f"/v1/media/jobs/{job_id}/audio-stream", json={"stream_index": 5}).status_code == 409

    exposed = _cors_headers("http://127.0.0.1:3000")["Access-Control-Expose-Headers"]
    assert "X-LP-Subtitle-SHA256" in exposed
    assert "X-LP-Media-SHA256" in exposed
