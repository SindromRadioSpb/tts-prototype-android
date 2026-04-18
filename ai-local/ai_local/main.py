from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import config
from .lifecycle import ensure_loaded, eager_load, shutdown_slot, try_unload, use_model
from .logging_setup import configure_logging
from .monitor import start_monitor, stop_monitor
from .state import ModelSlot, registry

log = logging.getLogger(__name__)


def _build_nakdan_slot() -> ModelSlot:
    from .models.nakdan import NakdanImpl

    idle = None if not config.NAKDAN_IDLE_UNLOAD else config.MADLAD_IDLE_TIMEOUT_SEC
    return ModelSlot(
        name="nakdan",
        factory=lambda: NakdanImpl(),
        device=config.NAKDAN_DEVICE,
        idle_timeout_sec=idle,
    )


def _build_translator_slot() -> ModelSlot:
    from .models.translator import TranslatorImpl

    return ModelSlot(
        name="translator",
        factory=lambda: TranslatorImpl(),
        device=config.MADLAD_DEVICE,
        idle_timeout_sec=config.MADLAD_IDLE_TIMEOUT_SEC,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("ai-local starting on %s:%d", config.HOST, config.PORT)

    registry.register(_build_nakdan_slot())
    registry.register(_build_translator_slot())

    if config.NAKDAN_EAGER:
        try:
            await eager_load(registry.slot("nakdan"))
        except Exception:
            log.exception("nakdan eager load failed; service will continue in degraded mode")

    await start_monitor()

    try:
        yield
    finally:
        registry.stop_accepting()
        await stop_monitor()
        await asyncio.gather(
            *(
                shutdown_slot(slot, config.SHUTDOWN_DRAIN_TIMEOUT_SEC)
                for slot in registry.slots.values()
            ),
            return_exceptions=True,
        )
        log.info("ai-local stopped")


app = FastAPI(title="ai-local", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def _gate_when_not_accepting(request: Request, call_next):
    if not registry.accepting and request.url.path not in ("/healthz", "/models/status"):
        return JSONResponse({"error": "service shutting down"}, status_code=503)
    return await call_next(request)


# ---------- schemas ----------


class NakdanRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)
    mark_matres_lectionis: Optional[str] = None


class NakdanResponse(BaseModel):
    results: list[str]
    model_version: str


class TranslateSegmentIn(BaseModel):
    index: int
    he: str


class TranslateRequest(BaseModel):
    segments: list[TranslateSegmentIn] = Field(..., min_length=1)
    target: str = "ru"


class TranslateSegmentOut(BaseModel):
    index: int
    ru: str


class TranslateResponse(BaseModel):
    results: list[TranslateSegmentOut]
    model_version: str


class UnloadRequest(BaseModel):
    name: str


class WarmupRequest(BaseModel):
    name: str


# ---------- endpoints ----------


@app.get("/healthz")
async def healthz():
    return {
        "status": "ok" if registry.accepting else "stopping",
        "models": {name: slot.reported_state() for name, slot in registry.slots.items()},
    }


@app.get("/models/status")
async def models_status():
    return {name: slot.to_status_dict() for name, slot in registry.slots.items()}


@app.post("/models/warmup")
async def models_warmup(body: WarmupRequest):
    if body.name not in registry.slots:
        raise HTTPException(status_code=404, detail=f"unknown model: {body.name}")
    slot = registry.slot(body.name)
    await ensure_loaded(slot)
    return {"ok": True, "state": slot.reported_state()}


@app.post("/models/unload")
async def models_unload(body: UnloadRequest):
    if body.name not in registry.slots:
        raise HTTPException(status_code=404, detail=f"unknown model: {body.name}")
    slot = registry.slot(body.name)
    did = await try_unload(slot, reason="manual")
    return {"unloaded": did, "state": slot.reported_state()}


@app.post("/models/unload-all")
async def models_unload_all():
    results: dict[str, bool] = {}
    for name, slot in registry.slots.items():
        results[name] = await try_unload(slot, reason="manual_all")
    return {"unloaded": results}


@app.post("/nakdan", response_model=NakdanResponse)
async def nakdan(body: NakdanRequest):
    slot = registry.slot("nakdan")
    async with use_model(slot):
        assert slot.impl is not None
        results = await asyncio.to_thread(
            slot.impl.predict, body.texts, body.mark_matres_lectionis
        )
    return NakdanResponse(results=results, model_version=slot.impl.version if slot.impl else "")


@app.post("/translate", response_model=TranslateResponse)
async def translate(body: TranslateRequest):
    slot = registry.slot("translator")
    async with use_model(slot):
        assert slot.impl is not None
        texts = [seg.he for seg in body.segments]
        translations = await asyncio.to_thread(
            slot.impl.translate_batch, texts, body.target
        )
    results = [
        TranslateSegmentOut(index=seg.index, ru=ru)
        for seg, ru in zip(body.segments, translations)
    ]
    version = slot.impl.version if slot.impl else ""
    return TranslateResponse(results=results, model_version=version)


def run() -> None:
    import uvicorn

    configure_logging()
    uvicorn.run(
        "ai_local.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    run()
