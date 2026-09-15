from pathlib import Path

from ai_local.mt_model_store import expected_mt_model_dir, inspect_mt_model


def test_missing_model_directory_is_not_installed(tmp_path):
    status = inspect_mt_model(tmp_path)
    assert (status.installed, status.verified, status.reason) == (False, False, "NOT_INSTALLED")
    assert status.path == expected_mt_model_dir(tmp_path)


def test_unreadable_model_directory_reports_not_accessible_instead_of_raising(tmp_path, monkeypatch):
    """A model directory the OS refuses to stat must not crash companion import."""
    target = expected_mt_model_dir(tmp_path)
    target.mkdir(parents=True)
    real_is_file = Path.is_file

    def deny(self, *args, **kwargs):
        if self.name.endswith(".json"):
            raise PermissionError(5, "Access is denied", str(self))
        return real_is_file(self, *args, **kwargs)

    monkeypatch.setattr(Path, "is_file", deny)
    status = inspect_mt_model(tmp_path)
    assert (status.installed, status.verified, status.reason) == (False, False, "NOT_ACCESSIBLE")
    assert status.public_dict()["reason"] == "NOT_ACCESSIBLE"
