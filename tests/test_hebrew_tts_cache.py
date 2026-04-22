import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "experiments" / "hebrew_tts_phonikud_piper" / "poc_lib.py"
SPEC = importlib.util.spec_from_file_location("poc_lib", MODULE_PATH)
poc_lib = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules["poc_lib"] = poc_lib
SPEC.loader.exec_module(poc_lib)


def test_cache_key_changes_when_speed_changes():
    first = poc_lib.build_cache_key(
        provider="hebrew_phonikud_piper",
        voice="shaul",
        normalized_text="שלום עולם",
        speed=1.0,
        pitch=0.0,
    )
    second = poc_lib.build_cache_key(
        provider="hebrew_phonikud_piper",
        voice="shaul",
        normalized_text="שלום עולם",
        speed=1.2,
        pitch=0.0,
    )
    assert first != second


def test_cache_key_changes_when_pitch_changes():
    first = poc_lib.build_cache_key(
        provider="hebrew_phonikud_piper",
        voice="shaul",
        normalized_text="שלום עולם",
        speed=1.0,
        pitch=0.0,
    )
    second = poc_lib.build_cache_key(
        provider="hebrew_phonikud_piper",
        voice="shaul",
        normalized_text="שלום עולם",
        speed=1.0,
        pitch=1.0,
    )
    assert first != second
