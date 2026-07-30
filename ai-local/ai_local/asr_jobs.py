"""Ephemeral, resumable single-source Studio L1 ASR jobs."""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Callable

from . import config
from .asr_constants import (
    ASR_CANCEL_TERMINAL_TIMEOUT_SEC,
    ASR_JOB_TTL_SEC,
    ASR_MAX_SOURCE_BYTES,
    model_identity,
)
from .asr_worker import asr_worker
from .gpu_scheduler import LeaseCancelled, heavy_gpu_scheduler
from .media_slicer import (
    ChunkManifest,
    MediaProbeError,
    MultipleAudioStreams,
    SliceCancelled,
    asr_windows,
    ffmpeg_version,
    probe_source,
    sha256_path,
    slice_window,
)
from .model_store import inspect_model
from .telemetry import TelemetryRecorder, sample_nvidia

TERMINAL_STATES = {"COMPLETE", "FAILED", "CANCELED"}
ACTIVE_STATES = {
    "PREFLIGHT", "SLICING", "WAITING_FOR_GPU", "LOADING_MODEL",
    "TRANSCRIBING", "VALIDATING", "COOLING", "CANCEL_REQUESTED",
}
SOURCE_NAME = "source.media"
MANIFEST_NAME = "job.json"
RESULT_NAME = "result.json"


class JobCapacityError(RuntimeError):
    pass


class JobNotFound(KeyError):
    pass


class JobCancelled(RuntimeError):
    pass


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    with temp.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def _json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _canonical_sha256(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _runtime_provenance(ffmpeg: str) -> dict[str, Any]:
    packages: dict[str, str | None] = {}
    for name in ("faster-whisper", "ctranslate2"):
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            packages[name] = None
    gpu: dict[str, str | None] = {"name": None, "driver_version": None}
    try:
        completed = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,driver_version",
                "--format=csv,noheader",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        rows = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
        if len(rows) == 1:
            name, driver = (part.strip() for part in rows[0].split(",", 1))
            gpu = {"name": name, "driver_version": driver}
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "faster_whisper": packages["faster-whisper"],
        "ctranslate2": packages["ctranslate2"],
        "ffmpeg": ffmpeg,
        "gpu": gpu,
    }


def _public_job(record: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "job_id", "state", "created_at", "updated_at", "source_sha256", "source_bytes",
        "media_type", "duration_sec", "audio_stream_index", "chunks_total",
        "chunks_completed", "error_code", "error_detail", "event_seq", "telemetry",
        "result_available", "recoverable", "attempt_id", "available_audio_streams",
        "selected_audio_stream_index",
    }
    return {key: value for key, value in record.items() if key in allowed}


def validate_worker_segments(payload: dict[str, Any], duration_sec: float) -> list[dict[str, Any]]:
    segments = payload.get("segments")
    if not isinstance(segments, list):
        raise RuntimeError("worker response has no segments list")
    out: list[dict[str, Any]] = []
    previous = -1.0
    for ordinal, item in enumerate(segments):
        if not isinstance(item, dict):
            raise RuntimeError("worker segment is not an object")
        try:
            start = float(item["start"])
            end = float(item["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("worker segment has invalid coordinates") from exc
        text = str(item.get("text") or "").strip()
        if not (start >= 0 and end >= start and end <= duration_sec + 2.0):
            raise RuntimeError("worker segment is outside its physical chunk")
        if start < previous:
            raise RuntimeError("worker segment clock is not monotonic")
        previous = start
        out.append({"ordinal": ordinal, "start": start, "end": end, "text": text})
    return out


class AsrJobManager:
    def __init__(
        self,
        root_provider: Callable[[], Path] | None = None,
        *,
        capacity: int = 2,
        executor: Callable[[str], Any] | None = None,
    ) -> None:
        self._root_provider = root_provider or (lambda: config.ASR_JOB_ROOT)
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._capacity = asyncio.Semaphore(capacity)
        self._reserved: set[str] = set()
        self._cancel: dict[str, asyncio.Event] = {}
        self._runner: asyncio.Task | None = None
        self._executor_override = executor
        self._stopping = False

    @property
    def root(self) -> Path:
        return self._root_provider().resolve()

    def job_dir(self, job_id: str) -> Path:
        try:
            parsed = uuid.UUID(job_id)
        except ValueError as exc:
            raise JobNotFound(job_id) from exc
        path = (self.root / str(parsed)).resolve()
        if path.parent != self.root:
            raise JobNotFound(job_id)
        return path

    async def start(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self._stopping = False
        await self._recover_interrupted()
        await self.cleanup_expired()
        if self._runner is None or self._runner.done():
            self._runner = asyncio.create_task(self._run_queue())

    async def shutdown(self) -> None:
        self._stopping = True
        for event in self._cancel.values():
            event.set()
        if self._runner is not None:
            # Wake an idle queue runner and let an active executor observe its
            # cancellation event so its own finally block can stop telemetry
            # and remove partial files. Only force-cancel after the L1 terminal
            # cancellation budget has been exhausted.
            await self._queue.put(None)
            try:
                await asyncio.wait_for(
                    asyncio.shield(self._runner),
                    timeout=ASR_CANCEL_TERMINAL_TIMEOUT_SEC,
                )
            except asyncio.TimeoutError:
                await asyncio.to_thread(asr_worker.hard_cancel)
                self._runner.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self._runner
        self._runner = None
        self._queue = asyncio.Queue()

    async def _recover_interrupted(self) -> None:
        for path in self.root.iterdir():
            manifest = path / MANIFEST_NAME
            if not path.is_dir() or not manifest.is_file():
                continue
            try:
                record = _json(manifest)
            except (OSError, ValueError):
                continue
            if record.get("state") in ACTIVE_STATES or record.get("state") in {"CREATED", "QUEUED"}:
                record["state"] = "RECOVERABLE"
                record["recoverable"] = True
                self._event(record, "RECOVERED_AFTER_RESTART")
                _atomic_json(manifest, record)

    async def reserve(self) -> str:
        try:
            await asyncio.wait_for(self._capacity.acquire(), timeout=0.001)
        except asyncio.TimeoutError as exc:
            raise JobCapacityError("one active and one waiting local media job are allowed") from exc
        reservation = uuid.uuid4().hex
        self._reserved.add(reservation)
        return reservation

    def release_reservation(self, reservation: str) -> None:
        if reservation in self._reserved:
            self._reserved.remove(reservation)
            self._capacity.release()

    async def create_from_stream(
        self,
        stream: AsyncIterator[bytes],
        *,
        media_type: str | None,
        content_length: int | None,
        reservation: str,
    ) -> dict[str, Any]:
        if reservation not in self._reserved:
            raise JobCapacityError("job reservation is unavailable")
        if content_length is not None:
            if content_length < 0:
                self.release_reservation(reservation)
                raise ValueError("source length must not be negative")
            if content_length > ASR_MAX_SOURCE_BYTES:
                self.release_reservation(reservation)
                raise ValueError("source exceeds 300 MiB")
        job_id = str(uuid.uuid4())
        path = self.job_dir(job_id)
        path.mkdir(parents=True, exist_ok=False)
        partial = path / (SOURCE_NAME + ".partial")
        digest = hashlib.sha256()
        size = 0
        try:
            with partial.open("wb") as output:
                async for chunk in stream:
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > ASR_MAX_SOURCE_BYTES:
                        raise ValueError("source exceeds 300 MiB")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if size == 0:
                raise ValueError("source is empty")
            os.replace(partial, path / SOURCE_NAME)
            now = utc_iso()
            record: dict[str, Any] = {
                "schema": "studio-local-asr-job-v1",
                "job_id": job_id,
                "attempt_id": uuid.uuid4().hex,
                "state": "QUEUED",
                "created_at": now,
                "updated_at": now,
                "event_seq": 0,
                "events": [],
                "source_sha256": digest.hexdigest(),
                "source_bytes": size,
                "media_type": (media_type or "application/octet-stream")[:120],
                "model": model_identity(),
                "chunks": [],
                "chunks_completed": 0,
                "result_available": False,
                "recoverable": False,
            }
            self._event(record, "QUEUED")
            _atomic_json(path / MANIFEST_NAME, record)
            self._reserved.remove(reservation)
            self._reserved.add(job_id)
            self._cancel[job_id] = asyncio.Event()
            await self._queue.put(job_id)
            return _public_job(record)
        except Exception:
            partial.unlink(missing_ok=True)
            await asyncio.to_thread(shutil.rmtree, path, ignore_errors=True)
            self.release_reservation(reservation)
            raise

    def get(self, job_id: str) -> dict[str, Any]:
        manifest = self.job_dir(job_id) / MANIFEST_NAME
        if not manifest.is_file():
            raise JobNotFound(job_id)
        return _public_job(_json(manifest))

    def result(self, job_id: str) -> dict[str, Any]:
        path = self.job_dir(job_id) / RESULT_NAME
        if not path.is_file():
            raise JobNotFound(job_id)
        return _json(path)

    async def cancel(self, job_id: str) -> dict[str, Any]:
        path = self.job_dir(job_id)
        record = _json(path / MANIFEST_NAME)
        if record.get("state") in TERMINAL_STATES:
            return _public_job(record)
        if record.get("state") in {"WAITING_FOR_INPUT", "RECOVERABLE"}:
            record["state"] = "CANCELED"
            record["result_available"] = False
            self._event(record, "CANCELED")
            _atomic_json(path / MANIFEST_NAME, record)
            return _public_job(record)
        event = self._cancel.setdefault(job_id, asyncio.Event())
        event.set()
        record["state"] = "CANCEL_REQUESTED"
        self._event(record, "CANCEL_REQUESTED")
        _atomic_json(path / MANIFEST_NAME, record)
        return _public_job(record)

    async def resume(self, job_id: str) -> dict[str, Any]:
        reservation = await self.reserve()
        path = self.job_dir(job_id)
        try:
            record = _json(path / MANIFEST_NAME)
            if record.get("state") not in {"RECOVERABLE", "CANCELED", "FAILED"}:
                raise ValueError("job is not resumable")
            if record.get("model") != model_identity():
                raise ValueError("job model pin does not match the current L1 contract")
            record["attempt_id"] = uuid.uuid4().hex
            record["state"] = "QUEUED"
            record["recoverable"] = False
            record.pop("error_code", None)
            record.pop("error_detail", None)
            self._event(record, "RESUMED")
            _atomic_json(path / MANIFEST_NAME, record)
            self._reserved.remove(reservation)
            self._reserved.add(job_id)
            self._cancel[job_id] = asyncio.Event()
            await self._queue.put(job_id)
            return _public_job(record)
        except Exception:
            self.release_reservation(reservation)
            raise

    async def select_audio_stream(self, job_id: str, stream_index: int) -> dict[str, Any]:
        reservation = await self.reserve()
        path = self.job_dir(job_id)
        try:
            record = _json(path / MANIFEST_NAME)
            if record.get("state") != "WAITING_FOR_INPUT":
                raise ValueError("job is not waiting for an audio-stream choice")
            choices = record.get("available_audio_streams") or []
            if stream_index not in {int(item["index"]) for item in choices}:
                raise ValueError("audio stream is not one of the probed choices")
            record["selected_audio_stream_index"] = stream_index
            record["state"] = "QUEUED"
            record.pop("available_audio_streams", None)
            self._event(record, "AUDIO_STREAM_SELECTED", stream_index=stream_index)
            _atomic_json(path / MANIFEST_NAME, record)
            self._reserved.remove(reservation)
            self._reserved.add(job_id)
            self._cancel[job_id] = asyncio.Event()
            await self._queue.put(job_id)
            return _public_job(record)
        except Exception:
            self.release_reservation(reservation)
            raise

    async def delete(self, job_id: str) -> dict[str, Any]:
        path = self.job_dir(job_id)
        if not path.exists():
            raise JobNotFound(job_id)
        with contextlib.suppress(JobNotFound):
            record = _json(path / MANIFEST_NAME)
            if record.get("state") not in TERMINAL_STATES | {"RECOVERABLE", "WAITING_FOR_INPUT"}:
                await self.cancel(job_id)
                raise ValueError("cancel the active job before deleting it")
        await asyncio.to_thread(shutil.rmtree, path)
        return {"deleted": True, "job_id": job_id, "receipt_at": utc_iso()}

    async def cleanup_expired(self, now: float | None = None) -> int:
        cutoff = (now or time.time()) - ASR_JOB_TTL_SEC
        removed = 0
        if not self.root.exists():
            return 0
        for path in self.root.iterdir():
            manifest = path / MANIFEST_NAME
            if not path.is_dir() or not manifest.is_file():
                continue
            try:
                record = _json(manifest)
                updated = datetime.fromisoformat(record["updated_at"]).timestamp()
            except (OSError, ValueError, KeyError):
                continue
            if record.get("state") in TERMINAL_STATES | {"RECOVERABLE", "WAITING_FOR_INPUT"} and updated < cutoff:
                await asyncio.to_thread(shutil.rmtree, path)
                removed += 1
        return removed

    async def _run_queue(self) -> None:
        while True:
            job_id = await self._queue.get()
            if job_id is None:
                self._queue.task_done()
                return
            try:
                if self._executor_override is not None:
                    await self._executor_override(job_id)
                else:
                    await self._execute(job_id)
            finally:
                self._queue.task_done()
                if job_id in self._reserved:
                    self._reserved.remove(job_id)
                    self._capacity.release()

    def _event(self, record: dict[str, Any], kind: str, **details: Any) -> None:
        record["event_seq"] = int(record.get("event_seq", 0)) + 1
        record["updated_at"] = utc_iso()
        record.setdefault("events", []).append({
            "seq": record["event_seq"], "at": record["updated_at"], "kind": kind, **details
        })

    def _save_state(self, path: Path, record: dict[str, Any], state: str, **details: Any) -> None:
        record["state"] = state
        self._event(record, state, **details)
        _atomic_json(path / MANIFEST_NAME, record)

    async def _execute(self, job_id: str) -> None:
        path = self.job_dir(job_id)
        manifest_path = path / MANIFEST_NAME
        record = _json(manifest_path)
        cancel = self._cancel.setdefault(job_id, asyncio.Event())
        recorder = TelemetryRecorder()
        try:
            if cancel.is_set():
                raise JobCancelled()
            self._save_state(path, record, "PREFLIGHT")
            model = await asyncio.to_thread(inspect_model, None, verify_hash=True)
            if not model.verified:
                raise RuntimeError(f"MODEL_{model.reason or 'UNVERIFIED'}")
            sample = await asyncio.to_thread(sample_nvidia)
            if not sample.admission_ok():
                raise RuntimeError("INSUFFICIENT_VRAM")
            if sample.must_abort():
                raise RuntimeError("THERMAL_ABORT")
            source = path / SOURCE_NAME
            if await asyncio.to_thread(sha256_path, source) != record["source_sha256"]:
                raise RuntimeError("SOURCE_HASH_MISMATCH")
            probe = await asyncio.to_thread(
                probe_source, source, record.get("selected_audio_stream_index")
            )
            windows = asr_windows(probe.duration_sec)
            record["duration_sec"] = probe.duration_sec
            record["audio_stream_index"] = probe.audio_stream_index
            record["chunks_total"] = len(windows)
            _atomic_json(manifest_path, record)
            version = await asyncio.to_thread(ffmpeg_version)
            record["runtime"] = await asyncio.to_thread(_runtime_provenance, version)
            _atomic_json(manifest_path, record)
            await recorder.start()

            self._save_state(path, record, "WAITING_FOR_GPU")
            async with heavy_gpu_scheduler.lease("asr", cancel=cancel):
                for window in windows:
                    if cancel.is_set():
                        raise JobCancelled()
                    completed = await self._completed_chunk(record, window.index, path)
                    if completed:
                        continue
                    recorder.require_healthy()
                    latest = recorder.samples[-1]
                    if latest.must_abort():
                        raise RuntimeError("THERMAL_ABORT")
                    if latest.temperature_c >= latest.pause_at_c:
                        self._save_state(path, record, "COOLING", chunk_index=window.index)
                        await self._wait_for_cooling(cancel, recorder)
                    self._save_state(path, record, "SLICING", chunk_index=window.index)
                    chunk_path, chunk_manifest = await slice_window(
                        source, path / "chunks", record["source_sha256"], probe,
                        window, cancel, version=version,
                    )
                    self._upsert_chunk(record, chunk_manifest)
                    _atomic_json(manifest_path, record)
                    self._save_state(path, record, "TRANSCRIBING", chunk_index=window.index)
                    response = await self._transcribe_cancellable(chunk_path, cancel)
                    recorder.require_healthy()
                    if not response.get("ok"):
                        raise RuntimeError(f"WORKER_{response.get('error_type', 'ERROR')}: {response.get('error', '')}")
                    response["segments"] = validate_worker_segments(response, window.duration_sec)
                    raw_path = path / "raw" / f"chunk-{window.index:04d}.json"
                    _atomic_json(raw_path, response)
                    raw_hash = await asyncio.to_thread(sha256_path, raw_path)
                    self._complete_chunk(record, window.index, raw_path.name, raw_hash, response)
                    _atomic_json(manifest_path, record)

            self._save_state(path, record, "VALIDATING")
            recorder.require_healthy()
            record["telemetry"] = recorder.summary()
            result = self._build_result(path, record)
            _atomic_json(path / RESULT_NAME, result)
            record["result_available"] = True
            self._save_state(path, record, "COMPLETE")
        except MultipleAudioStreams as exc:
            record["available_audio_streams"] = exc.choices
            record["result_available"] = False
            self._save_state(path, record, "WAITING_FOR_INPUT")
        except (JobCancelled, LeaseCancelled, SliceCancelled):
            asr_worker.hard_cancel()
            heavy_gpu_scheduler.invalidate("asr")
            record["result_available"] = False
            self._save_state(path, record, "CANCELED")
        except Exception as exc:
            record["error_code"] = self._error_code(exc)
            record["error_detail"] = str(exc)[:500]
            record["telemetry"] = recorder.summary()
            self._save_state(path, record, "FAILED")
        finally:
            await recorder.stop()
            for partial in path.rglob("*.partial"):
                partial.unlink(missing_ok=True)

    async def _transcribe_cancellable(self, chunk: Path, cancel: asyncio.Event) -> dict[str, Any]:
        call = asyncio.create_task(asyncio.to_thread(asr_worker.transcribe, chunk))
        cancellation = asyncio.create_task(cancel.wait())
        done, _ = await asyncio.wait({call, cancellation}, return_when=asyncio.FIRST_COMPLETED)
        if cancellation in done and cancel.is_set():
            asr_worker.hard_cancel()
            heavy_gpu_scheduler.invalidate("asr")
            with contextlib.suppress(Exception):
                await call
            raise JobCancelled()
        cancellation.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await cancellation
        return await call

    async def _wait_for_cooling(self, cancel: asyncio.Event, recorder: TelemetryRecorder) -> None:
        below_since: float | None = None
        while True:
            if cancel.is_set():
                raise JobCancelled()
            sample = await asyncio.to_thread(sample_nvidia)
            recorder.samples.append(sample)
            if sample.must_abort():
                raise RuntimeError("THERMAL_ABORT")
            if sample.temperature_c <= sample.resume_at_c:
                below_since = below_since or time.monotonic()
                if time.monotonic() - below_since >= 30:
                    return
            else:
                below_since = None
            await asyncio.sleep(2)

    async def _completed_chunk(
        self, record: dict[str, Any], index: int, path: Path
    ) -> bool:
        entry = next((item for item in record.get("chunks", []) if item.get("index") == index), None)
        if not entry or not entry.get("completed"):
            return False
        chunk_path = path / "chunks" / entry["file_name"]
        raw_path = path / "raw" / entry["raw_file"]
        if not chunk_path.is_file() or not raw_path.is_file():
            return False
        chunk_hash, raw_hash = await asyncio.gather(
            asyncio.to_thread(sha256_path, chunk_path),
            asyncio.to_thread(sha256_path, raw_path),
        )
        return chunk_hash == entry["chunk_sha256"] and raw_hash == entry["raw_sha256"]

    def _upsert_chunk(self, record: dict[str, Any], manifest: ChunkManifest) -> None:
        chunks = record.setdefault("chunks", [])
        chunks[:] = [item for item in chunks if item.get("index") != manifest.index]
        chunks.append({**manifest.to_dict(), "completed": False})
        chunks.sort(key=lambda item: item["index"])

    def _complete_chunk(
        self, record: dict[str, Any], index: int, raw_file: str, raw_sha256: str,
        response: dict[str, Any],
    ) -> None:
        entry = next(item for item in record["chunks"] if item["index"] == index)
        entry.update({
            "completed": True,
            "raw_file": raw_file,
            "raw_sha256": raw_sha256,
            "elapsed_sec": response.get("elapsed_sec"),
            "segments": len(response.get("segments", [])),
        })
        record["chunks_completed"] = sum(1 for item in record["chunks"] if item.get("completed"))
        self._event(record, "CHUNK_COMPLETED", chunk_index=index)

    def _build_result(self, path: Path, record: dict[str, Any]) -> dict[str, Any]:
        chunks = []
        for entry in sorted(record.get("chunks", []), key=lambda item: item["index"]):
            if not entry.get("completed"):
                continue
            raw = _json(path / "raw" / entry["raw_file"])
            chunks.append({
                "manifest": entry,
                "worker_input": {
                    "kind": "physical-chunk",
                    "chunk_sha256": entry["chunk_sha256"],
                    "source_handle_exposed": False,
                },
                "raw_file_sha256": entry["raw_sha256"],
                "raw_canonical_sha256": _canonical_sha256(raw),
                "raw": raw,
            })
        return {
            "schema": "studio-local-asr-result-v1",
            "sidecar_protocol": "studio-local-asr-l1-v1",
            "job_id": record["job_id"],
            "attempt_id": record["attempt_id"],
            "selected_provider": "local",
            "actual_provider": "local-faster-whisper",
            "source_sha256": record["source_sha256"],
            "source_bytes": record["source_bytes"],
            "duration_sec": record["duration_sec"],
            "model": record["model"],
            "runtime": record.get("runtime"),
            "telemetry": record.get("telemetry"),
            "chunks": chunks,
        }

    @staticmethod
    def _error_code(exc: Exception) -> str:
        text = str(exc)
        for code in (
            "MODEL_", "INSUFFICIENT_VRAM", "THERMAL_ABORT", "SOURCE_HASH_MISMATCH",
            "LOCAL_MEDIA_UNSUPPORTED", "WORKER_",
        ):
            if text.startswith(code):
                return text.split(":", 1)[0]
        if isinstance(exc, MediaProbeError):
            return "LOCAL_MEDIA_UNSUPPORTED"
        return type(exc).__name__.upper()


asr_job_manager = AsrJobManager()
