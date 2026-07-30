"""One exclusive heavy-GPU residency/usage slot for MADLAD and Studio ASR."""

from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Awaitable, Callable

Handler = Callable[[], Awaitable[None]]


class LeaseCancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class SchedulerStatus:
    resident: str | None
    active: str | None
    waiting: int


class HeavyGpuScheduler:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._handlers: dict[str, tuple[Handler, Handler, float | None]] = {}
        self._resident: str | None = None
        self._active: str | None = None
        self._waiting = 0
        self._idle_task: asyncio.Task | None = None
        self._idle_unloading = False

    def register(
        self, name: str, *, prepare: Handler, unload: Handler,
        idle_timeout_sec: float | None = None,
    ) -> None:
        self._handlers[name] = (prepare, unload, idle_timeout_sec)

    def status(self) -> SchedulerStatus:
        return SchedulerStatus(self._resident, self._active, self._waiting)

    def invalidate(self, name: str) -> None:
        if self._resident == name:
            self._resident = None
            self._cancel_idle()

    def _cancel_idle(self) -> None:
        # Once the idle task owns the scheduler lock, cancelling it could
        # interrupt a model unload half-way and make the residency marker lie.
        if (
            self._idle_task is not None
            and not self._idle_task.done()
            and not self._idle_unloading
        ):
            self._idle_task.cancel()
        self._idle_task = None

    async def unload_resident(self) -> None:
        async with self._lock:
            self._cancel_idle()
            if self._resident is None:
                return
            _, unload, _ = self._handlers[self._resident]
            await unload()
            self._resident = None

    @asynccontextmanager
    async def lease(
        self, name: str, *, cancel: asyncio.Event | None = None
    ) -> AsyncIterator[None]:
        if name not in self._handlers:
            raise KeyError(f"unregistered heavy model: {name}")
        self._waiting += 1
        self._cancel_idle()
        try:
            if cancel is None:
                await self._lock.acquire()
            else:
                acquired = asyncio.create_task(self._lock.acquire())
                cancelled = asyncio.create_task(cancel.wait())
                done, _ = await asyncio.wait(
                    {acquired, cancelled}, return_when=asyncio.FIRST_COMPLETED
                )
                if cancelled in done and cancel.is_set():
                    acquired.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await acquired
                    if acquired.done() and not acquired.cancelled() and acquired.result():
                        self._lock.release()
                    raise LeaseCancelled(f"heavy GPU lease for {name} was cancelled")
                cancelled.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await cancelled
                await acquired
        finally:
            self._waiting -= 1
        try:
            if self._resident != name:
                if self._resident is not None:
                    _, unload, _ = self._handlers[self._resident]
                    await unload()
                    self._resident = None
                prepare, _, _ = self._handlers[name]
                await prepare()
                self._resident = name
            if cancel is not None and cancel.is_set():
                _, unload, _ = self._handlers[name]
                await unload()
                self._resident = None
                raise LeaseCancelled(f"heavy GPU lease for {name} was cancelled")
            self._active = name
            yield
        finally:
            self._active = None
            self._lock.release()
            _, _, timeout = self._handlers[name]
            if timeout is not None and self._resident == name:
                self._idle_task = asyncio.create_task(self._idle_unload(name, timeout))

    async def _idle_unload(self, name: str, timeout: float) -> None:
        try:
            await asyncio.sleep(timeout)
            async with self._lock:
                if self._active is not None or self._resident != name:
                    return
                _, unload, _ = self._handlers[name]
                self._idle_unloading = True
                try:
                    await unload()
                    self._resident = None
                finally:
                    self._idle_unloading = False
        except asyncio.CancelledError:
            return


heavy_gpu_scheduler = HeavyGpuScheduler()
