from __future__ import annotations

from pathlib import Path
from typing import Optional

from .. import config


class TranslatorImpl:
    """
    MADLAD-400 via CTranslate2. Loads a converted CT2 model directory that must
    also contain `spiece.model` (SentencePiece). See scripts/convert_madlad.py.
    """

    def __init__(
        self,
        model_dir: Path = config.MADLAD_MODEL_DIR,
        device: str = config.MADLAD_DEVICE,
        compute_type: str = config.MADLAD_COMPUTE_TYPE,
        beam_size: int = config.MADLAD_BEAM_SIZE,
        max_decoding_length: int = config.MADLAD_MAX_DECODING_LENGTH,
        max_batch_size: int = config.MADLAD_MAX_BATCH_SIZE,
    ) -> None:
        self.model_dir = Path(model_dir)
        self.device = device
        self.compute_type = compute_type
        self.beam_size = beam_size
        self.max_decoding_length = max_decoding_length
        self.max_batch_size = max_batch_size
        self.version = config.MADLAD_MODEL_VERSION
        self._translator = None
        self._sp = None

    def load(self) -> None:
        import ctranslate2
        import sentencepiece as spm

        if not self.model_dir.exists():
            raise FileNotFoundError(
                f"CT2 model directory not found: {self.model_dir}. "
                "Run scripts/convert_madlad.py first."
            )
        spm_path = self.model_dir / "spiece.model"
        if not spm_path.exists():
            raise FileNotFoundError(
                f"spiece.model missing in {self.model_dir}. Re-run conversion with "
                "--copy_files spiece.model."
            )

        self._translator = ctranslate2.Translator(
            str(self.model_dir),
            device=self.device,
            compute_type=self.compute_type,
        )
        sp = spm.SentencePieceProcessor()
        sp.Load(str(spm_path))
        self._sp = sp

    def warmup(self) -> None:
        self.translate_batch(
            [config.WARMUP_TRANSLATOR_INPUT],
            target_lang=config.WARMUP_TRANSLATOR_TARGET,
        )

    def _encode(self, text: str, target_lang: str) -> list[str]:
        if self._sp is None:
            raise RuntimeError("TranslatorImpl not loaded")
        prefixed = f"<2{target_lang}> {text}"
        return self._sp.EncodeAsPieces(prefixed)

    def translate_batch(
        self,
        texts: list[str],
        target_lang: str,
        beam_size: Optional[int] = None,
    ) -> list[str]:
        if self._translator is None or self._sp is None:
            raise RuntimeError("TranslatorImpl not loaded")
        if not texts:
            return []
        batch_tokens = [self._encode(t, target_lang) for t in texts]
        results = self._translator.translate_batch(
            batch_tokens,
            beam_size=beam_size or self.beam_size,
            max_decoding_length=self.max_decoding_length,
            max_batch_size=self.max_batch_size,
        )
        return [self._sp.DecodePieces(r.hypotheses[0]) for r in results]

    def unload(self) -> None:
        self._translator = None
        self._sp = None
        import gc

        gc.collect()
        try:
            import torch

            if torch.cuda.is_available() and self.device.startswith("cuda"):
                torch.cuda.empty_cache()
        except Exception:
            pass
