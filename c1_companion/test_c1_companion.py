from __future__ import annotations

import io
import json
import tempfile
import unittest
import wave
from pathlib import Path

import c1_companion as c1


def wav_bytes(seconds: float = 0.5, rate: int = 16000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00" * int(rate * seconds))
    return buffer.getvalue()


def profile() -> dict:
    return {
        "schema_version": c1.PROFILE_SCHEMA_VERSION,
        "vowel_classes": ["a", "e", "i"],
        "vowel_centroids_hz": {"a": [700.0, 1200.0], "e": [500.0, 1900.0], "i": [300.0, 2400.0]},
        "vowel_scale_hz": [100.0, 200.0],
        "vowel_threshold": 0.5,
        "stress_threshold": -0.1,
    }


class FrozenFake:
    @staticmethod
    def score_item(*_args):
        return {
            "target_status": "SCORABLE",
            "alignment_score": 0.31,
            "vowels": [{"expected": "a", "f1": 300.0, "f2": 2400.0}],
            "expected_prominence_lead": -0.2,
        }


class CompanionTests(unittest.TestCase):
    def test_allowlist_is_exactly_25_unique_targets(self):
        exercises = c1.load_exercises()
        self.assertEqual(len(exercises), 25)
        self.assertEqual(len({row["target_word"] for row in exercises.values()}), 25)
        self.assertTrue(all(row["condition"] == "NORMAL" for row in exercises.values()))
        self.assertTrue(all(row["expected_error_type"] == "NONE" for row in exercises.values()))

    def test_profile_detector_is_advisory_and_axis_separated(self):
        item = FrozenFake.score_item()
        self.assertEqual(
            c1.apply_profile(item, c1.validate_profile(profile())),
            ["POSSIBLE_VOWEL_SUBSTITUTION", "POSSIBLE_STRESS_SHIFT"],
        )
        item["target_status"] = "UNSCORABLE"
        self.assertEqual(c1.apply_profile(item, profile()), [])

    def test_wav_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "attempt.wav"
            path.write_bytes(wav_bytes())
            self.assertAlmostEqual(c1.validate_wav(path), 0.5, places=2)
            path.write_bytes(wav_bytes(seconds=13.0))
            with self.assertRaisesRegex(c1.CompanionError, "AUDIO_TOO_LONG"):
                c1.validate_wav(path)

    def test_score_deletes_temp_file_and_returns_no_raw_features(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile_path = root / "profile.json"
            profile_path.write_text(json.dumps(profile()), encoding="utf-8")
            engine = c1.CompanionEngine(profile_path, root / "phonikud.onnx", root / "torch", root / "requests")
            engine._profile = profile()
            engine._runtime = object()
            engine._g2p = object()
            engine._phonemize = object()
            engine._frozen = FrozenFake()
            result = engine.score("c1-xd01", wav_bytes())
            self.assertTrue(result["ok"])
            self.assertTrue(result["advisory_only"])
            self.assertEqual(result["possible_issues"], ["POSSIBLE_VOWEL_SUBSTITUTION", "POSSIBLE_STRESS_SHIFT"])
            self.assertFalse(set(result) & {"vowels", "f1", "f2", "prominence", "audio"})
            self.assertEqual(list((root / "requests").glob("*")), [])


if __name__ == "__main__":
    unittest.main()
