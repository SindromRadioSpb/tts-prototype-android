"""Explicitly activate the approved Studio L1 ASR snapshot.

This command never resolves a mutable Hugging Face alias and never downloads by
itself.  Point --source at a pre-fetched snapshot of the exact approved revision.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai_local.model_store import activate_from_directory


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--models-root", type=Path, default=None)
    args = parser.parse_args()
    status = activate_from_directory(args.source, args.models_root)
    print(json.dumps(status.public_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
