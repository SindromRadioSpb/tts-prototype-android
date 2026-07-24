#!/usr/bin/env python3
"""Frozen local scorer for H3 charter C1.

This is research code. It does not call ASR, a network provider, LinguistPro, or an LLM.
Detailed outputs are private scratch artifacts; only aggregate.json belongs in the report.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PHONIKUD_SHA256 = "113afb58d3140502aa1e7691cdc6b240b56cf97e5852fc870e1a7fb5a400dd62"
MMS_FA_SHA256 = "20ef12963ab4924bef49ac4fc7f58ad5da2ee43b2c11bc8c853c9b90ecdbc680"
VOWELS = "aeiou"
ALIGNMENT_SCORE_FLOOR = 0.08
STRESS_NORMAL_QUANTILE = 0.10


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_manifest(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    validate_manifest(rows)
    return rows


def validate_manifest(rows: list[dict[str, str]]) -> None:
    required = {
        "id", "condition", "axis", "audio_file", "sentence", "target_index",
        "target_word", "expected_target_vocalized", "spoken_target_vocalized",
        "expected_error_type",
    }
    if not rows:
        raise ValueError("manifest is empty")
    missing = required - set(rows[0])
    if missing:
        raise ValueError(f"missing columns: {sorted(missing)}")
    if len(rows) != 75:
        raise ValueError(f"expected 75 rows, got {len(rows)}")
    normal = [r for r in rows if r["condition"] == "NORMAL"]
    distorted = [r for r in rows if r["condition"] == "DISTORTED"]
    if len(normal) != 50 or len(distorted) != 25:
        raise ValueError(f"expected 50 normal/25 distorted, got {len(normal)}/{len(distorted)}")
    if len({r["id"] for r in rows}) != 75 or len({r["audio_file"] for r in rows}) != 75:
        raise ValueError("id and audio_file must be unique")
    if sum(r["axis"] == "VOWEL" for r in distorted) != 15:
        raise ValueError("expected 15 vowel distortions")
    if sum(r["axis"] == "STRESS" for r in distorted) != 10:
        raise ValueError("expected 10 stress distortions")
    for row in rows:
        words = row["sentence"].split()
        index = int(row["target_index"])
        if index < 0 or index >= len(words):
            raise ValueError(f"{row['id']}: target_index out of range")
        surface = re.sub(r"[^\u0590-\u05ff]", "", words[index])
        if surface != row["target_word"]:
            raise ValueError(f"{row['id']}: target mismatch {surface!r} != {row['target_word']!r}")
        expected_type = row["expected_error_type"]
        if row["condition"] == "NORMAL" and expected_type != "NONE":
            raise ValueError(f"{row['id']}: normal row has error label")
        if row["condition"] == "DISTORTED" and expected_type not in {
            "VOWEL_SUBSTITUTION", "STRESS_SHIFT"
        }:
            raise ValueError(f"{row['id']}: invalid distortion label")


def ipa_to_mms(ipa: str) -> str:
    replacements = (
        ("tʃ", "c"), ("dʒ", "j"), ("ts", "c"), ("ʃ", "sh"),
        ("χ", "x"), ("ʁ", "r"), ("ʔ", "'"), ("ɡ", "g"), ("ˈ", ""),
    )
    value = ipa.lower()
    for old, new in replacements:
        value = value.replace(old, new)
    return re.sub(r"[^a-z']", "", value)


def stress_vowel_index(ipa: str) -> int | None:
    marker = ipa.find("ˈ")
    if marker < 0:
        return None
    index = sum(ch in VOWELS for ch in ipa[:marker])
    return index if index < sum(ch in VOWELS for ch in ipa) else None


def minmax(values: list[float]) -> list[float]:
    lo, hi = min(values), max(values)
    if math.isclose(lo, hi):
        return [0.5 for _ in values]
    return [(value - lo) / (hi - lo) for value in values]


def voiced_strength(samples: Any, sample_rate: int) -> float:
    import numpy as np

    if len(samples) < sample_rate * 0.04:
        return 0.0
    x = np.asarray(samples, dtype=np.float64)
    x = x - x.mean()
    energy = float(np.dot(x, x))
    if energy <= 1e-10:
        return 0.0
    min_lag = max(1, int(sample_rate / 350))
    max_lag = min(len(x) - 1, int(sample_rate / 70))
    if max_lag <= min_lag:
        return 0.0
    correlations = [float(np.dot(x[:-lag], x[lag:]) / energy) for lag in range(min_lag, max_lag + 1)]
    return max(0.0, min(1.0, max(correlations)))


def stress_prominence(
    waveform: Any,
    sample_rate: int,
    vowel_centers_s: list[float],
    word_start_s: float,
    word_end_s: float,
) -> tuple[int | None, float, list[float]]:
    import numpy as np

    if len(vowel_centers_s) < 2:
        return None, 0.0, []
    boundaries = [word_start_s]
    boundaries.extend((a + b) / 2 for a, b in zip(vowel_centers_s, vowel_centers_s[1:]))
    boundaries.append(word_end_s)
    energies: list[float] = []
    voiced: list[float] = []
    durations: list[float] = []
    for start_s, end_s in zip(boundaries, boundaries[1:]):
        start = max(0, int(start_s * sample_rate))
        end = min(len(waveform), max(start + 1, int(end_s * sample_rate)))
        samples = waveform[start:end]
        rms = float(np.sqrt(np.mean(np.square(samples))) if len(samples) else 0.0)
        energies.append(math.log(rms + 1e-8))
        voiced.append(voiced_strength(samples, sample_rate))
        durations.append(max(0.0, end_s - start_s))
    e_norm, v_norm, d_norm = minmax(energies), minmax(voiced), minmax(durations)
    scores = [0.50 * e + 0.30 * v + 0.20 * d for e, v, d in zip(e_norm, v_norm, d_norm)]
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    lead = scores[order[0]] - scores[order[1]]
    return order[0], lead, scores


def extract_formants(waveform: Any, sample_rate: int, centers_s: list[float]) -> list[tuple[float, float] | None]:
    import numpy as np
    import parselmouth

    sound = parselmouth.Sound(np.asarray(waveform, dtype=np.float64), sampling_frequency=sample_rate)
    formant = sound.to_formant_burg(
        time_step=0.005,
        max_number_of_formants=5,
        maximum_formant=5500.0,
        window_length=0.025,
        pre_emphasis_from=50.0,
    )
    values: list[tuple[float, float] | None] = []
    for center in centers_s:
        f1 = float(formant.get_value_at_time(1, center))
        f2 = float(formant.get_value_at_time(2, center))
        if not math.isfinite(f1) or not math.isfinite(f2) or f1 <= 0 or f2 <= f1:
            values.append(None)
        else:
            values.append((f1, f2))
    return values


@dataclass
class Runtime:
    model: Any
    tokenizer: Any
    aligner: Any
    dictionary: dict[str, int]
    sample_rate: int


def load_runtime() -> Runtime:
    import torch
    import torchaudio

    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True).eval()
    checkpoint = Path(torch.hub.get_dir()) / "checkpoints" / "model.pt"
    if not checkpoint.is_file() or sha256(checkpoint) != MMS_FA_SHA256:
        raise ValueError("MMS_FA checkpoint missing or SHA-256 mismatch")
    return Runtime(
        model=model,
        tokenizer=bundle.get_tokenizer(),
        aligner=bundle.get_aligner(),
        dictionary=bundle.get_dict(),
        sample_rate=bundle.sample_rate,
    )


def load_waveform(path: Path, target_rate: int) -> Any:
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly

    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    if len(mono) == 0:
        raise ValueError("empty audio")
    if not np.isfinite(mono).all():
        raise ValueError("non-finite samples")
    peak = float(np.max(np.abs(mono)))
    if peak < 1e-5:
        raise ValueError("silent audio")
    if rate != target_rate:
        divisor = math.gcd(rate, target_rate)
        mono = resample_poly(mono, target_rate // divisor, rate // divisor).astype("float32")
    return mono


def sentence_ipas(row: dict[str, str], g2p_model: Any, phonemize: Any) -> tuple[list[str], str]:
    vocalized = g2p_model.add_diacritics(row["sentence"])
    tokens = vocalized.split()
    surface_tokens = row["sentence"].split()
    if len(tokens) != len(surface_tokens):
        raise ValueError(f"G2P token count {len(tokens)} != sentence count {len(surface_tokens)}")
    ipas = [phonemize(token) for token in tokens]
    ipas[int(row["target_index"])] = phonemize(row["expected_target_vocalized"])
    return ipas, vocalized


def score_item(row: dict[str, str], audio_path: Path, runtime: Runtime, g2p_model: Any, phonemize: Any) -> dict[str, Any]:
    import numpy as np
    import torch

    waveform = load_waveform(audio_path, runtime.sample_rate)
    ipas, _ = sentence_ipas(row, g2p_model, phonemize)
    words = [ipa_to_mms(ipa) for ipa in ipas]
    if any(not word for word in words):
        raise ValueError("empty MMS token after phonemization")
    tensor = torch.from_numpy(np.asarray(waveform)).unsqueeze(0)
    with torch.inference_mode():
        emission, _ = runtime.model(tensor)
        token_spans = runtime.aligner(emission[0], runtime.tokenizer(words))
    seconds_per_frame = len(waveform) / emission.size(1) / runtime.sample_rate
    target_index = int(row["target_index"])
    word, ipa, spans = words[target_index], ipas[target_index], token_spans[target_index]
    base = {
        "id": row["id"], "condition": row["condition"], "axis": row["axis"],
        "audio_file": row["audio_file"], "target_index": target_index,
        "expected_error_type": row["expected_error_type"], "flags": [],
        "sentence_flagged": False, "correct_detection": False,
    }
    if not spans or len(spans) != len(word):
        return {**base, "target_status": "UNSCORABLE", "reason": "ALIGNMENT_SPANS"}
    weighted = sum(float(span.score) * len(span) for span in spans)
    span_frames = sum(len(span) for span in spans)
    alignment_score = weighted / span_frames
    if alignment_score < ALIGNMENT_SCORE_FLOOR:
        return {
            **base, "target_status": "UNSCORABLE", "reason": "LOW_ALIGNMENT",
            "alignment_score": alignment_score,
        }
    vowel_centers_s = [
        ((span.start + span.end) / 2) * seconds_per_frame
        for token, span in zip(word, spans) if token in VOWELS
    ]
    expected_vowels = [token for token in word if token in VOWELS]
    formants = extract_formants(waveform, runtime.sample_rate, vowel_centers_s)
    vowel_features = [
        {"expected": expected, "f1": value[0], "f2": value[1]}
        for expected, value in zip(expected_vowels, formants) if value is not None
    ]
    if len(vowel_features) != len(expected_vowels):
        return {
            **base, "target_status": "UNSCORABLE", "reason": "FORMANT_EXTRACTION",
            "alignment_score": alignment_score,
        }
    expected_stress = stress_vowel_index(ipa)
    predicted_stress, stress_lead, prominence = stress_prominence(
        waveform,
        runtime.sample_rate,
        vowel_centers_s,
        spans[0].start * seconds_per_frame,
        spans[-1].end * seconds_per_frame,
    )
    expected_prominence_lead = None
    if expected_stress is not None and len(prominence) >= 2 and expected_stress < len(prominence):
        expected_prominence_lead = prominence[expected_stress] - max(
            value for index, value in enumerate(prominence) if index != expected_stress
        )
    return {
        **base,
        "target_status": "SCORABLE",
        "alignment_score": alignment_score,
        "vowels": vowel_features,
        "expected_stress_vowel": expected_stress,
        "predicted_stress_vowel": predicted_stress,
        "stress_lead": stress_lead,
        "expected_prominence_lead": expected_prominence_lead,
        "prominence": prominence,
    }


def vowel_anomaly_score(training: list[dict[str, Any]], item: dict[str, Any], annotate: bool = False) -> float | None:
    import numpy as np

    samples = [
        (vowel["expected"], float(vowel["f1"]), float(vowel["f2"]))
        for row in training if row.get("target_status") == "SCORABLE"
        for vowel in row.get("vowels", [])
    ]
    counts = {label: sum(sample_label == label for sample_label, _, _ in samples) for label in VOWELS}
    classes = sorted(label for label, count in counts.items() if count >= 3)
    if len(classes) < 3:
        return None
    values = np.asarray([(f1, f2) for _, f1, f2 in samples], dtype=np.float64)
    scale = np.std(values, axis=0)
    scale[scale < 1e-6] = 1.0
    centroids = {
        label: np.mean(np.asarray([(f1, f2) for sample_label, f1, f2 in samples if sample_label == label]), axis=0)
        for label in classes
    }
    scores = []
    for vowel in item.get("vowels", []):
        if vowel["expected"] not in centroids:
            if annotate:
                vowel["predicted"] = "UNSCORABLE_CLASS"
            continue
        point = np.asarray([vowel["f1"], vowel["f2"]])
        distances = {
            label: float(np.linalg.norm((point - centroids[label]) / scale)) for label in classes
        }
        predicted = min(classes, key=distances.get)
        if annotate:
            vowel["predicted"] = predicted
            vowel["expected_distance"] = distances[vowel["expected"]]
        alternative_distance = min(value for label, value in distances.items() if label != vowel["expected"])
        scores.append(distances[vowel["expected"]] - alternative_distance)
    return max(scores) if scores else None


def apply_batch_detectors(details: list[dict[str, Any]]) -> None:
    import numpy as np

    normal = [item for item in details if item["condition"] == "NORMAL" and item.get("target_status") == "SCORABLE"]
    stress_training_all = [
        float(item["expected_prominence_lead"])
        for item in normal if item.get("expected_prominence_lead") is not None
    ]
    for item in details:
        if item.get("target_status") != "SCORABLE":
            continue
        training = [candidate for candidate in normal if candidate["id"] != item["id"]]
        vowel_score = vowel_anomaly_score(training, item, annotate=True)
        calibration_scores = []
        for calibration_item in training:
            calibration_training = [candidate for candidate in training if candidate["id"] != calibration_item["id"]]
            score = vowel_anomaly_score(calibration_training, calibration_item)
            if score is not None:
                calibration_scores.append(score)
        vowel_flag = False
        if vowel_score is not None and len(calibration_scores) >= 20:
            vowel_threshold = float(np.quantile(calibration_scores, 0.80))
            item["vowel_anomaly_score"] = vowel_score
            item["vowel_threshold"] = vowel_threshold
            vowel_flag = vowel_score > vowel_threshold
        stress_values = [
            float(candidate["expected_prominence_lead"])
            for candidate in training if candidate.get("expected_prominence_lead") is not None
        ]
        stress_flag = False
        if item.get("expected_prominence_lead") is not None and len(stress_values) >= 10:
            threshold = float(np.quantile(stress_values, STRESS_NORMAL_QUANTILE))
            item["stress_threshold"] = threshold
            stress_flag = float(item["expected_prominence_lead"]) < threshold
        flags = []
        if vowel_flag:
            flags.append({"word_index": item["target_index"], "type": "VOWEL_SUBSTITUTION"})
        if stress_flag:
            flags.append({"word_index": item["target_index"], "type": "STRESS_SHIFT"})
        item["flags"] = flags
        item["sentence_flagged"] = bool(flags)
        item["correct_detection"] = bool(
            item["condition"] == "DISTORTED"
            and any(flag["type"] == item["expected_error_type"] for flag in flags)
        )


def aggregate_results(details: list[dict[str, Any]]) -> dict[str, Any]:
    from scipy.stats import binomtest

    apply_batch_detectors(details)
    normal = [item for item in details if item["condition"] == "NORMAL"]
    distorted = [item for item in details if item["condition"] == "DISTORTED"]
    normal_flagged = sum(item["sentence_flagged"] for item in normal)
    detected = sum(item["correct_detection"] for item in distorted)
    target_unscorable = sum(item["target_status"] != "SCORABLE" for item in details)
    by_axis = {}
    for axis in ("VOWEL", "STRESS"):
        subset = [item for item in distorted if item["axis"] == axis]
        by_axis[axis] = {
            "total": len(subset),
            "detected_correct_word_and_type": sum(item["correct_detection"] for item in subset),
        }
    sensitivity = detected / len(distorted)
    false_positive_rate = normal_flagged / len(normal)
    return {
        "schema_version": "c1.pronunciation.aggregate.1.0.0",
        "maturity": "UNDERPOWERED",
        "normal_total": len(normal),
        "normal_flagged": normal_flagged,
        "false_positive_rate": false_positive_rate,
        "distorted_total": len(distorted),
        "detected_correct_word_and_type": detected,
        "sensitivity": sensitivity,
        "one_sided_binomial_p_vs_0_5": binomtest(detected, len(distorted), 0.5, alternative="greater").pvalue,
        "target_unscorable": target_unscorable,
        "by_axis": by_axis,
        "thresholds": {
            "sensitivity_min": 0.80,
            "false_positive_rate_max": 0.20,
            "target_unscorable_stop_above": 5,
        },
        "charter_threshold_pass": bool(
            sensitivity >= 0.80 and false_positive_rate <= 0.20 and target_unscorable <= 5
        ),
        "production_go": False,
    }


def validate_audio(rows: list[dict[str, str]], audio_dir: Path) -> dict[str, Any]:
    expected = {row["audio_file"] for row in rows}
    actual = {path.name for path in audio_dir.glob("*.wav")}
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    invalid = []
    if not missing:
        import soundfile as sf
        for filename in sorted(expected):
            try:
                info = sf.info(audio_dir / filename)
                if info.frames <= 0 or info.channels <= 0 or info.samplerate <= 0:
                    invalid.append(filename)
            except Exception:
                invalid.append(filename)
    return {"expected": 75, "present": len(actual & expected), "missing": missing, "extra": extra, "invalid": invalid}


def command_score(args: argparse.Namespace) -> int:
    rows = read_manifest(args.manifest)
    inventory = validate_audio(rows, args.audio_dir)
    if inventory["missing"] or inventory["extra"] or inventory["invalid"]:
        print(json.dumps(inventory, ensure_ascii=False, indent=2))
        return 2
    if sha256(args.phonikud_model) != PHONIKUD_SHA256:
        raise ValueError("Phonikud model SHA-256 mismatch")
    from phonikud import phonemize
    from phonikud_onnx import Phonikud

    g2p_model = Phonikud(str(args.phonikud_model))
    runtime = load_runtime()
    details = []
    for number, row in enumerate(rows, start=1):
        print(f"[{number:02d}/75] {row['id']}", file=sys.stderr, flush=True)
        try:
            details.append(score_item(row, args.audio_dir / row["audio_file"], runtime, g2p_model, phonemize))
        except Exception as error:
            details.append({
                "id": row["id"], "condition": row["condition"], "axis": row["axis"],
                "audio_file": row["audio_file"], "target_status": "UNSCORABLE",
                "sentence_flagged": False, "correct_detection": False,
                "error": type(error).__name__,
            })
    aggregate = aggregate_results(details)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "details.json").write_text(
        json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "aggregate.json").write_text(
        json.dumps(aggregate, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(aggregate, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    check = subparsers.add_parser("validate-manifest")
    check.add_argument("--manifest", type=Path, required=True)
    audio = subparsers.add_parser("validate-audio")
    audio.add_argument("--manifest", type=Path, required=True)
    audio.add_argument("--audio-dir", type=Path, required=True)
    inspect = subparsers.add_parser("inspect-targets")
    inspect.add_argument("--manifest", type=Path, required=True)
    score = subparsers.add_parser("score")
    score.add_argument("--manifest", type=Path, required=True)
    score.add_argument("--audio-dir", type=Path, required=True)
    score.add_argument("--phonikud-model", type=Path, required=True)
    score.add_argument("--output-dir", type=Path, required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    rows = read_manifest(args.manifest)
    if args.command == "validate-manifest":
        print(json.dumps({"status": "PASS", "rows": len(rows), "normal": 50, "distorted": 25}))
        return 0
    if args.command == "validate-audio":
        result = validate_audio(rows, args.audio_dir)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if not result["missing"] and not result["extra"] and not result["invalid"] else 2
    if args.command == "inspect-targets":
        from phonikud import phonemize
        seen = set()
        for row in rows:
            expected = row["expected_target_vocalized"]
            spoken = row["spoken_target_vocalized"]
            key = (expected, spoken)
            if key in seen:
                continue
            seen.add(key)
            print(f"{row['target_word']}\t{expected}\t{phonemize(expected)}\t{spoken}\t{phonemize(spoken)}")
        return 0
    if args.command == "score":
        return command_score(args)
    raise AssertionError(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
