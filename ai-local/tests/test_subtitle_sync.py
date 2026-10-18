"""Independent speech onsets are the oracle; subtitles may have shift or drift."""
import random

from ai_local.subtitle_sync import assess_windows


def windows(offsets):
    rng = random.Random(31)
    result = []
    for index, offset in enumerate(offsets):
        starts, cursor = [], 7.0
        for _ in range(24):
            cursor += rng.uniform(1.1, 3.5)
            starts.append(cursor)
        result.append({"start": index * 900.0, "speech": starts,
                       "cues": [t - offset + rng.uniform(-.03, .03) for t in starts]})
    return result


def test_normal_subtitle_anticipation_is_not_a_correction():
    result = assess_windows(windows([.15, .20, .20]))
    assert result["status"] == "aligned"
    assert result["apply_offset_ms"] == 0


def test_consistent_small_shift_is_recoverable_without_text_changes():
    result = assess_windows(windows([.75, .80, .75]))
    assert result["status"] == "correctable"
    assert 700 <= result["apply_offset_ms"] <= 850


def test_large_shift_and_drift_require_review():
    for offsets in [[2.1, 2.1, 2.1], [.0, .55, 1.1]]:
        result = assess_windows(windows(offsets))
        assert result["status"] == "needs_review"
        assert result["apply_offset_ms"] == 0


def test_silence_sparse_evidence_and_periodic_ambiguity_never_move_rows():
    for sample in [[], [{"start": 0, "speech": [], "cues": [1, 2]}],
                   [{"start": i*900, "speech": list(range(0, 120, 2)),
                     "cues": list(range(10, 110, 2))} for i in range(3)]]:
        result = assess_windows(sample)
        assert result["status"] == "unverified"
        assert result["apply_offset_ms"] == 0


def test_one_good_window_cannot_authorize_a_global_shift():
    result = assess_windows(windows([.8]))
    assert result["status"] == "unverified"
    assert result["apply_offset_ms"] == 0


# O-099: a subtitle file made for another frame rate drifts linearly (25 vs 23.976 fps is 4.3%,
# minutes by the end of a film); the plain shift search sees nothing, the stretch search finds it.
from ai_local.subtitle_sync import STRETCH_SCALES, assess_stretch


def stretched(scale, offset=0.0):
    rng = random.Random(7)
    speech_abs, cursor = [], 0.0
    while cursor < 3000:
        cursor += rng.uniform(1.1, 3.5)
        speech_abs.append(cursor)
    cue_starts = [(t - offset) / scale + rng.uniform(-.03, .03) for t in speech_abs]
    windows = [{"start": start, "speech": [t - start for t in speech_abs if start <= t <= start + 120]}
               for start in (600.0, 1500.0, 2400.0)]
    return windows, cue_starts


def test_frame_rate_stretch_is_found_and_named():
    scale = 25 / 23.976
    assert any(abs(s - scale) < 1e-9 for s in STRETCH_SCALES)
    windows, cues = stretched(scale)
    result = assess_stretch(windows, cues)
    assert result["status"] == "correctable"
    assert result["reason"] == "frame_rate_stretch"
    assert abs(result["apply_scale"] - scale) < 1e-9
    assert abs(result["apply_offset_ms"]) <= 300


def test_stretch_with_a_shift_carries_both():
    scale = 23.976 / 25
    windows, cues = stretched(scale, offset=0.9)
    result = assess_stretch(windows, cues)
    assert result["status"] == "correctable"
    assert abs(result["apply_scale"] - scale) < 1e-9
    assert 750 <= result["apply_offset_ms"] <= 1050


def test_no_stretch_is_invented_for_unrelated_subtitles():
    rng = random.Random(3)
    windows, _ = stretched(1.0)
    noise = sorted(rng.uniform(0, 3000) for _ in range(1200))
    result = assess_stretch(windows, noise)
    assert result["status"] != "correctable"
    assert result.get("apply_scale", 1) == 1
