"""Cancelable adoption/deletion lifecycle for the exact MADLAD CT2 snapshot."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from . import config
from .model_store import ACTIVATION_MANIFEST, MODEL_ACTIVATION_RESERVE_BYTES
from .mt_constants import (
    MT_MODEL_ID,
    MT_MODEL_LICENSE,
    MT_MODEL_QUANTIZATION,
    MT_MODEL_REVISION,
    MT_RUNTIME_FILE_BYTES,
    MT_RUNTIME_FILE_SHA256,
    MT_SOURCE_BYTES,
    MT_SOURCE_FILE_BYTES,
    MT_SOURCE_FILE_SHA256,
    MT_SNAPSHOT_BYTES,
    model_identity,
)
from .mt_model_store import expected_mt_model_dir, inspect_mt_model

MT_RECEIPT_ROOT = config.STATE_DIR / "receipts"
MT_DOWNLOAD_ROOT = config.STATE_DIR.parent / "downloads" / "mt"
ALLOWED_DOWNLOAD_HOST_SUFFIXES = ("huggingface.co", ".huggingface.co", ".hf.co")


def _is_link(path: Path) -> bool:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0)
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    )


def _assert_managed_target(path: Path) -> None:
    root = config.MODELS_DIR.resolve()
    resolved = path.resolve()
    if resolved == root or root not in resolved.parents:
        raise ValueError("MODEL_PATH_OUTSIDE_MANAGED_ROOT")
    if _is_link(path):
        raise ValueError("MODEL_PATH_IS_LINK")
    if path.exists() and any(_is_link(item) for item in path.rglob("*")):
        raise ValueError("MODEL_TREE_CONTAINS_LINK")


def _receipt(kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    MT_RECEIPT_ROOT.mkdir(parents=True, exist_ok=True)
    value = {
        "schema": "linguistpro-local-mt-receipt-v1",
        "kind": kind,
        "at_unix_ms": int(time.time() * 1000),
        **payload,
    }
    target = MT_RECEIPT_ROOT / f"mt-{kind}-{value['at_unix_ms']}.json"
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(target)
    return value


def _manifest() -> dict[str, Any]:
    return {
        "activation_schema": "linguistpro-local-model-v1",
        "model_id": MT_MODEL_ID,
        "revision": MT_MODEL_REVISION,
        "license": MT_MODEL_LICENSE,
        "format": "CTranslate2",
        "quantization": MT_MODEL_QUANTIZATION,
        "runtime_file_bytes": dict(MT_RUNTIME_FILE_BYTES),
        "runtime_file_sha256": dict(MT_RUNTIME_FILE_SHA256),
    }


class MtModelInstallManager:
    """Resume exact source downloads or adopt an already verified CT2 snapshot."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self._source_mode = "remote_exact_revision"
        self._state = self._idle_state()

    @staticmethod
    def _idle_state() -> dict[str, Any]:
        status = inspect_mt_model(verify_hash=False)
        return {
            "state": "READY" if status.verified else "IDLE",
            "processed_bytes": 0,
            "total_bytes": MT_SOURCE_BYTES + MT_SNAPSHOT_BYTES,
            "current_file": None,
            "error_code": None,
            "model": model_identity(),
            "source": "exact_revision_or_verified_local_snapshot",
        }

    def status(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._state)

    def _set(self, **changes: Any) -> None:
        with self._lock:
            self._state.update(changes)

    def start(self, *, accepted_license: bool, revision: str) -> dict[str, Any]:
        if not accepted_license:
            raise ValueError("MODEL_LICENSE_NOT_ACCEPTED")
        if revision != MT_MODEL_REVISION:
            raise ValueError("MODEL_REVISION_NOT_APPROVED")
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                raise RuntimeError("MODEL_INSTALL_ALREADY_RUNNING")
        existing = inspect_mt_model(verify_hash=True)
        if existing.verified:
            self._set(state="READY", error_code=None)
            return self.status()
        target = expected_mt_model_dir()
        if target.exists():
            raise RuntimeError("MODEL_REPAIR_REQUIRES_DELETE")
        source = config.MADLAD_LEGACY_MODEL_DIR
        self._source_mode = "verified_local_snapshot" if source.is_dir() else "remote_exact_revision"
        required = (
            (2 * MT_SNAPSHOT_BYTES) + MODEL_ACTIVATION_RESERVE_BYTES
            if self._source_mode == "verified_local_snapshot"
            else MT_SOURCE_BYTES + MT_SNAPSHOT_BYTES + MODEL_ACTIVATION_RESERVE_BYTES
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(target.parent).free < required:
            raise RuntimeError("MODEL_DISK_LOW")
        self._cancel.clear()
        self._set(
            state="QUEUED", processed_bytes=0,
            total_bytes=MT_SNAPSHOT_BYTES if self._source_mode == "verified_local_snapshot" else MT_SOURCE_BYTES + MT_SNAPSHOT_BYTES,
            current_file=None, error_code=None, source=self._source_mode,
        )
        thread = threading.Thread(target=self._run, name="local-mt-model-adopt", daemon=True)
        with self._lock:
            self._thread = thread
        thread.start()
        return self.status()

    def cancel(self) -> dict[str, Any]:
        self._cancel.set()
        return self.status()

    def _copy_verified(self, source: Path, staged: Path) -> None:
        processed = 0
        for name, expected_hash in MT_RUNTIME_FILE_SHA256.items():
            if self._cancel.is_set():
                raise InterruptedError
            self._set(current_file=name)
            digest = hashlib.sha256()
            source_file = source / name
            if not source_file.is_file() or source_file.stat().st_size != MT_RUNTIME_FILE_BYTES[name]:
                raise RuntimeError(f"MODEL_RUNTIME_FILE_INVALID:{name}")
            with source_file.open("rb") as reader, (staged / name).open("wb") as writer:
                while True:
                    if self._cancel.is_set():
                        raise InterruptedError
                    chunk = reader.read(8 * 1024 * 1024)
                    if not chunk:
                        break
                    writer.write(chunk)
                    digest.update(chunk)
                    processed += len(chunk)
                    self._set(processed_bytes=processed)
            if digest.hexdigest() != expected_hash:
                raise RuntimeError(f"MODEL_RUNTIME_FILE_HASH_MISMATCH:{name}")

    @staticmethod
    def _source_dir() -> Path:
        return MT_DOWNLOAD_ROOT / MT_MODEL_REVISION

    @staticmethod
    def _download_url(name: str) -> str:
        quoted = urllib.parse.quote(name, safe="")
        return f"https://huggingface.co/{MT_MODEL_ID}/resolve/{MT_MODEL_REVISION}/{quoted}?download=true"

    def _hash_partial(self, path: Path, digest: hashlib._Hash) -> int:
        size = 0
        if not path.exists():
            return size
        with path.open("rb") as stream:
            while True:
                if self._cancel.is_set():
                    raise InterruptedError
                chunk = stream.read(8 * 1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                size += len(chunk)
        return size

    def _download_source_file(self, source: Path, name: str, completed: int) -> int:
        expected_size = MT_SOURCE_FILE_BYTES[name]
        expected_hash = MT_SOURCE_FILE_SHA256[name]
        target = source / name
        partial = source / f"{name}.part"
        if target.is_file():
            if target.stat().st_size == expected_size:
                digest = hashlib.sha256()
                self._hash_partial(target, digest)
                if digest.hexdigest() == expected_hash:
                    self._set(processed_bytes=completed + expected_size)
                    return expected_size
            target.unlink()
        if partial.exists() and partial.stat().st_size > expected_size:
            partial.unlink()
        digest = hashlib.sha256()
        offset = self._hash_partial(partial, digest)
        if offset == expected_size:
            if digest.hexdigest() != expected_hash:
                partial.unlink()
                raise RuntimeError(f"MODEL_SOURCE_HASH_MISMATCH:{name}")
            partial.replace(target)
            return expected_size
        headers = {
            "User-Agent": "LinguistPro-Local-MT-Companion/0.3",
            "Accept-Encoding": "identity",
        }
        if offset:
            headers["Range"] = f"bytes={offset}-"
        request = urllib.request.Request(self._download_url(name), headers=headers)
        with urllib.request.urlopen(request, timeout=90) as response:
            final_host = (urllib.parse.urlparse(response.geturl()).hostname or "").lower()
            if not final_host.endswith(ALLOWED_DOWNLOAD_HOST_SUFFIXES):
                raise RuntimeError("MODEL_DOWNLOAD_REDIRECT_REJECTED")
            if offset and getattr(response, "status", None) != 206:
                partial.unlink(missing_ok=True)
                raise RuntimeError("MODEL_DOWNLOAD_RESUME_REJECTED")
            mode = "ab" if offset else "wb"
            with partial.open(mode) as stream:
                downloaded = offset
                while True:
                    if self._cancel.is_set():
                        raise InterruptedError
                    chunk = response.read(8 * 1024 * 1024)
                    if not chunk:
                        break
                    stream.write(chunk)
                    digest.update(chunk)
                    downloaded += len(chunk)
                    self._set(processed_bytes=completed + downloaded)
        if partial.stat().st_size != expected_size or digest.hexdigest() != expected_hash:
            raise RuntimeError(f"MODEL_SOURCE_INTEGRITY_FAILED:{name}")
        partial.replace(target)
        return expected_size

    def _download_source(self) -> Path:
        source = self._source_dir()
        source.mkdir(parents=True, exist_ok=True)
        completed = 0
        self._set(state="DOWNLOADING", current_file=None)
        for name in MT_SOURCE_FILE_SHA256:
            if self._cancel.is_set():
                raise InterruptedError
            self._set(current_file=name)
            completed += self._download_source_file(source, name, completed)
        return source

    @staticmethod
    def _conversion_command(source: Path, output: Path) -> list[str]:
        if getattr(sys, "frozen", False):
            return [sys.executable, "--convert-mt-worker", str(source), str(output)]
        return [sys.executable, "-m", "ai_local.mt_convert_worker", str(source), str(output)]

    def _convert_source(self, source: Path, partial: Path) -> None:
        self._set(state="CONVERTING", current_file=None, processed_bytes=MT_SOURCE_BYTES)
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        process = subprocess.Popen(
            self._conversion_command(source, partial),
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            close_fds=True, creationflags=creationflags,
        )
        try:
            while process.poll() is None:
                if self._cancel.wait(0.25):
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=10)
                    raise InterruptedError
            if process.returncode != 0:
                raise RuntimeError("MODEL_CONVERSION_FAILED")
        finally:
            if process.poll() is None:
                process.kill()
        self._set(state="VERIFYING", processed_bytes=MT_SOURCE_BYTES + MT_SNAPSHOT_BYTES)

    def _run(self) -> None:
        target = expected_mt_model_dir()
        partial = target.parent / f".{MT_MODEL_REVISION}.partial"
        try:
            _assert_managed_target(partial)
            if partial.exists():
                shutil.rmtree(partial)
            if self._source_mode == "verified_local_snapshot":
                partial.mkdir(parents=True, exist_ok=False)
                self._set(state="VERIFYING_AND_COPYING")
                self._copy_verified(config.MADLAD_LEGACY_MODEL_DIR, partial)
            else:
                source = self._download_source()
                self._convert_source(source, partial)
                # Conversion is accepted only if it reproduces every benchmarked
                # runtime byte/hash, not merely the mutable upstream model name.
                from .mt_model_store import verify_source_directory
                verify_source_directory(partial)
            (partial / ACTIVATION_MANIFEST).write_text(
                json.dumps(_manifest(), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            if self._cancel.is_set():
                raise InterruptedError
            partial.replace(target)
            status = inspect_mt_model(verify_hash=True)
            if not status.verified:
                raise RuntimeError(status.reason or "MODEL_ACTIVATION_FAILED")
            self._set(
                state="READY", processed_bytes=self._state.get("total_bytes", MT_SNAPSHOT_BYTES),
                current_file=None, error_code=None,
            )
            if self._source_mode == "remote_exact_revision" and self._source_dir().exists():
                shutil.rmtree(self._source_dir())
        except InterruptedError:
            self._set(state="CANCELED", current_file=None, error_code="MODEL_INSTALL_CANCELED")
        except (OSError, RuntimeError, ValueError, urllib.error.URLError) as exc:
            raw = str(exc).split(":", 1)[0]
            code = raw if re.fullmatch(r"[A-Z][A-Z0-9_]{2,79}", raw or "") else "MODEL_INSTALL_FAILED"
            self._set(state="FAILED", current_file=None, error_code=code)
        finally:
            if partial.exists():
                try:
                    _assert_managed_target(partial)
                    shutil.rmtree(partial)
                except (OSError, ValueError):
                    self._set(state="FAILED", error_code="PARTIAL_CLEANUP_FAILED")
            with self._lock:
                self._thread = None

    def delete_model(self) -> dict[str, Any]:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                raise RuntimeError("MODEL_INSTALL_ACTIVE")
        target = expected_mt_model_dir()
        cache = self._source_dir()
        existed = target.exists()
        if existed:
            _assert_managed_target(target)
            shutil.rmtree(target)
        if target.exists():
            raise RuntimeError("MODEL_DELETE_INCOMPLETE")
        cache_deleted = cache.exists()
        if cache_deleted:
            resolved_root = MT_DOWNLOAD_ROOT.resolve()
            resolved_cache = cache.resolve()
            if resolved_root not in resolved_cache.parents:
                raise ValueError("MODEL_CACHE_PATH_OUTSIDE_MANAGED_ROOT")
            shutil.rmtree(cache)
        self._set(state="IDLE", processed_bytes=0, current_file=None, error_code=None)
        return _receipt(
            "model-delete",
            {"deleted": existed, "cache_deleted": cache_deleted, "absent_after": True, "revision": MT_MODEL_REVISION},
        )


mt_model_install_manager = MtModelInstallManager()
