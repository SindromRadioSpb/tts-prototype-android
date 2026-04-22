import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from experiments.hebrew_tts_phonikud_piper import poc_lib


def test_empty_text_rejected():
    try:
        poc_lib.sanitize_text("   ")
    except ValueError as error:
        assert str(error) == "empty_text"
        return
    raise AssertionError("empty text must be rejected")


def test_very_long_text_is_clamped():
    text = "ש" * (poc_lib.MAX_TEXT_CHARS + 25)
    normalized = poc_lib.sanitize_text(text)
    assert len(normalized) == poc_lib.MAX_TEXT_CHARS


def test_output_name_is_stable():
    left = poc_lib.safe_output_name(1, "שלום עולם")
    right = poc_lib.safe_output_name(1, "שלום עולם")
    assert left == right
    assert left.endswith(".wav")
