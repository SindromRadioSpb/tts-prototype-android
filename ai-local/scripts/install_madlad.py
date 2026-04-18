"""
Step-by-step MADLAD-400 10B install: download weights + convert to CTranslate2.
Run from ai-local/ with the .venv activated:
    python scripts/install_madlad.py
"""
from __future__ import annotations
import sys
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
HF_CACHE = HERE / "hf-cache"
MODELS_DIR = HERE / "models"
CT2_OUT = MODELS_DIR / "madlad400-10b-ct2-int8f16"
MODEL_ID = "google/madlad400-10b-mt"

# Tell every HF library to write into our local cache, not ~/.cache/huggingface
os.environ["HF_HOME"] = str(HF_CACHE)
os.environ["HUGGINGFACE_HUB_CACHE"] = str(HF_CACHE)
os.environ["TRANSFORMERS_CACHE"] = str(HF_CACHE)

def step(n, msg):
    print(f"\n{'='*60}")
    print(f"  STEP {n}: {msg}")
    print(f"{'='*60}")

# ── Step 1: verify deps ────────────────────────────────────────────
step(1, "Checking dependencies")
try:
    import ctranslate2
    from ctranslate2.converters import TransformersConverter
    import huggingface_hub
    import transformers
    import sentencepiece
    print(f"  ctranslate2  {ctranslate2.__version__}")
    print(f"  transformers {transformers.__version__}")
    print(f"  hf_hub       {huggingface_hub.__version__}")
    print(f"  sentencepiece {sentencepiece.__version__}")
except ImportError as e:
    print(f"  MISSING: {e}")
    print("  Run: pip install -e '.[runtime]'")
    sys.exit(2)

# ── Step 2: download model weights ────────────────────────────────
step(2, f"Downloading {MODEL_ID} -> {HF_CACHE}")
print("  This will download ~22 GB — may take a while.")
HF_CACHE.mkdir(parents=True, exist_ok=True)
try:
    local_dir = huggingface_hub.snapshot_download(
        repo_id=MODEL_ID,
        cache_dir=str(HF_CACHE),
        ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*"],
    )
    print(f"  Downloaded to: {local_dir}")
except Exception as e:
    print(f"  ERROR: {e}")
    sys.exit(1)

# ── Step 3: convert to CTranslate2 int8_float16 ───────────────────
step(3, f"Converting to CTranslate2 int8_float16 -> {CT2_OUT}")
if CT2_OUT.exists():
    print(f"  Output already exists ({CT2_OUT}). Delete it first or pass --force to convert_madlad.py.")
    sys.exit(0)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
try:
    converter = TransformersConverter(
        model_name_or_path=local_dir,
        copy_files=[
            "spiece.model",
            "special_tokens_map.json",
            "tokenizer_config.json",
            "generation_config.json",
        ],
        low_cpu_mem_usage=True,
    )
    converter.convert(
        output_dir=str(CT2_OUT),
        quantization="int8_float16",
        force=False,
    )
    print(f"\n  Done! Model at: {CT2_OUT}")
    print(f"  Size: {sum(f.stat().st_size for f in CT2_OUT.rglob('*') if f.is_file()) / 1e9:.1f} GB")
except Exception as e:
    print(f"  ERROR during conversion: {e}")
    sys.exit(1)

step("OK", "MADLAD ready -- restart uvicorn and check /models/status")
