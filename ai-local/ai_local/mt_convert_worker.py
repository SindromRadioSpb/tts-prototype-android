"""Isolated, terminable exact-revision MADLAD -> CTranslate2 conversion worker."""

from __future__ import annotations

import argparse
from pathlib import Path


def convert(source: Path, output: Path) -> None:
    from ctranslate2.converters import TransformersConverter

    converter = TransformersConverter(
        model_name_or_path=str(source),
        # The pinned upstream config declares float32 weights (~39.9 GiB).
        # Explicit FP16 loading halves that representation to ~20 GiB; the
        # low-memory loader then avoids a second full-size initialization copy.
        load_as_float16=True,
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
