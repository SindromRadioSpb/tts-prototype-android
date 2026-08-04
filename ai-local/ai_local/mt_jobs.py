"""Bounded, deterministic local-MT jobs with exact row mapping and cancellation."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from .gpu_scheduler import LeaseCancelled, heavy_gpu_scheduler
from .lifecycle import use_model
from .mt_constants import (
    MT_ALLOWED_DIRECTIONS,
    MT_INFERENCE_BATCH_SIZE,
    MT_MAX_SEGMENT_CHARS,
    MT_MAX_SEGMENTS_PER_JOB,
    MT_MAX_TOTAL_CHARS,
    model_identity,
)
from .state import registry

log = logging.getLogger(__name__)
TERMINAL_STATES = frozenset({"COMPLETE", "FAILED", "CANCELED"})


class MtJobNotFound(KeyError):
    pass


class MtJobConflict(RuntimeError):
    pass


def canonical_input_checksum(
    source_lang: str, target_lang: str, segments: list[dict[str, Any]]
) -> str:
    canonical = json.dumps(
        {
            "source_lang": source_lang,
            "target_lang": target_lang,
            "segments": segments,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


@dataclass
class MtJob:
    job_id: str
    request_id: str
    input_checksum: str
    source_lang: str
    target_lang: str
    segments: list[dict[str, Any]]
    state: str = "QUEUED"
    completed_segments: int = 0
    results: list[dict[str, Any]] = field(default_factory=list)
    error_code: str | None = None
    created_unix_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_unix_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task | None = None

    def touch(self) -> None:
        self.updated_unix_ms = int(time.time() * 1000)

    def public_status(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "request_id": self.request_id,
            "input_checksum": self.input_checksum,
            "state": self.state,
            "completed_segments": self.completed_segments,
            "total_segments": len(self.segments),
            "error_code": self.error_code,
            "created_unix_ms": self.created_unix_ms,
            "updated_unix_ms": self.updated_unix_ms,
        }


class MtJobManager:
    def __init__(self, max_retained: int = 32) -> None:
        self._jobs: dict[str, MtJob] = {}
        self._request_index: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._max_retained = max_retained

    @staticmethod
    def validate_request(
        *, source_lang: str, target_lang: str, segments: list[dict[str, Any]],
        request_id: str, input_checksum: str,
    ) -> None:
        if (source_lang, target_lang) not in MT_ALLOWED_DIRECTIONS:
            raise ValueError("MT_DIRECTION_NOT_APPROVED")
        if not (1 <= len(segments) <= MT_MAX_SEGMENTS_PER_JOB):
            raise ValueError("MT_SEGMENT_COUNT_INVALID")
        if len(request_id) != 64 or any(ch not in "0123456789abcdef" for ch in request_id):
            raise ValueError("MT_REQUEST_ID_INVALID")
        expected_indexes = list(range(len(segments)))
        if [segment.get("index") for segment in segments] != expected_indexes:
            raise ValueError("MT_SEGMENT_INDEX_INVALID")
        texts = [segment.get("text") for segment in segments]
        if any(not isinstance(text, str) or len(text) > MT_MAX_SEGMENT_CHARS for text in texts):
            raise ValueError("MT_SEGMENT_TEXT_INVALID")
        if sum(len(text) for text in texts) > MT_MAX_TOTAL_CHARS:
            raise ValueError("MT_TOTAL_TEXT_TOO_LARGE")
        expected_checksum = canonical_input_checksum(source_lang, target_lang, segments)
        if input_checksum != expected_checksum:
            raise ValueError("MT_INPUT_CHECKSUM_MISMATCH")

    async def create(
        self, *, source_lang: str, target_lang: str, segments: list[dict[str, Any]],
        request_id: str, input_checksum: str,
    ) -> dict[str, Any]:
        self.validate_request(
            source_lang=source_lang, target_lang=target_lang, segments=segments,
            request_id=request_id, input_checksum=input_checksum,
        )
        async with self._lock:
            prior_id = self._request_index.get(request_id)
            if prior_id:
                prior = self._jobs[prior_id]
                if prior.input_checksum != input_checksum:
                    raise MtJobConflict("MT_REQUEST_ID_REPLAY_CONFLICT")
                return prior.public_status()
            self._prune()
            job_id = hashlib.sha256(f"{request_id}:{input_checksum}".encode()).hexdigest()[:32]
            job = MtJob(
                job_id=job_id, request_id=request_id, input_checksum=input_checksum,
                source_lang=source_lang, target_lang=target_lang,
                segments=[dict(segment) for segment in segments],
            )
            self._jobs[job_id] = job
            self._request_index[request_id] = job_id
            job.task = asyncio.create_task(self._run(job))
            return job.public_status()

    def _prune(self) -> None:
        if len(self._jobs) < self._max_retained:
            return
        terminal = sorted(
            (job for job in self._jobs.values() if job.state in TERMINAL_STATES),
            key=lambda item: item.updated_unix_ms,
        )
        if not terminal:
            raise MtJobConflict("MT_JOB_CAPACITY_EXCEEDED")
        oldest = terminal[0]
        self._jobs.pop(oldest.job_id, None)
        self._request_index.pop(oldest.request_id, None)

    def _get(self, job_id: str) -> MtJob:
        try:
            return self._jobs[job_id]
        except KeyError as exc:
            raise MtJobNotFound(job_id) from exc

    def status(self, job_id: str) -> dict[str, Any]:
        return self._get(job_id).public_status()

    def result(self, job_id: str) -> dict[str, Any]:
        job = self._get(job_id)
        return {
            **job.public_status(),
            "complete": job.state == "COMPLETE",
            "results": list(job.results),
            "provider": "madlad",
            "local_execution": True,
            "model": model_identity(),
            "source_lang": job.source_lang,
            "target_lang": job.target_lang,
        }

    async def cancel(self, job_id: str) -> dict[str, Any]:
        job = self._get(job_id)
        if job.state not in TERMINAL_STATES:
            job.cancel_event.set()
            job.touch()
        return job.public_status()

    async def retry(self, job_id: str) -> dict[str, Any]:
        job = self._get(job_id)
        if job.state not in {"FAILED", "CANCELED"}:
            raise MtJobConflict("MT_JOB_NOT_RETRYABLE")
        job.cancel_event = asyncio.Event()
        job.results = []
        job.completed_segments = 0
        job.error_code = None
        job.state = "QUEUED"
        job.touch()
        job.task = asyncio.create_task(self._run(job))
        return job.public_status()

    async def delete(self, job_id: str) -> dict[str, Any]:
        job = self._get(job_id)
        if job.state not in TERMINAL_STATES:
            raise MtJobConflict("MT_JOB_DELETE_BLOCKED")
        async with self._lock:
            self._jobs.pop(job.job_id, None)
            self._request_index.pop(job.request_id, None)
        return {"deleted": True, "job_id": job_id}

    def has_active_jobs(self) -> bool:
        return any(job.state not in TERMINAL_STATES for job in self._jobs.values())

    async def shutdown(self) -> None:
        tasks: list[asyncio.Task] = []
        for job in self._jobs.values():
            if job.state not in TERMINAL_STATES:
                job.cancel_event.set()
            if job.task and not job.task.done():
                tasks.append(job.task)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _run(self, job: MtJob) -> None:
        try:
            job.state = "WAITING_FOR_GPU"
            job.touch()
            async with heavy_gpu_scheduler.lease("translator", cancel=job.cancel_event):
                slot = registry.slot("translator")
                async with use_model(slot):
                    assert slot.impl is not None
                    job.state = "RUNNING"
                    job.touch()
                    for offset in range(0, len(job.segments), MT_INFERENCE_BATCH_SIZE):
                        if job.cancel_event.is_set():
                            raise LeaseCancelled("MT_JOB_CANCELED")
                        batch = job.segments[offset : offset + MT_INFERENCE_BATCH_SIZE]
                        translatable = [
                            (position, segment["text"])
                            for position, segment in enumerate(batch)
                            if segment["text"].strip()
                        ]
                        outputs = (
                            await asyncio.to_thread(
                                slot.impl.translate_batch,
                                [text for _, text in translatable],
                                job.target_lang,
                            )
                            if translatable else []
                        )
                        if len(outputs) != len(translatable):
                            raise RuntimeError("MT_RESULT_CARDINALITY_MISMATCH")
                        translated = dict(zip((position for position, _ in translatable), outputs))
                        for position, segment in enumerate(batch):
                            output = translated.get(position, segment["text"])
                            if not isinstance(output, str):
                                raise RuntimeError("MT_RESULT_SCHEMA_INVALID")
                            job.results.append({"index": segment["index"], "text": output})
                        job.completed_segments = len(job.results)
                        job.touch()
            if [row["index"] for row in job.results] != list(range(len(job.segments))):
                raise RuntimeError("MT_RESULT_ORDER_MISMATCH")
            job.state = "COMPLETE"
            job.touch()
        except (LeaseCancelled, asyncio.CancelledError):
            job.state = "CANCELED"
            job.error_code = "MT_JOB_CANCELED"
            job.touch()
        except Exception as exc:
            raw = str(exc).split(":", 1)[0]
            code = raw if re.fullmatch(r"[A-Z][A-Z0-9_]{2,79}", raw or "") else "MT_RUNTIME_ERROR"
            job.state = "FAILED"
            job.error_code = code[:80]
            job.touch()
            log.exception("local MT job failed with code %s", job.error_code)


mt_job_manager = MtJobManager()
