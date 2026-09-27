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

    from ai_local.models.nakdan import materialize_snapshot

    print(f"Preparing {ai_config.NAKDAN_MODEL_ID} as real files next to {cache}")
    # Real files, never cache symlinks: an installed service may not traverse them (O-031d).
    print(f"Ready: {materialize_snapshot(cache, ai_config.NAKDAN_MODEL_ID)}")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
