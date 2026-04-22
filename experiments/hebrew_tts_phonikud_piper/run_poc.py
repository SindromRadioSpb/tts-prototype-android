from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from poc_lib import PhonikudPiperPocEngine, SMOKE_PHRASES, safe_output_name


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Research-only Hebrew TTS PoC")
    parser.add_argument("--text", help="Single Hebrew phrase to synthesize")
    parser.add_argument("--limit", type=int, default=0, help="Run only the first N smoke phrases")
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    args = parse_args()
    engine = PhonikudPiperPocEngine()

    if args.text:
        phrase = args.text
        out_path = engine.out_dir / safe_output_name(1, phrase)
        result = engine.synthesize_to_file(phrase, out_path).to_dict()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    phrases = SMOKE_PHRASES[: args.limit] if args.limit and args.limit > 0 else SMOKE_PHRASES
    results = engine.run_smoke(list(phrases))
    results_path = engine.out_dir / "results.json"
    results_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"count": len(results), "resultsPath": str(results_path.resolve())}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
