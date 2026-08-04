"""Real owner-machine smoke for exclusive ASR -> MADLAD -> ASR GPU residency."""

from __future__ import annotations

import asyncio
import json
import os


async def run() -> dict[str, object]:
    # Configure the process before importing ai_local.config/main. The ASR job
    # manager need not run: acquiring the registered scheduler lease exercises
    # the same exact pinned model load/unload handlers.
    os.environ.setdefault("AI_LOCAL_ASR_ENABLED", "0")
    os.environ.setdefault("AI_LOCAL_MT_ENABLED", "1")
    os.environ.setdefault("AI_LOCAL_NAKDAN_EAGER", "0")

    from ai_local.gpu_scheduler import heavy_gpu_scheduler
    from ai_local.lifecycle import use_model
    from ai_local.main import app, lifespan
    from ai_local.state import registry

    stages: list[dict[str, object]] = []
    async with lifespan(app):
        async with heavy_gpu_scheduler.lease("asr"):
            stages.append({"stage": "asr_first", **vars(heavy_gpu_scheduler.status())})

        async with heavy_gpu_scheduler.lease("translator"):
            async with use_model(registry.slot("translator")) as slot:
                result = await asyncio.to_thread(
                    slot.impl.translate_batch,
                    ["זהו מבחן מקומי."],
                    "ru",
                )
            stages.append(
                {
                    "stage": "mt",
                    **vars(heavy_gpu_scheduler.status()),
                    "translation": result[0],
                }
            )

        async with heavy_gpu_scheduler.lease("asr"):
            stages.append({"stage": "asr_second", **vars(heavy_gpu_scheduler.status())})

        await heavy_gpu_scheduler.unload_resident()
        stages.append({"stage": "unloaded", **vars(heavy_gpu_scheduler.status())})

    return {
        "schema": "studio-l4-mt-gpu-swap-v1",
        "sequence": [stage["stage"] for stage in stages],
        "stages": stages,
        "exclusive_residency_pass": [stage["resident"] for stage in stages]
        == ["asr", "translator", "asr", None],
    }


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run()), ensure_ascii=False))
