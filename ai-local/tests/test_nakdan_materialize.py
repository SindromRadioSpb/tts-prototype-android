"""The niqqud model must load in every way the Companion is started (O-031d, 2026-09-28).

The Hugging Face cache is made of symlinks created without admin rights. Windows 11 refuses to
traverse such links for the service started by the installer or the tray: first OSError(22) on
open(), then WinError 448 "untrusted mount point" on stat() once beta.14 checked is_dir() on a
link. A console-started service read them, which is why every manual restart "fixed" it.

So the loader never traverses a snapshot link: it prefers an already complete folder of real
files, otherwise builds one reading link targets as text, otherwise downloads real files.
"""

import os
from pathlib import Path

import pytest

from ai_local.models import nakdan

MODEL = "dicta-il/dictabert-large-char-menaked"
REV = "4dfc20b94565d7868e1c8c00bf039d38c071a062"
FILES = {name: ("content of " + name).encode() for name in nakdan.REQUIRED_FILES}


def _repo(cache):
    return cache / ("models--" + MODEL.replace("/", "--"))


def _cache_with_links(tmp_path):
    cache = tmp_path / "downloads" / "cache"
    repo = _repo(cache)
    (repo / "refs").mkdir(parents=True)
    (repo / "refs" / "main").write_text(REV, encoding="utf-8")
    (repo / "blobs").mkdir()
    snap = repo / "snapshots" / REV
    snap.mkdir(parents=True)
    for i, (name, data) in enumerate(FILES.items()):
        blob = repo / "blobs" / ("blob%d" % i)
        blob.write_bytes(data)
        try:
            os.symlink(os.path.join("..", "..", "blobs", blob.name), snap / name)
        except OSError:
            pytest.skip("this account cannot create symlinks")
    return cache, snap


def _refuse_following(monkeypatch, snap):
    """Make any path operation that follows a snapshot link fail the way Windows did."""
    real_stat = os.stat

    def guarded_stat(path, *args, **kwargs):
        follow = kwargs.get("follow_symlinks", True)
        if follow and Path(os.fspath(path)).parent == snap and os.path.islink(os.fspath(path)):
            raise OSError(22, "untrusted mount point", os.fspath(path), 448)
        return real_stat(path, *args, **kwargs)

    monkeypatch.setattr(os, "stat", guarded_stat)


def test_links_are_read_as_text_and_the_model_gets_real_files(tmp_path, monkeypatch):
    cache, snap = _cache_with_links(tmp_path)
    _refuse_following(monkeypatch, snap)
    local = nakdan.materialize_snapshot(cache, MODEL, download_fn=lambda *a: pytest.fail("no download needed"))
    assert local == tmp_path / "downloads" / "materialized" / MODEL.replace("/", "--") / REV
    for name, data in FILES.items():
        assert not (local / name).is_symlink()
        assert (local / name).read_bytes() == data
    assert (local / nakdan.MARKER).is_file()


def test_a_complete_folder_is_used_without_touching_the_cache(tmp_path, monkeypatch):
    cache, snap = _cache_with_links(tmp_path)
    first = nakdan.materialize_snapshot(cache, MODEL)

    def no_scan(*_args, **_kwargs):
        raise AssertionError("the snapshot must not be scanned again")

    monkeypatch.setattr(os, "scandir", no_scan)
    assert nakdan.materialize_snapshot(cache, MODEL) == first


def test_a_folder_left_complete_without_marker_is_adopted(tmp_path, monkeypatch):
    cache, _snap = _cache_with_links(tmp_path)
    target = tmp_path / "downloads" / "materialized" / MODEL.replace("/", "--") / REV
    target.mkdir(parents=True)
    for name, data in FILES.items():
        (target / name).write_bytes(data)
    monkeypatch.setattr(os, "scandir", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no scan")))
    assert nakdan.materialize_snapshot(cache, MODEL) == target
    assert (target / nakdan.MARKER).is_file()


def test_when_links_cannot_even_be_read_real_files_are_downloaded(tmp_path, monkeypatch):
    cache, _snap = _cache_with_links(tmp_path)

    def refuse(_path):
        raise OSError(22, "untrusted mount point")

    monkeypatch.setattr(os, "readlink", refuse)
    calls = []

    def download(model_id, revision, target):
        calls.append((model_id, revision))
        target.mkdir(parents=True, exist_ok=True)
        for name, data in FILES.items():
            (target / name).write_bytes(data)

    local = nakdan.materialize_snapshot(cache, MODEL, download_fn=download)
    assert calls == [(MODEL, REV)]
    assert (local / "model.safetensors").read_bytes() == FILES["model.safetensors"]


def test_without_any_cache_the_model_is_downloaded_as_real_files(tmp_path):
    cache = tmp_path / "downloads" / "cache"
    calls = []

    def download(model_id, revision, target):
        calls.append(revision)
        target.mkdir(parents=True, exist_ok=True)
        for name, data in FILES.items():
            (target / name).write_bytes(data)

    local = nakdan.materialize_snapshot(cache, MODEL, download_fn=download)
    assert calls == [None]
    assert (local / nakdan.MARKER).is_file()


def test_an_unusable_result_is_a_named_failure(tmp_path):
    cache = tmp_path / "downloads" / "cache"
    with pytest.raises(RuntimeError, match="NIQQUD_MODEL_FILES_UNAVAILABLE"):
        nakdan.materialize_snapshot(cache, MODEL, download_fn=lambda *a: None)
