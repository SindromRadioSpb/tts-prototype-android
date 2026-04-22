import importlib.util
import json
import os
import tempfile
import wave
from pathlib import Path

from fastapi.testclient import TestClient


MODULE_PATH = Path(__file__).resolve().parents[1] / "ai-local" / "hebrew_tts_sidecar.py"
SPEC = importlib.util.spec_from_file_location("hebrew_tts_sidecar", MODULE_PATH)
hebrew_tts_sidecar = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(hebrew_tts_sidecar)


class FakeEngine:
    def __init__(self) -> None:
        self.last_text = None
        self.calls = 0

    def synthesize_to_file(self, text: str, out_path: Path):
        self.calls += 1
        self.last_text = text
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(out_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(22050)
            wav_file.writeframes(b"\x00\x00" * 2205)
        return type(
            "Result",
            (),
            {
                "to_dict": lambda self: {
                    "wavPath": str(out_path),
                    "g2pMs": 12.3,
                    "ttsMs": 45.6,
                    "totalMs": 57.9,
                }
            },
        )()

    def get_health_snapshot(self):
        return {
            "voices": ["shaul"],
            "modelLoaded": True,
            "phonikudReady": True,
            "piperReady": True,
            "modelVersion": "phonikud-shaul-v1",
            "phonikudVersion": "phonikud-1.0.int8.onnx",
            "piperModelVersion": "shaul.onnx",
        }


class FailingEngine:
    def synthesize_to_file(self, text: str, out_path: Path):
        raise RuntimeError("boom")


def create_client(engine_factory):
    os.environ["TTS_HEBREW_LOCAL_EXPERIMENTAL"] = "true"
    os.environ["TTS_HEBREW_LOCAL_LICENSE_MODE"] = "noncommercial"
    os.environ["TTS_HEBREW_LOCAL_CACHE_DIR"] = tempfile.mkdtemp(prefix="hebrew-tts-cache-")
    return TestClient(hebrew_tts_sidecar.create_app(engine_factory))


def test_empty_text_rejected():
    client = create_client(FakeEngine)
    response = client.post("/tts/hebrew/phonikud-piper", json={"text": "   ", "voice": "shaul", "format": "wav"})
    assert response.status_code == 400
    assert response.json()["detail"] == "empty_text"


def test_very_long_text_is_clamped():
    engine = FakeEngine()
    os.environ["TTS_HEBREW_LOCAL_EXPERIMENTAL"] = "true"
    os.environ["TTS_HEBREW_LOCAL_CACHE_DIR"] = tempfile.mkdtemp(prefix="hebrew-tts-cache-")
    client = TestClient(hebrew_tts_sidecar.create_app(lambda: engine))
    response = client.post(
        "/tts/hebrew/phonikud-piper",
        json={"text": "ש" * 800, "voice": "shaul", "format": "wav"},
    )
    assert response.status_code == 200
    assert engine.last_text is not None
    assert len(engine.last_text) == hebrew_tts_sidecar.MAX_TEXT_CHARS


def test_hebrew_phrase_produces_wav_with_diagnostics():
    client = create_client(FakeEngine)
    response = client.post(
        "/tts/hebrew/phonikud-piper",
        json={"text": "שלום עולם", "voice": "shaul", "speed": 1.2, "pitch": 1.0, "format": "wav"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    diagnostics = json.loads(response.headers["x-tts-diagnostics"])
    assert diagnostics["provider"] == "hebrew_phonikud_piper"
    assert diagnostics["runtime"] == "python_sidecar"
    assert diagnostics["licenseStatus"] == "noncommercial_allowed"
    assert diagnostics["licenseMode"] == "noncommercial"
    assert diagnostics["speedSupported"] is False
    assert diagnostics["pitchSupported"] is False
    assert diagnostics["g2pMs"] == 12.3
    assert diagnostics["ttsMs"] == 45.6


def test_sidecar_returns_controlled_error_without_crash():
    os.environ["TTS_HEBREW_LOCAL_EXPERIMENTAL"] = "true"
    client = TestClient(hebrew_tts_sidecar.create_app(FailingEngine))
    response = client.post(
        "/tts/hebrew/phonikud-piper",
        json={"text": "שלום עולם", "voice": "shaul", "format": "wav"},
    )
    assert response.status_code == 500
    assert response.json()["error"] == "hebrew_tts_failed"


def test_sidecar_health_reports_ready_state():
    client = create_client(FakeEngine)
    response = client.get("/tts/hebrew/phonikud-piper/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["licenseMode"] == "noncommercial"
    assert body["voices"] == ["shaul"]
    assert body["modelLoaded"] is True


def test_sidecar_cache_hits_on_same_text_and_settings():
    engine = FakeEngine()
    os.environ["TTS_HEBREW_LOCAL_EXPERIMENTAL"] = "true"
    os.environ["TTS_HEBREW_LOCAL_LICENSE_MODE"] = "noncommercial"
    os.environ["TTS_HEBREW_LOCAL_CACHE_DIR"] = tempfile.mkdtemp(prefix="hebrew-tts-cache-")
    client = TestClient(hebrew_tts_sidecar.create_app(lambda: engine))

    first = client.post(
        "/tts/hebrew/phonikud-piper",
        json={"text": "שלום עולם", "voice": "shaul", "speed": 1.0, "pitch": 0, "format": "wav"},
    )
    second = client.post(
        "/tts/hebrew/phonikud-piper",
        json={"text": "שלום עולם", "voice": "shaul", "speed": 1.0, "pitch": 0, "format": "wav"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert engine.calls == 1
    assert json.loads(second.headers["x-tts-diagnostics"])["cacheHit"] is True
