"""Verified managed store for the sole approved MADLAD runtime snapshot."""

from __future__ import annotations

import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from . import config
from .model_store import ACTIVATION_MANIFEST, MODEL_ACTIVATION_RESERVE_BYTES, sha256_file
from .mt_constants import (
    MT_MODEL_FORMAT,
    MT_MODEL_ID,
    MT_MODEL_LICENSE,
    MT_MODEL_QUANTIZATION,
    MT_MODEL_REVISION,
    MT_RUNTIME_FILE_BYTES,
    MT_RUNTIME_FILE_SHA256,
    model_identity,
)


def expected_mt_model_dir(root: Path | None = None) -> Path:
    base = root or config.MODELS_DIR
    return base / "mt" / MT_MODEL_ID.replace("/", "--") / MT_MODEL_REVISION / MT_MODEL_QUANTIZATION


@dataclass(frozen=True)
class MtModelStatus:
    installed: bool
    verified: bool
    path: Path
    reason: str | None = None

    def public_dict(self) -> dict[str, object]:
        return {
            "installed": self.installed,
            "verified": self.verified,
            "reason": self.reason,
            "model": model_identity(),
        }


def _manifest_payload() -> dict[str, object]:
    return {
        "activation_schema": "linguistpro-local-model-v1",
        "model_id": MT_MODEL_ID,
        "revision": MT_MODEL_REVISION,
        "license": MT_MODEL_LICENSE,
        "format": MT_MODEL_FORMAT,
        "quantization": MT_MODEL_QUANTIZATION,
        "runtime_file_bytes": dict(MT_RUNTIME_FILE_BYTES),
        "runtime_file_sha256": dict(MT_RUNTIME_FILE_SHA256),
    }


def inspect_mt_model(root: Path | None = None, *, verify_hash: bool = False) -> MtModelStatus:
    target = expected_mt_model_dir(root)
    manifest_path = target / ACTIVATION_MANIFEST
    if not target.is_dir() or not manifest_path.is_file():
        return MtModelStatus(False, False, target, "NOT_INSTALLED")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return MtModelStatus(True, False, target, "BAD_MANIFEST")
    required = _manifest_payload()
    if any(manifest.get(key) != value for key, value in required.items()):
        return MtModelStatus(True, False, target, "PIN_MISMATCH")
    for name, expected_size in MT_RUNTIME_FILE_BYTES.items():
        item = target / name
        if not item.is_file():
            return MtModelStatus(True, False, target, "RUNTIME_FILE_MISSING")
        if item.stat().st_size != expected_size:
            return MtModelStatus(True, False, target, "RUNTIME_FILE_SIZE_MISMATCH")
        if verify_hash and sha256_file(item) != MT_RUNTIME_FILE_SHA256[name]:
            return MtModelStatus(True, False, target, "RUNTIME_FILE_HASH_MISMATCH")
    return MtModelStatus(True, True, target)


def verify_source_directory(source: Path) -> None:
    for name, expected_size in MT_RUNTIME_FILE_BYTES.items():
        item = source / name
        if not item.is_file():
            raise ValueError(f"MODEL_RUNTIME_FILE_MISSING:{name}")
        if item.stat().st_size != expected_size:
            raise ValueError(f"MODEL_RUNTIME_FILE_SIZE_MISMATCH:{name}")
        if sha256_file(item) != MT_RUNTIME_FILE_SHA256[name]:
            raise ValueError(f"MODEL_RUNTIME_FILE_HASH_MISMATCH:{name}")


def activate_mt_from_directory(source: Path, root: Path | None = None) -> MtModelStatus:
    """Verify, copy, manifest, and atomically activate an existing exact snapshot."""
    source = source.resolve()
    verify_source_directory(source)
    target = expected_mt_model_dir(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        status = inspect_mt_model(root, verify_hash=True)
        if status.verified:
            return status
        raise FileExistsError("MODEL_REPAIR_REQUIRES_DELETE")
    required_free = (2 * sum(MT_RUNTIME_FILE_BYTES.values())) + MODEL_ACTIVATION_RESERVE_BYTES
    if shutil.disk_usage(target.parent).free < required_free:
        raise RuntimeError("MODEL_DISK_LOW")
    with tempfile.TemporaryDirectory(prefix="mt-activate-", dir=target.parent) as temp_name:
        staged = Path(temp_name) / "snapshot"
        shutil.copytree(source, staged)
        (staged / ACTIVATION_MANIFEST).write_text(
            json.dumps(_manifest_payload(), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        staged.replace(target)
    return inspect_mt_model(root, verify_hash=True)
