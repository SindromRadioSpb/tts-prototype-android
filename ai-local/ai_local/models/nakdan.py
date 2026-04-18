from __future__ import annotations

from pathlib import Path
from typing import Optional

from .. import config


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
