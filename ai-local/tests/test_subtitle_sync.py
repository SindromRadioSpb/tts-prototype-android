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
