from __future__ import annotations

import asyncio

import pytest

from ai_local.lifecycle import (
    ensure_loaded,
    eager_load,
    shutdown_slot,
    try_unload,
    use_model,
)
from ai_local.state import ModelState

from .helpers import MockImpl, make_slot

pytestmark = pytest.mark.asyncio


async def _one_request(slot) -> str:
    async with use_model(slot):
        assert slot.impl is not None
        return await asyncio.to_thread(slot.impl.infer, "payload")


# §2.5.16.1 — lazy load
async def test_translator_not_loaded_until_first_use():
    slot, impl = make_slot(idle_timeout_sec=1, device="cuda")
    assert slot.state == ModelState.UNLOADED
    assert impl.load_count == 0
    await _one_request(slot)
    assert slot.state == ModelState.READY
    assert impl.load_count == 1


# §2.5.16.2 — auto-unload by idle timeout
async def test_idle_timeout_unloads_translator():
    slot, impl = make_slot(idle_timeout_sec=0.1, device="cuda")
    await _one_request(slot)
    assert slot.state == ModelState.READY
    # Wait for idle unload to fire
    await asyncio.sleep(0.3)
    assert slot.state == ModelState.UNLOADED
    assert impl.unload_count == 1


# §2.5.16.3 — BERT-like model (no idle timeout) stays loaded
async def test_nakdan_without_idle_stays_loaded():
    slot, impl = make_slot(idle_timeout_sec=None, device="cpu")
    await _one_request(slot)
    await asyncio.sleep(0.3)
    assert slot.state == ModelState.READY
    assert impl.unload_count == 0


# §2.5.16.4 — repeat within idle window does not trigger reload
async def test_repeat_within_idle_window_no_reload():
    slot, impl = make_slot(idle_timeout_sec=10, device="cuda")
    await _one_request(slot)
    await _one_request(slot)
    await _one_request(slot)
    assert impl.load_count == 1
    assert impl.warmup_count == 1


# §2.5.16.5 — unload impossible while active request
async def test_manual_unload_blocked_while_busy():
    slot, impl = make_slot(idle_timeout_sec=None, device="cuda")
    # Enter the critical section and hold it
    started = asyncio.Event()
    release = asyncio.Event()

    async def long_request():
        async with use_model(slot):
            started.set()
            await release.wait()

    task = asyncio.create_task(long_request())
    await started.wait()
    assert slot.active_requests == 1
    did = await try_unload(slot, reason="test")
    assert did is False
    assert slot.state == ModelState.READY

    release.set()
    await task
    assert slot.active_requests == 0
    # Now unload should succeed
    did = await try_unload(slot, reason="test")
    assert did is True
    assert slot.state == ModelState.UNLOADED


# §2.5.16.6 — status dict reports correct state
async def test_status_dict_reflects_state():
    slot, _ = make_slot(idle_timeout_sec=None, device="cuda")
    assert slot.to_status_dict()["state"] == "unloaded"
    await eager_load(slot)
    assert slot.to_status_dict()["state"] == "ready"


# §2.5.16.8 — shutdown drains and unloads
async def test_shutdown_drains_and_unloads():
    slot, impl = make_slot(idle_timeout_sec=None, device="cuda")
    await eager_load(slot)
    assert slot.state == ModelState.READY
    await shutdown_slot(slot, drain_timeout=1.0)
    assert slot.state == ModelState.UNLOADED
    assert impl.unload_count == 1


# §2.5.16.9 — 5 parallel requests in unloaded state → 1 load, 5 responses
async def test_concurrent_first_load_single_load():
    impl = MockImpl(load_delay=0.2)
    slot, _ = make_slot(impl=impl, idle_timeout_sec=None, device="cuda")

    results = await asyncio.gather(*(_one_request(slot) for _ in range(5)))
    assert all(r == "ok:payload" for r in results)
    assert impl.load_count == 1
    assert impl.warmup_count == 1
    assert impl.infer_count == 5


# §2.5.16.10 — idle-unload cancelled when a new request arrives mid-wait
async def test_idle_unload_cancelled_by_new_request():
    slot, impl = make_slot(idle_timeout_sec=0.1, device="cuda")
    await _one_request(slot)
    assert slot.state == ModelState.READY
    assert slot.unload_task is not None

    # Sleep less than idle_timeout, then fire a second request
    await asyncio.sleep(0.05)
    await _one_request(slot)

    # Still only one load/warmup and no unload ran
    assert impl.load_count == 1
    assert impl.warmup_count == 1
    assert impl.unload_count == 0


async def test_error_state_allows_retry_after_recovery():
    impl = MockImpl(load_delay=0, fail_on_load=True)
    slot, _ = make_slot(impl=impl, idle_timeout_sec=None, device="cuda")
    with pytest.raises(RuntimeError):
        await ensure_loaded(slot)
    assert slot.state == ModelState.ERROR

    # Flip the mock to succeed and retry — ensure_loaded should reset ERROR→UNLOADED→READY
    impl.fail_on_load = False
    await ensure_loaded(slot)
    assert slot.state == ModelState.READY
    assert impl.load_count == 2


async def test_parallel_requests_while_loading_do_not_duplicate_load():
    impl = MockImpl(load_delay=0.3, warmup_delay=0.05)
    slot, _ = make_slot(impl=impl, idle_timeout_sec=None, device="cuda")

    t1 = asyncio.create_task(_one_request(slot))
    await asyncio.sleep(0.05)
    assert slot.state in (ModelState.LOADING, ModelState.WARMING_UP)
    t2 = asyncio.create_task(_one_request(slot))
    await asyncio.gather(t1, t2)

    assert impl.load_count == 1
    assert impl.infer_count == 2
