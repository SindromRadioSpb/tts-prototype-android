"""An installed app with an autostart entry cannot be configured by its parent's environment.

Owner finding 2026-09-19. GPU encoding was enabled with a User-level environment variable.
The registry had it; the running Companion did not, because a process keeps the environment
it was born with and its children inherit that, not the registry. Whether the option was on
depended on which process had spawned the Companion and on whether the machine had rebooted
since - and the silent fallback was honest in a report nobody had a reason to open.

So the switch lives in the state directory. These tests pin the part that made the old channel
unusable: what wins over what, and what happens when the file is unreadable.
"""

from __future__ import annotations

import json

import pytest

from ai_local import companion_settings, config


@pytest.fixture(autouse=True)
def state_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE_DIR", tmp_path)
    monkeypatch.delenv("AI_LOCAL_MEDIA_HW_ENCODER", raising=False)
    monkeypatch.delenv("AI_LOCAL_UI_LANGUAGE", raising=False)
    return tmp_path


def test_without_any_choice_the_compatible_copy_stays_on_the_cpu():
    assert companion_settings.media_hw_encoder() == "off"
    assert companion_settings.resolve("media_hw_encoder")["source"] == "default"


def test_a_stored_choice_reaches_the_service_without_any_environment():
    companion_settings.update_setting("media_hw_encoder", "auto")
    assert companion_settings.media_hw_encoder() == "auto"
    assert companion_settings.resolve("media_hw_encoder")["source"] == "settings"


def test_a_stored_choice_outranks_a_stale_environment_variable(monkeypatch):
    """A setx from months ago must not quietly outrank what the window shows today."""
    monkeypatch.setenv("AI_LOCAL_MEDIA_HW_ENCODER", "auto")
    companion_settings.update_setting("media_hw_encoder", "off")
    assert companion_settings.media_hw_encoder() == "off"
    assert companion_settings.resolve("media_hw_encoder")["source"] == "settings"


def test_the_environment_still_works_where_nothing_was_stored(monkeypatch):
    monkeypatch.setenv("AI_LOCAL_MEDIA_HW_ENCODER", "auto")
    assert companion_settings.media_hw_encoder() == "auto"
    assert companion_settings.resolve("media_hw_encoder")["source"] == "environment"


def test_the_window_language_is_stored_the_same_way():
    assert companion_settings.ui_language() == "en"
    companion_settings.update_setting("ui_language", "ru")
    assert companion_settings.ui_language() == "ru"


def test_one_setting_does_not_erase_the_other(state_dir):
    companion_settings.update_setting("ui_language", "ru")
    companion_settings.update_setting("media_hw_encoder", "auto")
    stored = json.loads((state_dir / "settings.json").read_text(encoding="utf-8"))
    assert stored["ui_language"] == "ru" and stored["media_hw_encoder"] == "auto"
    assert stored["schema"] == companion_settings.SCHEMA


def test_an_unsupported_value_is_refused_rather_than_stored():
    with pytest.raises(ValueError):
        companion_settings.update_setting("media_hw_encoder", "quicksync")
    with pytest.raises(ValueError):
        companion_settings.update_setting("ui_language", "he")
    with pytest.raises(ValueError):
        companion_settings.update_setting("cloud_fallback", "on")
    assert companion_settings.media_hw_encoder() == "off"


def test_a_damaged_settings_file_is_not_a_reason_to_fail_a_conversion(state_dir):
    (state_dir / "settings.json").write_text("{not json at all", encoding="utf-8")
    assert companion_settings.media_hw_encoder() == "off"
    assert companion_settings.ui_language() == "en"


def test_an_unknown_value_in_the_file_is_ignored_not_trusted(state_dir):
    (state_dir / "settings.json").write_text(
        json.dumps({"schema": companion_settings.SCHEMA, "media_hw_encoder": "gpu-please"}),
        encoding="utf-8",
    )
    assert companion_settings.media_hw_encoder() == "off"
    assert companion_settings.resolve("media_hw_encoder")["source"] == "default"


def test_read_settings_reports_the_source_of_every_effective_value(monkeypatch):
    monkeypatch.setenv("AI_LOCAL_UI_LANGUAGE", "ru")
    companion_settings.update_setting("media_hw_encoder", "auto")
    report = companion_settings.read_settings()
    assert report["values"] == {"media_hw_encoder": "auto", "ui_language": "ru"}
    assert report["sources"] == {"media_hw_encoder": "settings", "ui_language": "environment"}
    assert report["allowed"]["media_hw_encoder"] == ["off", "auto"]
