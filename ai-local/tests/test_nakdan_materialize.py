"""O-031d, root cause found 2026-09-28 in the new Companion log: opening the Hugging Face snapshot
symlink tokenizer_config.json raised OSError(22) in the service started by the installer or the
tray, while a service started from a console read it. The model is therefore loaded from a folder
of real files (hard links to the same blobs, a copy where a link is refused), never via symlinks."""

import os
from pathlib import Path

from ai_local.models import nakdan

MODEL = "dicta-il/dictabert-large-char-menaked"
REV = "4dfc20b94565d7868e1c8c00bf039d38c071a062"


def _cache(tmp_path):
    repo = tmp_path / "cache" / ("models--" + MODEL.replace("/", "--"))
    (repo / "refs").mkdir(parents=True)
    (repo / "refs" / "main").write_text(REV, encoding="utf-8")
    blobs = repo / "blobs"
    blobs.mkdir()
    (blobs / "aaa").write_text('{"tokenizer_class": "BertTokenizer"}', encoding="utf-8")
    (blobs / "bbb").write_text("vocab", encoding="utf-8")
    snap = repo / "snapshots" / REV
    snap.mkdir(parents=True)
    # Stand-ins for the symlinks: the loader must read their targets as text, not open them.
    (snap / "tokenizer_config.json").write_text("", encoding="utf-8")
    (snap / "vocab.txt").write_text("", encoding="utf-8")
    links = {str(snap / "tokenizer_config.json"): os.path.join("..", "..", "blobs", "aaa"),
             str(snap / "vocab.txt"): os.path.join("..", "..", "blobs", "bbb")}
    return tmp_path / "cache", links


def test_snapshot_becomes_a_folder_of_real_files(tmp_path, monkeypatch):
    cache, links = _cache(tmp_path)
    monkeypatch.setattr(nakdan, "_is_link", lambda p: str(p) in links)
    monkeypatch.setattr(nakdan.os, "readlink", lambda p: links[str(p)])
    local = nakdan.materialize_snapshot(cache, MODEL)
    assert local == cache.parent / "materialized" / MODEL.replace("/", "--") / REV
    assert (local / "tokenizer_config.json").read_text(encoding="utf-8") == '{"tokenizer_class": "BertTokenizer"}'
    assert (local / "vocab.txt").read_text(encoding="utf-8") == "vocab"
    assert not (local / "vocab.txt").is_symlink()
    again = nakdan.materialize_snapshot(cache, MODEL)
    assert again == local


def test_no_snapshot_means_the_usual_loader(tmp_path):
    assert nakdan.materialize_snapshot(tmp_path / "empty", MODEL) is None
