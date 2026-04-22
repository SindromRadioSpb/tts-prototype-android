import importlib.util
import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


MODULE_PATH = Path(__file__).resolve().parents[1] / "ai-local" / "hebrew_tts_sidecar.py"
SPEC = importlib.util.spec_from_file_location("hebrew_tts_sidecar", MODULE_PATH)
hebrew_tts_sidecar = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(hebrew_tts_sidecar)


class FakeEngine:
    def synthesize_to_file(self, text, out_path):  # pragma: no cover - should not be called when blocked
        raise AssertionError("engine should not be used in blocked mode")

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


def test_noncommercial_mode_is_reported_by_health():
    os.environ["TTS_HEBREW_LOCAL_EXPERIMENTAL"] = "true"
    os.environ["TTS_HEBREW_LOCAL_LICENSE_MODE"] = "noncommercial"
    os.environ["TTS_HEBREW_LOCAL_CACHE_DIR"] = tempfile.mkdtemp(prefix="hebrew-tts-cache-")
    client = TestClient(hebrew_tts_sidecar.create_app(FakeEngine))
    response = client.get("/tts/hebrew/phonikud-piper/health")
    assert response.status_code == 200
    assert response.json()["licenseMode"] == "noncommercial"


def test_commercial_mode_blocks_provider():
    os.environ["TTS_HEBREW_LOCAL_EXPERIMENTAL"] = "true"
    os.environ["TTS_HEBREW_LOCAL_LICENSE_MODE"] = "commercial"
    os.environ["TTS_HEBREW_LOCAL_CACHE_DIR"] = tempfile.mkdtemp(prefix="hebrew-tts-cache-")
    client = TestClient(hebrew_tts_sidecar.create_app(FakeEngine))
    response = client.post(
        "/tts/hebrew/phonikud-piper",
        json={"text": "שלום עולם", "voice": "shaul", "format": "wav"},
    )
    assert response.status_code == 403
    assert response.json()["error"] == "license_mode_blocked"
