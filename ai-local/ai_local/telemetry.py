"""NVIDIA admission and bounded thermal telemetry without transcript access."""

from __future__ import annotations

import asyncio
import csv
import io
import subprocess
from dataclasses import dataclass

from .asr_constants import ASR_REQUIRED_FREE_VRAM_MIB

NVIDIA_QUERY = (
    "memory.free,temperature.gpu,temperature.gpu.tlimit,"
    "clocks_event_reasons.hw_thermal_slowdown,power.draw,utilization.gpu"
)
THERMAL_PAUSE_CAP_C = 83
THERMAL_ABORT_CAP_C = 88
THERMAL_RESUME_DELTA_C = 5


def _number(value: str) -> float | None:
    cleaned = value.strip().replace("[N/A]", "")
    if not cleaned or cleaned.upper() == "N/A":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


@dataclass(frozen=True)
class GpuSample:
    free_vram_mib: int
    temperature_c: int
    slowdown_threshold_c: int | None
    thermal_throttle: bool
    power_w: float | None
    utilization_pct: int | None

    @property
    def pause_at_c(self) -> int:
        if self.slowdown_threshold_c is None:
            return THERMAL_PAUSE_CAP_C
        return min(THERMAL_PAUSE_CAP_C, self.slowdown_threshold_c - 5)

    @property
    def resume_at_c(self) -> int:
        return self.pause_at_c - THERMAL_RESUME_DELTA_C

    @property
    def abort_at_c(self) -> int:
        if self.slowdown_threshold_c is None:
            return THERMAL_ABORT_CAP_C
        return min(THERMAL_ABORT_CAP_C, self.slowdown_threshold_c - 1)

    def admission_ok(self) -> bool:
        return self.free_vram_mib >= ASR_REQUIRED_FREE_VRAM_MIB

    def must_abort(self) -> bool:
        return self.thermal_throttle or self.temperature_c >= self.abort_at_c


def sample_nvidia() -> GpuSample:
    completed = subprocess.run(
        ["nvidia-smi", f"--query-gpu={NVIDIA_QUERY}", "--format=csv,noheader,nounits"],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    )
    rows = list(csv.reader(io.StringIO(completed.stdout)))
    if len(rows) != 1 or len(rows[0]) != 6:
        raise RuntimeError("expected exactly one NVIDIA GPU telemetry row")
    free, temp, threshold, throttle, power, util = (value.strip() for value in rows[0])
    free_n, temp_n = _number(free), _number(temp)
    if free_n is None or temp_n is None:
        raise RuntimeError("NVIDIA telemetry omitted memory or temperature")
    threshold_n, power_n, util_n = _number(threshold), _number(power), _number(util)
    return GpuSample(
        free_vram_mib=int(free_n),
        temperature_c=int(temp_n),
        slowdown_threshold_c=int(threshold_n) if threshold_n is not None else None,
        thermal_throttle=throttle.lower() not in {"not active", "inactive", "0", "false"},
        power_w=power_n,
        utilization_pct=int(util_n) if util_n is not None else None,
    )


class TelemetryRecorder:
    def __init__(self, interval_sec: float = 2.0) -> None:
        self.interval_sec = interval_sec
        self.samples: list[GpuSample] = []
        self.error: str | None = None
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        first = await asyncio.to_thread(sample_nvidia)
        self.samples.append(first)
        self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval_sec)
                break
            except asyncio.TimeoutError:
                pass
            try:
                self.samples.append(await asyncio.to_thread(sample_nvidia))
            except Exception as exc:
                self.error = str(exc)[:200]
                return

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await self._task

    def require_healthy(self) -> None:
        if self.error is not None:
            raise RuntimeError(f"TELEMETRY_UNAVAILABLE: {self.error}")
        if not self.samples:
            raise RuntimeError("TELEMETRY_UNAVAILABLE: no samples")

    def summary(self) -> dict[str, object]:
        if not self.samples:
            return {"samples": 0, "error": self.error or "NO_TELEMETRY"}
        return {
            "samples": len(self.samples),
            "max_temperature_c": max(item.temperature_c for item in self.samples),
            "min_free_vram_mib": min(item.free_vram_mib for item in self.samples),
            "max_power_w": max((item.power_w or 0) for item in self.samples),
            "thermal_throttle": any(item.thermal_throttle for item in self.samples),
            "error": self.error,
        }
