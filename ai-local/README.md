# ai-local

Sidecar Python service for the `tts-prototype-android` Node server. Provides:

- **Nikud** (Hebrew vowel points) via `dicta-il/dictabert-large-char-menaked` on CPU.
- **Translation** (Hebrew → Russian) via `google/madlad400-10b-mt` through CTranslate2 on GPU.
- **Studio local ASR** (default-off L1) via the exact pinned
  `ivrit-ai/whisper-large-v3-turbo-ct2` revision. Full large-v3 is not a default or fallback.

Local-ASR design, boundaries and gates are canonical in
`docs/planning/STUDIO_INGEST_LOCAL_ASR_L1_DESIGN_DECISION_PACKET_2026_07_30.md`.
This README covers setup and running.

## Requirements

- Python 3.10–3.12.
- Windows or Linux. Tested target: Windows 11 + Ryzen 5 5600G + RTX 3070 (8 GB VRAM).
- CUDA 12.x for the translator. The nikud model runs on CPU.
- ~32 GB free disk for model download + conversion (intermediate MADLAD weights are ~22 GB;
  the final CT2 model is ~6.5 GB).

## Windows Local ASR Companion (invite-only beta)

Beta participants do not create a venv or run Uvicorn. Build the per-user Companion with:

```powershell
& .\scripts\build_companion.ps1
```

The build pins the Python/ASR runtime, FFmpeg/ffprobe 8.1, cuDNN 9.10.2.21 and cuBLAS 12.1.3.1,
runs a frozen start/health/stop smoke, and emits an Inno Setup installer plus a SHA-256 build report
under ignored `ai-local/artifacts/`. The current local artifact is unsigned and is strictly for
internal testing. Do not send it to external beta users without code signing and NVIDIA/FFmpeg
redistribution-license review.

The installed GUI provides start/stop/restart, session pairing, nine-check Windows/GPU/CUDA/
runtime/disk/port preflight, explicit pinned-model download/cancel/delete, warmup, job cleanup and
redacted diagnostic export. It binds only `127.0.0.1:8799` and stores model/jobs/state only under
`%LOCALAPPDATA%\LinguistPro\LocalASR`. Uninstall removes that exact managed tree.

Product enrollment requires both `LOCAL_ASR_BETA_ENABLED=true` on the Node runtime and an explicit
same-browser invite enrollment. The flag defaults false; an empty
`LOCAL_ASR_COMPANION_DOWNLOAD_URL` means the installer is supplied separately with the invitation.
Gemini remains the default and Local failures never trigger it automatically.

## Setup

### 1. Create venv

```bash
cd ai-local
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux/macOS
pip install --upgrade pip
```

### 2. Install PyTorch with CUDA (separately, from PyTorch index)

`torch` is **not** listed in `pyproject.toml` because the CUDA build must come from PyTorch's
own index, not PyPI. Run one of:

```bash
# CUDA 12.1 (matches most RTX 30xx/40xx setups)
pip install torch==2.3.* --index-url https://download.pytorch.org/whl/cu121

# CPU-only (if you only want the nikud model for dev)
pip install torch==2.3.* --index-url https://download.pytorch.org/whl/cpu
```

### 3. Install the package

```bash
pip install -e ".[runtime,dev]"
```

The `runtime` extra pulls `transformers`, pinned `faster-whisper`/`ctranslate2`,
`sentencepiece`, and `huggingface_hub`.
The `dev` extra adds pytest. Omit `runtime` if you only want to run the test suite against
mocks (no real models).

### 4. Download & convert models

```bash
# DictaBERT-menaked: downloaded automatically by transformers on first /nakdan call,
# or pre-fetched with:
python scripts/download_nakdan.py

# MADLAD-400 10B: one-time conversion to CTranslate2 int8_float16 (~6.5 GB output)
python scripts/convert_madlad.py
```

The conversion step downloads ~22 GB of original weights into `./hf-cache/`, then writes
`./models/madlad400-10b-ct2-int8f16/`. You can delete `hf-cache/` after conversion if disk
is tight.

### 5. Explicitly activate the approved ASR snapshot (optional, default-off)

Pre-fetch the exact revision outside this command, then activate it into the managed model
store. Activation verifies every runtime-critical file against the committed pin, requires
`2 × declared snapshot bytes + 2 GiB` free for temp+atomic activation, and is atomic:

```bash
python scripts/install_asr.py --source <EXACT_PINNED_SNAPSHOT_DIRECTORY>
```

Enable the browser-facing API only after activation:

```powershell
$env:AI_LOCAL_ASR_ENABLED = "1"
python -m uvicorn ai_local.main:app --host 127.0.0.1 --port 8799
```

The generated pairing token is stored under the user-local `AI_LOCAL_STATE_DIR` unless
`AI_LOCAL_PAIRING_TOKEN` is supplied explicitly. The service never returns the token through
an unauthenticated endpoint.

The L1-D Studio adapter remains browser-local and default-off. For a bounded local evaluation,
explicitly opt in from the Studio origin, reload, choose **Local companion**, and paste the token
into the password field (the browser keeps it in `sessionStorage`, not durable product state):

```js
localStorage.setItem("linguistpro.experimental.localAsr", "1"); location.reload();
```

Changing the selector back to Gemini after a local attempt requires a separate bytes/model/cost
consent. The local client never invokes Gemini as an automatic fallback.
CUDA OOM destroys the isolated worker and allows one clean retry with the same exact pin; a
second OOM fails the local job without compute-type/model/cloud fallback.

## Running

```bash
python -m uvicorn ai_local.main:app --host 127.0.0.1 --port 8799
```

Verify:

```bash
curl http://127.0.0.1:8799/healthz
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/healthz`                | Liveness + per-model readiness |
| GET  | `/models/status`          | Detailed lifecycle state per model |
| POST | `/models/warmup`          | Force load + warmup of a specific model |
| POST | `/models/unload`          | Manually unload a model |
| POST | `/models/unload-all`      | Unload every idle model |
| POST | `/nakdan`                 | Add nikud to Hebrew texts |
| POST | `/translate`              | Translate Hebrew segments → target language |
| GET  | `/v1/capabilities`        | Default-off companion/model capability probe |
| GET  | `/v1/companion/preflight` | Windows/GPU/CUDA/runtime/disk/port readiness |
| GET/POST/DELETE | `/v1/asr/model/install*` | Explicit pinned download, status, cancel and delete lifecycle |
| DELETE | `/v1/companion/jobs`     | Delete all inactive managed jobs with a receipt |
| GET/POST | `/v1/asr/model/*`     | Verify, warm or unload the exact pinned ASR model |
| POST | `/v1/asr/jobs`            | Stream one media source into the bounded local job queue |
| GET  | `/v1/asr/jobs/{id}`       | Read job state, progress and failure evidence |
| POST | `/v1/asr/jobs/{id}/cancel` | Request bounded cancellation |
| POST | `/v1/asr/jobs/{id}/resume` | Resume only hash- and pin-matched checkpoints |
| POST | `/v1/asr/jobs/{id}/retry-chunks` | Retry named gate-failed physical chunks once per S12.6/S12.7 gate |
| POST | `/v1/asr/jobs/{id}/audio-stream` | Resolve an ambiguous multi-audio source explicitly |
| GET  | `/v1/asr/jobs/{id}/result` | Read the raw provider result |
| DELETE | `/v1/asr/jobs/{id}`       | Explicitly delete job artifacts and return a receipt |

Request/response schemas are in `ai_local/main.py`.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `AI_LOCAL_HOST`              | `127.0.0.1` | Bind host |
| `AI_LOCAL_PORT`              | `8799`      | Bind port (`8765` is reserved for AnkiConnect) |
| `AI_LOCAL_MODELS_DIR`        | `./models`  | Where CT2 MADLAD lives |
| `AI_LOCAL_HF_CACHE`          | `./hf-cache`| HuggingFace download cache |
| `AI_LOCAL_NAKDAN_EAGER`      | `1`         | Eager-load nikud at startup |
| `AI_LOCAL_TRANSLATOR_IDLE`   | `900`       | MADLAD idle-unload seconds |
| `AI_LOCAL_TRANSLATOR_DEVICE` | `cuda`      | `cuda` / `cpu` |
| `AI_LOCAL_VRAM_MIN_MB`       | `768`       | Memory-pressure threshold |
| `AI_LOCAL_ASR_ENABLED`       | `0`         | Enable the default-off Studio L1 local-ASR API |
| `AI_LOCAL_ALLOWED_ORIGINS`   | localhost only | Comma-separated browser Origin allowlist |
| `AI_LOCAL_PAIRING_TOKEN`     | generated   | Optional explicit browser pairing token |
| `AI_LOCAL_STATE_DIR`         | user-local app data | Pairing/job state root |

The L1 job boundary is one active plus one waiting media job. Inputs are capped at 300 MiB
and three hours. `ffprobe` selects a sole/unique-default audio stream; ambiguous media pauses
for an explicit stream choice. `ffmpeg` materializes 16 kHz mono PCM on a 900-second core
cadence with 30 seconds of left overlap. Checkpoints are hash-bound, restart-resumable, automatically
expire after 24 hours, and can be explicitly deleted with a receipt. MADLAD and ASR share
one exclusive heavy-GPU residency slot; the ASR worker is unloaded after five idle minutes.

## Tests

```bash
pytest
```

Tests use mock model implementations and do **not** require torch or the actual models.
