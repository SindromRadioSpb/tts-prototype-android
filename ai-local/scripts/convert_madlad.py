"""
Convert google/madlad400-10b-mt to CTranslate2 format with int8_float16 quantization.

Usage:
    python scripts/convert_madlad.py
    python scripts/convert_madlad.py --quantization int8 --force

Output: ./models/madlad400-10b-ct2-int8f16/ (configurable via --output or env).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="google/madlad400-10b-mt")
    parser.add_argument("--output", default=None, help="Override AI_LOCAL_MADLAD_DIR")
    parser.add_argument(
        "--quantization",
        default="int8_float16",
        choices=["int8_float16", "int8", "float16", "int16"],
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    try:
        from ctranslate2.converters import TransformersConverter
    except ImportError:
        print(
            "ctranslate2 not installed. Run: pip install -e '.[runtime]'",
            file=sys.stderr,
        )
        return 2

    from ai_local import config as ai_config

    out = Path(args.output) if args.output else ai_config.MADLAD_MODEL_DIR
    if out.exists() and not args.force:
        print(f"Output already exists: {out}")
        print("Pass --force to re-convert.")
        return 1

    print(f"Converting {args.model} -> {out} ({args.quantization})")
    print("This downloads ~22 GB of weights the first time and takes 10-30 minutes.")

    converter = TransformersConverter(
        model_name_or_path=args.model,
        copy_files=[
            "spiece.model",
            "special_tokens_map.json",
            "tokenizer_config.json",
            "generation_config.json",
        ],
    )
    converter.convert(
        output_dir=str(out),
        quantization=args.quantization,
        force=args.force,
    )
    print(f"Done: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
