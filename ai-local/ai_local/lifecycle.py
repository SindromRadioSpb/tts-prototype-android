import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from .state import ModelSlot, ModelState, utcnow

log = logging.getLogger(__name__)


async def _do_load(slot: ModelSlot) -> None:
    """Called with state_lock held."""
    try:
        slot.state = ModelState.LOADING
        slot.error_message = None
        log.info("loading %s", slot.name)
        impl = slot.factory()
        await asyncio.to_thread(impl.load)
        slot.impl = impl
        slot.loaded_at = utcnow()

        slot.state = ModelState.WARMING_UP
        log.info("warming up %s", slot.name)
        await asyncio.to_thread(impl.warmup)

        slot.state = ModelState.READY
        log.info("%s ready", slot.name)
    except Exception as e:
        slot.state = ModelState.ERROR
        slot.error_message = repr(e)
        slot.impl = None
        log.exception("load failed for %s", slot.name)
        raise


async def ensure_loaded(slot: ModelSlot) -> None:
    if slot.state == ModelState.READY:
        return
    async with slot.state_lock:
        if slot.state == ModelState.READY:
            return
        if slot.state == ModelState.ERROR:
            # Allow a fresh attempt after an error; upstream decides whether to retry.
            slot.state = ModelState.UNLOADED
            slot.error_message = None
        if slot.state != ModelState.UNLOADED:
            # Any other state here means an inconsistent transition; surface as error.
            raise RuntimeError(
                f"ensure_loaded called in unexpected state {slot.state} for {slot.name}"
            )
        await _do_load(slot)


async def _do_unload(slot: ModelSlot, reason: str) -> None:
    """Called with state_lock held. active_requests must already be zero."""
    if slot.impl is None:
        slot.state = ModelState.UNLOADED
        return
    slot.state = ModelState.UNLOADING
    log.info("unloading %s (reason=%s)", slot.name, reason)
    impl = slot.impl
    try:
        await asyncio.to_thread(impl.unload)
    except Exception:
        log.exception("unload failed for %s", slot.name)
    slot.impl = None
    slot.loaded_at = None
    slot.state = ModelState.UNLOADED


async def _idle_unload(slot: ModelSlot) -> None:
    assert slot.idle_timeout_sec is not None
    try:
        await asyncio.sleep(slot.idle_timeout_sec)
    except asyncio.CancelledError:
        return

    async with slot.state_lock:
        async with slot.counter_lock:
            if slot.active_requests > 0 or slot.state != ModelState.READY:
                return
            # Zero active requests, no further work can start in the window between
            # releasing counter_lock and entering _do_unload because any new
            # use_model() would try to acquire state_lock (which we already hold).
        await _do_unload(slot, reason="idle_timeout")


async def try_unload(slot: ModelSlot, reason: str) -> bool:
    """Best-effort manual unload. Returns True if the unload ran."""
    async with slot.state_lock:
        async with slot.counter_lock:
            if not slot.can_unload():
                return False
        await _do_unload(slot, reason=reason)
        return True


@asynccontextmanager
async def use_model(slot: ModelSlot) -> AsyncIterator[ModelSlot]:
    async with slot.counter_lock:
        if slot.unload_task is not None and not slot.unload_task.done():
            slot.unload_task.cancel()
            slot.unload_task = None
        slot.active_requests += 1
    try:
        await ensure_loaded(slot)
        yield slot
    finally:
        async with slot.counter_lock:
            slot.active_requests -= 1
            slot.last_used_at = utcnow()
            if (
                slot.active_requests == 0
                and slot.idle_timeout_sec is not None
                and slot.state == ModelState.READY
            ):
                slot.unload_task = asyncio.create_task(_idle_unload(slot))


async def eager_load(slot: ModelSlot) -> None:
    await ensure_loaded(slot)


async def shutdown_slot(slot: ModelSlot, drain_timeout: float) -> None:
    """Wait for in-flight requests, then unload the model."""
    deadline = asyncio.get_event_loop().time() + drain_timeout
    while True:
        async with slot.counter_lock:
            if slot.active_requests == 0:
                break
        if asyncio.get_event_loop().time() >= deadline:
            log.warning(
                "shutdown drain timeout for %s; %d active requests remain",
                slot.name,
                slot.active_requests,
            )
            break
        await asyncio.sleep(0.05)

    async with slot.state_lock:
        if slot.unload_task is not None and not slot.unload_task.done():
            slot.unload_task.cancel()
        if slot.impl is not None:
            await _do_unload(slot, reason="shutdown")
