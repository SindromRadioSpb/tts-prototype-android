"""Actual-byte mobile MP4/M4A verification. No transcoding or network-enabled FFmpeg."""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path


class MediaVerificationError(RuntimeError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _run(command, cancel_event, *, timeout=180):
    flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if hasattr(subprocess, "CREATE_NO_WINDOW") else {}
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, **flags) as process:
        started = time.monotonic()
        while True:
            if cancel_event.is_set() or time.monotonic() - started > timeout:
                process.kill()
                process.communicate()
                raise MediaVerificationError("JOB_CANCELED" if cancel_event.is_set() else "MEDIA_VERIFY_TIMEOUT")
            try:
                stdout, _ = process.communicate(timeout=0.25)
                break
            except subprocess.TimeoutExpired:
                continue
        if process.returncode:
            raise MediaVerificationError("OUTPUT_MEDIA_INVALID")
        return stdout


def _probe(path, cancel_event):
    raw = _run(["ffprobe", "-v", "error", "-protocol_whitelist", "file", "-show_entries",
                "format=duration,format_name:stream=codec_type,codec_name,width,height,color_transfer,pix_fmt,profile",
                "-of", "json", str(path)], cancel_event, timeout=30)
    return json.loads(raw)


def normalize_and_verify(path: Path, option: dict, plan: dict, cancel_event):
    before = _probe(path, cancel_event)
    streams = before.get("streams", [])
    video = [s for s in streams if s.get("codec_type") == "video"]
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    if not audio or any(s.get("codec_name") != "aac" for s in audio):
        raise MediaVerificationError("OUTPUT_AUDIO_INVALID")
    if option["kind"] == "video":
        if len(video) != 1 or video[0].get("codec_name") != "h264":
            raise MediaVerificationError("OUTPUT_VIDEO_INVALID")
        if int(video[0].get("height", 0)) != int(option["quality"]):
            raise MediaVerificationError("OUTPUT_QUALITY_MISMATCH")
        if video[0].get("color_transfer") in {"smpte2084", "arib-std-b67"}:
            raise MediaVerificationError("OUTPUT_HDR_UNSUPPORTED")
        if video[0].get("pix_fmt") != "yuv420p" or video[0].get("profile") not in {"Baseline", "Constrained Baseline", "Main", "High"}:
            raise MediaVerificationError("OUTPUT_VIDEO_INVALID")
    elif video:
        raise MediaVerificationError("OUTPUT_AUDIO_INVALID")
    duration = float(before.get("format", {}).get("duration", 0))
    expected = float(plan["duration_seconds"])
    if duration <= 0 or abs(duration - expected) > max(3, expected * 0.01):
        raise MediaVerificationError("OUTPUT_DURATION_MISMATCH")
    extension = ".mp4" if option["kind"] == "video" else ".m4a"
    output = path.with_name("verified" + extension)
    _run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file", "-i", str(path),
          "-map", "0:v:0?", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", str(output)], cancel_event)
    after = _probe(output, cancel_event)
    output_streams = after.get("streams", [])
    if len(output_streams) != (2 if video else 1) or any(
            stream.get("codec_name") != ("h264" if stream.get("codec_type") == "video" else "aac")
            for stream in output_streams):
        raise MediaVerificationError("OUTPUT_MEDIA_INVALID")
    if abs(float(after.get("format", {}).get("duration", 0)) - duration) > 0.5:
        raise MediaVerificationError("OUTPUT_DURATION_MISMATCH")
    if output.stat().st_size > 300 * 1024 * 1024:
        raise MediaVerificationError("OUTPUT_SIZE_LIMIT")
    return output, {
        "method": "ffprobe-and-faststart-remux-v1", "container": "mp4" if video else "m4a",
        "video_codec": "h264" if video else None, "audio_codec": "aac",
        "height": video[0]["height"] if video else None, "faststart": True,
        "pixel_format": video[0]["pix_fmt"] if video else None,
        "video_profile": video[0]["profile"] if video else None,
        "duration_seconds": float(after["format"]["duration"]),
    }
