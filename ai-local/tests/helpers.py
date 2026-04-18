from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Optional

from ai_local.state import ModelSlot


@dataclass
class MockImpl:
    """
    Thread-safe counters and a blocking load to let tests observe state transitions
    and force concurrency scenarios deterministically.
    """

    version: str = "mock@v1"
    load_delay: float = 0.1
    unload_delay: float = 0.0
    warmup_delay: float = 0.0
    infer_delay: float = 0.02
    fail_on_load: bool = False

    load_count: int = 0
    unload_count: int = 0
    warmup_count: int = 0
    infer_count: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def load(self) -> None:
        if self.load_delay:
            threading.Event().wait(self.load_delay)
        with self._lock:
            self.load_count += 1
        if self.fail_on_load:
            raise RuntimeError("mock load failure")

    def warmup(self) -> None:
        if self.warmup_delay:
            threading.Event().wait(self.warmup_delay)
        with self._lock:
            self.warmup_count += 1

    def unload(self) -> None:
        if self.unload_delay:
            threading.Event().wait(self.unload_delay)
        with self._lock:
            self.unload_count += 1

    def infer(self, payload: str) -> str:
        if self.infer_delay:
            threading.Event().wait(self.infer_delay)
        with self._lock:
            self.infer_count += 1
        return f"ok:{payload}"


def make_slot(
    *,
    name: str = "mock",
    impl: Optional[MockImpl] = None,
    idle_timeout_sec: Optional[float] = None,
    device: str = "cpu",
) -> tuple[ModelSlot, MockImpl]:
    impl = impl or MockImpl()
    slot = ModelSlot(
        name=name,
        factory=lambda: impl,
        device=device,
        idle_timeout_sec=idle_timeout_sec,  # type: ignore[arg-type]
    )
    return slot, impl
