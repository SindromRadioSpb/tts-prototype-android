"""Allowlisted diagnostic export with no media, transcripts or credentials."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config
from .asr_constants import model_identity
from .companion_model import model_install_manager
from .companion_preflight import preflight_report
from .model_store import inspect_model

DIAGNOSTIC_SCHEMA = "linguistpro-local-asr-diagnostics-v1"


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _path_fingerprint(path: Path) -> str:
    # A support engineer can compare repeated reports without learning a username/path.
    return hashlib.sha256(str(path.resolve()).encode("utf-8")).hexdigest()[:16]


def diagnostic_payload(app_version: str, service_status: dict[str, Any]) -> dict[str, Any]:
    model = inspect_model(verify_hash=True)
    install = model_install_manager.status()
    pairing_exists = config.ASR_PAIRING_TOKEN_FILE.is_file()
    job_count = 0
    if config.ASR_JOB_ROOT.exists():
        job_count = sum(1 for item in config.ASR_JOB_ROOT.iterdir() if item.is_dir())
    return {
        "schema": DIAGNOSTIC_SCHEMA,
        "generated_at": _utc_iso(),
        "companion_version": app_version,
        "frozen_runtime": bool(getattr(sys, "frozen", False)),
        "os": {"system": platform.system(), "release": platform.release(), "version": platform.version()},
        "preflight": preflight_report(),
        "service": {
            "state": service_status.get("state"),
            "health": service_status.get("health"),
            "port_state": service_status.get("port_state"),
        },
        "model": {
            "installed": model.installed,
            "verified": model.verified,
            "reason": model.reason,
            "identity": model_identity(),
            "install_operation": {
                "state": install.get("state"),
                "downloaded_bytes": install.get("downloaded_bytes"),
                "total_bytes": install.get("total_bytes"),
                "current_file": install.get("current_file"),
                "error_code": install.get("error_code"),
            },
        },
        "storage": {
            "root_fingerprint": _path_fingerprint(config.STATE_DIR.parent),
            "pairing_material_present": pairing_exists,
            "job_directory_count": job_count,
        },
        "privacy": {
            "contains_pairing_token": False,
            "contains_media": False,
            "contains_transcript": False,
            "contains_original_filename": False,
            "contains_job_payload": False,
        },
    }


def export_diagnostics(target: Path, app_version: str, service_status: dict[str, Any], notices: Path | None = None) -> Path:
    target = target.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = diagnostic_payload(app_version, service_status)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("diagnostics.json", json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        archive.writestr(
            "README.txt",
            "Redacted LinguistPro Local ASR diagnostics. No audio, transcript text, original "
            "filename, pairing token, or raw job output is included.\n",
        )
        if notices is not None and notices.is_file():
            archive.write(notices, "THIRD_PARTY_NOTICES.md")
    return target
