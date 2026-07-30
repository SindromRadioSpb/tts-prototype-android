"""Isolated process owner for the pinned faster-whisper model."""

from __future__ import annotations

import multiprocessing as mp
import queue
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .asr_constants import (
    ASR_BEAM_SIZE,
    ASR_COMPUTE_TYPE,
    ASR_CONDITION_ON_PREVIOUS_TEXT,
    ASR_DEVICE,
    ASR_LANGUAGE,
    ASR_NUM_WORKERS,
    ASR_VAD_FILTER,
    ASR_WORD_TIMESTAMPS,
)


def _worker_main(commands, responses) -> None:
    model = None
    model_path: str | None = None
    while True:
        command = commands.get()
        request_id = command.get("request_id")
        action = command.get("action")
        try:
            if action == "shutdown":
                responses.put({"request_id": request_id, "ok": True, "state": "stopped"})
                return
            if action == "ping":
                responses.put({"request_id": request_id, "ok": True, "state": "ready" if model else "unloaded"})
                continue
            if action == "load":
                requested = str(command["model_path"])
                if model is None or model_path != requested:
                    from faster_whisper import WhisperModel

                    started = time.perf_counter()
                    model = WhisperModel(
                        requested,
                        device=ASR_DEVICE,
                        compute_type=ASR_COMPUTE_TYPE,
                        num_workers=ASR_NUM_WORKERS,
                    )
                    model_path = requested
                    load_sec = time.perf_counter() - started
                else:
                    load_sec = 0.0
                responses.put({"request_id": request_id, "ok": True, "state": "ready", "load_sec": load_sec})
                continue
            if action == "transcribe":
                if model is None:
                    raise RuntimeError("ASR model is not loaded")
                path = Path(str(command["chunk_path"]))
                if not path.is_file():
                    raise FileNotFoundError("physical chunk is unavailable")
                started = time.perf_counter()
                stream, info = model.transcribe(
                    str(path),
                    language=ASR_LANGUAGE,
                    beam_size=ASR_BEAM_SIZE,
                    condition_on_previous_text=ASR_CONDITION_ON_PREVIOUS_TEXT,
                    vad_filter=ASR_VAD_FILTER,
                    word_timestamps=ASR_WORD_TIMESTAMPS,
                )
                segments = []
                for ordinal, segment in enumerate(stream):
                    segments.append({
                        "ordinal": ordinal,
                        "start": float(segment.start),
                        "end": float(segment.end),
                        "text": segment.text.strip(),
                    })
                responses.put({
                    "request_id": request_id,
                    "ok": True,
                    "state": "ready",
                    "elapsed_sec": time.perf_counter() - started,
                    "language": info.language,
                    "language_probability": info.language_probability,
                    "segments": segments,
                })
                continue
            raise ValueError(f"unknown worker action: {action}")
        except BaseException as exc:
            responses.put({
                "request_id": request_id,
                "ok": False,
                "error_type": type(exc).__name__,
                "error": str(exc)[:500],
            })


@dataclass(frozen=True)
class WorkerStatus:
    state: str
    pid: int | None


class AsrWorkerManager:
    def __init__(self) -> None:
        self._ctx = mp.get_context("spawn")
        self._commands = None
        self._responses = None
        self._process = None
        self._call_lock = threading.Lock()

    def status(self) -> WorkerStatus:
        process = self._process
        if process is None:
            return WorkerStatus("unloaded", None)
        if not process.is_alive():
            return WorkerStatus("error", process.pid)
        return WorkerStatus("running", process.pid)

    def _ensure_process(self) -> None:
        if self._process is not None and self._process.is_alive():
            return
        self._commands = self._ctx.Queue()
        self._responses = self._ctx.Queue()
        self._process = self._ctx.Process(
            target=_worker_main,
            args=(self._commands, self._responses),
            name="linguistpro-asr-worker",
            daemon=True,
        )
        self._process.start()

    def call(self, action: str, *, timeout_sec: float = 30, **payload: Any) -> dict[str, Any]:
        with self._call_lock:
            self._ensure_process()
            assert self._commands is not None and self._responses is not None
            request_id = uuid.uuid4().hex
            self._commands.put({"request_id": request_id, "action": action, **payload})
            deadline = time.monotonic() + timeout_sec
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError(f"ASR worker {action} timed out")
                try:
                    response = self._responses.get(timeout=remaining)
                except queue.Empty as exc:
                    raise TimeoutError(f"ASR worker {action} timed out") from exc
                if response.get("request_id") == request_id:
                    return response

    def load(self, model_path: Path, timeout_sec: float = 120) -> dict[str, Any]:
        return self.call("load", timeout_sec=timeout_sec, model_path=str(model_path))

    def ping(self, timeout_sec: float = 5) -> dict[str, Any]:
        return self.call("ping", timeout_sec=timeout_sec)

    def transcribe(self, chunk_path: Path, timeout_sec: float = 360) -> dict[str, Any]:
        return self.call("transcribe", timeout_sec=timeout_sec, chunk_path=str(chunk_path))

    def hard_cancel(self, timeout_sec: float = 5) -> None:
        process = self._process
        if process is None:
            return
        if process.is_alive():
            process.terminate()
            process.join(timeout=timeout_sec)
            if process.is_alive():
                process.kill()
                process.join(timeout=timeout_sec)
        self._close_queues()

    def shutdown(self, timeout_sec: float = 5) -> None:
        process = self._process
        if process is None:
            return
        if process.is_alive():
            try:
                self.call("shutdown", timeout_sec=timeout_sec)
            except (TimeoutError, OSError):
                pass
            process.join(timeout=timeout_sec)
        if process.is_alive():
            self.hard_cancel(timeout_sec=timeout_sec)
        else:
            self._close_queues()

    def _close_queues(self) -> None:
        for channel in (self._commands, self._responses):
            if channel is not None:
                try:
                    channel.close()
                except (OSError, ValueError):
                    pass
        self._commands = None
        self._responses = None
        self._process = None


asr_worker = AsrWorkerManager()
