"""Offline Hebrew diagnostic: python -I course-asr-check.py OUT INVENTORY [--model PATH].

Uses the Companion's already installed ivrit-ai Whisper model. No downloads.
tailSilenceDb is RMS dBFS of the last 100 ms of decoded mono PCM, floored
at -120 dBFS (including digital silence). It is a tail level, not a duration.
ASR exact agreement is diagnostic and does not replace human listening.
"""
import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import unicodedata


def normalize(text):
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = "".join(" " if unicodedata.category(c).startswith("P") else c for c in text)
    return " ".join(text.split())


def model_path(requested):
    if requested:
        candidate = Path(requested).expanduser()
    else:
        local = os.environ.get("LOCALAPPDATA")
        if not local:
            raise ValueError("LOCALAPPDATA is unset; supply --model with an installed local model directory")
        root = Path(local) / "LinguistPro/LocalASR/models/asr/ivrit-ai--whisper-large-v3-turbo-ct2"
        candidates = sorted(p.parent for p in root.glob("*/model.bin"))
        if (root / "model.bin").is_file():
            candidates.append(root)
        if len(candidates) != 1:
            raise ValueError(f"Expected one installed model under {root}; found {len(candidates)}. Supply --model")
        candidate = candidates[0]
    for name in ("model.bin", "config.json", "tokenizer.json"):
        if not (candidate / name).is_file():
            raise ValueError(f"Local model missing {name}: {candidate}; no download will be attempted")
    return candidate.resolve()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("outDir", type=Path)
    parser.add_argument("inventory", type=Path)
    parser.add_argument("--model", help="Existing CTranslate2 model directory (local only)")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    args = parser.parse_args()
    try:
        if not args.outDir.is_dir():
            raise ValueError(f"Audio output directory does not exist: {args.outDir}")
        with args.inventory.open(encoding="utf-8-sig") as handle:
            inventory = json.load(handle)
        items = inventory.get("items") if isinstance(inventory, dict) else None
        if not isinstance(items, list) or not items:
            raise ValueError("Inventory must contain a nonempty items array")
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("ref"), str) or not item["ref"]:
                raise ValueError("Every inventory item needs a ref")
            if not isinstance(item.get("plain"), str) or not item["plain"].strip():
                raise ValueError(f"Missing authored plain text: {item['ref']}")
            if not re.fullmatch(r"[0-9a-f]{64}", str(item.get("assetKey", ""))):
                raise ValueError(f"Invalid assetKey: {item['ref']}")
            audio = args.outDir / (item["assetKey"] + ".mp3")
            if not audio.is_file() or audio.stat().st_size == 0:
                raise ValueError(f"Missing or empty audio: {audio}")
        model = model_path(args.model)
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise ValueError("ffmpeg not found on PATH; install it before running this offline check")
        # Defense in depth: the model is a validated directory and HF is offline.
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        import numpy as np
        from faster_whisper import WhisperModel
        engine = WhisperModel(str(model), device=args.device,
                              compute_type="int8" if args.device == "cpu" else "float16",
                              local_files_only=True)
        results = []
        for item in items:
            audio = args.outDir / (item["assetKey"] + ".mp3")
            decoded = subprocess.run([ffmpeg, "-nostdin", "-v", "error", "-i", str(audio),
                                      "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                                     capture_output=True, check=False)
            if decoded.returncode:
                raise ValueError(f"ffmpeg could not decode {audio}: {decoded.stderr.decode(errors='replace').strip()}")
            pcm = np.frombuffer(decoded.stdout, dtype="<f4").copy()
            if not pcm.size or not np.isfinite(pcm).all():
                raise ValueError(f"Invalid or empty PCM: {audio}")
            # Pass PCM directly: faster-whisper never opens the MP3 via PyAV.
            segments, _ = engine.transcribe(pcm, language="he", beam_size=5,
                                            vad_filter=False, condition_on_previous_text=False)
            hypothesis = " ".join(segment.text for segment in segments).strip()
            rms = float(np.sqrt(np.mean(np.square(pcm[-1600:].astype(np.float64)))))
            results.append({"ref": item["ref"], "key": item["assetKey"], "expected": item["plain"],
                            "asr": hypothesis, "exact": normalize(item["plain"]) == normalize(hypothesis),
                            "durationSec": round(pcm.size / 16000, 4),
                            "tailSilenceDb": round(max(-120.0, 20 * math.log10(max(rms, 1e-6))), 2)})
            print(f"{'OK' if results[-1]['exact'] else 'DIFF'} {item['ref']}")
        target = args.outDir / "asr-check.json"
        temporary = target.with_suffix(".json.part")
        temporary.write_text(json.dumps(results, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        temporary.replace(target)
        return 0
    except (OSError, ValueError, ImportError, RuntimeError) as error:
        print(f"ASR check failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
