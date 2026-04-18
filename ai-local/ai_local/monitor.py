import asyncio
import logging
from typing import Optional

from . import config
from .lifecycle import try_unload
from .state import ModelState, registry

log = logging.getLogger(__name__)

_monitor_task: Optional[asyncio.Task] = None


def _vram_free_mb() -> Optional[int]:
    try:
        import torch  # noqa: WPS433 (lazy import — optional at test time)
    except Exception:
        return None
    if not torch.cuda.is_available():
        return None
    try:
        free, _total = torch.cuda.mem_get_info()
        return int(free // (1024 * 1024))
    except Exception:
        return None


def _ram_free_mb() -> Optional[int]:
    try:
        import psutil
    except Exception:
        return None
    try:
        return int(psutil.virtual_memory().available // (1024 * 1024))
    except Exception:
        return None


async def _tick() -> None:
    if not config.ENABLE_MEMORY_PRESSURE_UNLOAD:
        return
    vram = _vram_free_mb()
    ram = _ram_free_mb()
    if vram is not None and vram < config.VRAM_FREE_MB_MIN:
        log.warning("vram pressure: %d MB free (threshold %d)", vram, config.VRAM_FREE_MB_MIN)
        for slot in registry.slots.values():
            if slot.device.startswith("cuda") and slot.state == ModelState.READY:
                if await try_unload(slot, reason="vram_pressure"):
                    break
    if ram is not None and ram < config.RAM_FREE_MB_MIN:
        # Default policy: warn only. BERT on CPU stays loaded unless explicitly enabled.
        log.warning("ram pressure: %d MB free (threshold %d)", ram, config.RAM_FREE_MB_MIN)


async def _run() -> None:
    log.info(
        "memory pressure monitor started (vram<%d MB, ram<%d MB, every %ds)",
        config.VRAM_FREE_MB_MIN,
        config.RAM_FREE_MB_MIN,
        config.PRESSURE_CHECK_INTERVAL_SEC,
    )
    try:
        while True:
            await asyncio.sleep(config.PRESSURE_CHECK_INTERVAL_SEC)
            try:
                await _tick()
            except Exception:
                log.exception("pressure monitor tick failed")
    except asyncio.CancelledError:
        log.info("memory pressure monitor stopped")
        raise


async def start_monitor() -> None:
    global _monitor_task
    if _monitor_task is not None and not _monitor_task.done():
        return
    _monitor_task = asyncio.create_task(_run())


async def stop_monitor() -> None:
    global _monitor_task
    if _monitor_task is None:
        return
    _monitor_task.cancel()
    try:
        await _monitor_task
    except (asyncio.CancelledError, Exception):
        pass
    _monitor_task = None
