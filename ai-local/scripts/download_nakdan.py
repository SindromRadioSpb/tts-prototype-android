"""
Pre-fetch dicta-il/dictabert-large-char-menaked so the first /nakdan call is fast.
"""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    try:
        from transformers import AutoModel, AutoTokenizer
    except ImportError:
        print(
            "transformers not installed. Run: pip install -e '.[runtime]'",
            file=sys.stderr,
        )
        return 2

    from ai_local import config as ai_config

    cache = Path(ai_config.HF_CACHE_DIR)
    cache.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {ai_config.NAKDAN_MODEL_ID} into {cache}")
    AutoTokenizer.from_pretrained(ai_config.NAKDAN_MODEL_ID, cache_dir=str(cache))
    AutoModel.from_pretrained(
        ai_config.NAKDAN_MODEL_ID,
        trust_remote_code=True,
        cache_dir=str(cache),
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
