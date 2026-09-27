"""O-031d (2026-09-28): the niqqud model failed with OSError(22) in the installed Companion and the
traceback was lost, because the detached service writes stdout to DEVNULL."""

import logging
from pathlib import Path

from ai_local import logging_setup

SRC = Path(__file__).resolve().parents[1] / "ai_local" / "companion.py"


def test_installed_companion_owns_its_model_caches():
    text = SRC.read_text(encoding="utf-8")
    for name in ("HF_HOME", "HF_MODULES_CACHE", "XDG_CACHE_HOME", "TORCH_HOME", "HF_HUB_CACHE"):
        assert f'"{name}"' in text, name
    assert 'os.environ.pop("TRANSFORMERS_CACHE", None)' in text
    assert "AI_LOCAL_LOG_FILE" in text


def test_a_configured_log_file_receives_the_records(tmp_path, monkeypatch):
    root = logging.getLogger()
    saved = list(root.handlers)
    for handler in saved:
        root.removeHandler(handler)
    target = tmp_path / "logs" / "companion.log"
    monkeypatch.setenv("AI_LOCAL_LOG_FILE", str(target))
    try:
        logging_setup.configure_logging()
        logging.getLogger("ai_local.test").error("nakdan load failed: OSError(22)")
        for handler in root.handlers:
            handler.flush()
        assert "nakdan load failed" in target.read_text(encoding="utf-8")
    finally:
        for handler in list(root.handlers):
            root.removeHandler(handler)
            handler.close()
        for handler in saved:
            root.addHandler(handler)
