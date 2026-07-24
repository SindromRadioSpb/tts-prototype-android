#!/usr/bin/env python3
"""Local, fail-closed Hermes C1 pronunciation practice tools."""

from __future__ import annotations

import importlib.util
import io
import logging
import os
import re
import threading
import time
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

SCHEMA_VERSION = "c1.practice_attempt.1.0.0"
DISCARD_SCHEMA_VERSION = "c1.practice_discard.1.0.0"
EXERCISES_SCHEMA_VERSION = "c1.practice_exercises.1.0.0"
CONFIDENCE_NOTE = "ASR_HYPOTHESIS_NOT_GROUND_TRUTH"
MAX_AUDIO_BYTES = 10 * 1024 * 1024
MIN_DURATION_S = 0.25
MAX_DURATION_S = 12.0
ALLOWED_SUFFIXES = {".m4a", ".wav", ".webm", ".ogg", ".mp3", ".flac"}
ALLOWED_NAME_PREFIXES = ("voice-note-", "voice-input-")

DEFAULT_ATTACHMENT_ROOT = "/home/hermeswebui/.hermes/webui/attachments"
DEFAULT_ASR_MODEL_DIR = "/workspace/models/ivrit-ai-whisper-large-v3-turbo-ct2"
DEFAULT_COMPANION_MODULE = "/workspace/mcp-servers/c1-pronunciation/c1_companion.py"
DEFAULT_PROFILE = "/workspace/private/c1-practice/profile.json"
DEFAULT_PHONIKUD_MODEL = "/workspace/models/c1-pronunciation/phonikud-1.0.int8.onnx"
DEFAULT_TORCH_HOME = "/workspace/models/c1-pronunciation/torch-cache"
DEFAULT_SCRATCH = "/workspace/private/c1-practice/requests"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("c1_practice")

mcp = FastMCP(
    "linguistpro-c1-pronunciation-practice",
    instructions=(
        "Experimental Hebrew pronunciation practice. ASR tells what may have been said; C1 gives "
        "advisory-only possible pronunciation issues. The transcript must be confirmed before C1 "
        "feedback is shown. Never write learner state or infer mastery."
    ),
)

_load_lock = threading.Lock()
_evaluation_lock = threading.Lock()
_asr_model: Any | None = None
_c1_engine: Any | None = None
_companion_module: Any | None = None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _tool_error(code: str, message: str) -> ToolError:
    return ToolError(f"{code}: {message}")


def _safe_session_component(session_id: str) -> str:
    if not isinstance(session_id, str) or not session_id.strip():
        raise _tool_error("C1_INVALID_SESSION", "session_id must be a non-empty string")
    return re.sub(r"[^\w.\-]", "_", session_id.strip())[:120]


def _resolve_attachment(session_id: str, file_path: str, attachment_root: Path) -> Path:
    if not isinstance(file_path, str) or not file_path.strip():
        raise _tool_error("C1_INVALID_PATH", "file_path must be a non-empty string")

    root = attachment_root.resolve(strict=True)
    session_root = (root / _safe_session_component(session_id)).resolve(strict=True)
    if not session_root.is_relative_to(root):
        raise _tool_error("C1_PATH_OUTSIDE_SESSION", "session attachment root is invalid")

    candidate = Path(file_path.strip())
    try:
        if candidate.is_symlink():
            raise _tool_error("C1_PATH_OUTSIDE_SESSION", "symbolic links are not accepted")
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(session_root)
    except ToolError:
        raise
    except (FileNotFoundError, RuntimeError, ValueError):
        raise _tool_error("C1_PATH_OUTSIDE_SESSION", "file must resolve inside the current session attachments")

    if not resolved.is_file():
        raise _tool_error("C1_INVALID_AUDIO", "input must be a regular file")
    if resolved.suffix.lower() not in ALLOWED_SUFFIXES:
        raise _tool_error("C1_AUDIO_TYPE_UNSUPPORTED", "attachment type is not supported")
    if not resolved.name.lower().startswith(ALLOWED_NAME_PREFIXES):
        raise _tool_error("C1_NOT_VOICE_NOTE", "only a new Hermex/WebUI voice note is accepted")
    return resolved


def _read_bounded_audio(path: Path) -> tuple[bytes, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, "rb") as stream:
        opened_stat = os.fstat(stream.fileno())
        payload = stream.read(MAX_AUDIO_BYTES + 1)
    return payload, opened_stat


def _delete_verified(path: Path, opened_stat: os.stat_result) -> None:
    try:
        current = path.lstat()
        if path.is_symlink() or (
            current.st_dev,
            current.st_ino,
            current.st_size,
            current.st_mtime_ns,
            current.st_ctime_ns,
        ) != (
            opened_stat.st_dev,
            opened_stat.st_ino,
            opened_stat.st_size,
            opened_stat.st_mtime_ns,
            opened_stat.st_ctime_ns,
        ):
            raise _tool_error("C1_INPUT_CHANGED", "attachment changed during evaluation; replacement was preserved")
        path.unlink()
    except ToolError:
        raise
    except FileNotFoundError:
        return
    except OSError as exc:
        raise _tool_error("C1_RAW_DELETE_FAILED", "raw attachment could not be deleted") from exc


def _load_companion_module() -> Any:
    global _companion_module
    if _companion_module is None:
        module_path = Path(os.environ.get("C1_COMPANION_MODULE", DEFAULT_COMPANION_MODULE)).resolve()
        spec = importlib.util.spec_from_file_location("c1_practice_companion", module_path)
        if spec is None or spec.loader is None:
            raise _tool_error("C1_RUNTIME_UNAVAILABLE", "companion module is unavailable")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _companion_module = module
    return _companion_module


def _get_c1_engine() -> Any:
    global _c1_engine
    if _c1_engine is None:
        with _load_lock:
            if _c1_engine is None:
                module = _load_companion_module()
                _c1_engine = module.CompanionEngine(
                    Path(os.environ.get("C1_PROFILE", DEFAULT_PROFILE)),
                    Path(os.environ.get("C1_PHONIKUD_MODEL", DEFAULT_PHONIKUD_MODEL)),
                    Path(os.environ.get("C1_TORCH_HOME", DEFAULT_TORCH_HOME)),
                    Path(os.environ.get("C1_SCRATCH", DEFAULT_SCRATCH)),
                )
    return _c1_engine


def _get_asr_model() -> Any:
    global _asr_model
    if _asr_model is None:
        with _load_lock:
            if _asr_model is None:
                from faster_whisper import WhisperModel

                model_dir = Path(os.environ.get("C1_ASR_MODEL_DIR", DEFAULT_ASR_MODEL_DIR))
                if not model_dir.is_dir():
                    raise _tool_error("C1_ASR_UNAVAILABLE", "pinned local ivrit.ai model is unavailable")
                _asr_model = WhisperModel(
                    str(model_dir),
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=int(os.environ.get("C1_CPU_THREADS", "6")),
                    num_workers=1,
                    local_files_only=True,
                )
    return _asr_model


def _decode_audio(payload: bytes) -> Any:
    try:
        from faster_whisper.audio import decode_audio

        return decode_audio(io.BytesIO(payload), sampling_rate=16000)
    except Exception as exc:
        raise _tool_error("C1_INVALID_AUDIO", "audio could not be decoded") from exc


def _pcm_wav_bytes(waveform: Any, sample_rate: int = 16000) -> bytes:
    import numpy as np

    samples = np.asarray(waveform, dtype=np.float32).reshape(-1)
    duration = len(samples) / sample_rate if sample_rate else 0.0
    if duration < MIN_DURATION_S:
        raise _tool_error("C1_AUDIO_TOO_SHORT", "audio is shorter than 0.25 seconds")
    if duration > MAX_DURATION_S:
        raise _tool_error("C1_AUDIO_TOO_LONG", "audio exceeds 12 seconds")
    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return output.getvalue()


def _transcribe(waveform: Any, model: Any) -> dict[str, Any]:
    try:
        generated, _info = model.transcribe(
            waveform,
            language="he",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        raw_segments = list(generated)
    except ToolError:
        raise
    except Exception as exc:
        raise _tool_error("C1_ASR_FAILED", "local ASR could not transcribe the attempt") from exc

    segments: list[dict[str, Any]] = []
    for segment in raw_segments:
        avg_logprob = round(float(segment.avg_logprob), 6)
        segments.append({
            "start_s": round(float(segment.start), 3),
            "end_s": round(float(segment.end), 3),
            "text": str(segment.text).strip(),
            "avg_logprob": avg_logprob,
            "confidence": "LOW" if avg_logprob <= -0.15 else "NORMAL",
        })
    return {
        "text": " ".join(item["text"] for item in segments if item["text"]).strip(),
        "segments": segments,
        "confidence_note": CONFIDENCE_NOTE,
    }


def evaluate_attempt_impl(
    session_id: str,
    file_path: str,
    exercise_id: str,
    language: Literal["he"] = "he",
    *,
    attachment_root: Path | None = None,
    decoder: Any = _decode_audio,
    asr_model: Any | None = None,
    c1_engine: Any | None = None,
) -> dict[str, Any]:
    if language != "he":
        raise _tool_error("C1_LANGUAGE_UNSUPPORTED", "language must be 'he'")
    request_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    root = attachment_root or Path(os.environ.get("C1_ATTACHMENT_ROOT", DEFAULT_ATTACHMENT_ROOT))
    audio_path = _resolve_attachment(session_id, file_path, root)
    payload: bytes | None = None
    opened_stat: os.stat_result | None = None
    result: dict[str, Any] | None = None
    failure: BaseException | None = None

    _evaluation_lock.acquire()
    try:
        payload, opened_stat = _read_bounded_audio(audio_path)
        if opened_stat.st_size <= 0 or not payload:
            raise _tool_error("C1_EMPTY_FILE", "audio file is empty")
        if opened_stat.st_size > MAX_AUDIO_BYTES or len(payload) > MAX_AUDIO_BYTES:
            raise _tool_error("C1_AUDIO_TOO_LARGE", "audio exceeds 10 MiB")
        logger.info("event=evaluation_started request_id=%s input_bytes=%d", request_id, len(payload))
        waveform = decoder(payload)
        wav_bytes = _pcm_wav_bytes(waveform)
        transcript = _transcribe(waveform, asr_model or _get_asr_model())
        pronunciation = (c1_engine or _get_c1_engine()).score(exercise_id, wav_bytes)
        result = {
            "ok": True,
            "schema_version": SCHEMA_VERSION,
            "exercise_id": exercise_id,
            "asr": transcript,
            "pronunciation": pronunciation,
            "must_confirm_transcript_before_feedback": True,
            "advisory_only": True,
            "raw_deleted": False,
            "generated_at": _utc_now(),
        }
    except BaseException as exc:  # preserve typed error until privacy cleanup completes
        failure = exc
    finally:
        try:
            if opened_stat is not None:
                _delete_verified(audio_path, opened_stat)
        except BaseException as delete_exc:
            failure = delete_exc
        _evaluation_lock.release()

    if failure is not None:
        logger.warning(
            "event=evaluation_failed request_id=%s error_type=%s raw_deleted=%s",
            request_id,
            type(failure).__name__,
            not audio_path.exists(),
        )
        raise failure
    assert result is not None
    result["raw_deleted"] = True
    logger.info(
        "event=evaluation_succeeded request_id=%s elapsed_s=%.3f raw_deleted=true",
        request_id,
        time.monotonic() - started,
    )
    return result


def discard_attachment_impl(
    session_id: str,
    file_path: str,
    *,
    attachment_root: Path | None = None,
) -> dict[str, Any]:
    """Delete an unused C1-intended voice note without evaluating or retaining it."""
    request_id = uuid.uuid4().hex[:12]
    root = attachment_root or Path(os.environ.get("C1_ATTACHMENT_ROOT", DEFAULT_ATTACHMENT_ROOT))
    audio_path = _resolve_attachment(session_id, file_path, root)
    opened_stat: os.stat_result | None = None
    failure: BaseException | None = None

    _evaluation_lock.acquire()
    try:
        payload, opened_stat = _read_bounded_audio(audio_path)
        if opened_stat.st_size <= 0 or not payload:
            raise _tool_error("C1_EMPTY_FILE", "audio file is empty")
        if opened_stat.st_size > MAX_AUDIO_BYTES or len(payload) > MAX_AUDIO_BYTES:
            raise _tool_error("C1_AUDIO_TOO_LARGE", "audio exceeds 10 MiB")
        logger.info(
            "event=discard_started request_id=%s input_bytes=%d",
            request_id,
            opened_stat.st_size,
        )
    except BaseException as exc:
        failure = exc
    finally:
        try:
            if opened_stat is not None:
                _delete_verified(audio_path, opened_stat)
        except BaseException as delete_exc:
            failure = delete_exc
        _evaluation_lock.release()

    if failure is not None:
        logger.warning(
            "event=discard_failed request_id=%s error_type=%s raw_deleted=%s",
            request_id,
            type(failure).__name__,
            not audio_path.exists(),
        )
        raise failure
    logger.info("event=discard_succeeded request_id=%s raw_deleted=true", request_id)
    return {
        "ok": True,
        "schema_version": DISCARD_SCHEMA_VERSION,
        "raw_deleted": True,
        "evaluated": False,
        "generated_at": _utc_now(),
    }


@mcp.tool(
    name="list_pronunciation_exercises",
    description="List the exactly 25 frozen C1 experimental Hebrew pronunciation exercises and measured limitations.",
)
def list_pronunciation_exercises() -> dict[str, Any]:
    engine = _get_c1_engine()
    return {
        "schema_version": EXERCISES_SCHEMA_VERSION,
        "exercises": engine.public_exercises(),
        "exercise_count": 25,
        "advisory_only": True,
        "quality_disclosure": engine.health()["quality_disclosure"],
        "generated_at": _utc_now(),
    }


@mcp.tool(
    name="evaluate_pronunciation_attempt",
    description=(
        "Evaluate one current-session Hermex/WebUI voice note locally with separate Hebrew ASR and "
        "experimental C1 pronunciation axes, then delete the raw attachment. The result marks the "
        "transcript-confirmation requirement for staged presentation by the C1 practice skill."
    ),
)
def evaluate_pronunciation_attempt(
    session_id: str,
    file_path: str,
    exercise_id: str,
    language: Literal["he"] = "he",
) -> dict[str, Any]:
    return evaluate_attempt_impl(session_id, file_path, exercise_id, language)


@mcp.tool(
    name="discard_pronunciation_attachment",
    description=(
        "Delete one current-session Hermex/WebUI voice note that arrived before a C1 exercise was "
        "active. Performs no ASR or scoring and confirms raw deletion."
    ),
)
def discard_pronunciation_attachment(session_id: str, file_path: str) -> dict[str, Any]:
    return discard_attachment_impl(session_id, file_path)


if __name__ == "__main__":
    mcp.run(transport="stdio", show_banner=False)
