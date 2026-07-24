from __future__ import annotations

import importlib.util
import math
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

MODULE_PATH = Path(__file__).with_name("c1_practice_mcp.py")
spec = importlib.util.spec_from_file_location("c1_practice_tested", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class FakeAsr:
    def transcribe(self, _waveform, **_kwargs):
        return iter([
            SimpleNamespace(start=0.0, end=0.5, text=" שלום", avg_logprob=-0.1),
        ]), None


class FakeC1:
    def score(self, exercise_id, _wav_bytes):
        return {
            "schema_version": "c1.pronunciation.advisory.1.0.0",
            "exercise_id": exercise_id,
            "target_status": "SCORABLE",
            "possible_issues": [],
            "advisory_only": True,
            "quality_disclosure": {
                "benchmark_sensitivity": 0.60,
                "benchmark_false_positive_rate": 0.30,
                "stress_detected": 2,
                "stress_total": 10,
            },
        }


def waveform(_payload: bytes):
    return np.zeros(math.ceil(16000 * 0.5), dtype=np.float32)


class C1PracticeTests(unittest.TestCase):
    def make_note(self, root: Path, session: str = "abc", name: str = "voice-note-test.m4a") -> Path:
        folder = root / session
        folder.mkdir(parents=True)
        path = folder / name
        path.write_bytes(b"bounded fake audio")
        return path

    def test_success_separates_axes_and_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            result = module.evaluate_attempt_impl(
                "abc", str(path), "c1-xd01", attachment_root=root,
                decoder=waveform, asr_model=FakeAsr(), c1_engine=FakeC1(),
            )
            self.assertFalse(path.exists())
            self.assertTrue(result["raw_deleted"])
            self.assertTrue(result["must_confirm_transcript_before_feedback"])
            self.assertEqual(result["asr"]["text"], "שלום")
            self.assertIn("pronunciation", result)

    def test_failure_still_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            with self.assertRaises(Exception):
                module.evaluate_attempt_impl(
                    "abc", str(path), "c1-xd01", attachment_root=root,
                    decoder=lambda _payload: (_ for _ in ()).throw(ValueError("decode")),
                    asr_model=FakeAsr(), c1_engine=FakeC1(),
                )
            self.assertFalse(path.exists())

    def test_rejects_cross_session_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root, session="other")
            (root / "abc").mkdir()
            with self.assertRaises(Exception):
                module.evaluate_attempt_impl(
                    "abc", str(path), "c1-xd01", attachment_root=root,
                    decoder=waveform, asr_model=FakeAsr(), c1_engine=FakeC1(),
                )
            self.assertTrue(path.exists())

    def test_rejects_non_voice_attachment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root, name="lesson.m4a")
            with self.assertRaises(Exception):
                module.evaluate_attempt_impl(
                    "abc", str(path), "c1-xd01", attachment_root=root,
                    decoder=waveform, asr_model=FakeAsr(), c1_engine=FakeC1(),
                )
            self.assertTrue(path.exists())

    def test_rejects_long_audio_and_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            long_wave = lambda _payload: np.zeros(16000 * 13, dtype=np.float32)
            with self.assertRaises(Exception):
                module.evaluate_attempt_impl(
                    "abc", str(path), "c1-xd01", attachment_root=root,
                    decoder=long_wave, asr_model=FakeAsr(), c1_engine=FakeC1(),
                )
            self.assertFalse(path.exists())

    def test_rejects_empty_audio_and_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            path.write_bytes(b"")
            with self.assertRaises(Exception):
                module.evaluate_attempt_impl(
                    "abc", str(path), "c1-xd01", attachment_root=root,
                    decoder=waveform, asr_model=FakeAsr(), c1_engine=FakeC1(),
                )
            self.assertFalse(path.exists())

    def test_rejects_oversized_audio_and_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            with path.open("wb") as stream:
                stream.truncate(module.MAX_AUDIO_BYTES + 1)
            with self.assertRaises(Exception):
                module.evaluate_attempt_impl(
                    "abc", str(path), "c1-xd01", attachment_root=root,
                    decoder=waveform, asr_model=FakeAsr(), c1_engine=FakeC1(),
                )
            self.assertFalse(path.exists())

    def test_rejects_symlink_without_deleting_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = self.make_note(root, name="voice-note-target.m4a")
            link = target.with_name("voice-note-link.m4a")
            try:
                link.symlink_to(target)
            except OSError:
                self.skipTest("symlinks unavailable")
            with self.assertRaises(Exception):
                module.evaluate_attempt_impl(
                    "abc", str(link), "c1-xd01", attachment_root=root,
                    decoder=waveform, asr_model=FakeAsr(), c1_engine=FakeC1(),
                )
            self.assertTrue(target.exists())

    def test_delete_failure_overrides_score_with_privacy_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            with patch.object(Path, "unlink", side_effect=OSError("locked")):
                with self.assertRaises(Exception) as caught:
                    module.evaluate_attempt_impl(
                        "abc", str(path), "c1-xd01", attachment_root=root,
                        decoder=waveform, asr_model=FakeAsr(), c1_engine=FakeC1(),
                    )
            self.assertIn("C1_RAW_DELETE_FAILED", str(caught.exception))
            self.assertTrue(path.exists())

    def test_discard_deletes_current_session_voice_attachment_without_evaluation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            result = module.discard_attachment_impl("abc", str(path), attachment_root=root)
            self.assertFalse(path.exists())
            self.assertTrue(result["raw_deleted"])
            self.assertFalse(result["evaluated"])
            self.assertEqual(result["schema_version"], module.DISCARD_SCHEMA_VERSION)

    def test_discard_rejects_cross_session_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root, session="other")
            (root / "abc").mkdir()
            with self.assertRaises(Exception):
                module.discard_attachment_impl("abc", str(path), attachment_root=root)
            self.assertTrue(path.exists())

    def test_reading_attempt_is_asr_only_and_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            result = module.transcribe_reading_attempt_impl(
                "abc", str(path), attachment_root=root,
                decoder=waveform, asr_model=FakeAsr(),
            )
            self.assertFalse(path.exists())
            self.assertTrue(result["raw_deleted"])
            self.assertFalse(result["pronunciation_scored"])
            self.assertEqual(result["schema_version"], module.READING_SCHEMA_VERSION)
            self.assertEqual(result["asr"]["text"], "שלום")

    def test_reading_attempt_rejects_over_90_seconds_and_deletes_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.make_note(root)
            long_wave = lambda _payload: np.zeros(16000 * 91, dtype=np.float32)
            with self.assertRaises(Exception):
                module.transcribe_reading_attempt_impl(
                    "abc", str(path), attachment_root=root,
                    decoder=long_wave, asr_model=FakeAsr(),
                )
            self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
