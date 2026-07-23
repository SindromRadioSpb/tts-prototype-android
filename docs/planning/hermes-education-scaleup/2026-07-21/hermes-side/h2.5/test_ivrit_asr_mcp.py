import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("ivrit_asr_mcp", HERE / "ivrit_asr_mcp.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FakeModel:
    def __init__(self, *, fail: bool = False, logprob: float = -0.1):
        self.fail = fail
        self.logprob = logprob

    def transcribe(self, *_args, **_kwargs):
        if self.fail:
            raise ValueError("synthetic decoder failure")
        return iter(
            [SimpleNamespace(start=0.0, end=1.25, text=" שלום ", avg_logprob=self.logprob)]
        ), SimpleNamespace()


def fake_decoder(_stream):
    return b"decoded audio"


class IvritAsrTests(unittest.TestCase):
    def test_success_returns_hypothesis_and_deletes_raw(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            audio = inbox / "sample.wav"
            audio.write_bytes(b"synthetic")
            result = MODULE.transcribe_audio_impl(audio.name, inbox=inbox, model=FakeModel(), decoder=fake_decoder)
            self.assertEqual(result["schema_version"], "asr.transcribe.1.0.0")
            self.assertEqual(result["confidence_note"], "ASR_HYPOTHESIS_NOT_GROUND_TRUTH")
            self.assertEqual(result["text"], "שלום")
            self.assertEqual(result["segments"][0]["confidence"], "NORMAL")
            self.assertFalse(audio.exists())

    def test_low_logprob_is_marked(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            audio = inbox / "noisy.wav"
            audio.write_bytes(b"synthetic")
            result = MODULE.transcribe_audio_impl(audio.name, inbox=inbox, model=FakeModel(logprob=-1.4), decoder=fake_decoder)
            self.assertEqual(result["segments"][0]["confidence"], "LOW")

    def test_empirical_low_confidence_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            low = inbox / "low.wav"
            low.write_bytes(b"synthetic")
            result = MODULE.transcribe_audio_impl(low.name, inbox=inbox, model=FakeModel(logprob=-0.154207), decoder=fake_decoder)
            self.assertEqual(result["segments"][0]["confidence"], "LOW")

    def test_empty_file_is_typed_and_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            audio = inbox / "empty.wav"
            audio.touch()
            with self.assertRaisesRegex(Exception, "ASR_EMPTY_FILE"):
                MODULE.transcribe_audio_impl(audio.name, inbox=inbox, model=FakeModel(), decoder=fake_decoder)
            self.assertTrue(audio.exists())

    def test_outside_path_is_typed_and_preserved(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            inbox = Path(tmp)
            audio = Path(outside) / "outside.wav"
            audio.write_bytes(b"synthetic")
            with self.assertRaisesRegex(Exception, "ASR_PATH_OUTSIDE_INBOX"):
                MODULE.transcribe_audio_impl(str(audio), inbox=inbox, model=FakeModel(), decoder=fake_decoder)
            self.assertTrue(audio.exists())

    def test_corrupt_file_is_typed_and_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            audio = inbox / "corrupt.wav"
            audio.write_bytes(b"not audio")
            with self.assertRaisesRegex(Exception, "ASR_INVALID_AUDIO"):
                MODULE.transcribe_audio_impl(audio.name, inbox=inbox, model=FakeModel(fail=True), decoder=fake_decoder)
            self.assertTrue(audio.exists())

    def test_input_swap_before_delete_is_typed_and_replacement_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            audio = inbox / "swap.wav"
            audio.write_bytes(b"original")

            class SwappingModel(FakeModel):
                def transcribe(self, *_args, **_kwargs):
                    audio.unlink()
                    audio.write_bytes(b"replacement")
                    return super().transcribe(*_args, **_kwargs)

            with self.assertRaisesRegex(Exception, "ASR_INPUT_CHANGED"):
                MODULE.transcribe_audio_impl(audio.name, inbox=inbox, model=SwappingModel(), decoder=fake_decoder)
            self.assertEqual(audio.read_bytes(), b"replacement")


if __name__ == "__main__":
    unittest.main()
