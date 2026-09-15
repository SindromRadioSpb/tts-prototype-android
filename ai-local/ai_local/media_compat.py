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
import re
import struct
from pathlib import Path
from typing import Any, Awaitable, Callable


READY = "READY"
LOSSLESS_REPAIR = "LOSSLESS_REPAIR"
TRANSCODE_REQUIRED = "TRANSCODE_REQUIRED"
AUDIO_STREAM_CHOICE_REQUIRED = "AUDIO_STREAM_CHOICE_REQUIRED"
BLOCKED = "BLOCKED"
TARGET_CONTRACT = "linguistpro-mobile-v1"
TARGET_LANGUAGE = "he"
MAX_BYTES = 3 * 1024 * 1024 * 1024
MAX_DURATION_SECONDS = 3 * 60 * 60
MAX_SUBTITLE_TRACKS = 32
MAX_SUBTITLE_BYTES = 6 * 1024 * 1024

ProgressFn = Callable[[float], Awaitable[None]]

# Text codecs are extracted into the two formats the browser parser accepts:
# codec -> (file format, ffmpeg subtitle encoder). "copy" keeps the stored cue text byte-exact.
_TEXT_SUBTITLE_CODECS = {
    "subrip": ("srt", "copy"),
    "srt": ("srt", "copy"),
    "webvtt": ("vtt", "copy"),
    "ass": ("srt", "srt"),
    "ssa": ("srt", "srt"),
    "mov_text": ("srt", "srt"),
    "text": ("srt", "srt"),
}
_IMAGE_SUBTITLE_CODECS = {"hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle", "dvb_teletext", "xsub"}
_DISPOSITION_KEYS = (
    "default", "forced", "hearing_impaired", "visual_impaired", "comment",
    "original", "dub", "descriptions", "captions", "attached_pic",
)
_UNDETERMINED_LANGUAGES = {"und", "mis", "mul", "zxx", "qaa"}
_LANGUAGE_CODES = {
    "heb": "he", "iw": "he", "rus": "ru", "eng": "en", "ara": "ar", "ukr": "uk",
    "fre": "fr", "fra": "fr", "ger": "de", "deu": "de", "spa": "es", "ita": "it", "por": "pt",
    "yid": "yi", "ji": "yi", "amh": "am", "tir": "ti", "tur": "tr", "per": "fa", "fas": "fa",
    "pol": "pl", "rum": "ro", "ron": "ro", "hun": "hu", "cze": "cs", "ces": "cs", "slo": "sk",
    "slk": "sk", "slv": "sl", "dut": "nl", "nld": "nl", "chi": "zh", "zho": "zh", "jpn": "ja",
    "kor": "ko", "gre": "el", "ell": "el", "bul": "bg", "geo": "ka", "kat": "ka", "arm": "hy",
    "hye": "hy", "hin": "hi", "tha": "th", "swe": "sv", "fin": "fi", "dan": "da", "nor": "no",
    "nob": "nb", "nno": "nn", "bel": "be", "kaz": "kk", "uzb": "uz", "aze": "az", "srp": "sr",
    "hrv": "hr", "lit": "lt", "lav": "lv", "est": "et", "ind": "id", "may": "ms", "msa": "ms",
    "vie": "vi", "tgl": "tl", "urd": "ur", "ben": "bn", "tam": "ta",
}
_DESCRIPTIVE_AUDIO_TITLE = re.compile(r"comment|коммент|описани|audio.?description|\bAD\b|תיאור|פרשנות", re.IGNORECASE)


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


def _int_or_none(value: Any) -> int | None:
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def normalize_language(value: Any) -> str | None:
    """Return an ISO 639-1 code when known, the lowercase tag otherwise, None when undetermined."""
    code = re.split(r"[-_]", str(value or "").strip().lower(), maxsplit=1)[0]
    if not code or code in _UNDETERMINED_LANGUAGES or not re.fullmatch(r"[a-z]{2,3}", code):
        return None
    return _LANGUAGE_CODES.get(code, code)


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


def _track_entry(stream: dict[str, Any]) -> dict[str, Any]:
    return {
        "index": int(stream.get("index") or 0),
        "type_index": int(stream.get("type_index") or 0),
        "codec_name": stream.get("codec_name"),
        "language": stream.get("language"),
        "language_tag": stream.get("language_tag"),
        "title": stream.get("title"),
        "disposition": dict(stream.get("disposition") or {}),
    }


def track_inventory(probe: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "media-track-inventory-v1",
        "audio": [
            dict(_track_entry(stream), channels=_int_or_none(stream.get("channels")))
            for stream in probe.get("audio_streams") or []
        ],
        "subtitles": [
            dict(_track_entry(stream), text_based=bool(stream.get("text_based")))
            for stream in probe.get("subtitle_streams") or []
        ],
    }


def _audio_choice(stream: dict[str, Any]) -> dict[str, Any]:
    return {
        "index": int(stream.get("index") or 0),
        "type_index": int(stream.get("type_index") or 0),
        "codec_name": stream.get("codec_name"),
        "language": stream.get("language"),
        "title": stream.get("title"),
        "channels": _int_or_none(stream.get("channels")),
        "default": bool((stream.get("disposition") or {}).get("default")),
    }


def select_audio_stream(
    audio_streams: list[dict[str, Any]],
    *,
    target_language: str = TARGET_LANGUAGE,
    selected_index: int | None = None,
) -> dict[str, Any]:
    """Choose the learning-language audio. The default flag is a player preference, not a language."""
    streams = list(audio_streams or [])
    if selected_index is not None:
        matches = [stream for stream in streams if int(stream.get("index") or 0) == int(selected_index)]
        if len(matches) != 1:
            return {"status": "unavailable", "stream": None, "reason": "selected_audio_stream_unavailable"}
        return {"status": "selected", "stream": matches[0], "reason": "explicit_selection"}
    if len(streams) == 1:
        return {"status": "selected", "stream": streams[0], "reason": "single_audio_stream"}

    def descriptive(stream: dict[str, Any]) -> bool:
        flags = stream.get("disposition") or {}
        return bool(flags.get("comment") or flags.get("visual_impaired") or flags.get("descriptions")) or bool(
            _DESCRIPTIVE_AUDIO_TITLE.search(stream.get("title") or "")
        )

    candidates = [stream for stream in streams if stream.get("language") == target_language and not descriptive(stream)]
    if len(candidates) == 1:
        return {"status": "selected", "stream": candidates[0], "reason": "target_language_tag"}
    if len(candidates) > 1:
        for flag, reason in (("original", "target_language_original"), ("default", "target_language_default")):
            flagged = [stream for stream in candidates if (stream.get("disposition") or {}).get(flag)]
            if len(flagged) == 1:
                return {"status": "selected", "stream": flagged[0], "reason": reason}
        return {"status": "choice_required", "stream": None, "reason": "target_language_ambiguous"}
    return {"status": "choice_required", "stream": None, "reason": "target_language_missing"}


def _estimated_copy_bytes(video: dict[str, Any], audio: dict[str, Any], duration: float, fallback: int) -> int:
    video_bps, audio_bps = _int_or_none(video.get("bps")), _int_or_none(audio.get("bps"))
    if video_bps and audio_bps and duration > 0:
        return int((video_bps + audio_bps) * duration / 8 * 1.01) + 1024 * 1024
    return fallback


def classify_probe(
    probe: dict[str, Any],
    *,
    selected_audio_stream_index: int | None = None,
    target_language: str = TARGET_LANGUAGE,
) -> dict[str, Any]:
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
    if not audios:
        return _blocked("audio_stream_count_must_be_one", "choose-unambiguous-audio-stream")
    if probe.get("drm") or probe.get("encrypted"):
        return _blocked("encrypted_or_drm_media", "choose-unprotected-file")

    inventory = track_inventory(probe)
    choices = [_audio_choice(stream) for stream in audios]
    selection = select_audio_stream(audios, target_language=target_language, selected_index=selected_audio_stream_index)
    if selection["status"] == "unavailable":
        return {**_blocked(selection["reason"], "choose-audio-stream"), "track_inventory": inventory, "audio_choices": choices}
    if selection["status"] == "choice_required":
        return {
            **_blocked(selection["reason"], "choose-audio-stream"),
            "outcome": AUDIO_STREAM_CHOICE_REQUIRED,
            "verdict": AUDIO_STREAM_CHOICE_REQUIRED,
            "track_inventory": inventory,
            "audio_choices": choices,
            "duration_seconds": duration,
            "source_bytes": size,
        }
    audio = selection["stream"]
    if audio.get("decode_ok") is False:
        return {**_blocked("selected_audio_stream_not_decodable", "choose-audio-stream"),
                "track_inventory": inventory, "audio_choices": choices}
    multi_audio = len(audios) > 1

    video = videos[0]
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
    selected_video_stream = int(video.get("index") or 0)
    selected_audio_stream = int(audio.get("index") or 0)
    single_audio_operation = ["keep only the selected audio stream"] if multi_audio else []

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
        "track_inventory": inventory,
        "audio_selection": {
            "index": selected_audio_stream,
            "type_index": int(audio.get("type_index") or 0),
            "language": audio.get("language"),
            "title": audio.get("title"),
            "reason": selection["reason"],
        },
    }

    if not (h264 and main_profile and eight_bit_420 and progressive and sdr and audio_ok and dimensions_ok and required_level):
        operations = ["decode selected streams", *single_audio_operation]
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
            "selected_video_stream": selected_video_stream,
            "selected_audio_stream": selected_audio_stream,
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
    if metadata_level_wrong or not is_mp4 or multi_audio:
        plan = {
            "mode": "lossless_repair",
            "container": "mp4",
            "video_encoder": None,
            "audio_encoder": None,
            "h264_level": "auto",
            "faststart": True,
            "original_preserved": True,
            "selected_video_stream": selected_video_stream,
            "selected_audio_stream": selected_audio_stream,
            "quality_impact": "none_stream_copy",
            "operations": [
                "copy selected video/audio streams", *single_audio_operation,
                "set H.264 level metadata to auto", "MP4 faststart remux",
            ],
        }
        reason = "h264_level_or_container_metadata" if (metadata_level_wrong or not is_mp4) else "single_audio_stream_required"
        fallback_bytes = size + max(1024 * 1024, int(size * 0.01))
        return {
            **base,
            "outcome": LOSSLESS_REPAIR,
            "verdict": LOSSLESS_REPAIR,
            "reason": reason,
            "next_action": "review-and-confirm-lossless-repair",
            "plan": plan,
            "plan_sha256": _canonical_sha256(plan),
            "estimated_output_bytes": _estimated_copy_bytes(video, audio, duration, fallback_bytes) if multi_audio else fallback_bytes,
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


def _tag(stream: dict[str, Any], name: str) -> Any:
    for key, value in (stream.get("tags") or {}).items():
        if str(key).lower() == name:
            return value
    return None


def _clean_title(value: Any) -> str | None:
    text = re.sub(r"[\x00-\x1f\x7f]", "", str(value or "")).strip()
    return text[:120] or None


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
        result["disposition"] = {key: int(bool(disposition.get(key))) for key in _DISPOSITION_KEYS}
        language_tag = str(_tag(stream, "language") or "").strip().lower()[:16]
        result["language"] = normalize_language(language_tag)
        result["language_tag"] = language_tag or None
        result["title"] = _clean_title(_tag(stream, "title"))
        result["bps"] = _int_or_none(stream.get("bit_rate")) or _int_or_none(_tag(stream, "bps")) or _int_or_none(_tag(stream, "bps-eng"))
        return result

    audios = [stream for stream in streams if stream.get("codec_type") == "audio"]
    subtitles = [stream for stream in streams if stream.get("codec_type") == "subtitle"]
    return {
        "format": fmt,
        "video_streams": [clean_stream(stream) for stream in streams if stream.get("codec_type") == "video" and not (stream.get("disposition") or {}).get("attached_pic")],
        "audio_streams": [dict(clean_stream(stream), type_index=position) for position, stream in enumerate(audios)],
        "subtitle_streams": [
            dict(clean_stream(stream), type_index=position,
                 text_based=str(stream.get("codec_name") or "").lower() in _TEXT_SUBTITLE_CODECS)
            for position, stream in enumerate(subtitles)
        ],
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


async def _bounded_decode(path: Path, duration: float, audio_indexes: list[int]) -> tuple[bool, dict[int, bool]]:
    """Decode one second at two positions: the main video and each audio stream separately.

    A broken dub must not block a file whose learning-language audio decodes.
    """
    positions = [0.0, max(0.0, duration * 0.75)]

    def command(position: float, stream_map: str) -> list[str]:
        return [
            "ffmpeg", "-v", "error", "-xerror", "-ss", "%.3f" % position,
            "-i", os.fspath(path), "-map", stream_map, "-t", "1", "-f", "null", "-",
        ]

    video_results = await asyncio.gather(*(_run_capture(command(position, "0:V:0")) for position in positions))
    audio_ok: dict[int, bool] = {}
    for index in audio_indexes:
        results = await asyncio.gather(*(_run_capture(command(position, "0:%d" % index)) for position in positions))
        audio_ok[index] = not any(code for code, _, _ in results)
    return not any(code for code, _, _ in video_results), audio_ok


async def _run_capture(args: list[str]) -> tuple[int, bytes, bytes]:
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        creationflags=getattr(__import__("subprocess"), "CREATE_NO_WINDOW", 0),
    )
    stdout, stderr = await process.communicate()
    return process.returncode or 0, stdout, stderr


async def _run_cancellable(args: list[str], cancel: asyncio.Event | None) -> int:
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        creationflags=getattr(__import__("subprocess"), "CREATE_NO_WINDOW", 0),
    )
    while True:
        if cancel is not None and cancel.is_set():
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
            raise asyncio.CancelledError
        try:
            return await asyncio.wait_for(process.wait(), timeout=0.25) or 0
        except asyncio.TimeoutError:
            continue


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
    audio_indexes = [int(stream.get("index") or 0) for stream in normalized["audio_streams"]]
    video_ok, audio_ok = await _bounded_decode(path, float((normalized.get("format") or {}).get("duration") or 0), audio_indexes)
    for stream in normalized["audio_streams"]:
        stream["decode_ok"] = audio_ok.get(int(stream.get("index") or 0), False)
    decode_ok = video_ok and (not audio_ok or any(audio_ok.values()))
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
    result["code_version"] = "media-readiness-v2"
    return result


def _subtitle_arguments(entry: dict[str, Any], out_dir: Path) -> list[str]:
    _, encoder = _TEXT_SUBTITLE_CODECS[entry["codec_name"]]
    muxer = "webvtt" if entry["format"] == "vtt" else "srt"
    return ["-map", "0:%d" % entry["index"], "-c:s", encoder, "-f", muxer, os.fspath(out_dir / entry["file"])]


async def extract_text_subtitles(
    source: Path,
    subtitle_streams: list[dict[str, Any]],
    out_dir: Path,
    cancel: asyncio.Event | None = None,
) -> list[dict[str, Any]]:
    """Extract every text subtitle stream in one ffmpeg pass, then retry failures one by one.

    No ``-copyts``: cue times share the zero point of a prepared copy made from the same source.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []
    pending: list[dict[str, Any]] = []
    for position, stream in enumerate(subtitle_streams or []):
        codec = str(stream.get("codec_name") or "").lower()
        entry = dict(_track_entry(stream), codec_name=codec or None, status=None, format=None,
                     conversion=None, bytes=0, sha256=None, file=None)
        if position >= MAX_SUBTITLE_TRACKS:
            entry["status"] = "track_limit"
        elif codec in _IMAGE_SUBTITLE_CODECS:
            entry["status"] = "image_based"
        elif codec not in _TEXT_SUBTITLE_CODECS:
            entry["status"] = "unsupported_codec"
        else:
            file_format, encoder = _TEXT_SUBTITLE_CODECS[codec]
            entry.update(format=file_format, conversion=None if encoder == "copy" else "ffmpeg-srt",
                         file="%d.%s" % (entry["index"], file_format))
            pending.append(entry)
        results.append(entry)
    if not pending:
        return results

    prefix = ["ffmpeg", "-y", "-v", "error", "-nostdin", "-i", os.fspath(source)]
    together = prefix + [argument for entry in pending for argument in _subtitle_arguments(entry, out_dir)]
    if await _run_cancellable(together, cancel):
        for entry in pending:
            if await _run_cancellable(prefix + _subtitle_arguments(entry, out_dir), cancel):
                entry["status"] = "extraction_failed"
    for entry in pending:
        path = out_dir / entry["file"]
        if entry["status"] == "extraction_failed" or not path.is_file():
            path.unlink(missing_ok=True)
            entry.update(status="extraction_failed", file=None)
            continue
        size = path.stat().st_size
        if size > MAX_SUBTITLE_BYTES:
            path.unlink(missing_ok=True)
            entry.update(status="too_large", bytes=size, file=None)
            continue
        data = path.read_bytes()
        if not size or b"-->" not in data:
            path.unlink(missing_ok=True)
            entry.update(status="empty", file=None)
            continue
        entry.update(status="extracted", bytes=size, sha256=hashlib.sha256(data).hexdigest())
    return results


async def _media_hash(args: list[str]) -> str:
    code, stdout, stderr = await _run_capture(args)
    if code:
        raise RuntimeError(stderr.decode("utf-8", "replace")[-1000:])
    return hashlib.sha256(stdout).hexdigest()


async def prove_lossless_equivalence(
    source: Path,
    output: Path,
    source_audio_index: int | None = None,
    source_video_index: int | None = None,
) -> dict[str, Any]:
    """Compare copied audio packets and deterministic decoded video frame checksums."""
    source_audio = "0:a:0" if source_audio_index is None else "0:%d" % int(source_audio_index)
    source_video = "0:V:0" if source_video_index is None else "0:%d" % int(source_video_index)
    audio_args = lambda path, stream_map: ["ffmpeg", "-v", "error", "-i", os.fspath(path), "-map", stream_map, "-c", "copy", "-f", "hash", "-hash", "sha256", "-"]
    source_probe, output_probe = await asyncio.gather(probe_media(source), probe_media(output))
    duration = float(source_probe.get("duration_seconds") or 0)
    positions = [duration * fraction for fraction in (0.0, 0.25, 0.5, 0.75)]
    video_args = lambda path, position, stream_map: ["ffmpeg", "-v", "error", "-ss", "%.3f" % position, "-i", os.fspath(path), "-map", stream_map, "-frames:v", "1", "-f", "framemd5", "-"]
    source_audio_hash, output_audio_hash = await asyncio.gather(
        _media_hash(audio_args(source, source_audio)), _media_hash(audio_args(output, "0:a:0")),
    )
    frame_pairs = await asyncio.gather(*(
        asyncio.gather(_media_hash(video_args(source, position, source_video)), _media_hash(video_args(output, position, "0:V:0")))
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
        "audio_packet_hash_equal": source_audio_hash == output_audio_hash,
        "decoded_frame_hash_equal": frames_equal,
        "timeline_equal": timeline_equal,
        "sample_positions_seconds": [round(value, 3) for value in positions],
        "verified": source_audio_hash == output_audio_hash and frames_equal and timeline_equal,
    }


async def prepare_media(
    source: Path,
    output: Path,
    mode: str,
    cancel: asyncio.Event,
    progress: ProgressFn,
    plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run one explicitly selected plan into a new partial output path."""
    plan = plan or {}
    video_map = "0:V:0" if plan.get("selected_video_stream") is None else "0:%d" % int(plan["selected_video_stream"])
    audio_map = "0:a:0" if plan.get("selected_audio_stream") is None else "0:%d" % int(plan["selected_audio_stream"])
    source_report = await probe_media(source)
    duration = float(source_report.get("duration_seconds") or 0)
    if mode == "lossless_repair":
        args = [
            "ffmpeg", "-y", "-v", "error", "-i", os.fspath(source),
            "-map", video_map, "-map", audio_map, "-map_chapters", "-1", "-c", "copy",
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
            "-map", video_map, "-map", audio_map, "-map_chapters", "-1",
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
