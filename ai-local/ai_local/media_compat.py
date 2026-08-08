"""Deterministic local media compatibility probe and explicit preparation plans.

This module never uploads media and never starts a repair/transcode on its own.
It describes the exact selected file against LinguistPro mobile target v1; a
caller must separately confirm a plan hash before :func:`prepare_media` runs.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import struct
from pathlib import Path
from typing import Any, Awaitable, Callable


READY = "READY"
LOSSLESS_REPAIR = "LOSSLESS_REPAIR"
TRANSCODE_REQUIRED = "TRANSCODE_REQUIRED"
BLOCKED = "BLOCKED"
TARGET_CONTRACT = "linguistpro-mobile-v1"
MAX_BYTES = 300 * 1024 * 1024
MAX_DURATION_SECONDS = 3 * 60 * 60

ProgressFn = Callable[[float], Awaitable[None]]


def _canonical_sha256(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _rate(value: Any) -> float:
    text = str(value or "0/1")
    try:
        if "/" in text:
            numerator, denominator = text.split("/", 1)
            return float(numerator) / float(denominator or 1)
        return float(text)
    except (TypeError, ValueError, ZeroDivisionError):
        return 0.0


def minimum_h264_level(width: int, height: int, fps: float) -> int | None:
    """Return the lowest supported H.264 level for frame size and macroblock rate."""
    frame_mbs = math.ceil(width / 16) * math.ceil(height / 16)
    mbps = frame_mbs * fps
    for level, max_fs, max_mbps in (
        (30, 1620, 40500),
        (31, 3600, 108000),
        (32, 5120, 216000),
        (40, 8192, 245760),
        (41, 8192, 245760),
    ):
        if frame_mbs <= max_fs and mbps <= max_mbps:
            return level
    return None


def _blocked(reason: str, next_action: str) -> dict[str, Any]:
    return {
        "schema": "media-compat-report-v1",
        "target": "lp-ios-android-v1",
        "outcome": BLOCKED,
        "verdict": BLOCKED,
        "target_contract": TARGET_CONTRACT,
        "reason": reason,
        "next_action": next_action,
        "plan": None,
        "plan_sha256": None,
    }


def classify_probe(probe: dict[str, Any]) -> dict[str, Any]:
    """Classify normalized ffprobe data into exactly one deterministic outcome."""
    fmt = probe.get("format") or {}
    videos = list(probe.get("video_streams") or [])
    audios = list(probe.get("audio_streams") or [])
    duration = float(fmt.get("duration") or 0)
    size = int(fmt.get("size") or 0)

    if probe.get("probe_error"):
        return _blocked("probe_failed", "choose-another-file")
    if duration <= 0 or duration > MAX_DURATION_SECONDS:
        return _blocked("invalid_or_excessive_duration", "choose-shorter-file")
    if size <= 0 or size > MAX_BYTES:
        return _blocked("invalid_or_excessive_size", "choose-smaller-file")
    if len(videos) != 1:
        return _blocked("video_stream_count_must_be_one", "choose-unambiguous-video-stream")
    if len(audios) != 1:
        return _blocked("audio_stream_count_must_be_one", "choose-unambiguous-audio-stream")
    if probe.get("drm") or probe.get("encrypted"):
        return _blocked("encrypted_or_drm_media", "choose-unprotected-file")

    video, audio = videos[0], audios[0]
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    fps = _rate(video.get("avg_frame_rate") or video.get("r_frame_rate"))
    if width <= 0 or height <= 0 or fps <= 0:
        return _blocked("invalid_video_geometry_or_rate", "choose-decodable-file")

    format_names = {name.strip().lower() for name in str(fmt.get("format_name") or "").split(",")}
    is_mp4 = bool(format_names & {"mov", "mp4", "m4a", "3gp", "3g2", "mj2"})
    faststart = probe.get("faststart", True) is not False
    h264 = str(video.get("codec_name") or "").lower() == "h264"
    profile = str(video.get("profile") or "").lower()
    main_profile = profile in {"main", "main@l"} or profile.startswith("main ")
    eight_bit_420 = str(video.get("pix_fmt") or "").lower() == "yuv420p"
    progressive = str(video.get("field_order") or "progressive").lower() in {"progressive", "unknown", ""}
    transfer = str(video.get("color_transfer") or "").lower()
    primaries = str(video.get("color_primaries") or "").lower()
    sdr = transfer not in {"smpte2084", "arib-std-b67"} and primaries != "bt2020"
    aac = str(audio.get("codec_name") or "").lower() == "aac"
    # ffprobe reports the owner-proven episode 1-5 stream as HE-AAC. The
    # packet's concrete acceptance requires stream-copy for episode 5, so the
    # profile is retained truthfully and admitted alongside AAC-LC.
    aac_mobile = str(audio.get("profile") or "lc").lower() in {"lc", "aac lc", "low complexity", "he-aac", "he-aacv2"}
    audio_ok = aac and aac_mobile and int(audio.get("sample_rate") or 0) <= 48000 and int(audio.get("channels") or 0) <= 2
    dimensions_ok = (width <= 1920 and height <= 1080 and fps <= 30.01) or (
        width <= 1280 and height <= 720 and fps <= 60.01
    )
    required_level = minimum_h264_level(width, height, fps) if h264 else None
    declared_level = int(video.get("level") or 0)

    base = {
        "schema": "media-compat-report-v1",
        "target": "lp-ios-android-v1",
        "target_contract": TARGET_CONTRACT,
        "codec_summary": {
            "container": "mp4" if is_mp4 else next(iter(format_names), "unknown"),
            "faststart": faststart,
            "video_codec": str(video.get("codec_name") or "unknown"),
            "profile": str(video.get("profile") or "unknown"),
            "declared_level": declared_level or None,
            "required_level": required_level,
            "pixel_format": str(video.get("pix_fmt") or "unknown"),
            "color_transfer": transfer or None,
            "color_primaries": primaries or None,
            "sdr": sdr,
            "width": width,
            "height": height,
            "fps": round(fps, 3),
            "audio_codec": str(audio.get("codec_name") or "unknown"),
            "audio_profile": str(audio.get("profile") or "unknown"),
            "sample_rate": int(audio.get("sample_rate") or 0),
            "channels": int(audio.get("channels") or 0),
        },
        "duration_seconds": duration,
        "source_bytes": size,
    }

    if not (h264 and main_profile and eight_bit_420 and progressive and sdr and audio_ok and dimensions_ok and required_level):
        operations = ["decode selected streams"]
        if not sdr:
            operations.append("tone-map HDR to BT.709 SDR")
        operations.extend(["encode H.264 Main yuv420p", "encode AAC", "MP4 faststart"])
        plan = {
            "mode": "transcode",
            "container": "mp4",
            "video_encoder": "libx264",
            "video_profile": "main",
            "pixel_format": "yuv420p",
            "max_geometry": "1920x1080@30-or-1280x720@60",
            "audio_encoder": "aac",
            "audio_profile": "lc",
            "faststart": True,
            "original_preserved": True,
            "selected_video_stream": int(video.get("index") or 0),
            "selected_audio_stream": int(audio.get("index") or 0),
            "quality_impact": "video_and_audio_reencoded",
            "operations": operations,
            "video_crf": 20,
            "video_preset": "medium",
            "audio_bitrate": "160k",
        }
        return {
            **base,
            "outcome": TRANSCODE_REQUIRED,
            "verdict": TRANSCODE_REQUIRED,
            "reason": "target_codec_or_geometry_mismatch",
            "next_action": "review-and-confirm-transcode",
            "plan": plan,
            "plan_sha256": _canonical_sha256(plan),
            "estimated_output_bytes": min(size, MAX_BYTES),
            "estimated_time_seconds": max(30, round(duration * 0.75)),
        }

    metadata_level_wrong = declared_level <= 0 or declared_level > 41 or declared_level < required_level
    if metadata_level_wrong or not is_mp4:
        plan = {
            "mode": "lossless_repair",
            "container": "mp4",
            "video_encoder": None,
            "audio_encoder": None,
            "h264_level": "auto",
            "faststart": True,
            "original_preserved": True,
            "selected_video_stream": int(video.get("index") or 0),
            "selected_audio_stream": int(audio.get("index") or 0),
            "quality_impact": "none_stream_copy",
            "operations": ["copy selected video/audio streams", "set H.264 level metadata to auto", "MP4 faststart remux"],
        }
        return {
            **base,
            "outcome": LOSSLESS_REPAIR,
            "verdict": LOSSLESS_REPAIR,
            "reason": "h264_level_or_container_metadata",
            "next_action": "review-and-confirm-lossless-repair",
            "plan": plan,
            "plan_sha256": _canonical_sha256(plan),
            "estimated_output_bytes": size + max(1024 * 1024, int(size * 0.01)),
            "estimated_time_seconds": max(5, round(duration * 0.03)),
        }

    return {
        **base,
        "outcome": READY,
        "verdict": READY,
        "reason": "target_contract_satisfied",
        "next_action": "continue-to-asr",
        "plan": None,
        "plan_sha256": None,
        "estimated_output_bytes": size,
    }


def _normalize_probe(raw: dict[str, Any]) -> dict[str, Any]:
    streams = raw.get("streams") or []
    raw_format = raw.get("format") or {}
    fmt = {key: raw_format.get(key) for key in ("format_name", "duration", "size", "bit_rate")}
    for key in ("duration",):
        try:
            fmt[key] = float(fmt.get(key) or 0)
        except (TypeError, ValueError):
            fmt[key] = 0.0
    try:
        fmt["size"] = int(fmt.get("size") or 0)
    except (TypeError, ValueError):
        fmt["size"] = 0
    allowed = (
        "index", "codec_type", "codec_name", "codec_tag_string", "profile", "level",
        "pix_fmt", "bits_per_raw_sample", "width", "height", "r_frame_rate", "avg_frame_rate",
        "field_order", "bit_rate", "refs", "channels", "sample_rate", "color_range",
        "color_space", "color_transfer", "color_primaries",
    )
    def clean_stream(stream: dict[str, Any]) -> dict[str, Any]:
        result = {key: stream.get(key) for key in allowed if key in stream}
        disposition = stream.get("disposition") or {}
        result["disposition"] = {"default": int(bool(disposition.get("default"))), "attached_pic": int(bool(disposition.get("attached_pic")))}
        return result
    return {
        "format": fmt,
        "video_streams": [clean_stream(stream) for stream in streams if stream.get("codec_type") == "video" and not (stream.get("disposition") or {}).get("attached_pic")],
        "audio_streams": [clean_stream(stream) for stream in streams if stream.get("codec_type") == "audio"],
        "encrypted": any(str(stream.get("codec_tag_string") or "").lower() in {"encv", "enca"} for stream in streams),
    }


def _mp4_faststart(path: Path) -> bool | None:
    """Inspect top-level ISO-BMFF atoms without reading media payload bytes."""
    try:
        size = path.stat().st_size
        offset, moov, mdat = 0, None, None
        with path.open("rb") as handle:
            while offset + 8 <= size:
                handle.seek(offset)
                head = handle.read(16)
                if len(head) < 8:
                    break
                atom_size, atom_type = struct.unpack(">I4s", head[:8])
                header = 8
                if atom_size == 1:
                    if len(head) < 16:
                        return None
                    atom_size, header = struct.unpack(">Q", head[8:16])[0], 16
                elif atom_size == 0:
                    atom_size = size - offset
                if atom_size < header or offset + atom_size > size:
                    return None
                if atom_type == b"moov":
                    moov = offset
                elif atom_type == b"mdat":
                    mdat = offset
                offset += atom_size
        return None if moov is None or mdat is None else moov < mdat
    except OSError:
        return None


async def _bounded_decode(path: Path, duration: float) -> tuple[bool, str | None]:
    positions = [0.0, max(0.0, duration * 0.75)]
    commands = [[
        "ffmpeg", "-v", "error", "-xerror", "-ss", "%.3f" % position,
        "-i", os.fspath(path), "-map", "0:v:0", "-map", "0:a:0",
        "-t", "1", "-f", "null", "-",
    ] for position in positions]
    results = await asyncio.gather(*(_run_capture(command) for command in commands))
    errors = [stderr.decode("utf-8", "replace")[-1000:] for code, _, stderr in results if code]
    return not errors, errors[0] if errors else None


async def _run_capture(args: list[str]) -> tuple[int, bytes, bytes]:
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        creationflags=getattr(__import__("subprocess"), "CREATE_NO_WINDOW", 0),
    )
    stdout, stderr = await process.communicate()
    return process.returncode or 0, stdout, stderr


async def probe_media(path: Path) -> dict[str, Any]:
    args = [
        "ffprobe", "-v", "error", "-show_format", "-show_streams",
        "-of", "json", os.fspath(path),
    ]
    code, stdout, stderr = await _run_capture(args)
    if code:
        return _blocked("probe_failed", "choose-decodable-file") | {"probe_diagnostic_code": "FFPROBE_NONZERO_EXIT"}
    try:
        normalized = _normalize_probe(json.loads(stdout.decode("utf-8")))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _blocked("probe_output_invalid", "choose-decodable-file")
    normalized["faststart"] = _mp4_faststart(path)
    decode_ok, _decode_error = await _bounded_decode(path, float((normalized.get("format") or {}).get("duration") or 0))
    normalized["bounded_decode"] = decode_ok
    if not decode_ok:
        normalized["probe_error"] = "BOUNDED_DECODE_FAILED"
    result = classify_probe(normalized)
    result["probe"] = normalized
    versions = await asyncio.gather(
        _run_capture(["ffprobe", "-version"]), _run_capture(["ffmpeg", "-version"]),
    )
    result["ffprobe_version"] = versions[0][1].decode("utf-8", "replace").splitlines()[0] if versions[0][0] == 0 else "unavailable"
    result["ffmpeg_version"] = versions[1][1].decode("utf-8", "replace").splitlines()[0] if versions[1][0] == 0 else "unavailable"
    result["code_version"] = "media-readiness-v1"
    return result


async def _media_hash(args: list[str]) -> str:
    code, stdout, stderr = await _run_capture(args)
    if code:
        raise RuntimeError(stderr.decode("utf-8", "replace")[-1000:])
    return hashlib.sha256(stdout).hexdigest()


async def prove_lossless_equivalence(source: Path, output: Path) -> dict[str, Any]:
    """Compare copied audio packets and deterministic decoded video frame checksums."""
    audio_args = lambda path: ["ffmpeg", "-v", "error", "-i", os.fspath(path), "-map", "0:a:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-"]
    source_probe, output_probe = await asyncio.gather(probe_media(source), probe_media(output))
    duration = float(source_probe.get("duration_seconds") or 0)
    positions = [duration * fraction for fraction in (0.0, 0.25, 0.5, 0.75)]
    video_args = lambda path, position: ["ffmpeg", "-v", "error", "-ss", "%.3f" % position, "-i", os.fspath(path), "-map", "0:v:0", "-frames:v", "1", "-f", "framemd5", "-"]
    source_audio, output_audio = await asyncio.gather(_media_hash(audio_args(source)), _media_hash(audio_args(output)))
    frame_pairs = await asyncio.gather(*(
        asyncio.gather(_media_hash(video_args(source, position)), _media_hash(video_args(output, position)))
        for position in positions
    ))
    source_codec, output_codec = source_probe.get("codec_summary") or {}, output_probe.get("codec_summary") or {}
    timeline_equal = (
        abs(float(source_probe.get("duration_seconds") or 0) - float(output_probe.get("duration_seconds") or 0)) <= 0.05
        and source_codec.get("width") == output_codec.get("width")
        and source_codec.get("height") == output_codec.get("height")
        and source_codec.get("fps") == output_codec.get("fps")
    )
    frames_equal = all(pair[0] == pair[1] for pair in frame_pairs)
    return {
        "audio_packet_hash_equal": source_audio == output_audio,
        "decoded_frame_hash_equal": frames_equal,
        "timeline_equal": timeline_equal,
        "sample_positions_seconds": [round(value, 3) for value in positions],
        "verified": source_audio == output_audio and frames_equal and timeline_equal,
    }


async def prepare_media(source: Path, output: Path, mode: str, cancel: asyncio.Event, progress: ProgressFn) -> dict[str, Any]:
    """Run one explicitly selected plan into a new partial output path."""
    source_report = await probe_media(source)
    duration = float(source_report.get("duration_seconds") or 0)
    if mode == "lossless_repair":
        args = [
            "ffmpeg", "-y", "-v", "error", "-i", os.fspath(source),
            "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
            "-bsf:v", "h264_metadata=level=auto", "-movflags", "+faststart",
            "-progress", "pipe:1", "-nostats", os.fspath(output),
        ]
    elif mode == "transcode":
        source_video = ((source_report.get("probe") or {}).get("video_streams") or [{}])[0]
        source_fps = _rate(source_video.get("avg_frame_rate") or source_video.get("r_frame_rate")) or 30.0
        source_width, source_height = int(source_video.get("width") or 0), int(source_video.get("height") or 0)
        max_fps = 60.0 if source_width <= 1280 and source_height <= 720 else 30.0
        target_fps = min(source_fps, max_fps)
        hdr = str(source_video.get("color_transfer") or "").lower() in {"smpte2084", "arib-std-b67"} or str(source_video.get("color_primaries") or "").lower() == "bt2020"
        scale = "scale='min(iw,1920)':'min(ih,1080)':force_original_aspect_ratio=decrease,fps=" + ("%.3f" % target_fps) + ",format=yuv420p"
        video_filter = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv," + scale) if hdr else scale
        args = [
            "ffmpeg", "-y", "-v", "error", "-i", os.fspath(source),
            "-map", "0:v:0", "-map", "0:a:0",
            "-vf", video_filter,
            "-c:v", "libx264", "-profile:v", "main", "-preset", "medium", "-crf", "20",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-c:a", "aac", "-profile:a", "aac_low", "-ar", "48000", "-ac", "2", "-b:a", "160k",
            "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", os.fspath(output),
        ]
    else:
        raise ValueError("unsupported media preparation mode")

    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        creationflags=getattr(__import__("subprocess"), "CREATE_NO_WINDOW", 0),
    )
    assert process.stdout is not None
    while True:
        if cancel.is_set():
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
            raise asyncio.CancelledError
        try:
            line = await asyncio.wait_for(process.stdout.readline(), timeout=0.25)
        except asyncio.TimeoutError:
            continue
        if not line:
            break
        if line.startswith(b"out_time_us=") and duration > 0:
            try:
                elapsed = int(line.split(b"=", 1)[1]) / 1_000_000
                await progress(0.22 + min(1.0, elapsed / duration) * 0.68)
            except (ValueError, IndexError):
                pass
        elif line.startswith(b"progress=end"):
            await progress(0.9)
    stderr = await process.stderr.read() if process.stderr else b""
    code = await process.wait()
    if code:
        raise RuntimeError(stderr.decode("utf-8", "replace")[-2000:])
    await progress(0.92)
    return {"mode": mode}
