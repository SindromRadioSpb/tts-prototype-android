import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional, Protocol


class ModelState(str, Enum):
    UNLOADED = "unloaded"
    LOADING = "loading"
    WARMING_UP = "warming_up"
    READY = "ready"
    UNLOADING = "unloading"
    ERROR = "error"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ModelImpl(Protocol):
    """Minimal interface every model wrapper must satisfy."""

    version: str

    def load(self) -> None: ...
    def warmup(self) -> None: ...
    def unload(self) -> None: ...


@dataclass
class ModelSlot:
    """
    Owns lifecycle state for a single model. Concurrency invariants:
      * `state_lock` serializes load/unload transitions.
      * `counter_lock` protects active_requests and unload_task.
      * Lock ordering: counter_lock must NEVER be acquired while holding state_lock
        UNLESS state_lock's critical section never tries to re-enter counter_lock
        under the same task. `_idle_unload` acquires state_lock then counter_lock;
        `use_model` acquires and releases counter_lock before touching state_lock.
    """

    name: str
    factory: Callable[[], ModelImpl]
    device: str = "cpu"
    idle_timeout_sec: Optional[int] = None

    state: ModelState = ModelState.UNLOADED
    impl: Optional[ModelImpl] = None
    error_message: Optional[str] = None
    loaded_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None

    active_requests: int = 0
    unload_task: Optional[asyncio.Task] = field(default=None, repr=False)

    state_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    counter_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def reported_state(self) -> str:
        if self.state == ModelState.READY and self.active_requests > 0:
            return "busy"
        return self.state.value

    def can_unload(self) -> bool:
        return self.state == ModelState.READY and self.active_requests == 0

    def to_status_dict(self) -> dict[str, Any]:
        return {
            "state": self.reported_state(),
            "device": self.device,
            "active_requests": self.active_requests,
            "idle_timeout_sec": self.idle_timeout_sec,
            "loaded_at": self.loaded_at.isoformat() if self.loaded_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "version": self.impl.version if self.impl else None,
            "error": self.error_message,
        }


class Registry:
    def __init__(self) -> None:
        self.slots: dict[str, ModelSlot] = {}
        self._accepting = True

    def register(self, slot: ModelSlot) -> None:
        self.slots[slot.name] = slot

    def slot(self, name: str) -> ModelSlot:
        return self.slots[name]

    @property
    def accepting(self) -> bool:
        return self._accepting

    def stop_accepting(self) -> None:
        self._accepting = False


registry = Registry()
