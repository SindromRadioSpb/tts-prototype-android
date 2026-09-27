"""The owner chooses where temporary media copies live (owner decision 2026-09-28).

The Companion kept every copy under %LOCALAPPDATA% on C:, which had 3.1 GB free while E: had
1.4 TB; a 3.8 GB film failed at 79% for lack of space and nothing let the owner move the copies.
"""

import json

import pytest

from ai_local import companion_settings, config


@pytest.fixture()
def state(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(config, "MEDIA_JOB_ROOT", tmp_path / "state" / "media-jobs")
    monkeypatch.setattr(config, "ASR_JOB_ROOT", tmp_path / "jobs")
    return tmp_path


def test_without_a_choice_the_historical_folders_stay(state):
    assert companion_settings.media_jobs_root() == state / "state" / "media-jobs"
    assert companion_settings.asr_jobs_root() == state / "jobs"
    assert companion_settings.previous_media_roots() == []


def test_a_chosen_folder_moves_both_job_roots_and_keeps_other_settings(state):
    companion_settings.update_setting("ui_language", "ru")
    chosen = state / "big-disk" / "LinguistPro work"
    result = companion_settings.set_work_dir(str(chosen))
    assert result["work_dir"]["path"] == str(chosen.resolve())
    assert result["work_dir"]["chosen"] is True
    assert companion_settings.media_jobs_root() == chosen.resolve() / "media-jobs"
    assert companion_settings.asr_jobs_root() == chosen.resolve() / "asr-jobs"
    assert companion_settings.previous_media_roots() == [state / "state" / "media-jobs"]
    assert companion_settings.ui_language() == "ru"
    companion_settings.update_setting("media_hw_encoder", "auto")
    stored = json.loads(companion_settings.settings_path().read_text(encoding="utf-8"))
    assert stored["work_dir"] == str(chosen.resolve())


@pytest.mark.parametrize("bad", ["", "relative\\folder", "   "])
def test_an_unusable_folder_is_refused(state, bad):
    with pytest.raises(ValueError):
        companion_settings.set_work_dir(bad)


def test_a_folder_that_cannot_be_written_is_refused(state, monkeypatch):
    target = state / "readonly"

    def deny(*_args, **_kwargs):
        raise PermissionError(13, "denied")

    monkeypatch.setattr(companion_settings, "_probe_writable", deny)
    with pytest.raises(ValueError, match="WORK_DIR_NOT_WRITABLE"):
        companion_settings.set_work_dir(str(target))


def test_a_damaged_stored_value_falls_back_to_the_default(state):
    path = companion_settings.settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schema": companion_settings.SCHEMA, "work_dir": "not absolute"}), encoding="utf-8")
    assert companion_settings.media_jobs_root() == state / "state" / "media-jobs"
