"""Bounded ephemeral acquisition jobs; no database and no durable media registry."""

from __future__ import annotations

import hashlib
import mimetypes
import os
import re
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .planner import MAX_OUTPUT_BYTES
from .receipts import TokenError, verify_plan_token


TERMINAL_STATES = {"COMPLETE", "FAILED", "CANCELED", "EXPIRED"}
ACTIVE_STATES = {"PREPARING", "DOWNLOADING", "MERGING", "VERIFYING"}
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


class JobError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class StreamResult:
    path: Path
    mime_type: str
    download_name: str
    sha256: str
    size_bytes: int


@dataclass
class _Job:
    job_id: str
    subject: str
    plan: dict[str, Any]
    option: dict[str, Any]
    created_at: float
    expires_at: float
    state: str = "QUEUED"
    phase: str = "QUEUED"
    bytes_done: int = 0
    bytes_total: int | None = None
    output_path: Path | None = None
    output_sha256: str | None = None
    output_size_bytes: int | None = None
    mime_type: str | None = None
    download_name: str | None = None
    error_code: str | None = None
    cleanup_receipt: dict[str, Any] | None = None
    stream_count: int = 0
    cancel_event: threading.Event = field(default_factory=threading.Event)
    done_event: threading.Event = field(default_factory=threading.Event)


def _hash_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_OUTPUT_BYTES:
                raise JobError("OUTPUT_SIZE_LIMIT")
            digest.update(chunk)
    return digest.hexdigest(), size


def _safe_download_name(value: str) -> str:
    value = SAFE_NAME_RE.sub("-", str(value or "media")).strip(".-")
    return (value[:120] or "media.bin")


class YtDlpBackend:
    """Fixed yt-dlp API adapter. Callers cannot supply extractor options or paths."""

    def __init__(self, *, socket_timeout: int = 20):
        self.socket_timeout = int(socket_timeout)

    @staticmethod
    def _base_options() -> dict[str, Any]:
        return {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_unavailable_fragments": False,
            "ignoreerrors": False,
            "cachedir": False,
            "ignoreconfig": True,
            "socket_timeout": 20,
            "retries": 3,
            "fragment_retries": 3,
            "concurrent_fragment_downloads": 1,
            "js_runtimes": {"deno": {}},
        }

    def resolve(self, canonical_url: str) -> dict[str, Any]:
        from yt_dlp import YoutubeDL

        options = self._base_options()
        options["skip_download"] = True
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(canonical_url, download=False, process=True)
        if not isinstance(info, dict) or info.get("_type") == "playlist":
            raise JobError("EXTRACTOR_RESULT_INVALID")
        return info

    def prepare(self, *, plan: dict[str, Any], option: dict[str, Any], job_dir: Path,
                cancel_event: threading.Event, progress: Callable[[str, int, int | None], None]):
        from yt_dlp import YoutubeDL

        job_dir = Path(job_dir).resolve()
        options = self._base_options()
        options.update({
            "paths": {"home": str(job_dir), "temp": str(job_dir)},
            "outtmpl": {"default": str(job_dir / "prepared.%(ext)s")},
            "overwrites": True,
            "nopart": False,
            "max_filesize": MAX_OUTPUT_BYTES,
        })

        def hook(status: dict[str, Any]):
            if cancel_event.is_set():
                raise JobError("JOB_CANCELED")
            downloaded = int(status.get("downloaded_bytes") or 0)
            total = status.get("total_bytes") or status.get("total_bytes_estimate")
            total = int(total) if isinstance(total, (int, float)) and total > 0 else None
            if downloaded > MAX_OUTPUT_BYTES or (total is not None and total > MAX_OUTPUT_BYTES):
                raise JobError("OUTPUT_SIZE_LIMIT")
            phase = "DOWNLOADING" if status.get("status") != "finished" else "MERGING"
            progress(phase, downloaded, total)

        options["progress_hooks"] = [hook]
        kind = option.get("kind")
        if kind in {"video", "audio"}:
            ids = option.get("format_ids") or []
            if not ids or any(not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", str(value)) for value in ids):
                raise JobError("FORMAT_PLAN_INVALID")
            options["format"] = "+".join(str(value) for value in ids)
            options["merge_output_format"] = "mp4" if kind == "video" else None
        elif kind == "captions":
            provider_language = str(option.get("provider_language") or "")
            if provider_language not in {"he", "iw"}:
                raise JobError("CAPTION_PLAN_INVALID")
            options.update({
                "skip_download": True,
                "writesubtitles": option.get("source_kind") == "manual",
                "writeautomaticsub": option.get("source_kind") == "auto",
                "subtitleslangs": [provider_language],
                "subtitlesformat": "vtt",
            })
        else:
            raise JobError("OPTION_KIND_INVALID")

        progress("DOWNLOADING", 0, option.get("size_bytes"))
        with YoutubeDL(options) as ydl:
            ydl.extract_info(str(plan["canonical_url"]), download=True, process=True)
        if cancel_event.is_set():
            raise JobError("JOB_CANCELED")

        candidates = [path for path in job_dir.iterdir() if path.is_file() and not path.name.endswith((".part", ".ytdl"))]
        if kind == "captions":
            candidates = [path for path in candidates if path.suffix.lower() == ".vtt"]
        else:
            candidates = [path for path in candidates if path.suffix.lower() in ({".mp4"} if kind == "video" else {".m4a", ".mp4"})]
        if len(candidates) != 1:
            raise JobError("OUTPUT_FILE_INVALID")
        output = candidates[0].resolve()
        if job_dir not in output.parents:
            raise JobError("OUTPUT_PATH_INVALID")
        quality = f"-{int(option['quality'])}p" if option.get("quality") else ""
        ext = "mp4" if kind == "video" else ("m4a" if kind == "audio" else "vtt")
        name = _safe_download_name(f"youtube-{plan['video_id']}{quality}.{ext}")
        mime = {"video": "video/mp4", "audio": "audio/mp4", "captions": "text/vtt"}[kind]
        return output, mime, name


class JobRegistry:
    def __init__(self, *, secret: str, root: str | os.PathLike[str], backend: Any | None = None,
                 ttl_seconds: int = 1800):
        if len(str(secret)) < 32:
            raise JobError("SECRET_TOO_SHORT")
        self.secret = str(secret)
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.backend = backend or YtDlpBackend()
        self.ttl_seconds = min(1800, max(60, int(ttl_seconds)))
        self._jobs: dict[str, _Job] = {}
        self._lock = threading.RLock()

    def _public(self, job: _Job) -> dict[str, Any]:
        return {
            "schema_version": "lp_media_job.1.0.0",
            "job_id": job.job_id,
            "state": job.state,
            "phase": job.phase,
            "option_id": job.option.get("id"),
            "kind": job.option.get("kind"),
            "quality": job.option.get("quality"),
            "bytes_done": job.bytes_done,
            "bytes_total": job.bytes_total,
            "output_sha256": job.output_sha256 if job.state in {"READY", "COMPLETE"} else None,
            "output_size_bytes": job.output_size_bytes if job.state in {"READY", "COMPLETE"} else None,
            "mime_type": job.mime_type if job.state in {"READY", "COMPLETE"} else None,
            "download_name": job.download_name if job.state in {"READY", "COMPLETE"} else None,
            "expires_at": int(job.expires_at),
            "error_code": job.error_code,
            "cleanup_receipt": job.cleanup_receipt,
        }

    def _owned(self, subject: str, job_id: str) -> _Job:
        with self._lock:
            job = self._jobs.get(str(job_id))
            if not job or job.subject != str(subject):
                raise JobError("JOB_NOT_FOUND")
            if time.time() > job.expires_at and job.state not in TERMINAL_STATES:
                self._expire(job)
            return job

    def create(self, *, subject: str, plan_token: str, option_id: str,
               rights_basis: dict[str, Any]) -> dict[str, Any]:
        if rights_basis != {"kind": "rights_holder_permission"}:
            raise JobError("RIGHTS_REQUIRED")
        try:
            plan = verify_plan_token(plan_token, self.secret)
        except TokenError as exc:
            raise JobError(exc.args[0]) from exc
        if plan.get("sub") != str(subject):
            raise JobError("PLAN_SUBJECT_MISMATCH")
        option = next((item for item in plan.get("options", []) if item.get("id") == option_id), None)
        if not option:
            raise JobError("OPTION_NOT_IN_PLAN")
        predicted = option.get("size_bytes")
        if predicted is not None and int(predicted) > MAX_OUTPUT_BYTES:
            raise JobError("OUTPUT_SIZE_LIMIT")
        now = time.time()
        with self._lock:
            self.cleanup(now=now)
            retained = [item for item in self._jobs.values()
                        if item.state in ACTIVE_STATES or item.state in {"QUEUED", "READY"}
                        or (item.state == "COMPLETE" and item.cleanup_receipt
                            and not item.cleanup_receipt.get("deleted"))]
            if len(retained) >= 2:
                raise JobError("QUEUE_FULL")
            job_id = "rma_" + uuid.uuid4().hex
            job = _Job(job_id=job_id, subject=str(subject), plan=plan, option=dict(option),
                       created_at=now, expires_at=now + self.ttl_seconds,
                       bytes_total=int(predicted) if predicted is not None else None)
            self._jobs[job_id] = job
            should_start = not any(item.state in ACTIVE_STATES for item in self._jobs.values())
            if should_start:
                self._start(job)
            return self._public(job)

    def _start(self, job: _Job) -> None:
        job.state = "PREPARING"
        job.phase = "PREPARING"
        threading.Thread(target=self._run, args=(job,), name=f"lp-media-{job.job_id}", daemon=True).start()

    def _progress(self, job: _Job, phase: str, done: int, total: int | None) -> None:
        with self._lock:
            if job.cancel_event.is_set():
                raise JobError("JOB_CANCELED")
            job.state = str(phase)
            job.phase = str(phase)
            job.bytes_done = max(0, int(done or 0))
            if total is not None:
                job.bytes_total = max(0, int(total))

    def _run(self, job: _Job) -> None:
        job_dir = (self.root / job.job_id).resolve()
        if self.root not in job_dir.parents:
            return
        job_dir.mkdir(parents=False, exist_ok=False)
        try:
            output, mime, name = self.backend.prepare(
                plan=job.plan,
                option=job.option,
                job_dir=job_dir,
                cancel_event=job.cancel_event,
                progress=lambda phase, done, total: self._progress(job, phase, done, total),
            )
            if job.cancel_event.is_set():
                raise JobError("JOB_CANCELED")
            with self._lock:
                job.state = "VERIFYING"
                job.phase = "VERIFYING"
            output = Path(output).resolve()
            if job_dir not in output.parents or not output.is_file():
                raise JobError("OUTPUT_PATH_INVALID")
            digest, size = _hash_file(output)
            with self._lock:
                job.output_path = output
                job.output_sha256 = digest
                job.output_size_bytes = size
                job.bytes_done = size
                job.bytes_total = size
                job.mime_type = str(mime or mimetypes.guess_type(name)[0] or "application/octet-stream")
                job.download_name = _safe_download_name(name)
                job.state = "READY"
                job.phase = "READY"
        except Exception as exc:
            code = getattr(exc, "code", None) or ("JOB_CANCELED" if job.cancel_event.is_set() else "PREPARE_FAILED")
            with self._lock:
                job.state = "CANCELED" if code == "JOB_CANCELED" else "FAILED"
                job.phase = job.state
                job.error_code = str(code)
            shutil.rmtree(job_dir, ignore_errors=True)
        finally:
            job.done_event.set()
            with self._lock:
                queued = next((item for item in self._jobs.values() if item.state == "QUEUED"), None)
                if queued:
                    self._start(queued)

    def wait(self, job_id: str, *, timeout: float) -> dict[str, Any]:
        with self._lock:
            job = self._jobs.get(job_id)
        if not job:
            raise JobError("JOB_NOT_FOUND")
        job.done_event.wait(timeout)
        return self.status(job.subject, job_id)

    def status(self, subject: str, job_id: str) -> dict[str, Any]:
        return self._public(self._owned(subject, job_id))

    def cancel(self, subject: str, job_id: str) -> dict[str, Any]:
        job = self._owned(subject, job_id)
        with self._lock:
            if job.state == "QUEUED":
                job.state = "CANCELED"
                job.phase = "CANCELED"
                job.error_code = "JOB_CANCELED"
                job.done_event.set()
            elif job.state in ACTIVE_STATES:
                job.cancel_event.set()
                job.phase = "CANCEL_REQUESTED"
            elif job.state == "READY":
                self._delete_output(job, reason="owner_cancel")
                job.state = "CANCELED"
                job.phase = "CANCELED"
            return self._public(job)

    def open_stream(self, *, subject: str, job_id: str) -> StreamResult:
        job = self._owned(subject, job_id)
        with self._lock:
            if job.state != "READY" or not job.output_path or not job.output_path.is_file():
                raise JobError("JOB_NOT_READY")
            if job.stream_count >= 3:
                raise JobError("STREAM_RETRY_LIMIT")
            job.stream_count += 1
            return StreamResult(path=job.output_path, mime_type=job.mime_type or "application/octet-stream",
                                download_name=job.download_name or "media.bin", sha256=job.output_sha256 or "",
                                size_bytes=int(job.output_size_bytes or 0))

    def confirm_device(self, *, subject: str, job_id: str, sha256: str, size_bytes: int) -> dict[str, Any]:
        job = self._owned(subject, job_id)
        if job.state != "READY":
            raise JobError("JOB_NOT_READY")
        if str(sha256).lower() != str(job.output_sha256).lower():
            raise JobError("DEVICE_HASH_MISMATCH")
        if int(size_bytes) != int(job.output_size_bytes or -1):
            raise JobError("DEVICE_SIZE_MISMATCH")
        deletion = self._delete_output(job, reason="device_verified")
        job.state = "COMPLETE"
        job.phase = "COMPLETE"
        job.cleanup_receipt = deletion
        return {
            "schema_version": "lp_media_device_receipt.1.0.0",
            "job_id": job.job_id,
            "option_id": job.option.get("id"),
            "output_sha256": job.output_sha256,
            "output_size_bytes": job.output_size_bytes,
            "stored_in_studio_opfs": True,
            "owner_saved_copy": False,
            "deletion_receipt": deletion,
        }

    def _delete_output(self, job: _Job, *, reason: str) -> dict[str, Any]:
        job_dir = (self.root / job.job_id).resolve()
        deleted = False
        if self.root in job_dir.parents and job_dir.exists():
            try:
                shutil.rmtree(job_dir, ignore_errors=False)
                deleted = not job_dir.exists()
            except OSError:
                deleted = False
        if deleted or not job_dir.exists():
            job.output_path = None
        return {"deleted": deleted, "reason": reason, "at": int(time.time())}

    def _expire(self, job: _Job) -> None:
        try:
            deletion = self._delete_output(job, reason="ttl_expired")
        except Exception:
            deletion = {"deleted": False, "reason": "ttl_expired", "at": int(time.time())}
        job.cancel_event.set()
        job.state = "EXPIRED"
        job.phase = "EXPIRED"
        job.cleanup_receipt = deletion

    def cleanup(self, *, now: float | None = None) -> int:
        current = time.time() if now is None else float(now)
        removed = 0
        with self._lock:
            for job_id, job in list(self._jobs.items()):
                if job.state == "COMPLETE" and job.cleanup_receipt and not job.cleanup_receipt.get("deleted"):
                    job.cleanup_receipt = self._delete_output(job, reason="device_verified_retry")
                if current <= job.expires_at:
                    continue
                if job.state not in TERMINAL_STATES:
                    self._expire(job)
                elif job.output_path:
                    job.cleanup_receipt = self._delete_output(job, reason="terminal_ttl_retry")
                if not job.output_path:
                    self._jobs.pop(job_id, None)
                    removed += 1
        return removed
