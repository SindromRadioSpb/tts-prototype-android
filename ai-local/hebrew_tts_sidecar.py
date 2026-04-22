from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from experiments.hebrew_tts_phonikud_piper.poc_lib import (  # noqa: E402
    LICENSE_STATUS,
    MAX_TEXT_CHARS,
    QUALITY_TIER,
    PhonikudPiperPocEngine,
    sanitize_text,
)

FEATURE_FLAG = "TTS_HEBREW_LOCAL_EXPERIMENTAL"


class HebrewTtsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = "shaul"
    format: str = "wav"


def _feature_enabled() -> bool:
    raw = str(os.getenv(FEATURE_FLAG, "false")).strip().lower()
    return raw not in {"0", "false", "off", "no"}


def create_app(engine_factory=PhonikudPiperPocEngine) -> FastAPI:
    app = FastAPI(title="hebrew-tts-sidecar", version="0.1.0")
    engine = engine_factory()

    @app.get("/healthz")
    async def healthz():
        return {
            "status": "ok",
            "provider": "hebrew_phonikud_piper",
            "licenseStatus": LICENSE_STATUS,
            "qualityTier": QUALITY_TIER,
            "experimentalEnabled": _feature_enabled(),
        }

    @app.post("/tts/hebrew/phonikud-piper")
    async def synthesize(body: HebrewTtsRequest):
        if not _feature_enabled():
            return JSONResponse(
                {
                    "error": "hebrew_tts_experimental_disabled",
                    "licenseStatus": LICENSE_STATUS,
                    "qualityTier": QUALITY_TIER,
                },
                status_code=503,
            )

        try:
            text = sanitize_text(body.text, MAX_TEXT_CHARS)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

        if body.format.lower() != "wav":
            raise HTTPException(status_code=400, detail="unsupported_format")

        tmp_dir = REPO_ROOT / "experiments" / "hebrew_tts_phonikud_piper" / "out" / "sidecar"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(dir=tmp_dir, suffix=".wav", delete=False)
        handle.close()

        try:
            result = engine.synthesize_to_file(text, Path(handle.name)).to_dict()
        except Exception as error:  # pragma: no cover - exercised in tests with fake engine
            return JSONResponse(
                {
                    "error": "hebrew_tts_failed",
                    "message": str(error),
                    "licenseStatus": LICENSE_STATUS,
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
            "licenseStatus": LICENSE_STATUS,
            "qualityTier": QUALITY_TIER,
        }

        return FileResponse(
            path=result["wavPath"],
            media_type="audio/wav",
            filename=Path(result["wavPath"]).name,
            headers={
                "X-TTS-Provider": "hebrew_phonikud_piper",
                "X-TTS-Runtime": "python_sidecar",
                "X-License-Status": LICENSE_STATUS,
                "X-Quality-Tier": QUALITY_TIER,
                "X-TTS-Diagnostics": json.dumps(diagnostics, ensure_ascii=True),
            },
        )

    return app


app = create_app()
