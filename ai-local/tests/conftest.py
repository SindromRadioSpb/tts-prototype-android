import asyncio

import pytest


@pytest.fixture(autouse=True)
async def _cancel_leftover_tasks():
    """
    Prevent `Task was destroyed but it is pending` warnings from tests that schedule
    idle-unload timers with timeouts longer than the test body.
    """
    yield
    loop = asyncio.get_event_loop()
    current = asyncio.current_task()
    for task in asyncio.all_tasks(loop):
        if task is current or task.done():
            continue
        task.cancel()
    for task in asyncio.all_tasks(loop):
        if task is current or task.done():
            continue
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
