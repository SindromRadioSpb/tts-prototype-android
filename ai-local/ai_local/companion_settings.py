"""Durable Companion options, kept in the per-user state directory.

Why a file and not an environment variable.  GPU encoding was first enabled with
``setx AI_LOCAL_MEDIA_HW_ENCODER auto``.  That writes the registry, but a process that is
already running keeps the environment it was born with, and its children inherit from it
rather than from the registry.  The Companion starts from the installer or from its
startup shortcut, so whether the option was on depended on which process had spawned it
and on whether the machine had been rebooted since - and when it silently fell back the
report honestly said ``libx264`` while nobody had a reason to look.

An installed application with an autostart entry therefore cannot be configured through
its parent's environment.  The switch lives here instead: written by the window, read by
the service on every job, independent of process ancestry and reboot order.

The environment variable is still honoured when this file says nothing about a key, so
development shells and the test-suite keep their existing override, but an explicit
choice stored here always wins over it - otherwise a stale ``setx`` from months ago could
silently outrank what the window shows today.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from . import config

SCHEMA = "linguistpro-companion-settings-v1"

# key -> (allowed values, environment fallback, built-in default)
_KEYS: dict[str, tuple[tuple[str, ...], str, str]] = {
    # "off" keeps libx264, so the produced copy stays comparable on any machine with
    # ffmpeg; "auto" uses h264_nvenc where it actually runs and falls back otherwise.
    "media_hw_encoder": (("off", "auto"), "AI_LOCAL_MEDIA_HW_ENCODER", "off"),
    # Companion window language. The bundled guides exist in ru/en/he; the window itself
    # offers the two languages the invite beta is used in.
    "ui_language": (("en", "ru"), "AI_LOCAL_UI_LANGUAGE", "en"),
}


def settings_path() -> Path:
    return config.STATE_DIR / "settings.json"


def _stored() -> dict[str, Any]:
    """Only values this build understands; a damaged file is not a reason to fail a job."""
    try:
        raw = json.loads(settings_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    clean: dict[str, Any] = {}
    for key, (allowed, _env, _default) in _KEYS.items():
        value = raw.get(key)
        if isinstance(value, str) and value.strip().lower() in allowed:
            clean[key] = value.strip().lower()
    work_dir = raw.get(WORK_DIR_KEY)
    if isinstance(work_dir, str) and Path(work_dir).is_absolute():
        clean[WORK_DIR_KEY] = work_dir
    return clean


def resolve(key: str) -> dict[str, Any]:
    """The effective value and where it came from, so a report can name its own source."""
    allowed, env_name, default = _KEYS[key]
    stored = _stored().get(key)
    if stored is not None:
        return {"key": key, "value": stored, "source": "settings"}
    raw = (os.environ.get(env_name) or "").strip().lower()
    if raw in allowed:
        return {"key": key, "value": raw, "source": "environment"}
    return {"key": key, "value": default, "source": "default"}


def read_settings() -> dict[str, Any]:
    """Every known key with its effective value, its source and what may be chosen."""
    return {
        "schema": SCHEMA,
        "path": str(settings_path()),
        "values": {key: resolve(key)["value"] for key in _KEYS},
        "sources": {key: resolve(key)["source"] for key in _KEYS},
        "allowed": {key: list(allowed) for key, (allowed, _env, _default) in _KEYS.items()},
        "work_dir": work_dir_info(),
    }


def update_setting(key: str, value: str) -> dict[str, Any]:
    """Persist one explicit choice; anything unknown is refused rather than stored."""
    if key not in _KEYS:
        raise ValueError("UNKNOWN_SETTING:" + str(key))
    allowed = _KEYS[key][0]
    clean = str(value or "").strip().lower()
    if clean not in allowed:
        raise ValueError("UNSUPPORTED_SETTING_VALUE:%s=%s" % (key, value))
    current = _stored()
    current[key] = clean
    _write(current)
    return read_settings()


def _write(values: dict[str, Any]) -> None:
    path = settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schema": SCHEMA, **values}
    temp = path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temp.replace(path)


# Where temporary media copies live (owner decision 2026-09-28). A film can need its size three
# times over (source, prepared copy, light copy), so the owner may put them on a roomier disk.
# The choice is read when the service starts; moving it never migrates running jobs.
WORK_DIR_KEY = "work_dir"


def _probe_writable(folder: Path) -> None:
    probe = folder / ".linguistpro-write-probe"
    probe.write_bytes(b"ok")
    probe.unlink()


def stored_work_dir() -> Path | None:
    value = _stored().get(WORK_DIR_KEY)
    return Path(value) if value else None


def media_jobs_root() -> Path:
    chosen = stored_work_dir()
    return chosen / "media-jobs" if chosen else config.MEDIA_JOB_ROOT


def asr_jobs_root() -> Path:
    chosen = stored_work_dir()
    return chosen / "asr-jobs" if chosen else config.ASR_JOB_ROOT


def previous_media_roots() -> list[Path]:
    """The default folder is still swept after a move, so nothing is stranded there."""
    return [config.MEDIA_JOB_ROOT] if stored_work_dir() else []


def work_dir_info() -> dict[str, Any]:
    import shutil

    chosen = stored_work_dir()
    root = chosen or config.STATE_DIR
    free = None
    try:
        free = shutil.disk_usage(root if root.exists() else Path(root.anchor or ".")).free
    except OSError:
        pass
    return {"path": str(root), "chosen": chosen is not None, "free_bytes": free}


def set_work_dir(value: str) -> dict[str, Any]:
    """Validate, create and remember the folder; refuse anything that could not hold a copy."""
    raw = str(value or "").strip().strip('"')
    if not raw or not Path(raw).is_absolute():
        raise ValueError("WORK_DIR_NOT_ABSOLUTE")
    folder = Path(raw).resolve()
    try:
        folder.mkdir(parents=True, exist_ok=True)
        _probe_writable(folder)
    except OSError as exc:
        raise ValueError("WORK_DIR_NOT_WRITABLE:%s" % exc.__class__.__name__) from exc
    current = _stored()
    current[WORK_DIR_KEY] = str(folder)
    _write(current)
    return read_settings()


def media_hw_encoder() -> str:
    """The compatible-copy encoder mode in force right now, read fresh on every job."""
    return resolve("media_hw_encoder")["value"]


def ui_language() -> str:
    return resolve("ui_language")["value"]
