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


def _ratio_scorer(windows, usable_at):
    """score_window stand-in: the stretch loop scores every window once per ratio, in order, so
    the call count tells which ratio is being tried; usable_at(scale, start) decides the window."""
    import ai_local.subtitle_sync as ss
    state = {"i": 0}

    def score(sample):
        scale = ((1.0,) + ss.STRETCH_SCALES)[state["i"] // len(windows)]
        state["i"] += 1
        return {"start": sample["start"], "usable": usable_at(scale, sample["start"]), "offset_ms": 200,
                "score": .6, "cue_count": 20, "speech_count": 20}
    return score


def test_two_far_windows_at_a_unique_ratio_are_enough(monkeypatch):
    import ai_local.subtitle_sync as ss
    target = 25 / 23.976
    windows = [{"start": float(s), "speech": [1.0]} for s in (300, 900, 1500, 2100, 2700, 3300)]
    monkeypatch.setattr(ss, "score_window", _ratio_scorer(windows, lambda scale, start: scale == target and start in (900.0, 2100.0)))
    result = ss.assess_stretch(windows, [10.0, 20.0])
    assert result["status"] == "correctable"
    assert result["apply_scale"] == target
    assert result["apply_offset_ms"] == 0


def test_two_ratios_that_both_fit_are_ambiguous_and_move_nothing(monkeypatch):
    import ai_local.subtitle_sync as ss
    windows = [{"start": float(s), "speech": [1.0]} for s in (300, 900, 1500, 2100, 2700, 3300)]
    ok = {25 / 23.976, 25 / 24}
    state = {"i": 0}
    def score(sample):
        scale = ((1.0,) + ss.STRETCH_SCALES)[state["i"] // len(windows)]
        state["i"] += 1
        usable = scale in ok and sample["start"] in (900.0, 2100.0)
        return {"start": sample["start"], "usable": usable, "offset_ms": 100, "score": .6, "cue_count": 20, "speech_count": 20}
    monkeypatch.setattr(ss, "score_window", score)
    result = ss.assess_stretch(windows, [10.0])
    assert result["status"] == "needs_review"
    assert result["reason"] == "ambiguous_frame_rate"
    assert result["apply_offset_ms"] == 0 and result["apply_scale"] == 1


def test_two_close_windows_are_not_enough(monkeypatch):
    import ai_local.subtitle_sync as ss
    windows = [{"start": float(s), "speech": [1.0]} for s in (300, 600, 1500, 2100, 2700, 3300)]
    state = {"i": 0}
    def score(sample):
        scale = ((1.0,) + ss.STRETCH_SCALES)[state["i"] // len(windows)]
        state["i"] += 1
        usable = scale == 25 / 23.976 and sample["start"] in (300.0, 600.0)
        return {"start": sample["start"], "usable": usable, "offset_ms": 100, "score": .6, "cue_count": 20, "speech_count": 20}
    monkeypatch.setattr(ss, "score_window", score)
    assert ss.assess_stretch(windows, [10.0])["status"] == "unverified"
