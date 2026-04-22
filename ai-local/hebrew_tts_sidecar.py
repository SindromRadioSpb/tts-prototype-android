from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from experiments.hebrew_tts_phonikud_piper.poc_lib import (  # noqa: E402
    DEFAULT_LICENSE_MODE,
    MODEL_VERSION,
    MAX_TEXT_CHARS,
    PHONIKUD_VERSION,
    PIPER_MODEL_VERSION,
    QUALITY_TIER,
    PhonikudPiperPocEngine,
    build_cache_key,
    sanitize_text,
)

FEATURE_FLAG = "TTS_HEBREW_LOCAL_EXPERIMENTAL"
LICENSE_MODE_ENV = "TTS_HEBREW_LOCAL_LICENSE_MODE"
CACHE_DIR_ENV = "TTS_HEBREW_LOCAL_CACHE_DIR"
ALLOWED_LICENSE_MODES = {"research_only", "noncommercial"}
BLOCKED_LICENSE_MODES = {"commercial", "premium_commercial"}
SUPPORTED_VOICES = {"shaul"}
SUPPORTED_FORMATS = {"wav"}


class HebrewTtsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = "shaul"
    speed: float = 1.0
    pitch: float = 0.0
    format: str = "wav"


def _feature_enabled() -> bool:
    raw = str(os.getenv(FEATURE_FLAG, "true")).strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _license_mode() -> str:
    value = str(os.getenv(LICENSE_MODE_ENV, "noncommercial")).strip().lower()
    if not value:
        return "noncommercial"
    if value in ALLOWED_LICENSE_MODES or value in BLOCKED_LICENSE_MODES:
        return value
    return value


def _license_status() -> str:
    mode = _license_mode()
    if mode in BLOCKED_LICENSE_MODES:
        return "license_mode_blocked"
    if mode == "noncommercial":
        return "noncommercial_allowed"
    return "research_only"


def _validate_request(body: HebrewTtsRequest) -> tuple[str, str]:
    if body.voice not in SUPPORTED_VOICES:
        raise HTTPException(status_code=400, detail="unsupported_voice")
    if body.format.lower() not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail="unsupported_format")
    try:
        text = sanitize_text(body.text, MAX_TEXT_CHARS)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return text, body.format.lower()


class SidecarCache:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _wav_path(self, cache_key: str) -> Path:
        return self.base_dir / f"{cache_key}.wav"

    def _json_path(self, cache_key: str) -> Path:
        return self.base_dir / f"{cache_key}.json"

    def get(self, cache_key: str) -> dict[str, Any] | None:
        meta_path = self._json_path(cache_key)
        wav_path = self._wav_path(cache_key)
        if not meta_path.exists() or not wav_path.exists():
            return None
        try:
            payload = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            return None
        payload["wavPath"] = str(wav_path.resolve())
        return payload

    def put(self, cache_key: str, result: dict[str, Any], source_wav_path: str) -> dict[str, Any]:
        wav_path = self._wav_path(cache_key)
        meta_path = self._json_path(cache_key)
        source = Path(source_wav_path)
        if source.resolve() != wav_path.resolve():
            wav_path.write_bytes(source.read_bytes())
        payload = dict(result)
        payload["wavPath"] = str(wav_path.resolve())
        payload["cacheKey"] = cache_key
        meta_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        return payload


def create_app(engine_factory=PhonikudPiperPocEngine) -> FastAPI:
    app = FastAPI(title="hebrew-tts-sidecar", version="0.1.0")
    engine = engine_factory()
    cache_dir = Path(os.getenv(CACHE_DIR_ENV, str(REPO_ROOT / "audio-cache" / "hebrew-local")))
    cache = SidecarCache(cache_dir)

    @app.get("/healthz")
    async def healthz():
        return {
            "status": "ok",
            "provider": "hebrew_phonikud_piper",
            "licenseStatus": _license_status(),
            "qualityTier": QUALITY_TIER,
            "experimentalEnabled": _feature_enabled(),
            "licenseMode": _license_mode(),
        }

    @app.get("/tts/hebrew/phonikud-piper/health")
    async def provider_health():
        if hasattr(engine, "get_health_snapshot"):
            snapshot = engine.get_health_snapshot()
        else:
            snapshot = {
                "voices": ["shaul"],
                "modelLoaded": False,
                "phonikudReady": False,
                "piperReady": False,
                "modelVersion": MODEL_VERSION,
                "phonikudVersion": PHONIKUD_VERSION,
                "piperModelVersion": PIPER_MODEL_VERSION,
            }
        license_mode = _license_mode()
        status = "ready"
        if not _feature_enabled():
            status = "disabled"
        elif license_mode in BLOCKED_LICENSE_MODES:
            status = "blocked"
        elif not snapshot["modelLoaded"]:
            status = "degraded"
        return {
            "status": status,
            "provider": "hebrew_phonikud_piper",
            "licenseMode": license_mode,
            "licenseStatus": _license_status(),
            "voices": snapshot["voices"],
            "modelLoaded": snapshot["modelLoaded"],
            "phonikudReady": snapshot["phonikudReady"],
            "piperReady": snapshot["piperReady"],
            "qualityTier": QUALITY_TIER,
            "modelVersion": snapshot["modelVersion"],
            "phonikudVersion": snapshot["phonikudVersion"],
            "piperModelVersion": snapshot["piperModelVersion"],
        }

    @app.post("/tts/hebrew/phonikud-piper")
    async def synthesize(body: HebrewTtsRequest):
        if not _feature_enabled():
            return JSONResponse(
                {
                    "error": "sidecar_disabled",
                    "licenseStatus": _license_status(),
                    "licenseMode": _license_mode(),
                    "qualityTier": QUALITY_TIER,
                },
                status_code=503,
            )

        license_mode = _license_mode()
        if license_mode in BLOCKED_LICENSE_MODES:
            return JSONResponse(
                {
                    "error": "license_mode_blocked",
                    "licenseStatus": _license_status(),
                    "licenseMode": license_mode,
                    "qualityTier": QUALITY_TIER,
                },
                status_code=403,
            )

        text, requested_format = _validate_request(body)
        cache_key = build_cache_key(
            provider="hebrew_phonikud_piper",
            voice=body.voice,
            normalized_text=text,
            speed=body.speed,
            pitch=body.pitch,
            model_version=MODEL_VERSION,
            phonikud_version=PHONIKUD_VERSION,
            piper_model_version=PIPER_MODEL_VERSION,
        )
        cached = cache.get(cache_key)
        if cached:
            diagnostics = {
                "provider": "hebrew_phonikud_piper",
                "runtime": "python_sidecar",
                "voice": body.voice,
                "g2pMs": cached["g2pMs"],
                "ttsMs": cached["ttsMs"],
                "totalMs": cached["totalMs"],
                "textChars": len(text),
                "licenseStatus": _license_status(),
                "licenseMode": license_mode,
                "qualityTier": QUALITY_TIER,
                "speedSupported": False,
                "pitchSupported": False,
                "speedApplied": float(body.speed),
                "pitchApplied": 0.0,
                "modelVersion": MODEL_VERSION,
                "phonikudVersion": PHONIKUD_VERSION,
                "piperModelVersion": PIPER_MODEL_VERSION,
                "format": requested_format,
                "cacheHit": True,
            }
            return FileResponse(
                path=cached["wavPath"],
                media_type="audio/wav",
                filename=Path(cached["wavPath"]).name,
                headers={
                    "X-TTS-Provider": "hebrew_phonikud_piper",
                    "X-TTS-Runtime": "python_sidecar",
                    "X-License-Status": _license_status(),
                    "X-Quality-Tier": QUALITY_TIER,
                    "X-TTS-Diagnostics": json.dumps(diagnostics, ensure_ascii=True),
                },
            )

        tmp_dir = REPO_ROOT / "experiments" / "hebrew_tts_phonikud_piper" / "out" / "sidecar"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(dir=tmp_dir, suffix=".wav", delete=False)
        handle.close()

        try:
            result = engine.synthesize_to_file(text, Path(handle.name)).to_dict()
            cached_result = cache.put(cache_key, result, result["wavPath"])
        except HTTPException:
            raise
        except Exception as error:  # pragma: no cover - exercised in tests with fake engine
            return JSONResponse(
                {
                    "error": "hebrew_tts_failed",
                    "message": str(error),
                    "licenseStatus": _license_status(),
                    "licenseMode": license_mode,
                    "qualityTier": QUALITY_TIER,
                },
                status_code=500,
            )

        diagnostics = {
            "provider": "hebrew_phonikud_piper",
            "runtime": "python_sidecar",
            "voice": body.voice,
            "g2pMs": result["g2pMs"],
            "ttsMs": result["ttsMs"],
            "totalMs": result["totalMs"],
            "textChars": len(text),
            "licenseStatus": _license_status(),
            "licenseMode": license_mode,
            "qualityTier": QUALITY_TIER,
            "speedSupported": False,
            "pitchSupported": False,
            "speedApplied": float(body.speed),
            "pitchApplied": 0.0,
            "modelVersion": MODEL_VERSION,
            "phonikudVersion": PHONIKUD_VERSION,
            "piperModelVersion": PIPER_MODEL_VERSION,
            "format": requested_format,
            "cacheHit": False,
        }

        return FileResponse(
            path=cached_result["wavPath"],
            media_type="audio/wav",
            filename=Path(cached_result["wavPath"]).name,
            headers={
                "X-TTS-Provider": "hebrew_phonikud_piper",
                "X-TTS-Runtime": "python_sidecar",
                "X-License-Status": _license_status(),
                "X-Quality-Tier": QUALITY_TIER,
                "X-TTS-Diagnostics": json.dumps(diagnostics, ensure_ascii=True),
            },
        )

    return app


app = create_app()
