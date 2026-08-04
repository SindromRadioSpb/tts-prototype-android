"""Immutable MADLAD productization pins and browser protocol limits."""

from __future__ import annotations

MT_PROTOCOL_VERSION = "studio-local-mt-v1"
MT_MODEL_ID = "google/madlad400-10b-mt"
MT_MODEL_REVISION = "9f2797629c31e69617186dbe5f0ca43bf662f36d"
MT_MODEL_LICENSE = "Apache-2.0"
MT_MODEL_FORMAT = "CTranslate2"
MT_MODEL_QUANTIZATION = "int8_float16"
MT_MODEL_IDENTITY = "madlad-400-10b-ct2-int8f16@v1"

# This is the exact artifact used by the frozen L4.0a benchmark. A different
# conversion is a different model identity and must not be silently accepted.
MT_RUNTIME_FILE_BYTES = {
    "config.json": 234,
    "generation_config.json": 142,
    "model.bin": 10_729_462_562,
    "shared_vocabulary.json": 5_733_100,
    "special_tokens_map.json": 414,
    "spiece.model": 4_427_844,
    "tokenizer_config.json": 830,
}
MT_RUNTIME_FILE_SHA256 = {
    "config.json": "5b74d87fd940afd7074813842dd5ca399fe288381e5a35d73fdef957cb6083b9",
    "generation_config.json": "0849b38987568ccfe4ebefc22bbda1cec4bee01c345e93bfab207d4692b0a1d5",
    "model.bin": "8edcf2e2437385df83407e5129bf23fb2f939d3dabba50870fdb36610d0a54b3",
    "shared_vocabulary.json": "96a87e56790161e612568fd3a9917c3eb05100632dbda0eb0f202dfc1890d91d",
    "special_tokens_map.json": "7f79f1d5063d56c4b980eec0692f3c7429bdef335071d34e566bd00fd4b5e3e0",
    "spiece.model": "ef11ac9a22c7503492f56d48dce53be20e339b63605983e9f27d2cd0e0f3922c",
    "tokenizer_config.json": "641fc660745306dfb935f666a68f8bc10a44c39241cfb357be518fda8c09662d",
}
MT_SNAPSHOT_BYTES = sum(MT_RUNTIME_FILE_BYTES.values())

# Exact upstream Transformers snapshot required to reproduce the approved CT2
# artifact. GGUF variants and mutable branch content are deliberately excluded.
MT_SOURCE_FILE_BYTES = {
    "README.md": 9_367,
    "added_tokens.json": 4,
    "config.json": 806,
    "generation_config.json": 142,
    "model.safetensors.index.json": 67_407,
    "model-00001-of-00009.safetensors": 4_915_824_880,
    "model-00002-of-00009.safetensors": 4_966_213_544,
    "model-00003-of-00009.safetensors": 4_966_213_584,
    "model-00004-of-00009.safetensors": 4_966_234_776,
    "model-00005-of-00009.safetensors": 4_999_811_840,
    "model-00006-of-00009.safetensors": 4_932_694_504,
    "model-00007-of-00009.safetensors": 4_999_803_272,
    "model-00008-of-00009.safetensors": 4_932_703_208,
    "model-00009-of-00009.safetensors": 3_170_937_232,
    "special_tokens_map.json": 414,
    "spiece.model": 4_427_844,
    "tokenizer_config.json": 830,
}
MT_SOURCE_FILE_SHA256 = {
    "README.md": "eefbae9d05e4152e59c07692c306fae1e0e6467377136c7cc236a80dcb7f6bb4",
    "added_tokens.json": "d914176fd50bd7f565700006a31aa97b79d3ad17cee20c8e5ff2061d5cb74817",
    "config.json": "1b67ea0acb188cd4b3a49274a867b069fb3a48614d130357369dfabdd146c20f",
    "generation_config.json": "0849b38987568ccfe4ebefc22bbda1cec4bee01c345e93bfab207d4692b0a1d5",
    "model.safetensors.index.json": "bc341bc0736cc5aeab99c8854b01d24181621055f4e7418ed01ee59dcad5fdf3",
    "model-00001-of-00009.safetensors": "c9e86fef943ce2ed0d9af7bb9b95fd4c23f08adecbf3ed3c69701c083a70084c",
    "model-00002-of-00009.safetensors": "0113037361356eb550caf34fd9a6c82562d9c49a337c3d7c8115f9fc6afbe10f",
    "model-00003-of-00009.safetensors": "e8b8d92c9a72aedd06fb1efd2b11dcfb83d12374732cd45d6e86bb95f95a0cad",
    "model-00004-of-00009.safetensors": "229207583daae9ed3282f0cfb467d366cb803417baad32865b9a735bafafceab",
    "model-00005-of-00009.safetensors": "cd6ed8d7d72d4e0f471aafad94acbd5140d403c218e84173e58a696ab3d361b8",
    "model-00006-of-00009.safetensors": "5e7d39bdb30107d9d4f2f0ae4785d47861c05060678d11203f33b4ee2fa883ef",
    "model-00007-of-00009.safetensors": "8607844d74a28c18f46465b355465f5ec9395832bd4aa661ccb48c81bf0a9ed9",
    "model-00008-of-00009.safetensors": "23295d4fb84d4a657c0af7f362d12d6ad4395e2a3c8b26e8256f832c2bc3eb5f",
    "model-00009-of-00009.safetensors": "d115240ace78581b178664a89a2d0be15beebcf536a7deddee8d4108d7ef7d5b",
    "special_tokens_map.json": "7f79f1d5063d56c4b980eec0692f3c7429bdef335071d34e566bd00fd4b5e3e0",
    "spiece.model": "ef11ac9a22c7503492f56d48dce53be20e339b63605983e9f27d2cd0e0f3922c",
    "tokenizer_config.json": "641fc660745306dfb935f666a68f8bc10a44c39241cfb357be518fda8c09662d",
}
MT_SOURCE_BYTES = sum(MT_SOURCE_FILE_BYTES.values())

MT_ALLOWED_DIRECTIONS = frozenset({("he", "ru"), ("ru", "he")})
MT_MAX_SEGMENTS_PER_JOB = 120
MT_MAX_SEGMENT_CHARS = 8_000
MT_MAX_TOTAL_CHARS = 240_000
MT_INFERENCE_BATCH_SIZE = 4
# TransformersConverter materializes the 10B model before CT2 quantization.
# Fail before a 42.85 GB download unless the machine has enough currently
# available physical RAM; pagefile-only headroom proved crash-prone on Windows.
MT_CONVERSION_MIN_AVAILABLE_RAM_BYTES = 24 * 1024**3


def model_identity() -> dict[str, object]:
    return {
        "id": MT_MODEL_ID,
        "revision": MT_MODEL_REVISION,
        "identity": MT_MODEL_IDENTITY,
        "license": MT_MODEL_LICENSE,
        "format": MT_MODEL_FORMAT,
        "quantization": MT_MODEL_QUANTIZATION,
        "runtime_bytes": MT_SNAPSHOT_BYTES,
    }
