from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SMOKE_PHRASES = [
    "שלום עולם",
    "ברוך אתה",
    "בָּרוּךְ אַתָּה",
    "העברית היא שפה עתיקה ומתחדשת.",
    "אני רוצה לשמוע את הטקסט הזה בעברית טבעית.",
    "הילדים אהבו במיוחד את הסיפורים הללו שהמורה הקריאה.",
    "זהו מבחן קצר של מערכת דיבור בעברית.",
    "אני לומד עברית ורוצה לשמוע כל מילה בצורה ברורה.",
]

MAX_TEXT_CHARS = 500
LICENSE_STATUS = "research_only"
QUALITY_TIER = "experimental"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def experiment_root() -> Path:
    return Path(__file__).resolve().parent


def cache_dir() -> Path:
    return experiment_root() / ".cache"


def output_dir() -> Path:
    return experiment_root() / "out"


def sanitize_text(text: str, max_chars: int = MAX_TEXT_CHARS) -> str:
    value = " ".join(str(text or "").split()).strip()
    if not value:
        raise ValueError("empty_text")
    if len(value) > max_chars:
        value = value[:max_chars].rstrip()
    return value


def safe_output_name(index: int, text: str) -> str:
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]
    return f"{index:02d}_{digest}.wav"


def write_ascii_config_copy(config_path: Path) -> Path:
    config_data = json.loads(config_path.read_text(encoding="utf-8"))
    target = config_path.with_name("model.config.ascii.json")
    target.write_text(json.dumps(config_data, ensure_ascii=True, indent=2), encoding="ascii")
    return target


@dataclass
class SynthesisResult:
    phrase: str
    vocalized: str
    phonemes: str
    wav_path: str
    sample_rate: int
    g2p_ms: float
    tts_ms: float
    total_ms: float
    duration_ms: float
    notes: str
    model_path: str
    config_path: str
    phonikud_model_path: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "phrase": self.phrase,
            "vocalized": self.vocalized,
            "phonemes": self.phonemes,
            "wavPath": self.wav_path,
            "sampleRate": self.sample_rate,
            "g2pMs": self.g2p_ms,
            "ttsMs": self.tts_ms,
            "totalMs": self.total_ms,
            "durationMs": self.duration_ms,
            "notes": self.notes,
            "modelPath": self.model_path,
            "configPath": self.config_path,
            "phonikudModelPath": self.phonikud_model_path,
            "licenseStatus": LICENSE_STATUS,
            "qualityTier": QUALITY_TIER,
        }


class PhonikudPiperPocEngine:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = Path(base_dir) if base_dir else experiment_root()
        self.cache_dir = self.base_dir / ".cache"
        self.out_dir = self.base_dir / "out"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._assets: dict[str, str] | None = None
        self._phonikud = None
        self._piper = None

    def ensure_assets(self) -> dict[str, str]:
        if self._assets:
            return self._assets

        from huggingface_hub import hf_hub_download

        phonikud_model = hf_hub_download(
            "thewh1teagle/phonikud-onnx",
            "phonikud-1.0.int8.onnx",
            local_dir=self.cache_dir / "phonikud-onnx",
        )
        model_path = hf_hub_download(
            "thewh1teagle/phonikud-tts-checkpoints",
            "shaul.onnx",
            local_dir=self.cache_dir / "phonikud-tts-checkpoints",
        )
        raw_config_path = Path(
            hf_hub_download(
                "thewh1teagle/phonikud-tts-checkpoints",
                "model.config.json",
                local_dir=self.cache_dir / "phonikud-tts-checkpoints",
            )
        )
        config_path = write_ascii_config_copy(raw_config_path)
        self._assets = {
            "phonikudModelPath": str(phonikud_model),
            "modelPath": str(model_path),
            "configPath": str(config_path),
        }
        return self._assets

    def _ensure_models(self) -> None:
        if self._phonikud is not None and self._piper is not None:
            return

        from phonikud_onnx import Phonikud
        from piper_onnx import Piper

        assets = self.ensure_assets()
        if self._phonikud is None:
            self._phonikud = Phonikud(assets["phonikudModelPath"])
        if self._piper is None:
            self._piper = Piper(assets["modelPath"], assets["configPath"])

    def synthesize_to_file(self, text: str, out_path: Path) -> SynthesisResult:
        from phonikud import phonemize
        import soundfile as sf

        value = sanitize_text(text)
        self._ensure_models()
        assets = self.ensure_assets()

        total_started = time.perf_counter()
        g2p_started = time.perf_counter()
        vocalized = self._phonikud.add_diacritics(value)
        phonemes = phonemize(vocalized)
        g2p_ms = round((time.perf_counter() - g2p_started) * 1000, 1)

        tts_started = time.perf_counter()
        samples, sample_rate = self._piper.create(phonemes, is_phonemes=True)
        tts_ms = round((time.perf_counter() - tts_started) * 1000, 1)

        out_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(out_path, samples, sample_rate)
        total_ms = round((time.perf_counter() - total_started) * 1000, 1)
        duration_ms = round((len(samples) / float(sample_rate)) * 1000, 1)

        return SynthesisResult(
            phrase=value,
            vocalized=vocalized,
            phonemes=phonemes,
            wav_path=str(out_path.resolve()),
            sample_rate=int(sample_rate),
            g2p_ms=g2p_ms,
            tts_ms=tts_ms,
            total_ms=total_ms,
            duration_ms=duration_ms,
            notes="Research-only PoC. Manual listening review pending.",
            model_path=assets["modelPath"],
            config_path=assets["configPath"],
            phonikud_model_path=assets["phonikudModelPath"],
        )

    def run_smoke(self, phrases: list[str] | None = None) -> list[dict[str, Any]]:
        results = []
        for index, phrase in enumerate(phrases or SMOKE_PHRASES, start=1):
            out_path = self.out_dir / safe_output_name(index, phrase)
            result = self.synthesize_to_file(phrase, out_path)
            results.append(result.to_dict())
        return results
