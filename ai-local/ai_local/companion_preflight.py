"""Windows beta hardware, disk, runtime and loopback preflight.

This module returns structured, transcript-free facts suitable for both the
desktop Companion and the paired browser.  It never probes user media.
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from . import config
from .asr_constants import (
    ASR_FFMPEG_VERSION,
    ASR_MODEL_BIN_REPOSITORY_BYTES,
    ASR_PROTOCOL_VERSION,
    ASR_REQUIRED_FREE_VRAM_MIB,
)
from .model_store import MODEL_ACTIVATION_RESERVE_BYTES, inspect_model

MIN_WINDOWS_BUILD = 22_000
MIN_TOTAL_VRAM_MIB = 8_000
CUDA_RUNTIME_DLLS = (
    "cublas64_12.dll",
    "cublasLt64_12.dll",
    "cudnn64_9.dll",
    "cudnn_ops64_9.dll",
    "cudnn_graph64_9.dll",
    "cudnn_engines_runtime_compiled64_9.dll",
    "cudnn_engines_precompiled64_9.dll",
)


def _result(code: str, ok: bool, observed: Any, required: Any = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"code": code, "ok": bool(ok), "observed": observed}
    if required is not None:
        payload["required"] = required
    return payload


def _run(args: list[str], timeout: int = 8) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout)


def _windows_check() -> dict[str, Any]:
    is_windows = os.name == "nt"
    build = 0
    if is_windows:
        try:
            build = int(sys.getwindowsversion().build)
        except (AttributeError, ValueError):
            build = 0
    return _result(
        "WINDOWS_11",
        is_windows and build >= MIN_WINDOWS_BUILD,
        {"platform": platform.system(), "release": platform.release(), "build": build},
        {"platform": "Windows", "minimum_build": MIN_WINDOWS_BUILD},
    )


def _gpu_check() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    try:
        completed = _run([
            "nvidia-smi",
            "--query-gpu=name,memory.total,memory.free,driver_version",
            "--format=csv,noheader,nounits",
        ])
        rows = [row.strip() for row in completed.stdout.splitlines() if row.strip()]
        if len(rows) != 1:
            raise RuntimeError("expected exactly one NVIDIA GPU")
        name, total, free, driver = [part.strip() for part in rows[0].split(",", 3)]
        total_mib, free_mib = int(float(total)), int(float(free))
        gpu = _result(
            "NVIDIA_GPU",
            total_mib >= MIN_TOTAL_VRAM_MIB,
            {"name": name, "total_vram_mib": total_mib, "driver": driver},
            {"minimum_total_vram_mib": MIN_TOTAL_VRAM_MIB},
        )
        vram = _result(
            "FREE_VRAM",
            free_mib >= ASR_REQUIRED_FREE_VRAM_MIB,
            {"free_vram_mib": free_mib},
            {"minimum_free_vram_mib": ASR_REQUIRED_FREE_VRAM_MIB},
        )
        cuda_text = _run(["nvidia-smi"]).stdout
        marker = "CUDA Version:"
        cuda = cuda_text.split(marker, 1)[1].split()[0] if marker in cuda_text else None
        driver_check = _result("CUDA_DRIVER", bool(cuda), {"reported_cuda": cuda, "driver": driver})
        return gpu, vram, driver_check
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError) as exc:
        detail = type(exc).__name__
        return (
            _result("NVIDIA_GPU", False, {"error": detail}, {"minimum_total_vram_mib": MIN_TOTAL_VRAM_MIB}),
            _result("FREE_VRAM", False, {"error": detail}, {"minimum_free_vram_mib": ASR_REQUIRED_FREE_VRAM_MIB}),
            _result("CUDA_DRIVER", False, {"error": detail}),
        )


def runtime_binary(name: str) -> Path | None:
    candidates: list[Path] = []
    frozen_root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    candidates.extend([frozen_root / "bin" / f"{name}.exe", Path(sys.executable).parent / "bin" / f"{name}.exe"])
    found = shutil.which(name)
    if found:
        candidates.append(Path(found))
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


def _cuda_runtime_check() -> dict[str, Any]:
    frozen_root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    roots = (
        frozen_root / "cuda",
        Path(sys.executable).parent / "_internal" / "cuda",
        Path(sys.executable).parent / "cuda",
    )
    found: list[str] = []
    missing: list[str] = []
    for name in CUDA_RUNTIME_DLLS:
        candidate = next((root / name for root in roots if (root / name).is_file()), None)
        located = candidate or (Path(value) if (value := shutil.which(name)) else None)
        if located is None:
            missing.append(name)
        else:
            found.append(name)
    return _result(
        "CUDA_RUNTIME",
        not missing,
        {"available_dlls": sorted(found), "missing_dlls": missing},
        {"cublas_major": 12, "cudnn_major": 9},
    )


def _ffmpeg_check(name: str) -> dict[str, Any]:
    binary = runtime_binary(name)
    if binary is None:
        return _result(name.upper(), False, {"available": False}, {"version": ASR_FFMPEG_VERSION})
    try:
        first = _run([str(binary), "-version"]).stdout.splitlines()[0]
    except (OSError, subprocess.SubprocessError, IndexError):
        first = ""
    return _result(
        name.upper(),
        f"version {ASR_FFMPEG_VERSION}" in first,
        {"available": True, "version_line": first[:160]},
        {"version": ASR_FFMPEG_VERSION},
    )


def _disk_check() -> dict[str, Any]:
    target = config.MODELS_DIR.resolve()
    target.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(target).free
    required = (2 * ASR_MODEL_BIN_REPOSITORY_BYTES) + MODEL_ACTIVATION_RESERVE_BYTES
    installed = inspect_model(verify_hash=False).installed
    needed_now = 512 * 1024 * 1024 if installed else required
    return _result(
        "DISK_SPACE",
        free >= needed_now,
        {"free_bytes": free, "model_installed": installed},
        {"minimum_free_bytes": needed_now, "fresh_install_reserve_bytes": required},
    )


def _capability_probe() -> dict[str, Any] | None:
    try:
        from .security import pairing_token
        request = urllib.request.Request(
            "http://127.0.0.1:8799/v1/capabilities",
            headers={"Authorization": "Bearer " + pairing_token(), "Origin": "http://127.0.0.1:3000"},
        )
        with urllib.request.urlopen(request, timeout=1.0) as response:
            payload = json.loads(response.read(64 * 1024).decode("utf-8"))
        if payload.get("protocol") == ASR_PROTOCOL_VERSION:
            return payload
    except (OSError, ValueError, urllib.error.URLError):
        return None
    return None


def _port_check() -> dict[str, Any]:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        occupied = probe.connect_ex(("127.0.0.1", 8799)) == 0
    if not occupied:
        return _result("PORT_8799", True, {"state": "free"}, {"bind": "127.0.0.1:8799"})
    capability = _capability_probe()
    return _result(
        "PORT_8799",
        capability is not None,
        {"state": "companion" if capability else "foreign_listener"},
        {"bind": "127.0.0.1:8799"},
    )


def preflight_report() -> dict[str, Any]:
    checks: list[dict[str, Any]] = [_windows_check()]
    checks.extend(_gpu_check())
    checks.extend([
        _cuda_runtime_check(),
        _ffmpeg_check("ffmpeg"),
        _ffmpeg_check("ffprobe"),
        _disk_check(),
        _port_check(),
    ])
    return {
        "schema": "linguistpro-local-asr-preflight-v1",
        "supported": all(item["ok"] for item in checks),
        "checks": checks,
    }
