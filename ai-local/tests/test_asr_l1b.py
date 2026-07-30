from __future__ import annotations

import asyncio
import io
import json
import os
import subprocess
import sys
import threading
import time
import uuid
import wave
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai_local.asr_jobs import AsrJobManager, _canonical_sha256
from ai_local.asr_constants import model_identity
from ai_local.gpu_scheduler import HeavyGpuScheduler, LeaseCancelled, heavy_gpu_scheduler
from ai_local.media_slicer import Window, _wait_process, asr_windows, probe_source, slice_window
from ai_local.telemetry import GpuSample, TelemetryRecorder


def _wav_bytes(duration_sec: float = 1.0, rate: int = 16_000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"\0\0" * int(duration_sec * rate))
    return buffer.getvalue()


def test_canonical_hash_matches_browser_normalizer_contract():
    assert _canonical_sha256({"z": "שלום", "a": [2, 1]}) == (
        "bed45b584fee349f5d790ac68bbd636564530e811c6bcce0d4b5ca41346d7523"
    )


async def _stream(payload: bytes):
    yield payload[: len(payload) // 2]
    yield payload[len(payload) // 2 :]


async def test_heavy_gpu_scheduler_serializes_and_evicts_residency():
    scheduler = HeavyGpuScheduler()
    events: list[str] = []

    async def prepare_a():
        events.append("prepare-a")

    async def unload_a():
        events.append("unload-a")

    async def prepare_b():
        events.append("prepare-b")

    async def unload_b():
        events.append("unload-b")

    scheduler.register("a", prepare=prepare_a, unload=unload_a)
    scheduler.register("b", prepare=prepare_b, unload=unload_b)
    async with scheduler.lease("a"):
        assert scheduler.status().active == "a"
    async with scheduler.lease("a"):
        pass
    async with scheduler.lease("b"):
        assert scheduler.status().resident == "b"
    assert events == ["prepare-a", "unload-a", "prepare-b"]


async def test_heavy_gpu_scheduler_never_overlaps_active_leases():
    scheduler = HeavyGpuScheduler()
    active = 0
    peak = 0

    async def noop():
        return None

    scheduler.register("asr", prepare=noop, unload=noop)

    async def one():
        nonlocal active, peak
        async with scheduler.lease("asr"):
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.03)
            active -= 1

    await asyncio.gather(one(), one(), one())
    assert peak == 1


async def test_waiting_heavy_gpu_lease_is_cancellable():
    scheduler = HeavyGpuScheduler()
    holding = asyncio.Event()
    release = asyncio.Event()

    async def noop():
        return None

    scheduler.register("asr", prepare=noop, unload=noop)

    async def holder():
        async with scheduler.lease("asr"):
            holding.set()
            await release.wait()

    active = asyncio.create_task(holder())
    await holding.wait()
    cancel = asyncio.Event()
    waiting = scheduler.lease("asr", cancel=cancel)
    acquire = asyncio.create_task(waiting.__aenter__())
    await asyncio.sleep(0)
    cancel.set()
    with pytest.raises(LeaseCancelled):
        await asyncio.wait_for(acquire, timeout=0.5)
    release.set()
    await active


async def test_asr_scheduler_idle_timeout_unloads_residency():
    scheduler = HeavyGpuScheduler()
    unloaded = asyncio.Event()

    async def noop():
        return None

    async def unload():
        unloaded.set()

    scheduler.register("asr", prepare=noop, unload=unload, idle_timeout_sec=0.05)
    async with scheduler.lease("asr"):
        pass
    await asyncio.wait_for(unloaded.wait(), timeout=0.5)
    assert scheduler.status().resident is None


async def test_new_lease_does_not_interrupt_idle_unload():
    scheduler = HeavyGpuScheduler()
    unload_started = asyncio.Event()
    allow_unload = asyncio.Event()
    events: list[str] = []

    async def prepare():
        events.append("prepare")

    async def unload():
        unload_started.set()
        await allow_unload.wait()
        events.append("unload")

    scheduler.register("asr", prepare=prepare, unload=unload, idle_timeout_sec=0)
    async with scheduler.lease("asr"):
        pass
    await unload_started.wait()
    lease = scheduler.lease("asr")
    next_lease = asyncio.create_task(lease.__aenter__())
    await asyncio.sleep(0)
    assert not next_lease.done()
    allow_unload.set()
    await next_lease
    assert events == ["prepare", "unload", "prepare"]
    await lease.__aexit__(None, None, None)


def test_asr_windows_match_canonical_900s_with_30s_overlap():
    windows = asr_windows(2705)
    assert [(w.start_sec, w.end_sec) for w in windows] == [
        (0.0, 900.0), (870.0, 1800.0), (1770.0, 2700.0), (2670.0, 2705.0)
    ]


async def test_format_neutral_ffmpeg_slice_has_manifest_and_exact_pcm(tmp_path):
    source = tmp_path / "source.any"
    source.write_bytes(_wav_bytes(1.0))
    probe = probe_source(source)
    assert probe.duration_sec == pytest.approx(1.0, abs=0.01)
    cancel = asyncio.Event()
    target, manifest = await slice_window(
        source,
        tmp_path / "chunks",
        "source-hash",
        probe,
        Window(index=0, start_sec=0.0, end_sec=1.0),
        cancel,
    )
    assert target.is_file()
    assert manifest.actual_samples == 16_000
    assert manifest.sample_rate == 16_000
    assert manifest.channels == 1
    assert manifest.source_sha256 == "source-hash"
    assert len(manifest.chunk_sha256) == 64
    assert not list((tmp_path / "chunks").glob("*.partial"))


def test_probe_uses_unique_default_audio_stream_and_requires_choice_when_ambiguous(tmp_path):
    from ai_local.media_slicer import MultipleAudioStreams

    selected = tmp_path / "selected.mka"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
        "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "1",
        "-map", "0:a", "-map", "1:a",
        "-disposition:a:0", "default", "-disposition:a:1", "0", str(selected),
    ], check=True)
    assert probe_source(selected).audio_stream_index == 0

    ambiguous = tmp_path / "ambiguous.mka"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
        "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "1",
        "-map", "0:a", "-map", "1:a",
        "-disposition:a:0", "0", "-disposition:a:1", "0", str(ambiguous),
    ], check=True)
    with pytest.raises(MultipleAudioStreams) as caught:
        probe_source(ambiguous)
    assert {item["index"] for item in caught.value.choices} == {0, 1}
    assert probe_source(ambiguous, selected_stream_index=1).audio_stream_index == 1


async def test_process_wait_is_cancellable():
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import time; time.sleep(30)",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    cancel = asyncio.Event()
    cancel.set()
    started = time.monotonic()
    with pytest.raises(Exception, match="cancelled"):
        await _wait_process(process, cancel)
    assert time.monotonic() - started < 3
    assert process.returncode is not None


async def test_single_job_executor_writes_atomic_checkpoints_and_result(monkeypatch, tmp_path):
    import ai_local.asr_jobs as jobs
    import ai_local.telemetry as telemetry

    sample = GpuSample(6000, 50, None, False, 30.0, 10)
    monkeypatch.setattr(jobs, "sample_nvidia", lambda: sample)
    monkeypatch.setattr(telemetry, "sample_nvidia", lambda: sample)
    monkeypatch.setattr(
        jobs,
        "inspect_model",
        lambda *_args, **_kwargs: SimpleNamespace(verified=True, path=tmp_path / "model"),
    )
    calls = 0

    def transcribe(_path):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {"ok": False, "error_type": "RuntimeError", "error": "transient"}
        return {
            "ok": True,
            "elapsed_sec": 0.01,
            "language": "he",
            "language_probability": 1.0,
            "segments": [{"start": 0.0, "end": 0.8, "text": "שלום"}],
        }

    monkeypatch.setattr(jobs.asr_worker, "transcribe", transcribe)
    monkeypatch.setattr(jobs.asr_worker, "hard_cancel", lambda: None)
    monkeypatch.setattr(jobs.asr_worker, "load", lambda _path: {"ok": True})

    async def noop():
        return None

    heavy_gpu_scheduler.invalidate("asr")
    heavy_gpu_scheduler.register("asr", prepare=noop, unload=noop)
    manager = AsrJobManager(lambda: tmp_path / "jobs")
    await manager.start()
    try:
        reservation = await manager.reserve()
        created = await manager.create_from_stream(
            _stream(_wav_bytes(1.0)),
            media_type="audio/wav",
            content_length=None,
            reservation=reservation,
        )
        job_id = created["job_id"]
        for _ in range(100):
            status = manager.get(job_id)
            if status["state"] in {"COMPLETE", "FAILED"}:
                break
            await asyncio.sleep(0.05)
        assert status["state"] == "COMPLETE", status
        assert status["chunks_completed"] == 1
        result = manager.result(job_id)
        assert result["selected_provider"] == "local"
        assert result["actual_provider"] == "local-faster-whisper"
        assert len(result["chunks"]) == 1
        assert result["chunks"][0]["worker_input"]["kind"] == "physical-chunk"
        assert result["chunks"][0]["worker_input"]["source_handle_exposed"] is False
        assert result["chunks"][0]["raw_canonical_sha256"] == _canonical_sha256(
            result["chunks"][0]["raw"]
        )
        assert [item["accepted"] for item in result["chunks"][0]["raw_attempts"]] == [False, True]
        path = manager.job_dir(job_id)
        assert (path / "chunks" / "chunk-0000.wav").is_file()
        assert len(list((path / "raw").glob("chunk-0000-attempt-*.json"))) == 2
        assert not list(path.rglob("*.partial"))
    finally:
        await asyncio.wait_for(manager.shutdown(), timeout=2)


async def test_job_cancel_ack_and_terminal_state_are_bounded(monkeypatch, tmp_path):
    import ai_local.asr_jobs as jobs
    import ai_local.telemetry as telemetry

    sample = GpuSample(6000, 50, None, False, 30.0, 10)
    monkeypatch.setattr(jobs, "sample_nvidia", lambda: sample)
    monkeypatch.setattr(telemetry, "sample_nvidia", lambda: sample)
    monkeypatch.setattr(
        jobs,
        "inspect_model",
        lambda *_args, **_kwargs: SimpleNamespace(verified=True, path=tmp_path / "model"),
    )
    entered = threading.Event()
    released = threading.Event()

    def transcribe(_path):
        entered.set()
        released.wait(timeout=5)
        return {"ok": True, "segments": []}

    monkeypatch.setattr(jobs.asr_worker, "transcribe", transcribe)
    monkeypatch.setattr(jobs.asr_worker, "hard_cancel", lambda: released.set())

    async def noop():
        return None

    heavy_gpu_scheduler.invalidate("asr")
    heavy_gpu_scheduler.register("asr", prepare=noop, unload=noop)
    manager = AsrJobManager(lambda: tmp_path / "jobs")
    await manager.start()
    try:
        reservation = await manager.reserve()
        created = await manager.create_from_stream(
            _stream(_wav_bytes()),
            media_type="audio/wav",
            content_length=None,
            reservation=reservation,
        )
        job_id = created["job_id"]
        assert await asyncio.to_thread(entered.wait, 3)
        started = time.monotonic()
        acknowledged = await manager.cancel(job_id)
        assert acknowledged["state"] == "CANCEL_REQUESTED"
        assert time.monotonic() - started < 0.5
        for _ in range(100):
            status = manager.get(job_id)
            if status["state"] == "CANCELED":
                break
            await asyncio.sleep(0.02)
        assert status["state"] == "CANCELED"
        assert time.monotonic() - started < 15
    finally:
        await asyncio.wait_for(manager.shutdown(), timeout=2)


def test_telemetry_failure_is_fail_closed():
    recorder = TelemetryRecorder()
    recorder.samples.append(GpuSample(6000, 50, None, False, 30.0, 10))
    recorder.error = "nvidia-smi unavailable"
    with pytest.raises(RuntimeError, match="TELEMETRY_UNAVAILABLE"):
        recorder.require_healthy()


async def test_gate_retry_reuses_physical_chunk_and_archives_previous_result(tmp_path):
    root = tmp_path / "jobs"
    job_id = str(uuid.uuid4())
    path = root / job_id
    (path / "chunks").mkdir(parents=True)
    (path / "raw").mkdir()
    (path / "chunks" / "chunk-0000.wav").write_bytes(b"physical")
    (path / "raw" / "chunk-0000-attempt-00.json").write_text("{}", encoding="utf-8")
    record = {
        "job_id": job_id,
        "attempt_id": "attempt-zero",
        "state": "COMPLETE",
        "created_at": "2026-07-30T00:00:00+00:00",
        "updated_at": "2026-07-30T00:00:00+00:00",
        "event_seq": 0,
        "events": [],
        "model": model_identity(),
        "result_available": True,
        "chunks_completed": 1,
        "chunks": [{
            "index": 0,
            "completed": True,
            "file_name": "chunk-0000.wav",
            "chunk_sha256": "x" * 64,
            "raw_file": "chunk-0000-attempt-00.json",
            "raw_sha256": "y" * 64,
        }],
    }
    (path / "job.json").write_text(json.dumps(record), encoding="utf-8")
    (path / "result.json").write_text('{"old":true}', encoding="utf-8")
    manager = AsrJobManager(lambda: root)
    queued = await manager.retry_chunks(job_id, [0], "s12_7")
    assert queued["state"] == "QUEUED"
    updated = json.loads((path / "job.json").read_text(encoding="utf-8"))
    assert updated["chunks"][0]["completed"] is False
    assert updated["chunks"][0]["gate_retries"] == {"s12_7": 1}
    assert not (path / "result.json").exists()
    assert (path / "results" / "result-attempt-zero.json").is_file()


async def test_restart_marks_inflight_job_recoverable(tmp_path):
    root = tmp_path / "jobs"
    job_id = str(uuid.uuid4())
    path = root / job_id
    path.mkdir(parents=True)
    record = {
        "job_id": job_id,
        "state": "TRANSCRIBING",
        "created_at": "2026-07-30T00:00:00+00:00",
        "updated_at": "2026-07-30T00:00:00+00:00",
        "event_seq": 0,
        "events": [],
    }
    (path / "job.json").write_text(json.dumps(record), encoding="utf-8")
    manager = AsrJobManager(lambda: root)
    await manager.start()
    try:
        status = manager.get(job_id)
        assert status["state"] == "RECOVERABLE"
        assert status["recoverable"] is True
    finally:
        await manager.shutdown()


async def test_delete_receipt_removes_only_terminal_job(tmp_path):
    root = tmp_path / "jobs"
    job_id = str(uuid.uuid4())
    path = root / job_id
    path.mkdir(parents=True)
    record = {
        "job_id": job_id,
        "state": "CANCELED",
        "created_at": "2026-07-30T00:00:00+00:00",
        "updated_at": "2026-07-30T00:00:00+00:00",
        "event_seq": 0,
        "events": [],
    }
    (path / "job.json").write_text(json.dumps(record), encoding="utf-8")
    manager = AsrJobManager(lambda: root)
    receipt = await manager.delete(job_id)
    assert receipt["deleted"] is True
    assert not path.exists()
    assert root.exists()
