# ai-local

Sidecar Python service for the `tts-prototype-android` Node server. Provides:

- **Nikud** (Hebrew vowel points) via `dicta-il/dictabert-large-char-menaked` on CPU.
- **Translation** (Hebrew → Russian) via `google/madlad400-10b-mt` through CTranslate2 on GPU.

Design and policy live in the plan discussed in chat; see in particular §2.5 (model lifecycle)
and §8 (cache/persistence). This README covers only setup and running.

## Requirements

- Python 3.10–3.12.
- Windows or Linux. Tested target: Windows 11 + Ryzen 5 5600G + RTX 3070 (8 GB VRAM).
- CUDA 12.x for the translator. The nikud model runs on CPU.
- ~32 GB free disk for model download + conversion (intermediate MADLAD weights are ~22 GB;
  the final CT2 model is ~6.5 GB).

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

The `runtime` extra pulls `transformers`, `ctranslate2`, `sentencepiece`, `huggingface_hub`.
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

## Running

```bash
python -m uvicorn ai_local.main:app --host 127.0.0.1 --port 8765
```

Verify:

```bash
curl http://127.0.0.1:8765/healthz
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

Request/response schemas are in `ai_local/main.py`.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `AI_LOCAL_HOST`              | `127.0.0.1` | Bind host |
| `AI_LOCAL_PORT`              | `8765`      | Bind port |
| `AI_LOCAL_MODELS_DIR`        | `./models`  | Where CT2 MADLAD lives |
| `AI_LOCAL_HF_CACHE`          | `./hf-cache`| HuggingFace download cache |
| `AI_LOCAL_NAKDAN_EAGER`      | `1`         | Eager-load nikud at startup |
| `AI_LOCAL_TRANSLATOR_IDLE`   | `900`       | MADLAD idle-unload seconds |
| `AI_LOCAL_TRANSLATOR_DEVICE` | `cuda`      | `cuda` / `cpu` |
| `AI_LOCAL_VRAM_MIN_MB`       | `768`       | Memory-pressure threshold |

## Tests

```bash
pytest
```

Tests use mock model implementations and do **not** require torch or the actual models.
