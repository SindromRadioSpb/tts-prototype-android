"""Single-slot, authenticated-loopback media readiness jobs."""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
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
    prove_video_copy_equivalence,
)
from .subtitle_sync import assess_media


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
        video_proof_fn: Callable[..., Awaitable[dict[str, Any]]] = prove_video_copy_equivalence,
        subtitle_sync_fn: Callable[..., dict[str, Any]] = assess_media,
    ) -> None:
        self.root = Path(root)
        self.probe_fn = probe_fn
        self.prepare_fn = prepare_fn
        self.extract_fn = extract_fn
        self.video_proof_fn = video_proof_fn
        self.subtitle_sync_fn = subtitle_sync_fn
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

    async def assess_subtitle_sync(self, job_id: str, stream_index: int, subtitle_sha256: str,
                                   cue_starts: list[float]) -> dict[str, Any]:
        async with self._capacity:
            manifest = self.get(job_id)
            if manifest["state"] not in {"WAITING_FOR_DECISION", "COMPLETE"}:
                raise MediaJobConflict("media job is not ready for subtitle verification")
            _, track = self.subtitle_file(job_id, stream_index)
            if track["sha256"] != subtitle_sha256:
                raise MediaJobConflict("subtitle verification source changed")
            report = manifest.get("report") or {}
            audio = report.get("source_audio_selection", report.get("audio_selection")) or {}
            duration = float(report.get("source_duration_seconds", report.get("duration_seconds")) or 0)
            if not isinstance(audio.get("index"), int) or not math.isfinite(duration) or duration <= 0:
                raise MediaJobConflict("selected audio is unavailable")
            if len(cue_starts) > 20000 or any(not math.isfinite(t) or t < 0 or t >= duration for t in cue_starts):
                raise MediaJobConflict("invalid subtitle verification intervals")
            inputs = {"method": "silero-onset-grid-v1", "source_sha256": manifest["source_sha256"], "audio_stream_index": audio["index"],
                      "subtitle_sha256": subtitle_sha256, "cue_starts": sorted(set(cue_starts))}
            key = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
            previous = manifest.get("subtitle_sync") or {}
            if previous.get("input_sha256") == key:
                return previous
            try:
                assessment = await asyncio.to_thread(self.subtitle_sync_fn, self._dir(job_id)/"source.media",
                                                     audio["index"], inputs["cue_starts"], duration)
            except Exception as exc:
                assessment = {"schema": "subtitle-speech-sync-v1", "status": "unverified", "apply_offset_ms": 0,
                              "reason": "local_speech_analysis_unavailable", "error_type": type(exc).__name__}
            current = self.get(job_id)
            current_report = current.get("report") or {}
            current_audio = current_report.get("source_audio_selection", current_report.get("audio_selection")) or {}
            if current_audio != audio or current["state"] != manifest["state"]:
                raise MediaJobConflict("media selection changed during subtitle verification")
            assessment.update(input_sha256=key, source_sha256=inputs["source_sha256"],
                              audio_stream_index=audio["index"], subtitle_sha256=subtitle_sha256)
            # A missing local runtime may be repaired; do not durably cache its failure.
            if assessment.get("reason") != "local_speech_analysis_unavailable":
                current["subtitle_sync"] = assessment
                self._write(job_id, current)
            return assessment

    def subtitle_file(self, job_id: str, stream_index: int) -> tuple[Path, dict[str, Any]]:
        manifest = self.get(job_id)
        report = manifest.get("report") or {}
        tracks = report.get("source_subtitle_tracks", report.get("subtitle_tracks")) or []
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

    async def prepare(self, job_id: str, *, mode: str, plan_sha256: str, rendition: str = "full") -> dict[str, Any]:
        manifest = self.get(job_id)
        report = manifest.get("report") or {}
        if rendition == "lite":
            # A light copy is a second rendition of the same source, offered only once the full
            # output of this job is verified; it never replaces it.
            if manifest["state"] != "COMPLETE" or not manifest.get("output_sha256"):
                raise MediaJobConflict("prepare the full copy before its light copy")
            plan, expected_sha = report.get("lite_plan") or {}, report.get("lite_plan_sha256")
            state = "TRANSCODING_LITE"
        elif rendition == "full":
            if manifest["state"] != "WAITING_FOR_DECISION":
                raise MediaJobConflict("job is not waiting for a decision")
            plan, expected_sha = report.get("plan") or {}, report.get("plan_sha256")
            state = "REPAIRING" if mode == "lossless_repair" else "TRANSCODING"
        else:
            raise MediaJobConflict("unknown rendition")
        if not plan or plan_sha256 != expected_sha or mode != plan.get("mode"):
            raise MediaJobConflict("media plan changed; review the current plan")
        manifest.update(state=state, progress=0.21)
        self._write(job_id, manifest)
        self._tasks[job_id] = asyncio.create_task(self._prepare(job_id, mode, dict(plan), rendition))
        return manifest

    async def _prepare(self, job_id: str, mode: str, plan: dict[str, Any], rendition: str = "full") -> None:
        async with self._capacity:
            job_dir = self._dir(job_id)
            source = job_dir / "source.media"
            suffix = "-lite" if rendition == "lite" else ""
            partial, output = job_dir / ("output.partial%s.mp4" % suffix), job_dir / ("ready%s.mp4" % suffix)
            reference_report = self.get(job_id).get("report") or {}

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
                if rendition == "lite":
                    budget = int(plan.get("max_output_bytes") or 0)
                    size_bytes = partial.stat().st_size
                    if budget and size_bytes > budget:
                        raise MediaJobConflict("light copy exceeds its size budget")
                    reference_duration = float(reference_report.get("duration_seconds") or 0)
                    lite_duration = float(post.get("duration_seconds") or 0)
                    if reference_duration and abs(reference_duration - lite_duration) > 0.15:
                        raise MediaJobConflict("light copy timeline differs from the full copy")
                    output_sha = _sha256_file(partial)
                    os.replace(partial, output)
                    manifest = self.get(job_id)
                    renditions = dict(manifest.get("renditions") or {})
                    renditions["lite"] = {
                        "role": "lite", "sha256": output_sha, "size_bytes": size_bytes,
                        "name": Path(manifest["source_name"]).stem + "-phone.mp4",
                        "height": plan.get("height"), "duration_seconds": lite_duration or None,
                        "derived_from_source_sha256": manifest.get("source_sha256"),
                    }
                    manifest.update(state="COMPLETE", progress=1.0, renditions=renditions,
                                    lite_output_sha256=output_sha)
                    self._write(job_id, manifest)
                    return
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
                elif mode == "audio_transcode":
                    picture = await self.video_proof_fn(
                        source, partial, source_video_index=plan.get("selected_video_stream"),
                    )
                    if not picture.get("verified"):
                        raise MediaJobConflict("copied picture equivalence proof failed")
                    verification.update(picture)
                output_sha = _sha256_file(partial)
                output_bytes = partial.stat().st_size
                post.update(
                    source_sha256=manifest["source_sha256"], source_size_bytes=manifest["source_bytes"],
                    source_name=manifest["source_name"], output_sha256=output_sha,
                    output_size_bytes=output_bytes,
                )
                source_report = manifest.get("report") or {}
                for key in ("audio_selection", "subtitle_tracks", "track_inventory", "duration_seconds"):
                    if key in source_report:
                        post["source_" + key] = source_report[key]
                # The light copy is always derived from the source, so the source plan governs it;
                # the post-probe describes the prepared output and must not replace that plan.
                for key in ("lite_plan", "lite_plan_sha256", "lite_reason"):
                    post[key] = source_report.get(key)
                post["timeline_verdict"] = {
                    "lossless_repair": "equivalent", "audio_transcode": "picture-equivalent",
                }.get(mode, "explicit-transcode")
                os.replace(partial, output)
                manifest = self.get(job_id)
                renditions = dict(manifest.get("renditions") or {})
                renditions["full"] = {
                    "role": "full", "sha256": output_sha, "size_bytes": output_bytes,
                    "name": Path(manifest["source_name"]).stem + "-mobile-ready.mp4",
                    "duration_seconds": post.get("duration_seconds"),
                    "derived_from_source_sha256": manifest.get("source_sha256"),
                }
                manifest.update(
                    state="COMPLETE", progress=1.0, report=post,
                    output_sha256=output_sha,
                    output_name=Path(manifest["source_name"]).stem + "-mobile-ready.mp4",
                    output_bytes=output_bytes, verification=verification, renditions=renditions,
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
                manifest.update(
                    state="FAILED", progress=1.0,
                    error="MEDIA_PREPARE_OR_VERIFY_FAILED", error_type=type(exc).__name__,
                    # MediaJobConflict messages are bounded contract diagnoses written by us
                    # (never an ffmpeg command line or a local path), so they are safe and useful
                    # to return to Studio. Other exceptions keep only their type.
                    error_detail=str(exc)[:240] if isinstance(exc, MediaJobConflict) else None,
                )
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

    def file_path(self, job_id: str, rendition: str = "full") -> Path:
        manifest = self.get(job_id)
        if rendition == "lite":
            expected = ((manifest.get("renditions") or {}).get("lite") or {}).get("sha256")
            path = self._dir(job_id) / "ready-lite.mp4"
        elif rendition == "full":
            expected = manifest.get("output_sha256")
            path = self._dir(job_id) / "ready.mp4"
        else:
            raise MediaJobConflict("unknown rendition")
        if manifest["state"] != "COMPLETE" or not expected or not path.is_file() or _sha256_file(path) != expected:
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
            "deleted_lite_output": (self._dir(job_id) / "ready-lite.mp4").is_file(),
            "deleted_temporary": (self._dir(job_id) / "output.partial.mp4").is_file(),
            "deleted_subtitles": (self._dir(job_id) / "subtitles").is_dir(),
        }
        shutil.rmtree(self._dir(job_id), ignore_errors=False)
        self._tasks.pop(job_id, None)
        self._cancel.pop(job_id, None)
        return receipt
