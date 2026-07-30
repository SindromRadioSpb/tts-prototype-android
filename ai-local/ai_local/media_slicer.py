"""Format-neutral physical audio slicing for Studio L1 ASR."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import subprocess
import wave
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .asr_constants import ASR_MAX_DURATION_SEC, ASR_WINDOW_OVERLAP_SEC, ASR_WINDOW_SEC

PCM_SAMPLE_RATE = 16_000
PCM_CHANNELS = 1
PCM_SAMPLE_WIDTH = 2
SLICE_DURATION_TOLERANCE_SEC = 0.10


class MediaProbeError(RuntimeError):
    pass


class MultipleAudioStreams(MediaProbeError):
    def __init__(self, choices: list[dict[str, Any]]) -> None:
        super().__init__("multiple audio streams require an explicit selection")
        self.choices = choices


class SliceCancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class SourceProbe:
    duration_sec: float
    audio_stream_index: int
    audio_streams: int
    codec_name: str | None


@dataclass(frozen=True)
class Window:
    index: int
    start_sec: float
    end_sec: float

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


@dataclass(frozen=True)
class ChunkManifest:
    index: int
    source_sha256: str
    start_sec: float
    end_sec: float
    expected_duration_sec: float
    actual_samples: int
    sample_rate: int
    channels: int
    sample_width_bytes: int
    pcm: str
    chunk_sha256: str
    ffmpeg_version: str
    audio_stream_index: int
    file_name: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def sha256_path(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def asr_windows(duration_sec: float) -> list[Window]:
    duration = max(0.0, float(duration_sec))
    windows: list[Window] = []
    index = 0
    while index * ASR_WINDOW_SEC < duration:
        nominal = index * ASR_WINDOW_SEC
        windows.append(
            Window(
                index=index,
                start_sec=0.0 if index == 0 else float(nominal - ASR_WINDOW_OVERLAP_SEC),
                end_sec=min(duration, float(nominal + ASR_WINDOW_SEC)),
            )
        )
        index += 1
    if not windows:
        windows.append(Window(index=0, start_sec=0.0, end_sec=0.0))
    return windows


def probe_source(path: Path, selected_stream_index: int | None = None) -> SourceProbe:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=index,codec_type,codec_name:stream_disposition=default",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    try:
        payload = json.loads(completed.stdout)
        duration = float(payload["format"]["duration"])
    except (KeyError, TypeError, ValueError) as exc:
        raise MediaProbeError("media duration is unavailable") from exc
    if duration <= 0 or duration > ASR_MAX_DURATION_SEC + 1:
        raise MediaProbeError("media duration is outside the L1 boundary")
    streams = [item for item in payload.get("streams", []) if item.get("codec_type") == "audio"]
    if not streams:
        raise MediaProbeError("media has no audio stream")
    if selected_stream_index is not None:
        matches = [item for item in streams if int(item["index"]) == selected_stream_index]
        if len(matches) != 1:
            raise MediaProbeError("selected audio stream is unavailable")
        chosen = matches[0]
    elif len(streams) == 1:
        chosen = streams[0]
    else:
        defaults = [item for item in streams if int((item.get("disposition") or {}).get("default", 0)) == 1]
        if len(defaults) != 1:
            raise MultipleAudioStreams([
                {
                    "index": int(item["index"]),
                    "codec_name": item.get("codec_name"),
                    "default": int((item.get("disposition") or {}).get("default", 0)) == 1,
                }
                for item in streams
            ])
        chosen = defaults[0]
    return SourceProbe(
        duration_sec=duration,
        audio_stream_index=int(chosen["index"]),
        audio_streams=len(streams),
        codec_name=chosen.get("codec_name"),
    )


def ffmpeg_version() -> str:
    completed = subprocess.run(
        ["ffmpeg", "-version"], check=True, capture_output=True, text=True, timeout=10
    )
    first = completed.stdout.splitlines()[0] if completed.stdout else ""
    parts = first.split()
    return parts[2] if len(parts) >= 3 and parts[0] == "ffmpeg" else first[:80]


async def _wait_process(process: asyncio.subprocess.Process, cancel: asyncio.Event) -> tuple[bytes, bytes]:
    communicate = asyncio.create_task(process.communicate())
    cancelled = asyncio.create_task(cancel.wait())
    done, _ = await asyncio.wait({communicate, cancelled}, return_when=asyncio.FIRST_COMPLETED)
    if cancelled in done and cancel.is_set():
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        communicate.cancel()
        try:
            await communicate
        except (asyncio.CancelledError, Exception):
            pass
        raise SliceCancelled("physical slicing was cancelled")
    cancelled.cancel()
    try:
        await cancelled
    except asyncio.CancelledError:
        pass
    return await communicate


async def slice_window(
    source: Path,
    chunks_dir: Path,
    source_sha256: str,
    probe: SourceProbe,
    window: Window,
    cancel: asyncio.Event,
    *,
    ffmpeg_bin: str = "ffmpeg",
    version: str | None = None,
) -> tuple[Path, ChunkManifest]:
    chunks_dir.mkdir(parents=True, exist_ok=True)
    target = chunks_dir / f"chunk-{window.index:04d}.wav"
    partial = target.with_suffix(".wav.partial")
    partial.unlink(missing_ok=True)
    command = [
        ffmpeg_bin, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source),
        "-ss", f"{window.start_sec:.6f}",
        "-t", f"{window.duration_sec:.6f}",
        "-map", f"0:{probe.audio_stream_index}",
        "-vn", "-ac", str(PCM_CHANNELS), "-ar", str(PCM_SAMPLE_RATE),
        "-c:a", "pcm_s16le", "-f", "wav", str(partial),
    ]
    process = await asyncio.create_subprocess_exec(
        *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await _wait_process(process, cancel)
    if process.returncode != 0:
        partial.unlink(missing_ok=True)
        detail = (stderr or stdout).decode("utf-8", errors="replace")[-500:]
        raise MediaProbeError(f"ffmpeg slice failed: {detail}")
    try:
        with wave.open(str(partial), "rb") as wav:
            rate = wav.getframerate()
            channels = wav.getnchannels()
            width = wav.getsampwidth()
            frames = wav.getnframes()
    except (wave.Error, OSError) as exc:
        partial.unlink(missing_ok=True)
        raise MediaProbeError("ffmpeg output is not a valid PCM WAV") from exc
    actual_duration = frames / max(1, rate)
    if rate != PCM_SAMPLE_RATE or channels != PCM_CHANNELS or width != PCM_SAMPLE_WIDTH:
        partial.unlink(missing_ok=True)
        raise MediaProbeError("ffmpeg output PCM format is not canonical")
    if abs(actual_duration - window.duration_sec) > SLICE_DURATION_TOLERANCE_SEC:
        partial.unlink(missing_ok=True)
        raise MediaProbeError("physical chunk duration does not match its manifest")
    chunk_hash = await asyncio.to_thread(sha256_path, partial)
    os.replace(partial, target)
    manifest = ChunkManifest(
        index=window.index,
        source_sha256=source_sha256,
        start_sec=window.start_sec,
        end_sec=window.end_sec,
        expected_duration_sec=window.duration_sec,
        actual_samples=frames,
        sample_rate=rate,
        channels=channels,
        sample_width_bytes=width,
        pcm="s16le",
        chunk_sha256=chunk_hash,
        ffmpeg_version=version or await asyncio.to_thread(ffmpeg_version),
        audio_stream_index=probe.audio_stream_index,
        file_name=target.name,
    )
    return target, manifest
