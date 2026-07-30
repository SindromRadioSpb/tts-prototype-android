"""Atomic activation and verification of the sole approved L1 ASR model."""

from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from . import config
from .asr_constants import (
    ASR_MODEL_BIN_REPOSITORY_BYTES,
    ASR_MODEL_BIN_SHA256,
    ASR_MODEL_ID,
    ASR_MODEL_LICENSE,
    ASR_MODEL_REVISION,
    ASR_RUNTIME_FILE_SHA256,
    model_identity,
)

ACTIVATION_MANIFEST = "linguistpro-model-manifest.json"


def sha256_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def expected_model_dir(root: Path | None = None) -> Path:
    base = root or config.MODELS_DIR
    safe_id = ASR_MODEL_ID.replace("/", "--")
    return base / "asr" / safe_id / ASR_MODEL_REVISION


@dataclass(frozen=True)
class ModelStatus:
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


def inspect_model(root: Path | None = None, *, verify_hash: bool = False) -> ModelStatus:
    target = expected_model_dir(root)
    model_bin = target / "model.bin"
    manifest_path = target / ACTIVATION_MANIFEST
    if not target.is_dir() or not model_bin.is_file() or not manifest_path.is_file():
        return ModelStatus(False, False, target, "NOT_INSTALLED")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ModelStatus(True, False, target, "BAD_MANIFEST")
    required = {
        "model_id": ASR_MODEL_ID,
        "revision": ASR_MODEL_REVISION,
        "model_bin_sha256": ASR_MODEL_BIN_SHA256,
        "license": ASR_MODEL_LICENSE,
    }
    if any(manifest.get(key) != value for key, value in required.items()):
        return ModelStatus(True, False, target, "PIN_MISMATCH")
    if model_bin.stat().st_size != ASR_MODEL_BIN_REPOSITORY_BYTES:
        return ModelStatus(True, False, target, "MODEL_SIZE_MISMATCH")
    manifest_hashes = manifest.get("runtime_file_sha256")
    if manifest_hashes != ASR_RUNTIME_FILE_SHA256:
        return ModelStatus(True, False, target, "RUNTIME_MANIFEST_MISMATCH")
    for name, expected_hash in ASR_RUNTIME_FILE_SHA256.items():
        runtime_file = target / name
        if not runtime_file.is_file():
            return ModelStatus(True, False, target, "RUNTIME_FILE_MISSING")
        if verify_hash and sha256_file(runtime_file) != expected_hash:
            return ModelStatus(True, False, target, "RUNTIME_FILE_HASH_MISMATCH")
    return ModelStatus(True, True, target)


def _manifest_payload() -> dict[str, object]:
    return {
        "activation_schema": "linguistpro-local-model-v1",
        "model_id": ASR_MODEL_ID,
        "revision": ASR_MODEL_REVISION,
        "model_bin_sha256": ASR_MODEL_BIN_SHA256,
        "model_bin_repository_bytes": ASR_MODEL_BIN_REPOSITORY_BYTES,
        "runtime_file_sha256": dict(ASR_RUNTIME_FILE_SHA256),
        "license": ASR_MODEL_LICENSE,
        "format": "CTranslate2",
    }


def activate_from_directory(source: Path, root: Path | None = None) -> ModelStatus:
    """Copy a pre-fetched exact snapshot into the managed store and atomically activate it."""
    source = source.resolve()
    source_model = source / "model.bin"
    if not source_model.is_file():
        raise ValueError("source snapshot has no model.bin")
    if source_model.stat().st_size != ASR_MODEL_BIN_REPOSITORY_BYTES:
        raise ValueError("source model.bin size does not match the approved pin")
    for name, expected_hash in ASR_RUNTIME_FILE_SHA256.items():
        runtime_file = source / name
        if not runtime_file.is_file():
            raise ValueError(f"source snapshot has no required runtime file: {name}")
        if sha256_file(runtime_file) != expected_hash:
            raise ValueError(f"source runtime file hash does not match the approved pin: {name}")

    target = expected_model_dir(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        status = inspect_model(root, verify_hash=True)
        if status.verified:
            return status
        raise FileExistsError(f"unverified activation already exists: {target}")

    with tempfile.TemporaryDirectory(prefix="asr-activate-", dir=target.parent) as temp_name:
        temp = Path(temp_name) / "snapshot"
        shutil.copytree(source, temp)
        (temp / ACTIVATION_MANIFEST).write_text(
            json.dumps(_manifest_payload(), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temp.replace(target)
    return inspect_model(root, verify_hash=True)
