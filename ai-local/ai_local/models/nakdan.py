from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Optional

from .. import config


def _is_link(path: Path) -> bool:
    return path.is_symlink()


def materialize_snapshot(cache_dir: Path, model_id: str) -> Optional[Path]:
    """The cached snapshot as a folder of real files; None when nothing is cached.

    O-031d (2026-09-28): the installed service started by the installer or the tray got
    OSError(22) opening a snapshot symlink that a console-started service read fine. Each link
    target is read as text and joined as a string, so the link itself is never opened; the file
    is hard-linked (same volume, no extra space) or copied where a link is refused.
    """
    repo = Path(cache_dir) / ("models--" + model_id.replace("/", "--"))
    try:
        revision = (repo / "refs" / "main").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    snapshot = repo / "snapshots" / revision
    if not revision or not snapshot.is_dir():
        return None
    target = Path(cache_dir).parent / "materialized" / model_id.replace("/", "--") / revision
    target.mkdir(parents=True, exist_ok=True)
    for entry in snapshot.iterdir():
        if entry.is_dir() and not _is_link(entry):
            continue
        if _is_link(entry):
            relative = os.readlink(entry)
            if relative.startswith("\\\\?\\"):
                relative = relative[4:]
            source = Path(os.path.normpath(os.path.join(str(entry.parent), relative)))
        else:
            source = entry
        dest = target / entry.name
        try:
            if dest.is_file() and dest.stat().st_size == source.stat().st_size:
                continue
            dest.unlink(missing_ok=True)
            try:
                os.link(source, dest)
            except OSError:
                shutil.copyfile(source, dest)
        except OSError:
            return None
    return target


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

        local = materialize_snapshot(self.cache_dir, self.model_id) if self.cache_dir is not None else None
        if local is not None:
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
