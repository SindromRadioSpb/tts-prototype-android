"""Explicit exact-revision model download, activation, cancellation and deletion."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from . import config
from .asr_constants import (
    ASR_MODEL_ID,
    ASR_MODEL_REVISION,
    ASR_RUNTIME_FILE_BYTES,
    ASR_RUNTIME_FILE_SHA256,
    ASR_SNAPSHOT_BYTES,
)
from .model_store import (
    MODEL_ACTIVATION_RESERVE_BYTES,
    activate_from_directory,
    expected_model_dir,
    inspect_model,
)

ALLOWED_DOWNLOAD_HOST_SUFFIXES = ("huggingface.co", ".huggingface.co", ".hf.co")
DOWNLOAD_ROOT = config.STATE_DIR.parent / "downloads"
RECEIPT_ROOT = config.STATE_DIR / "receipts"


def _utc_iso() -> str:
    import datetime

    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def _is_reparse(path: Path) -> bool:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    if stat.S_ISLNK(info.st_mode):
        return True
    return bool(getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def _assert_managed_tree(path: Path, root: Path) -> Path:
    resolved_root = root.resolve()
    resolved = path.resolve()
    if resolved == resolved_root or resolved_root not in resolved.parents:
        raise ValueError("managed path escaped its root")
    if _is_reparse(path):
        raise ValueError("managed path is a link or junction")
    if path.exists():
        for item in path.rglob("*"):
            if _is_reparse(item):
                raise ValueError("managed tree contains a link or junction")
    return resolved


def _write_receipt(kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    RECEIPT_ROOT.mkdir(parents=True, exist_ok=True)
    receipt = {"schema": "linguistpro-local-asr-deletion-receipt-v1", "kind": kind, "at": _utc_iso(), **payload}
    name = f"{kind}-{int(time.time() * 1000)}.json"
    target = RECEIPT_ROOT / name
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(target)
    return receipt


def _download_url(filename: str) -> str:
    quoted = urllib.parse.quote(filename, safe="")
    return f"https://huggingface.co/{ASR_MODEL_ID}/resolve/{ASR_MODEL_REVISION}/{quoted}?download=true"


class ModelInstallManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self._state: dict[str, Any] = self._idle_state()

    @staticmethod
    def _idle_state() -> dict[str, Any]:
        status = inspect_model(verify_hash=False)
        return {
            "state": "READY" if status.verified else "IDLE",
            "downloaded_bytes": 0,
            "total_bytes": ASR_SNAPSHOT_BYTES,
            "current_file": None,
            "error_code": None,
            "error_detail": None,
            "model": status.public_dict()["model"],
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
        if revision != ASR_MODEL_REVISION:
            raise ValueError("MODEL_REVISION_NOT_APPROVED")
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                raise RuntimeError("MODEL_INSTALL_ALREADY_RUNNING")
        existing = inspect_model(verify_hash=True)
        if existing.verified:
            self._set(state="READY", error_code=None, error_detail=None)
            return self.status()
        if expected_model_dir().exists():
            raise RuntimeError("MODEL_REPAIR_REQUIRES_DELETE")
        DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        required = (2 * ASR_RUNTIME_FILE_BYTES["model.bin"]) + MODEL_ACTIVATION_RESERVE_BYTES
        if shutil.disk_usage(DOWNLOAD_ROOT).free < required:
            raise RuntimeError("MODEL_DISK_LOW")
        self._cancel.clear()
        self._set(
            state="QUEUED",
            downloaded_bytes=0,
            total_bytes=ASR_SNAPSHOT_BYTES,
            current_file=None,
            error_code=None,
            error_detail=None,
        )
        thread = threading.Thread(target=self._run, name="local-asr-model-install", daemon=True)
        with self._lock:
            self._thread = thread
        thread.start()
        return self.status()

    def cancel(self) -> dict[str, Any]:
        self._cancel.set()
        return self.status()

    def _run(self) -> None:
        partial = DOWNLOAD_ROOT / f"{ASR_MODEL_REVISION}.partial"
        try:
            if partial.exists():
                _assert_managed_tree(partial, DOWNLOAD_ROOT)
                shutil.rmtree(partial)
            partial.mkdir(parents=True, exist_ok=False)
            downloaded = 0
            self._set(state="DOWNLOADING")
            for name, expected_hash in ASR_RUNTIME_FILE_SHA256.items():
                if self._cancel.is_set():
                    raise InterruptedError("download canceled")
                expected_bytes = ASR_RUNTIME_FILE_BYTES[name]
                self._set(current_file=name)
                request = urllib.request.Request(_download_url(name), headers={"User-Agent": "LinguistPro-Local-ASR-Companion/0.2"})
                digest = hashlib.sha256()
                target = partial / name
                with urllib.request.urlopen(request, timeout=60) as response, target.open("wb") as stream:
                    final_host = (urllib.parse.urlparse(response.geturl()).hostname or "").lower()
                    if not final_host.endswith(ALLOWED_DOWNLOAD_HOST_SUFFIXES):
                        raise RuntimeError("MODEL_DOWNLOAD_REDIRECT_REJECTED")
                    while True:
                        if self._cancel.is_set():
                            raise InterruptedError("download canceled")
                        chunk = response.read(4 * 1024 * 1024)
                        if not chunk:
                            break
                        stream.write(chunk)
                        digest.update(chunk)
                        downloaded += len(chunk)
                        self._set(downloaded_bytes=downloaded)
                if target.stat().st_size != expected_bytes or digest.hexdigest() != expected_hash:
                    raise RuntimeError(f"MODEL_INTEGRITY_FAILED:{name}")
            self._set(state="VERIFYING", current_file=None)
            activated = activate_from_directory(partial)
            if not activated.verified:
                raise RuntimeError(activated.reason or "MODEL_ACTIVATION_FAILED")
            self._set(state="READY", downloaded_bytes=ASR_SNAPSHOT_BYTES, error_code=None, error_detail=None)
        except InterruptedError:
            self._set(state="CANCELED", error_code="MODEL_DOWNLOAD_CANCELED", error_detail=None)
        except (OSError, RuntimeError, urllib.error.URLError) as exc:
            detail = str(exc)[:200]
            code = detail.split(":", 1)[0] if detail else type(exc).__name__
            self._set(state="FAILED", error_code=code, error_detail=detail)
        finally:
            if partial.exists():
                try:
                    _assert_managed_tree(partial, DOWNLOAD_ROOT)
                    shutil.rmtree(partial)
                except (OSError, ValueError):
                    self._set(state="FAILED", error_code="PARTIAL_CLEANUP_FAILED", error_detail=None)
            with self._lock:
                self._thread = None

    def delete_model(self) -> dict[str, Any]:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                raise RuntimeError("MODEL_INSTALL_ACTIVE")
        target = expected_model_dir()
        existed = target.exists()
        if existed:
            _assert_managed_tree(target, config.MODELS_DIR)
            shutil.rmtree(target)
        if target.exists():
            raise RuntimeError("MODEL_DELETE_INCOMPLETE")
        self._set(state="IDLE", downloaded_bytes=0, current_file=None, error_code=None, error_detail=None)
        return _write_receipt("model", {"deleted": existed, "absent_after": True, "revision": ASR_MODEL_REVISION})


model_install_manager = ModelInstallManager()


def delete_all_jobs() -> dict[str, Any]:
    root = config.ASR_JOB_ROOT
    deleted = 0
    if root.exists():
        root.mkdir(parents=True, exist_ok=True)
        for child in list(root.iterdir()):
            _assert_managed_tree(child, root)
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
            deleted += 1
    leftovers = list(root.iterdir()) if root.exists() else []
    if leftovers:
        raise RuntimeError("JOB_DELETE_INCOMPLETE")
    return _write_receipt("jobs", {"deleted_entries": deleted, "absent_after": True})
