"""Isolated, terminable exact-revision MADLAD -> CTranslate2 conversion worker."""

from __future__ import annotations

import argparse
from pathlib import Path


def convert(source: Path, output: Path) -> None:
    from ctranslate2.converters import TransformersConverter

    converter = TransformersConverter(
        model_name_or_path=str(source),
        # MADLAD 10B cannot be materialized as float32 inside the invite
        # cohort's 32 GB system-memory envelope. Accelerate-backed lazy shard
        # loading is also the conversion mode used for the benchmark artifact.
        low_cpu_mem_usage=True,
        copy_files=[
            "spiece.model",
            "special_tokens_map.json",
            "tokenizer_config.json",
            "generation_config.json",
        ],
    )
    converter.convert(
        output_dir=str(output), quantization="int8_float16", force=False
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(argv)
    convert(args.source, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
