import os
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return int(raw)


HERE = Path(__file__).resolve().parent.parent

HOST = os.environ.get("AI_LOCAL_HOST", "127.0.0.1")
# Default 8799 (NOT 8765 — AnkiConnect's well-known port, which this project uses;
# a sidecar on 8765 collides with it). Override with AI_LOCAL_PORT.
PORT = _env_int("AI_LOCAL_PORT", 8799)

MODELS_DIR = Path(os.environ.get("AI_LOCAL_MODELS_DIR", HERE / "models"))
HF_CACHE_DIR = Path(os.environ.get("AI_LOCAL_HF_CACHE", HERE / "hf-cache"))

NAKDAN_MODEL_ID = "dicta-il/dictabert-large-char-menaked"
NAKDAN_DEVICE = os.environ.get("AI_LOCAL_NAKDAN_DEVICE", "cpu")
NAKDAN_EAGER = _env_bool("AI_LOCAL_NAKDAN_EAGER", True)
NAKDAN_IDLE_UNLOAD = _env_bool("AI_LOCAL_NAKDAN_IDLE_UNLOAD", False)

MADLAD_MODEL_DIR = Path(
    os.environ.get(
        "AI_LOCAL_MADLAD_DIR",
        MODELS_DIR / "madlad400-10b-ct2-int8f16",
    )
)
MADLAD_DEVICE = os.environ.get("AI_LOCAL_TRANSLATOR_DEVICE", "cuda")
MADLAD_COMPUTE_TYPE = os.environ.get("AI_LOCAL_TRANSLATOR_COMPUTE_TYPE", "int8_float16")
MADLAD_BEAM_SIZE = _env_int("AI_LOCAL_TRANSLATOR_BEAM_SIZE", 4)
MADLAD_MAX_DECODING_LENGTH = _env_int("AI_LOCAL_TRANSLATOR_MAX_DEC_LEN", 256)
MADLAD_MAX_BATCH_SIZE = _env_int("AI_LOCAL_TRANSLATOR_MAX_BATCH", 4)
MADLAD_IDLE_TIMEOUT_SEC = _env_int("AI_LOCAL_TRANSLATOR_IDLE", 900)

ENABLE_TRANSLATOR_WARMUP = _env_bool("AI_LOCAL_TRANSLATOR_WARMUP", True)
ENABLE_MEMORY_PRESSURE_UNLOAD = _env_bool("AI_LOCAL_MEM_PRESSURE", True)

VRAM_FREE_MB_MIN = _env_int("AI_LOCAL_VRAM_MIN_MB", 768)
RAM_FREE_MB_MIN = _env_int("AI_LOCAL_RAM_MIN_MB", 2048)
PRESSURE_CHECK_INTERVAL_SEC = _env_int("AI_LOCAL_PRESSURE_INTERVAL", 30)

WARMUP_NAKDAN_INPUT = "שלום עולם"
WARMUP_TRANSLATOR_INPUT = "שלום"
WARMUP_TRANSLATOR_TARGET = "ru"

SHUTDOWN_DRAIN_TIMEOUT_SEC = _env_int("AI_LOCAL_SHUTDOWN_DRAIN", 30)

MADLAD_MODEL_VERSION = "madlad-400-10b-ct2-int8f16@v1"
NAKDAN_MODEL_VERSION = "dictabert-large-char-menaked@2025-03"
