# Studio Ingest local-processing L0 benchmark

This directory records the 2026-07-30 measure-before-code benchmark. Outcome: **L0 GO for an L1 design around the pinned ivrit-ai turbo CT2 model; no permanent integration is authorized.** See [GO_NO_GO_DECISION.md](GO_NO_GO_DECISION.md) and `quality-report.json`.

## What is committed

- hardware/runtime/port truth in `hardware.json`;
- pinned model metadata in `model-manifest-*.json`;
- exact input hashes, durations and sizes in `run-manifest-*.json` without transcripts;
- provider-neutral `benchmark_runner.py` and its minimal `requirements-l0.txt`;
- normalized metrics and limitations in `quality-report.json`.

Models, keys, raw transcripts, subtitle oracle and user media are deliberately excluded. Raw files live under ignored `.tmp/studio-local-processing-l0/`; model weights live in the external Hugging Face cache on `F:`.

## Reproduce

Prerequisites: Windows NVIDIA driver/CUDA stack recorded in `hardware.json`, `ffmpeg`/`ffprobe`, Python 3.10, and the packages in `requirements-l0.txt`. The runner expects the local owner-audio C1 corpus, the two long-media sources described in `input-manifest.json`, the local podcast sample, and the independent `iw-orig` JSON3 oracle. It fails closed if required media is absent.

```powershell
ai-local\.venv\Scripts\python.exe docs\research\studio-local-processing\2026-07-30\benchmark_runner.py prepare

ai-local\.venv\Scripts\python.exe docs\research\studio-local-processing\2026-07-30\benchmark_runner.py run `
  --provider local --run-id ivrit-turbo-fp16 `
  --model-path <PINNED_TURBO_SNAPSHOT> `
  --model-id ivrit-ai/whisper-large-v3-turbo-ct2 `
  --model-revision 72ad623a37947395efcc3933132353790e5a12f5 `
  --compute-type float16
```

The full model uses the same command with its pinned path/revision. Gemini uses `--provider gemini --gemini-model gemini-flash-latest`; the key is read from `INGEST_SMOKE_GEMINI_KEY`, `GEMINI_API_KEY`, or local `.env`, never written to an artifact. Use `--reuse-raw` to rescore local ignored raw files without uploading or rerunning inference.

## Metric semantics

- Hebrew NFKC normalization removes niqqud/cantillation for CER/WER.
- Inputs over 15 minutes are physically cut with ffmpeg before any provider call.
- Completeness is checked through zero-text significant chunks, word-count ratio when an independent text oracle exists, and duplicate 4-gram rate.
- Clock integrity is checked per physical chunk for monotonicity and excessive output-span compression/expansion.
- Podcast WER/CER and p50/p95 timestamps use an independent `iw-orig` subtitle track and are explicitly silver quality, not human gold.
- S12 and the long boundary have no full transcript oracle, so their CER/WER fields are intentionally absent.
- RTF uses provider elapsed time divided by source duration. Long-run orchestration timeouts prevented aggregate resource fields from being finalized, so peak VRAM/RAM evidence comes from bounded sampled runs while per-case provider times come from preserved raw files.

## Known drift and run incidents

- Hardware is an RTX 3070 8 GB, not the previously stated RTX 3080.
- Canonical `ai-local` port is `8799`; `ai-local/README.md` still contains stale `8765`, which is the AnkiConnect port and was listening through Docker Desktop during final capture.
- Three orphan benchmark subprocesses contaminated the first full-model attempt. Those measurements were discarded; the exact runner processes were stopped and both local candidates were measured again from a clean ~1 GB GPU baseline.
- Gemini quota exhausted after S12, so boundary and batch are honestly `NOT_RUN`, not inferred.
- The benchmark's frozen noisy file is identified by SHA-256 in each run. New clean-room generation uses a fixed seed but is not claimed byte-identical to the already frozen 2026-07-30 mix.
