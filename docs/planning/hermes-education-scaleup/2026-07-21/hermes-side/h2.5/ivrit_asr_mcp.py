#!/usr/bin/env python3
"""Local, fail-closed Hebrew ASR MCP for the owner's Hermes workspace."""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio

SCHEMA_VERSION = "asr.transcribe.1.0.0"
CONFIDENCE_NOTE = "ASR_HYPOTHESIS_NOT_GROUND_TRUTH"
MODEL_REPOSITORY = "ivrit-ai/whisper-large-v3-turbo-ct2"
MODEL_REVISION = "72ad623a37947395efcc3933132353790e5a12f5"
MODEL_VERSION = f"{MODEL_REPOSITORY}@{MODEL_REVISION}"
DEFAULT_INBOX = "/workspace/voice-inbox"
DEFAULT_MODEL_DIR = "/workspace/models/ivrit-ai-whisper-large-v3-turbo-ct2"
# Empirically calibrated on the pinned model and H2.5 clean/noisy fixtures.
LOW_CONFIDENCE_AVG_LOGPROB = -0.15

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ivrit_asr")
mcp = FastMCP(
    "ivrit-ai-local-asr",
    instructions=(
        "Local Hebrew ASR only. Every transcript is an ASR hypothesis, never ground truth. "
        "Do not infer pronunciation quality from this tool."
    ),
)

_model: WhisperModel | None = None
_model_lock = threading.Lock()
_transcription_lock = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _tool_error(code: str, message: str) -> ToolError:
    return ToolError(f"{code}: {message}")


def _resolve_input(file_path: str, inbox: Path) -> Path:
    if not isinstance(file_path, str) or not file_path.strip():
        raise _tool_error("ASR_INVALID_PATH", "file_path must be a non-empty string")

    root = inbox.resolve(strict=True)
    raw = Path(file_path.strip())
    candidate = raw if raw.is_absolute() else root / raw

    try:
        if candidate.is_symlink():
            raise _tool_error("ASR_PATH_OUTSIDE_INBOX", "symbolic links are not accepted")
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
    except ToolError:
        raise
    except (FileNotFoundError, RuntimeError, ValueError):
        raise _tool_error("ASR_PATH_OUTSIDE_INBOX", "file must resolve inside voice-inbox")

    if not resolved.is_file():
        raise _tool_error("ASR_INVALID_AUDIO", "input must be a regular file")
    if resolved.stat().st_size == 0:
        raise _tool_error("ASR_EMPTY_FILE", "audio file is empty")
    return resolved


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                model_dir = Path(os.environ.get("IVRIT_ASR_MODEL_DIR", DEFAULT_MODEL_DIR))
                if not model_dir.is_dir():
                    raise _tool_error("ASR_MODEL_UNAVAILABLE", "pinned local model is unavailable")
                _model = WhisperModel(
                    str(model_dir),
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=int(os.environ.get("IVRIT_ASR_CPU_THREADS", "6")),
                    num_workers=1,
                    local_files_only=True,
                )
    return _model


def transcribe_audio_impl(
    file_path: str,
    language: Literal["he"] = "he",
    *,
    inbox: Path | None = None,
    model: Any | None = None,
    decoder: Any = decode_audio,
) -> dict[str, Any]:
    """Transcribe one inbox file, deleting raw audio only after complete success."""
    if language != "he":
        raise _tool_error("ASR_UNSUPPORTED_LANGUAGE", "language must be 'he'")

    request_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    inbox_path = inbox or Path(os.environ.get("IVRIT_ASR_INBOX", DEFAULT_INBOX))
    audio_path = _resolve_input(file_path, inbox_path)
    input_bytes = audio_path.stat().st_size
    logger.info("event=transcription_started request_id=%s input_bytes=%d", request_id, input_bytes)

    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(audio_path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            opened_stat = os.fstat(stream.fileno())
            decoded_audio = decoder(stream)
        with _transcription_lock:
            engine = model or _get_model()
            generated, _info = engine.transcribe(
                decoded_audio,
                language="he",
                beam_size=5,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            raw_segments = list(generated)
    except ToolError:
        raise
    except Exception as exc:
        logger.warning(
            "event=transcription_failed request_id=%s error_type=%s",
            request_id,
            type(exc).__name__,
        )
        raise _tool_error("ASR_INVALID_AUDIO", "audio could not be decoded or transcribed") from exc

    segments: list[dict[str, Any]] = []
    for segment in raw_segments:
        avg_logprob = round(float(segment.avg_logprob), 6)
        segments.append(
            {
                "start_s": round(float(segment.start), 3),
                "end_s": round(float(segment.end), 3),
                "text": str(segment.text).strip(),
                "avg_logprob": avg_logprob,
                "confidence": "LOW" if avg_logprob <= LOW_CONFIDENCE_AVG_LOGPROB else "NORMAL",
            }
        )

    text = " ".join(item["text"] for item in segments if item["text"]).strip()
    try:
        current_stat = audio_path.lstat()
        if audio_path.is_symlink() or (
            current_stat.st_dev,
            current_stat.st_ino,
            current_stat.st_size,
            current_stat.st_mtime_ns,
            current_stat.st_ctime_ns,
        ) != (
            opened_stat.st_dev,
            opened_stat.st_ino,
            opened_stat.st_size,
            opened_stat.st_mtime_ns,
            opened_stat.st_ctime_ns,
        ):
            logger.error("event=input_changed request_id=%s", request_id)
            raise _tool_error("ASR_INPUT_CHANGED", "raw file changed during transcription; nothing was deleted")
        audio_path.unlink()
    except ToolError:
        raise
    except OSError as exc:
        logger.error("event=raw_delete_failed request_id=%s error_type=%s", request_id, type(exc).__name__)
        raise _tool_error("ASR_RAW_DELETE_FAILED", "transcription completed but raw audio was not deleted") from exc

    elapsed = round(time.monotonic() - started, 3)
    logger.info(
        "event=transcription_succeeded request_id=%s input_bytes=%d segments=%d elapsed_s=%.3f raw_deleted=true",
        request_id,
        input_bytes,
        len(segments),
        elapsed,
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "text": text,
        "segments": segments,
        "confidence_note": CONFIDENCE_NOTE,
        "model_version": MODEL_VERSION,
        "generated_at": _utc_now(),
    }


@mcp.tool(
    name="transcribe_audio",
    description=(
        "Transcribe one Hebrew audio file from voice-inbox locally. Output is an ASR hypothesis, "
        "not pronunciation scoring or ground truth. The raw file is deleted after success."
    ),
)
def transcribe_audio(file_path: str, language: Literal["he"] = "he") -> dict[str, Any]:
    return transcribe_audio_impl(file_path, language)


if __name__ == "__main__":
    mcp.run(transport="stdio", show_banner=False)
