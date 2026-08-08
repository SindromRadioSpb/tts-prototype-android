from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import config
from .lifecycle import ensure_loaded, eager_load, shutdown_slot, try_unload, use_model
from .logging_setup import configure_logging
from .monitor import start_monitor, stop_monitor
from .asr_constants import ASR_MODEL_IDLE_TIMEOUT_SEC, ASR_PROTOCOL_VERSION, model_identity
from .asr_jobs import JobCapacityError, JobNotFound, asr_job_manager
from .asr_worker import asr_worker
from .gpu_scheduler import heavy_gpu_scheduler
from .model_store import inspect_model
from .mt_constants import MT_PROTOCOL_VERSION, model_identity as mt_model_identity
from .mt_jobs import MtJobConflict, MtJobNotFound, mt_job_manager
from .mt_model_install import mt_model_install_manager
from .mt_model_store import inspect_mt_model
from .companion_model import delete_all_jobs, model_install_manager
from .companion_preflight import preflight_report
from .media_jobs import MediaJobConflict, MediaJobManager, MediaJobNotFound
from .security import (
    loopback_security_middleware,
    require_browser_auth,
    require_companion_auth,
    require_mt_browser_auth,
)
from .state import ModelSlot, registry
from .telemetry import sample_nvidia

log = logging.getLogger(__name__)
media_job_manager = MediaJobManager(config.STATE_DIR / "media-jobs")


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

    async def prepare_translator() -> None:
        status = await asyncio.to_thread(inspect_mt_model, None, verify_hash=False)
        if not status.verified:
            raise RuntimeError(status.reason or "MT model is not verified")
        sample = await asyncio.to_thread(sample_nvidia)
        if not sample.admission_ok():
            raise RuntimeError("insufficient free VRAM for the pinned MT model")

    async def unload_translator() -> None:
        did = await try_unload(registry.slot("translator"), reason="heavy_gpu_switch")
        if not did and registry.slot("translator").state.value != "unloaded":
            raise RuntimeError("translator did not release the heavy GPU slot")

    async def prepare_asr() -> None:
        status = await asyncio.to_thread(inspect_model, None, verify_hash=False)
        if not status.verified:
            raise RuntimeError(status.reason or "ASR model is not verified")
        sample = await asyncio.to_thread(sample_nvidia)
        if not sample.admission_ok():
            raise RuntimeError("insufficient free VRAM for the pinned ASR model")
        result = await asyncio.to_thread(asr_worker.load, status.path)
        if not result.get("ok"):
            raise RuntimeError(result.get("error") or "ASR worker load failed")

    async def unload_asr() -> None:
        await asyncio.to_thread(asr_worker.hard_cancel)

    heavy_gpu_scheduler.register(
        "translator", prepare=prepare_translator, unload=unload_translator
    )
    heavy_gpu_scheduler.register(
        "asr", prepare=prepare_asr, unload=unload_asr,
        idle_timeout_sec=ASR_MODEL_IDLE_TIMEOUT_SEC,
    )

    if config.NAKDAN_EAGER:
        try:
            await eager_load(registry.slot("nakdan"))
        except Exception:
            log.exception("nakdan eager load failed; service will continue in degraded mode")

    await start_monitor()
    if config.ASR_ENABLED:
        await asr_job_manager.start()

    try:
        yield
    finally:
        registry.stop_accepting()
        if config.ASR_ENABLED:
            await asr_job_manager.shutdown()
        if config.MT_ENABLED:
            await mt_job_manager.shutdown()
        await stop_monitor()
        try:
            await heavy_gpu_scheduler.unload_resident()
        except Exception:
            log.exception("heavy GPU residency cleanup failed during shutdown")
        await asyncio.gather(
            *(
                shutdown_slot(slot, config.SHUTDOWN_DRAIN_TIMEOUT_SEC)
                for slot in registry.slots.values()
            ),
            return_exceptions=True,
        )
        await asyncio.to_thread(asr_worker.shutdown)
        log.info("ai-local stopped")


app = FastAPI(title="ai-local", version="0.1.0", lifespan=lifespan)


app.middleware("http")(loopback_security_middleware)


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


class AudioStreamRequest(BaseModel):
    stream_index: int = Field(..., ge=0)


class RetryChunksRequest(BaseModel):
    chunk_indexes: list[int] = Field(..., min_length=1, max_length=12)
    reason: str = Field(..., pattern=r"^s12_[67]$")


class InstallAsrModelRequest(BaseModel):
    revision: str
    accepted_license: bool


class InstallMtModelRequest(BaseModel):
    revision: str
    accepted_license: bool


class MtSegmentIn(BaseModel):
    index: int = Field(..., ge=0)
    text: str = Field(..., max_length=8_000)


class MtJobRequest(BaseModel):
    request_id: str = Field(..., min_length=64, max_length=64)
    input_checksum: str = Field(..., min_length=64, max_length=64)
    source_lang: str
    target_lang: str
    segments: list[MtSegmentIn] = Field(..., min_length=1, max_length=120)


class MediaPrepareRequest(BaseModel):
    mode: str = Field(..., pattern=r"^(lossless_repair|transcode)$")
    plan_sha256: str = Field(..., pattern=r"^[a-f0-9]{64}$")


# ---------- endpoints ----------


@app.get("/v1/capabilities", dependencies=[Depends(require_companion_auth)])
async def v1_capabilities():
    return {
        "protocol": ASR_PROTOCOL_VERSION,
        "local_asr": {
            "enabled": config.ASR_ENABLED,
            "default": False,
            "auth_required": True,
            "model": model_identity(),
        },
        "local_mt": {
            "enabled": config.MT_ENABLED,
            "default": False,
            "auth_required": True,
            "model": mt_model_identity(),
            "protocol": MT_PROTOCOL_VERSION,
        },
        "media_readiness": {
            "enabled": True,
            "default": False,
            "auth_required": True,
            "target_contract": "linguistpro-mobile-v1",
            "max_bytes": media_job_manager.MAX_BYTES,
            "automatic_prepare": False,
        },
    }


@app.post("/v1/media/jobs", status_code=202, dependencies=[Depends(require_companion_auth)])
async def v1_media_create_job(request: Request, filename: str = "media"):
    raw_length = request.headers.get("content-length")
    try:
        content_length = int(raw_length) if raw_length is not None else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid Content-Length") from exc
    if content_length is not None and content_length > media_job_manager.MAX_BYTES:
        raise HTTPException(status_code=413, detail="media exceeds 300 MiB")
    try:
        return await media_job_manager.create(
            request.stream(), filename=filename,
            content_type=request.headers.get("content-type") or "application/octet-stream",
        )
    except MediaJobConflict as exc:
        status = 413 if "300 MiB" in str(exc) else 429
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@app.get("/v1/media/jobs/{job_id}", dependencies=[Depends(require_companion_auth)])
async def v1_media_job_status(job_id: str):
    try:
        return media_job_manager.get(job_id)
    except MediaJobNotFound as exc:
        raise HTTPException(status_code=404, detail="media job not found") from exc


@app.post("/v1/media/jobs/{job_id}/prepare", status_code=202, dependencies=[Depends(require_companion_auth)])
async def v1_media_job_prepare(job_id: str, body: MediaPrepareRequest):
    try:
        return await media_job_manager.prepare(job_id, mode=body.mode, plan_sha256=body.plan_sha256)
    except MediaJobNotFound as exc:
        raise HTTPException(status_code=404, detail="media job not found") from exc
    except MediaJobConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/v1/media/jobs/{job_id}/cancel", dependencies=[Depends(require_companion_auth)])
async def v1_media_job_cancel(job_id: str):
    try:
        return await media_job_manager.cancel(job_id)
    except MediaJobNotFound as exc:
        raise HTTPException(status_code=404, detail="media job not found") from exc


@app.get("/v1/media/jobs/{job_id}/file", dependencies=[Depends(require_companion_auth)])
async def v1_media_job_file(job_id: str):
    try:
        path = media_job_manager.file_path(job_id)
        manifest = media_job_manager.get(job_id)
        return FileResponse(path, media_type="video/mp4", filename=manifest.get("output_name") or "mobile-ready.mp4")
    except MediaJobNotFound as exc:
        raise HTTPException(status_code=404, detail="media job not found") from exc
    except MediaJobConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/v1/media/jobs/{job_id}/report", dependencies=[Depends(require_companion_auth)])
async def v1_media_job_report(job_id: str):
    try:
        manifest = media_job_manager.get(job_id)
        return {
            "job_id": job_id,
            "state": manifest.get("state"),
            "source_sha256": manifest.get("source_sha256"),
            "output_sha256": manifest.get("output_sha256"),
            "report": manifest.get("report"),
            "verification": manifest.get("verification"),
        }
    except MediaJobNotFound as exc:
        raise HTTPException(status_code=404, detail="media job not found") from exc


@app.delete("/v1/media/jobs/{job_id}", dependencies=[Depends(require_companion_auth)])
async def v1_media_job_delete(job_id: str):
    try:
        return await media_job_manager.delete(job_id)
    except MediaJobNotFound as exc:
        raise HTTPException(status_code=404, detail="media job not found") from exc
    except MediaJobConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/v1/mt/model/status", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_model_status(verify_hash: bool = False):
    status = await asyncio.to_thread(inspect_mt_model, None, verify_hash=verify_hash)
    scheduler = heavy_gpu_scheduler.status()
    return {
        **status.public_dict(),
        "runtime_state": registry.slot("translator").reported_state(),
        "gpu": {
            "resident": scheduler.resident,
            "active": scheduler.active,
            "waiting": scheduler.waiting,
        },
    }


@app.get("/v1/mt/model/install-status", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_model_install_status():
    return mt_model_install_manager.status()


@app.post("/v1/mt/model/install", status_code=202, dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_model_install(body: InstallMtModelRequest):
    try:
        return mt_model_install_manager.start(
            accepted_license=body.accepted_license,
            revision=body.revision,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/v1/mt/model/install-cancel", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_model_install_cancel():
    return mt_model_install_manager.cancel()


@app.delete("/v1/mt/model", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_model_delete():
    scheduler = heavy_gpu_scheduler.status()
    if mt_job_manager.has_active_jobs() or scheduler.active == "translator":
        raise HTTPException(status_code=409, detail="MODEL_DELETE_BLOCKED_BY_ACTIVE_JOB")
    if scheduler.resident == "translator":
        await heavy_gpu_scheduler.unload_resident()
    heavy_gpu_scheduler.invalidate("translator")
    try:
        return await asyncio.to_thread(mt_model_install_manager.delete_model)
    except (ValueError, RuntimeError, OSError) as exc:
        detail = str(exc).split(":", 1)[0]
        if not detail or not detail.replace("_", "").isalnum() or detail.upper() != detail:
            detail = "MODEL_DELETE_FAILED"
        raise HTTPException(status_code=409, detail=detail) from exc


@app.post("/v1/mt/model/warmup", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_model_warmup():
    status = await asyncio.to_thread(inspect_mt_model, None, verify_hash=True)
    if not status.verified:
        raise HTTPException(status_code=409, detail=status.reason or "model is not verified")
    try:
        async with heavy_gpu_scheduler.lease("translator"):
            slot = registry.slot("translator")
            async with use_model(slot):
                assert slot.impl is not None
                await asyncio.to_thread(slot.impl.warmup)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="MT_WARMUP_FAILED") from exc
    return {"ok": True, "state": registry.slot("translator").reported_state()}


@app.post("/v1/mt/model/unload", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_model_unload():
    scheduler = heavy_gpu_scheduler.status()
    if scheduler.active == "translator" or mt_job_manager.has_active_jobs():
        raise HTTPException(status_code=409, detail="MT_JOB_ACTIVE")
    if scheduler.resident == "translator":
        await heavy_gpu_scheduler.unload_resident()
    else:
        await try_unload(registry.slot("translator"), reason="browser_mt_unload")
    heavy_gpu_scheduler.invalidate("translator")
    return {"ok": True, "state": "unloaded"}


@app.post("/v1/mt/jobs", status_code=202, dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_create_job(body: MtJobRequest):
    try:
        return await mt_job_manager.create(
            request_id=body.request_id,
            input_checksum=body.input_checksum,
            source_lang=body.source_lang,
            target_lang=body.target_lang,
            segments=[segment.model_dump() for segment in body.segments],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except MtJobConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/v1/mt/jobs/{job_id}", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_job_status(job_id: str):
    try:
        return mt_job_manager.status(job_id)
    except MtJobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc


@app.get("/v1/mt/jobs/{job_id}/result", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_job_result(job_id: str):
    try:
        return mt_job_manager.result(job_id)
    except MtJobNotFound as exc:
        raise HTTPException(status_code=404, detail="job result not found") from exc


@app.post("/v1/mt/jobs/{job_id}/cancel", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_job_cancel(job_id: str):
    try:
        return await mt_job_manager.cancel(job_id)
    except MtJobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc


@app.post("/v1/mt/jobs/{job_id}/retry", status_code=202, dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_job_retry(job_id: str):
    try:
        return await mt_job_manager.retry(job_id)
    except MtJobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except MtJobConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/v1/mt/jobs/{job_id}", dependencies=[Depends(require_mt_browser_auth)])
async def v1_mt_job_delete(job_id: str):
    try:
        return await mt_job_manager.delete(job_id)
    except MtJobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except MtJobConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/v1/asr/model/status", dependencies=[Depends(require_browser_auth)])
async def v1_asr_model_status(verify_hash: bool = False):
    status = await asyncio.to_thread(inspect_model, None, verify_hash=verify_hash)
    worker = asr_worker.status()
    return {
        **status.public_dict(),
        "worker": {"state": worker.state, "pid": worker.pid},
    }


@app.get("/v1/companion/preflight", dependencies=[Depends(require_browser_auth)])
async def v1_companion_preflight():
    return await asyncio.to_thread(preflight_report)


@app.get("/v1/asr/model/install-status", dependencies=[Depends(require_browser_auth)])
async def v1_asr_model_install_status():
    return model_install_manager.status()


@app.post("/v1/asr/model/install", status_code=202, dependencies=[Depends(require_browser_auth)])
async def v1_asr_model_install(body: InstallAsrModelRequest):
    try:
        return model_install_manager.start(
            accepted_license=body.accepted_license,
            revision=body.revision,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/v1/asr/model/install-cancel", dependencies=[Depends(require_browser_auth)])
async def v1_asr_model_install_cancel():
    return model_install_manager.cancel()


@app.delete("/v1/asr/model", dependencies=[Depends(require_browser_auth)])
async def v1_asr_model_delete():
    if asr_job_manager.has_active_jobs() or heavy_gpu_scheduler.status().active == "asr":
        raise HTTPException(status_code=409, detail="MODEL_DELETE_BLOCKED_BY_ACTIVE_JOB")
    await asyncio.to_thread(asr_worker.hard_cancel)
    heavy_gpu_scheduler.invalidate("asr")
    try:
        return await asyncio.to_thread(model_install_manager.delete_model)
    except (ValueError, RuntimeError, OSError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/v1/companion/jobs", dependencies=[Depends(require_browser_auth)])
async def v1_companion_delete_jobs():
    if asr_job_manager.has_active_jobs():
        raise HTTPException(status_code=409, detail="JOB_DELETE_BLOCKED_BY_ACTIVE_JOB")
    try:
        return await asyncio.to_thread(delete_all_jobs)
    except (ValueError, RuntimeError, OSError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/v1/asr/model/warmup", dependencies=[Depends(require_browser_auth)])
async def v1_asr_model_warmup():
    status = await asyncio.to_thread(inspect_model, None, verify_hash=True)
    if not status.verified:
        raise HTTPException(status_code=409, detail=status.reason or "model is not verified")
    try:
        async with heavy_gpu_scheduler.lease("asr"):
            result = asr_worker.ping()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "state": result.get("state")}


@app.post("/v1/asr/model/unload", dependencies=[Depends(require_browser_auth)])
async def v1_asr_model_unload():
    scheduler = heavy_gpu_scheduler.status()
    if scheduler.active == "asr":
        raise HTTPException(status_code=409, detail="ASR job is active; cancel the job first")
    await asyncio.to_thread(asr_worker.hard_cancel)
    heavy_gpu_scheduler.invalidate("asr")
    return {"ok": True, "state": "unloaded"}


@app.post("/v1/asr/jobs", status_code=202, dependencies=[Depends(require_browser_auth)])
async def v1_asr_create_job(request: Request):
    raw_length = request.headers.get("content-length")
    try:
        content_length = int(raw_length) if raw_length is not None else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid Content-Length") from exc
    try:
        reservation = await asr_job_manager.reserve()
    except JobCapacityError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    try:
        return await asr_job_manager.create_from_stream(
            request.stream(),
            media_type=request.headers.get("content-type"),
            content_length=content_length,
            reservation=reservation,
        )
    except ValueError as exc:
        raise HTTPException(status_code=413 if "300 MiB" in str(exc) else 400, detail=str(exc)) from exc


@app.get("/v1/asr/jobs/{job_id}", dependencies=[Depends(require_browser_auth)])
async def v1_asr_job_status(job_id: str):
    try:
        return asr_job_manager.get(job_id)
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc


@app.get("/v1/asr/jobs/{job_id}/result", dependencies=[Depends(require_browser_auth)])
async def v1_asr_job_result(job_id: str):
    try:
        return asr_job_manager.result(job_id)
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job result not found") from exc


@app.post("/v1/asr/jobs/{job_id}/cancel", dependencies=[Depends(require_browser_auth)])
async def v1_asr_job_cancel(job_id: str):
    try:
        return await asr_job_manager.cancel(job_id)
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc


@app.post("/v1/asr/jobs/{job_id}/resume", status_code=202, dependencies=[Depends(require_browser_auth)])
async def v1_asr_job_resume(job_id: str):
    try:
        return await asr_job_manager.resume(job_id)
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except JobCapacityError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post(
    "/v1/asr/jobs/{job_id}/retry-chunks",
    status_code=202,
    dependencies=[Depends(require_browser_auth)],
)
async def v1_asr_job_retry_chunks(job_id: str, body: RetryChunksRequest):
    try:
        return await asr_job_manager.retry_chunks(job_id, body.chunk_indexes, body.reason)
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except JobCapacityError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post(
    "/v1/asr/jobs/{job_id}/audio-stream",
    status_code=202,
    dependencies=[Depends(require_browser_auth)],
)
async def v1_asr_job_audio_stream(job_id: str, body: AudioStreamRequest):
    try:
        return await asr_job_manager.select_audio_stream(job_id, body.stream_index)
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except JobCapacityError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/v1/asr/jobs/{job_id}", dependencies=[Depends(require_browser_auth)])
async def v1_asr_job_delete(job_id: str):
    try:
        return await asr_job_manager.delete(job_id)
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
    if body.name == "translator":
        async with heavy_gpu_scheduler.lease("translator"):
            await ensure_loaded(slot)
    else:
        await ensure_loaded(slot)
    return {"ok": True, "state": slot.reported_state()}


@app.post("/models/unload")
async def models_unload(body: UnloadRequest):
    if body.name not in registry.slots:
        raise HTTPException(status_code=404, detail=f"unknown model: {body.name}")
    slot = registry.slot(body.name)
    did = await try_unload(slot, reason="manual")
    if body.name == "translator" and (did or slot.state.value == "unloaded"):
        heavy_gpu_scheduler.invalidate("translator")
    return {"unloaded": did, "state": slot.reported_state()}


@app.post("/models/unload-all")
async def models_unload_all():
    results: dict[str, bool] = {}
    for name, slot in registry.slots.items():
        results[name] = await try_unload(slot, reason="manual_all")
        if name == "translator" and (results[name] or slot.state.value == "unloaded"):
            heavy_gpu_scheduler.invalidate("translator")
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
    async with heavy_gpu_scheduler.lease("translator"):
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
