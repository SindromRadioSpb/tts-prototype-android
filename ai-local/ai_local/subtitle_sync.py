"""Conservative subtitle timing evidence from independent local speech onsets.

This module never recognizes words, changes text, or calls a remote provider.
Positive offsets move subtitle times later. Natural anticipation has a 300 ms
dead band; ambiguous matches cannot authorize any change to stored timing.
"""
from __future__ import annotations

import math
import statistics
import subprocess


def runtime_report():
    """Exercise the bundled ONNX speech detector without downloading a model."""
    import numpy as np
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    speech = get_speech_timestamps(np.zeros(16000, dtype=np.float32), VadOptions())
    if speech:
        raise RuntimeError("VAD detected speech in digital silence")
    return {"status": "ok", "detector": "silero", "sample_rate": 16000,
            "silence_speech_segments": len(speech)}


def _numbers(values):
    return sorted(float(v) for v in values
                  if isinstance(v, (int, float)) and not isinstance(v, bool)
                  and math.isfinite(v) and 0 <= v <= 120)


def score_window(sample):
    cues, speech = _numbers(sample.get("cues", [])), _numbers(sample.get("speech", []))
    # Bound scoring work even for word-by-word subtitle tracks.
    if len(cues) > 256:
        cues = [cues[round(index*(len(cues)-1)/255)] for index in range(256)]
    empty = {"start": float(sample.get("start", 0)), "usable": False,
             "cue_count": len(cues), "speech_count": len(speech)}
    if len(cues) < 10 or len(speech) < 10:
        return empty
    scores = []
    for tick in range(-60, 61):
        offset = tick / 20
        distances = [min(abs(cue + offset - onset) for onset in speech) for cue in cues]
        score = statistics.mean(max(0, 1-distance/.35) for distance in distances)
        matched = sum(distance <= .25 for distance in distances) / len(cues)
        scores.append((score, offset, matched))
    best = max(scores, key=lambda value: (value[0], -abs(value[1])))
    other_peak = max(value[0] for value in scores if abs(value[1]-best[1]) >= .45)
    prominence = best[0] - other_peak
    return {**empty, "usable": best[0] >= .45 and best[2] >= .65 and prominence >= .12
            and abs(best[1]) < 2.95,
            "offset_ms": round(best[1]*1000), "score": round(best[0], 4),
            "matched_fraction": round(best[2], 4), "prominence": round(prominence, 4)}


def assess_windows(samples):
    windows = [score_window(sample) for sample in samples]
    good = sorted((window for window in windows if window["usable"]), key=lambda w: w["start"])
    result = {"schema": "subtitle-speech-sync-v1", "method": "silero-onset-grid-v1", "status": "unverified",
              "apply_offset_ms": 0, "windows": windows, "reason": "insufficient_evidence"}
    if len(good) < 2 or good[-1]["start"] - good[0]["start"] < 120:
        return result
    offsets = [window["offset_ms"] for window in good]
    spread = max(offsets) - min(offsets)
    offset = round(statistics.median(offsets))
    result.update(estimated_offset_ms=offset, offset_spread_ms=spread,
                  drift_ms_per_hour=round((offsets[-1]-offsets[0]) * 3600 /
                                          (good[-1]["start"]-good[0]["start"])))
    if spread > 300:
        return {**result, "status": "needs_review", "reason": "inconsistent_shift_or_drift"}
    if abs(offset) <= 300:
        return {**result, "status": "aligned", "reason": "within_subtitle_anticipation_tolerance"}
    if abs(offset) > 1500:
        return {**result, "status": "needs_review", "reason": "large_shift"}
    # Two windows may agree by chance. Mutation needs all three independent samples.
    if len(good) < 3:
        return result
    return {**result, "status": "correctable", "reason": "consistent_small_shift",
            "apply_offset_ms": offset}


# O-099: a subtitle file made for another release runs at another frame rate. Subtitle time t
# then belongs at t * scale in this media: PAL speed-up (25 vs 23.976/24), NTSC 1000/1001.
STRETCH_SCALES = tuple(sorted({a / b for a, b in (
    (25, 23.976), (23.976, 25), (25, 24), (24, 25), (24, 23.976), (23.976, 24),
    (30, 29.97), (29.97, 30))}))


def assess_stretch(windows, cue_starts):
    """Try each known frame-rate ratio on the same speech windows; adopt one only when all three
    windows agree, exactly as a plain shift must. Returns the best evidence otherwise."""
    starts = sorted(float(t) for t in cue_starts if isinstance(t, (int, float)) and math.isfinite(t) and t >= 0)
    best = None
    for scale in STRETCH_SCALES:
        samples = [{"start": w["start"], "speech": w["speech"],
                    "cues": [t * scale - w["start"] for t in starts if w["start"] + 5 <= t * scale <= w["start"] + 115]}
                   for w in windows]
        result = assess_windows(samples)
        good = [w for w in result["windows"] if w["usable"]]
        # Moving every row needs all three independent windows, as for a plain shift.
        if result["status"] not in {"aligned", "correctable"} or len(good) < 3:
            continue
        score = statistics.mean(w["score"] for w in good)
        if best is None or score > best[0]:
            best = (score, scale, result)
    if best is None:
        return {"schema": "subtitle-speech-sync-v1", "method": "silero-onset-grid-stretch-v1", "status": "unverified",
                "apply_offset_ms": 0, "apply_scale": 1, "reason": "no_frame_rate_match"}
    _, scale, result = best
    offset = result.get("estimated_offset_ms", 0)
    return {**result, "method": "silero-onset-grid-stretch-v1", "status": "correctable", "reason": "frame_rate_stretch",
            "apply_scale": scale, "apply_offset_ms": 0 if abs(offset) <= 300 else offset}


def assess_media(source, audio_stream_index, cue_starts, duration, subtitle_source="container"):
    """At most three 120-second PCM windows; bundled Silero VAD runs on CPU.

    No Whisper model is loaded and no model download is attempted. The caller
    records an unverified outcome if the local VAD runtime is unavailable.
    """
    import numpy as np
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    starts = sorted(set(float(t) for t in cue_starts if math.isfinite(t) and 0 <= t < duration))
    if len(starts) < 30:
        return assess_windows([])
    samples = []
    for quantile in (.2, .5, .8):
        start = max(0, min(starts[int(len(starts)*quantile)]-60, duration-120))
        if any(abs(start-sample["start"]) < 120 for sample in samples):
            continue
        process = subprocess.run(
            ["ffmpeg", "-v", "error", "-nostdin", "-ss", str(start), "-i", str(source),
             "-t", "120", "-map", "0:%d" % audio_stream_index, "-ac", "1", "-ar", "16000",
             "-f", "f32le", "pipe:1"], capture_output=True, check=True, timeout=45,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        audio = np.frombuffer(process.stdout, dtype=np.float32)
        speech = get_speech_timestamps(audio, VadOptions(
            min_speech_duration_ms=150, min_silence_duration_ms=150, speech_pad_ms=0))
        samples.append({"start": start, "speech": [item["start"]/16000 for item in speech],
                        "cues": [t-start for t in starts if start+5 <= t <= start+115]})
    result = assess_windows(samples)
    # A container track was cut for this very picture; only a separate file may be stretched.
    if subtitle_source == "external" and result["status"] not in {"aligned", "correctable"} and len(samples) >= 3:
        stretched = assess_stretch(samples, starts)
        if stretched["status"] == "correctable":
            return stretched
        result["stretch_checked"] = True
    return result
