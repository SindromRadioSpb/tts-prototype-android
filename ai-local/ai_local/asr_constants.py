"""Pinned Studio Ingest L1 local-ASR contract.

Changing any value in this module creates a new measured candidate.  The L1
implementation must never silently substitute a model, revision, compute type,
or decode policy.
"""

from __future__ import annotations

ASR_PROTOCOL_VERSION = "studio-local-asr-v1"

ASR_MODEL_ID = "ivrit-ai/whisper-large-v3-turbo-ct2"
ASR_MODEL_REVISION = "72ad623a37947395efcc3933132353790e5a12f5"
ASR_MODEL_BIN_SHA256 = "db2a2265aa012c16c7db9edda3d699c99f984efdd3f2e22a72a8ce7e9720f3a2"
ASR_MODEL_BIN_REPOSITORY_BYTES = 1_617_884_968
ASR_MODEL_LICENSE = "apache-2.0"
ASR_RUNTIME_FILE_SHA256 = {
    "model.bin": ASR_MODEL_BIN_SHA256,
    "config.json": "c805eff43fc2a1d00d5cfa315e4b2230895f34994257c185959808a116e7c4f0",
    "preprocessor_config.json": "654cf18d3e163b948ceaf9766da56ce0b52de265d58673cf61c9376f126bd499",
    "tokenizer.json": "297b13372ac43916285644fb9687add3cc62ee2a1adb60da3dc25cc94c1871fd",
    "vocabulary.json": "c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1",
}
ASR_RUNTIME_FILE_BYTES = {
    "model.bin": 1_617_884_968,
    "config.json": 1_405,
    "preprocessor_config.json": 357,
    "tokenizer.json": 2_710_337,
    "vocabulary.json": 1_068_114,
}
ASR_SNAPSHOT_BYTES = sum(ASR_RUNTIME_FILE_BYTES.values())

ASR_DEVICE = "cuda"
ASR_COMPUTE_TYPE = "float16"
ASR_LANGUAGE = "he"
ASR_BEAM_SIZE = 5
ASR_CONDITION_ON_PREVIOUS_TEXT = False
ASR_VAD_FILTER = False
ASR_WORD_TIMESTAMPS = False
ASR_NUM_WORKERS = 1

ASR_FASTER_WHISPER_VERSION = "1.1.1"
ASR_CTRANSLATE2_VERSION = "4.5.0"
ASR_FFMPEG_VERSION = "8.1"

ASR_WINDOW_SEC = 900
ASR_WINDOW_OVERLAP_SEC = 30
ASR_CLOCK_SPLIT_SEC = 310
ASR_CLOCK_SPLIT_MAX_WINDOWS = 4

ASR_PEAK_VRAM_DELTA_MIB = 2330
ASR_VRAM_SAFETY_RESERVE_MIB = 1536
ASR_REQUIRED_FREE_VRAM_MIB = ASR_PEAK_VRAM_DELTA_MIB + ASR_VRAM_SAFETY_RESERVE_MIB

ASR_MODEL_IDLE_TIMEOUT_SEC = 300
ASR_JOB_TTL_SEC = 24 * 60 * 60
ASR_CANCEL_TERMINAL_TIMEOUT_SEC = 15
ASR_MAX_SOURCE_BYTES = 300 * 1024 * 1024
ASR_MAX_DURATION_SEC = 3 * 60 * 60


def decode_parameters() -> dict[str, object]:
    return {
        "device": ASR_DEVICE,
        "compute_type": ASR_COMPUTE_TYPE,
        "language": ASR_LANGUAGE,
        "beam_size": ASR_BEAM_SIZE,
        "condition_on_previous_text": ASR_CONDITION_ON_PREVIOUS_TEXT,
        "vad_filter": ASR_VAD_FILTER,
        "word_timestamps": ASR_WORD_TIMESTAMPS,
        "num_workers": ASR_NUM_WORKERS,
    }


def model_identity() -> dict[str, object]:
    return {
        "model_id": ASR_MODEL_ID,
        "revision": ASR_MODEL_REVISION,
        "model_bin_sha256": ASR_MODEL_BIN_SHA256,
        "model_bin_repository_bytes": ASR_MODEL_BIN_REPOSITORY_BYTES,
        "runtime_file_sha256": dict(ASR_RUNTIME_FILE_SHA256),
        "runtime_file_bytes": dict(ASR_RUNTIME_FILE_BYTES),
        "snapshot_bytes": ASR_SNAPSHOT_BYTES,
        "license": ASR_MODEL_LICENSE,
        "format": "CTranslate2",
        "decode": decode_parameters(),
    }
