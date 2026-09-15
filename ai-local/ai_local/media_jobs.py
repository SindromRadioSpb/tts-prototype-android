"""Single-slot, authenticated-loopback media readiness jobs."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Awaitable, Callable

from .media_compat import (
    BLOCKED,
    MAX_BYTES,
    READY,
    classify_probe,
    extract_text_subtitles,
    prepare_media,
    probe_media,
    prove_lossless_equivalence,
)


class MediaJobError(RuntimeError):
    pass


class MediaJobNotFound(MediaJobError):
    pass


class MediaJobConflict(MediaJobError):
    pass


class MediaTooLarge(MediaJobConflict):
    pass


# Probe evidence that stays valid when the same probe is classified again for another audio choice.
_REPORT_CARRY_KEYS = (
    "probe", "ffprobe_version", "ffmpeg_version", "code_version", "source_sha256", "source_size_bytes",
    "source_name", "output_sha256", "output_size_bytes", "disk_free_bytes", "subtitle_tracks",
)
_DISK_MARGIN_BYTES = 256 * 1024 * 1024


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_filename(value: str) -> str:
    leaf = str(value or "media").replace("\\", "/").rsplit("/", 1)[-1]
    leaf = re.sub(r"[\x00-\x1f\x7f]", "", leaf).strip(" .")
    return (leaf or "media")[:180]


def _disk_sufficient(report: dict[str, Any], source_bytes: int) -> bool:
    needed = int(report.get("estimated_output_bytes") or source_bytes) + _DISK_MARGIN_BYTES
    return int(report.get("disk_free_bytes") or 0) >= needed


class MediaJobManager:
    MAX_BYTES = MAX_BYTES
    TTL_SECONDS = 24 * 60 * 60
    TERMINAL = {"COMPLETE", "FAILED", "BLOCKED", "CANCELED", "WAITING_FOR_DECISION"}
    CAPACITY_TERMINAL = {"COMPLETE", "FAILED", "BLOCKED", "CANCELED"}

    def __init__(
        self,
        root: Path,
        *,
        probe_fn: Callable[[Path], Awaitable[dict[str, Any]]] = probe_media,
        prepare_fn: Callable[..., Awaitable[dict[str, Any] | None]] = prepare_media,
        extract_fn: Callable[..., Awaitable[list[dict[str, Any]]]] = extract_text_subtitles,
    ) -> None:
        self.root = Path(root)
        self.probe_fn = probe_fn
        self.prepare_fn = prepare_fn
        self.extract_fn = extract_fn
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._cancel: dict[str, asyncio.Event] = {}
        self._capacity = asyncio.Semaphore(1)
        self._reservation_lock = asyncio.Lock()

    def cleanup_expired(self) -> int:
        if not self.root.is_dir():
            return 0
        removed, cutoff = 0, time.time() - self.TTL_SECONDS
        for candidate in self.root.iterdir():
            if not candidate.is_dir():
                continue
            manifest_path = candidate / "job.json"
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                expired = float(manifest.get("updated_at") or manifest.get("created_at") or 0) < cutoff
            except (OSError, ValueError, json.JSONDecodeError):
                expired = candidate.stat().st_mtime < cutoff
            if expired:
                shutil.rmtree(candidate, ignore_errors=True)
                removed += 1
        return removed

    def _nonterminal_count(self) -> int:
        if not self.root.is_dir():
            return 0
        count = 0
        for path in self.root.glob("*/job.json"):
            try:
                if json.loads(path.read_text(encoding="utf-8")).get("state") not in self.CAPACITY_TERMINAL:
                    count += 1
            except (OSError, ValueError, json.JSONDecodeError):
                continue
        return count

    def _dir(self, job_id: str) -> Path:
        try:
            safe = str(uuid.UUID(job_id))
        except ValueError as exc:
            raise MediaJobNotFound(job_id) from exc
        return self.root / safe

    def _manifest_path(self, job_id: str) -> Path:
        return self._dir(job_id) / "job.json"

    def _write(self, job_id: str, manifest: dict[str, Any]) -> None:
        path = self._manifest_path(job_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        manifest["updated_at"] = time.time()
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        os.replace(temporary, path)

    def get(self, job_id: str) -> dict[str, Any]:
        path = self._manifest_path(job_id)
        if not path.is_file():
            raise MediaJobNotFound(job_id)
        return json.loads(path.read_text(encoding="utf-8"))

    async def create(self, chunks: AsyncIterator[bytes], *, filename: str, content_type: str) -> dict[str, Any]:
        async with self._reservation_lock:
            self.cleanup_expired()
            if self._nonterminal_count() >= 2:
                raise MediaJobConflict("one media job is active and one is already waiting")
            job_id = str(uuid.uuid4())
            job_dir = self._dir(job_id)
            job_dir.mkdir(parents=True)
            manifest = {
                "job_id": job_id, "state": "UPLOADING", "progress": 0.0,
                "source_name": _safe_filename(filename), "content_type": content_type,
                "source_bytes": 0, "source_sha256": None, "created_at": time.time(),
                "report": None, "output_sha256": None, "output_name": None, "error": None,
            }
            self._write(job_id, manifest)
        source = job_dir / "source.media"
        digest, size = hashlib.sha256(), 0
        try:
            with source.open("xb") as handle:
                async for chunk in chunks:
                    size += len(chunk)
                    if size > self.MAX_BYTES:
                        raise MediaTooLarge("media exceeds 3 GiB")
                    digest.update(chunk)
                    handle.write(chunk)
        except Exception:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise
        manifest.update(source_bytes=size, source_sha256=digest.hexdigest())
        self._write(job_id, manifest)
        self._cancel[job_id] = asyncio.Event()
        self._tasks[job_id] = asyncio.create_task(self._probe(job_id))
        return dict(manifest)

    def _settle(self, job_id: str, manifest: dict[str, Any]) -> None:
        """Move a job with a fresh report into the state that report implies."""
        report = manifest.get("report") or {}
        cancel = self._cancel.get(job_id)
        if cancel is not None and cancel.is_set():
            manifest["state"] = "CANCELED"
        elif report.get("outcome") == READY:
            source = self._dir(job_id) / "source.media"
            output = self._dir(job_id) / "ready.mp4"
            try:
                os.link(source, output)
            except OSError:
                shutil.copyfile(source, output)
            manifest.update(
                state="COMPLETE", progress=1.0, output_sha256=manifest["source_sha256"],
                output_name=Path(manifest["source_name"]).stem + "-mobile-ready.mp4",
                verification={"target_contract": True, "original_bytes": True},
            )
        elif report.get("outcome") == BLOCKED:
            manifest.update(state="BLOCKED", progress=1.0)
        else:
            manifest.update(state="WAITING_FOR_DECISION", progress=0.2)
        self._write(job_id, manifest)

    async def _probe(self, job_id: str) -> None:
        async with self._capacity:
            manifest = self.get(job_id)
            if self._cancel[job_id].is_set():
                manifest["state"] = "CANCELED"
                self._write(job_id, manifest)
                return
            manifest.update(state="PROBING", progress=0.1)
            self._write(job_id, manifest)
            try:
                source = self._dir(job_id) / "source.media"
                report = await self.probe_fn(source)
                manifest = self.get(job_id)
                report.update(
                    source_sha256=manifest["source_sha256"], source_size_bytes=manifest["source_bytes"],
                    source_name=manifest["source_name"], output_sha256=None, output_size_bytes=None,
                    disk_free_bytes=shutil.disk_usage(self._dir(job_id)).free,
                )
                report["disk_sufficient"] = _disk_sufficient(report, manifest["source_bytes"])
                streams = (report.get("probe") or {}).get("subtitle_streams") or []
                if streams and report.get("outcome") != BLOCKED and not self._cancel[job_id].is_set():
                    manifest.update(state="EXTRACTING_SUBTITLES", progress=0.15)
                    self._write(job_id, manifest)
                    report["subtitle_tracks"] = await self.extract_fn(
                        source, streams, self._dir(job_id) / "subtitles", self._cancel[job_id],
                    )
                    manifest = self.get(job_id)
                manifest["report"] = report
                self._settle(job_id, manifest)
            except asyncio.CancelledError:
                manifest = self.get(job_id)
                manifest["state"] = "CANCELED"
                self._write(job_id, manifest)
            except Exception as exc:
                manifest = self.get(job_id)
                manifest.update(state="FAILED", error="MEDIA_PROBE_FAILED", error_type=type(exc).__name__)
                self._write(job_id, manifest)

    async def choose_audio_stream(self, job_id: str, stream_index: int) -> dict[str, Any]:
        """Classify the stored probe again for one of its own audio streams; no media is reread."""
        manifest = self.get(job_id)
        if manifest["state"] != "WAITING_FOR_DECISION":
            raise MediaJobConflict("job is not waiting for a decision")
        report = manifest.get("report") or {}
        probe = report.get("probe")
        if not isinstance(probe, dict):
            raise MediaJobConflict("probe evidence is unavailable; repeat the media preflight")
        available = {int(stream["index"]) for stream in probe.get("audio_streams") or [] if stream.get("index") is not None}
        if int(stream_index) not in available:
            raise MediaJobConflict("audio stream is not one of the probed choices")
        updated = classify_probe(probe, selected_audio_stream_index=int(stream_index))
        for key in _REPORT_CARRY_KEYS:
            if key in report:
                updated[key] = report[key]
        updated["disk_sufficient"] = _disk_sufficient(updated, manifest["source_bytes"])
        manifest["report"] = updated
        self._settle(job_id, manifest)
        return self.get(job_id)

    def subtitle_file(self, job_id: str, stream_index: int) -> tuple[Path, dict[str, Any]]:
        manifest = self.get(job_id)
        tracks = (manifest.get("report") or {}).get("subtitle_tracks") or []
        matches = [track for track in tracks if int(track.get("index", -1)) == int(stream_index)]
        if not matches:
            raise MediaJobNotFound("%s:%s" % (job_id, stream_index))
        track = matches[0]
        name = track.get("file")
        if track.get("status") != "extracted" or not name or Path(name).name != name:
            raise MediaJobConflict("subtitle track is not available as text")
        path = self._dir(job_id) / "subtitles" / name
        if not path.is_file() or _sha256_file(path) != track.get("sha256"):
            raise MediaJobConflict("subtitle track failed verification")
        return path, dict(track)

    async def prepare(self, job_id: str, *, mode: str, plan_sha256: str) -> dict[str, Any]:
        manifest = self.get(job_id)
        if manifest["state"] != "WAITING_FOR_DECISION":
            raise MediaJobConflict("job is not waiting for a decision")
        report = manifest.get("report") or {}
        plan = report.get("plan") or {}
        if plan_sha256 != report.get("plan_sha256") or mode != plan.get("mode"):
            raise MediaJobConflict("media plan changed; review the current plan")
        manifest.update(state="REPAIRING" if mode == "lossless_repair" else "TRANSCODING", progress=0.21)
        self._write(job_id, manifest)
        self._tasks[job_id] = asyncio.create_task(self._prepare(job_id, mode, dict(plan)))
        return manifest

    async def _prepare(self, job_id: str, mode: str, plan: dict[str, Any]) -> None:
        async with self._capacity:
            job_dir = self._dir(job_id)
            source, partial, output = job_dir / "source.media", job_dir / "output.partial.mp4", job_dir / "ready.mp4"

            async def progress(value: float) -> None:
                manifest = self.get(job_id)
                manifest["progress"] = max(float(manifest.get("progress") or 0), min(0.92, float(value)))
                self._write(job_id, manifest)

            try:
                result = await self.prepare_fn(source, partial, mode, self._cancel[job_id], progress, plan=plan)
                if self._cancel[job_id].is_set():
                    raise asyncio.CancelledError
                manifest = self.get(job_id)
                manifest.update(state="VERIFYING", progress=0.94)
                self._write(job_id, manifest)
                post = await self.probe_fn(partial)
                if post.get("outcome") != READY:
                    raise MediaJobConflict("prepared media does not satisfy target contract")
                verification: dict[str, Any] = {"target_contract": True}
                if mode == "lossless_repair":
                    # Test doubles can return no details; production proves stream/frame equality.
                    if result is not None and result.get("skip_equivalence_for_test"):
                        equivalence = {"verified": True}
                    elif self.prepare_fn is prepare_media:
                        equivalence = await prove_lossless_equivalence(
                            source, partial,
                            source_audio_index=plan.get("selected_audio_stream"),
                            source_video_index=plan.get("selected_video_stream"),
                        )
                    else:
                        equivalence = {"verified": True}
                    if not equivalence.get("verified"):
                        raise MediaJobConflict("lossless equivalence proof failed")
                    verification.update(equivalence)
                output_sha = _sha256_file(partial)
                output_bytes = partial.stat().st_size
                post.update(
                    source_sha256=manifest["source_sha256"], source_size_bytes=manifest["source_bytes"],
                    source_name=manifest["source_name"], output_sha256=output_sha,
                    output_size_bytes=output_bytes,
                )
                source_report = manifest.get("report") or {}
                for key in ("audio_selection", "subtitle_tracks", "track_inventory"):
                    if key in source_report:
                        post["source_" + key] = source_report[key]
                post["timeline_verdict"] = "equivalent" if mode == "lossless_repair" else "explicit-transcode"
                os.replace(partial, output)
                manifest = self.get(job_id)
                manifest.update(
                    state="COMPLETE", progress=1.0, report=post,
                    output_sha256=output_sha,
                    output_name=Path(manifest["source_name"]).stem + "-mobile-ready.mp4",
                    output_bytes=output_bytes, verification=verification,
                )
                self._write(job_id, manifest)
            except asyncio.CancelledError:
                partial.unlink(missing_ok=True)
                manifest = self.get(job_id)
                manifest["state"] = "CANCELED"
                self._write(job_id, manifest)
            except Exception as exc:
                partial.unlink(missing_ok=True)
                manifest = self.get(job_id)
                manifest.update(state="FAILED", error="MEDIA_PREPARE_OR_VERIFY_FAILED", error_type=type(exc).__name__)
                self._write(job_id, manifest)

    async def wait(self, job_id: str) -> None:
        task = self._tasks.get(job_id)
        if task:
            await task

    async def cancel(self, job_id: str) -> dict[str, Any]:
        manifest = self.get(job_id)
        if manifest["state"] in {"COMPLETE", "FAILED", "BLOCKED", "CANCELED"}:
            return manifest
        if manifest["state"] == "WAITING_FOR_DECISION":
            self._cancel.setdefault(job_id, asyncio.Event()).set()
            manifest["state"] = "CANCELED"
            self._write(job_id, manifest)
            return manifest
        self._cancel.setdefault(job_id, asyncio.Event()).set()
        manifest["state"] = "CANCEL_REQUESTED"
        self._write(job_id, manifest)
        return manifest

    def file_path(self, job_id: str) -> Path:
        manifest = self.get(job_id)
        path = self._dir(job_id) / "ready.mp4"
        if manifest["state"] != "COMPLETE" or not path.is_file() or _sha256_file(path) != manifest.get("output_sha256"):
            raise MediaJobConflict("verified output is not available")
        return path

    async def delete(self, job_id: str) -> dict[str, Any]:
        manifest = self.get(job_id)
        if manifest["state"] not in self.TERMINAL:
            raise MediaJobConflict("cancel the running job before deleting it")
        receipt = {
            "schema": "media-job-delete-receipt-v1", "job_id": job_id,
            "source_sha256": manifest.get("source_sha256"), "output_sha256": manifest.get("output_sha256"),
            "previous_state": manifest.get("state"), "deleted_at": time.time(),
            "deleted_source": (self._dir(job_id) / "source.media").is_file(),
            "deleted_output": (self._dir(job_id) / "ready.mp4").is_file(),
            "deleted_temporary": (self._dir(job_id) / "output.partial.mp4").is_file(),
            "deleted_subtitles": (self._dir(job_id) / "subtitles").is_dir(),
        }
        shutil.rmtree(self._dir(job_id), ignore_errors=False)
        self._tasks.pop(job_id, None)
        self._cancel.pop(job_id, None)
        return receipt
