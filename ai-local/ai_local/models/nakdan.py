from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Callable, Optional

from .. import config


# Files the model needs; a folder holding all of them as regular files is ready to load.
REQUIRED_FILES = ("config.json", "tokenizer_config.json", "vocab.txt", "model.safetensors", "BertForDiacritization.py")
MARKER = ".complete"


def _download_real_files(model_id: str, revision: Optional[str], target: Path) -> None:
    """Fetch the repository straight into a folder of regular files (no cache symlinks)."""
    from huggingface_hub import snapshot_download

    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo_id=model_id, revision=revision or "main", local_dir=str(target))


def _complete(folder: Path) -> bool:
    try:
        return all((folder / name).is_file() and (folder / name).stat().st_size > 0 for name in REQUIRED_FILES)
    except OSError:
        return False


def _seal(folder: Path, revision: Optional[str]) -> Path:
    (folder / MARKER).write_text(str(revision or "main"), encoding="utf-8")
    return folder


def _copy_from_snapshot(snapshot: Path, target: Path) -> None:
    """Build real files from snapshot links without ever traversing one.

    os.scandir reports whether an entry is a link from the directory listing itself, and
    os.readlink reads the link's own data; neither follows it. The blob path is then joined as a
    string and hard-linked (same volume, no extra space) or copied.
    """
    target.mkdir(parents=True, exist_ok=True)
    with os.scandir(snapshot) as entries:
        listed = [(entry.name, entry.path, entry.is_symlink(),
                   (not entry.is_symlink()) and entry.is_file(follow_symlinks=False)) for entry in entries]
    for name, path, is_link, is_file in listed:
        if is_link:
            relative = os.readlink(path)
            if relative.startswith("\\\\?\\"):
                relative = relative[4:]
            source = os.path.normpath(os.path.join(os.path.dirname(path), relative))
        elif is_file:
            source = path
        else:
            continue
        dest = target / name
        dest.unlink(missing_ok=True)
        try:
            os.link(source, dest)
        except OSError:
            shutil.copyfile(source, dest)


def materialize_snapshot(cache_dir: Path, model_id: str,
                         download_fn: Optional[Callable[[str, Optional[str], Path], None]] = None) -> Path:
    """A folder of real model files the service can open however it was started.

    O-031d (2026-09-28): Windows 11 refuses to traverse the Hugging Face cache symlinks (created
    without admin rights) for the service started by the installer or the tray - OSError(22) on
    open(), WinError 448 "untrusted mount point" on stat() - while a console-started service
    reads them. So: a complete folder is used as is; otherwise one is built reading link targets
    as text; otherwise the model is downloaded as real files. Nothing ever follows a link.
    """
    slug = model_id.replace("/", "--")
    repo = Path(cache_dir) / ("models--" + slug)
    base = Path(cache_dir).parent / "materialized" / slug
    try:
        revision: Optional[str] = (repo / "refs" / "main").read_text(encoding="utf-8").strip() or None
    except OSError:
        revision = None
    target = base / (revision or "main")
    if (target / MARKER).is_file() or _complete(target):
        return _seal(target, revision)
    if revision is None and base.is_dir():
        for folder in sorted(base.iterdir()):
            if (folder / MARKER).is_file():
                return folder
    snapshot = repo / "snapshots" / revision if revision else None
    if snapshot is not None:
        try:
            _copy_from_snapshot(snapshot, target)
        except OSError:
            pass
        if _complete(target):
            return _seal(target, revision)
    (download_fn or _download_real_files)(model_id, revision, target)
    if _complete(target):
        return _seal(target, revision)
    raise RuntimeError("NIQQUD_MODEL_FILES_UNAVAILABLE")


class NakdanImpl:
    """DictaBERT-menaked wrapper. CPU-only by default."""

    def __init__(
        self,
        model_id: str = config.NAKDAN_MODEL_ID,
        device: str = config.NAKDAN_DEVICE,
        cache_dir: Optional[Path] = config.HF_CACHE_DIR,
    ) -> None:
        self.model_id = model_id
        self.device = device
        self.cache_dir = cache_dir
        self.version = config.NAKDAN_MODEL_VERSION
        self._model = None
        self._tokenizer = None

    def load(self) -> None:
        from transformers import AutoModel, AutoTokenizer

        kwargs: dict = {}
        if self.cache_dir is not None:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            kwargs["cache_dir"] = str(self.cache_dir)

        if self.cache_dir is not None:
            # Always from a folder of real files: see materialize_snapshot (O-031d).
            local = materialize_snapshot(self.cache_dir, self.model_id)
            self._tokenizer = AutoTokenizer.from_pretrained(str(local), local_files_only=True)
            model = AutoModel.from_pretrained(str(local), trust_remote_code=True, local_files_only=True)
        else:
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_id, **kwargs)
            model = AutoModel.from_pretrained(
                self.model_id, trust_remote_code=True, **kwargs
            )
        model.eval()
        if self.device != "cpu":
            model.to(self.device)
        self._model = model

    def warmup(self) -> None:
        self.predict([config.WARMUP_NAKDAN_INPUT])

    def predict(
        self,
        texts: list[str],
        mark_matres_lectionis: Optional[str] = None,
    ) -> list[str]:
        if self._model is None or self._tokenizer is None:
            raise RuntimeError("NakdanImpl not loaded")
        kwargs = {}
        if mark_matres_lectionis is not None:
            kwargs["mark_matres_lectionis"] = mark_matres_lectionis
        return list(self._model.predict(texts, self._tokenizer, **kwargs))

    def unload(self) -> None:
        self._model = None
        self._tokenizer = None
        import gc

        gc.collect()
        try:
            import torch

            if torch.cuda.is_available() and self.device != "cpu":
                torch.cuda.empty_cache()
        except Exception:
            pass
