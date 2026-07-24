#!/usr/bin/env python3
"""Loopback-only runtime for LinguistPro C1 Experimental.

The companion reuses the frozen C1 feature extractor without modifying it. Raw
audio is accepted only as a bounded WAV request, written to a temporary file for
inference, and deleted in a finally block. No network provider or LinguistPro
server is called.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import hmac
import importlib.util
import json
import math
import os
import secrets
import sys
import tempfile
import threading
import wave
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


SCHEMA_VERSION = "c1.companion.1.0.0"
PROFILE_SCHEMA_VERSION = "c1.calibration.profile.1.0.0"
RESULT_SCHEMA_VERSION = "c1.pronunciation.advisory.1.0.0"
DEFAULT_PORT = 8766
MAX_AUDIO_BYTES = 10 * 1024 * 1024
MIN_DURATION_S = 0.25
MAX_DURATION_S = 12.0
QUALITY_DISCLOSURE = {
    "benchmark_sensitivity": 0.60,
    "benchmark_false_positive_rate": 0.30,
    "stress_detected": 2,
    "stress_total": 10,
    "maturity": "UNDERPOWERED",
}
PHONIKUD_TOKENIZER_SHA256 = "8e62e3b46c924e14fc32c749ef8944c311411ce9c4dc01c5b606953a169140ba"
EXERCISE_GUIDANCE = {
    "שלום": ("shalom", "Я говорю соседу «шалом»."),
    "התלמיד": ("hatalmid", "Ученик читает книгу."),
    "עברית": ("ivrit", "Я учу иврит каждый день."),
    "מדינה": ("medina", "Израиль — маленькая страна."),
    "ספרים": ("sfarim", "На столе лежат книги."),
    "חברים": ("khaverim", "Хорошие друзья встречаются вечером."),
    "עבודה": ("avoda", "Хорошая работа требует терпения."),
    "לומד": ("lomed", "Ребёнок учит иврит."),
    "כותב": ("kotev", "Дани пишет короткое письмо."),
    "שומע": ("shomea", "Я слушаю музыку дома."),
    "מדברת": ("medaberet", "Она хорошо говорит на иврите."),
    "ילדים": ("yeladim", "Дети играют во дворе."),
    "אנשים": ("anashim", "Люди ждут на остановке."),
    "משפחה": ("mishpakha", "Семья ест вместе."),
    "ארוחה": ("arukha", "Мы приготовили вкусную еду."),
    "בוקר": ("boker", "Доброе утро начинается с кофе."),
    "ערב": ("erev", "Тихий вечер опускается на город."),
    "כסף": ("kesef", "Деньги находятся в кошельке."),
    "חדר": ("kheder", "Маленькая комната находится наверху."),
    "ילד": ("yeled", "Счастливый ребёнок бежит во дворе."),
    "ספר": ("sefer", "Новая книга лежит на столе."),
    "לחם": ("lekhem", "Свежий хлеб готов на кухне."),
    "גשם": ("geshem", "Ночью шёл сильный дождь."),
    "כלב": ("kelev", "Маленькая собака ждёт снаружи."),
    "שמש": ("shemesh", "Сегодня светит тёплое солнце."),
}

REPO_ROOT = Path(__file__).resolve().parents[1]
FROZEN_DIR = Path(os.environ.get(
    "C1_FROZEN_DIR",
    REPO_ROOT / "docs" / "research" / "hermes-education-scaleup" / "rnd-c1-2026-07-24",
)).resolve()
FROZEN_SCORER = FROZEN_DIR / "prototype" / "c1_score.py"
FROZEN_MANIFEST = FROZEN_DIR / "benchmark_manifest.tsv"


class CompanionError(Exception):
    def __init__(self, code: str, status: int = 400, message: str | None = None):
        super().__init__(message or code)
        self.code = code
        self.status = status


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_frozen_module() -> Any:
    spec = importlib.util.spec_from_file_location("c1_frozen_score", FROZEN_SCORER)
    if spec is None or spec.loader is None:
        raise RuntimeError("FROZEN_SCORER_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_exercises() -> dict[str, dict[str, str]]:
    with FROZEN_MANIFEST.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    distorted = [row for row in rows if row.get("condition") == "DISTORTED"]
    if len(distorted) != 25:
        raise RuntimeError(f"EXERCISE_ALLOWLIST_INVALID:{len(distorted)}")
    exercises: dict[str, dict[str, str]] = {}
    for row in distorted:
        exercise_id = "c1-x" + row["id"].lower()
        exercise = dict(row)
        exercise["id"] = exercise_id
        exercise["condition"] = "NORMAL"
        exercise["expected_error_type"] = "NONE"
        exercise["audio_file"] = exercise_id + ".wav"
        guidance = EXERCISE_GUIDANCE.get(exercise["target_word"])
        if guidance is None:
            raise RuntimeError(f"EXERCISE_GUIDANCE_MISSING:{exercise['target_word']}")
        exercise["target_transliteration"] = guidance[0]
        exercise["sentence_translation_ru"] = guidance[1]
        exercises[exercise_id] = exercise
    if len(exercises) != 25 or len({row["target_word"] for row in exercises.values()}) != 25:
        raise RuntimeError("EXERCISE_TARGETS_NOT_UNIQUE")
    return exercises


def _vowel_model(normal: list[dict[str, Any]]) -> tuple[list[str], dict[str, list[float]], list[float]]:
    import numpy as np

    samples = [
        (vowel["expected"], float(vowel["f1"]), float(vowel["f2"]))
        for row in normal
        for vowel in row.get("vowels", [])
    ]
    counts = {label: sum(sample[0] == label for sample in samples) for label in "aeiou"}
    classes = sorted(label for label, count in counts.items() if count >= 3)
    if len(classes) < 3:
        raise CompanionError("PROFILE_VOWEL_CLASSES_INSUFFICIENT")
    values = np.asarray([(f1, f2) for _, f1, f2 in samples], dtype=np.float64)
    scale = np.std(values, axis=0)
    scale[scale < 1e-6] = 1.0
    centroids = {
        label: np.mean(
            np.asarray([(f1, f2) for sample_label, f1, f2 in samples if sample_label == label]),
            axis=0,
        ).tolist()
        for label in classes
    }
    return classes, centroids, scale.tolist()


def derive_profile(details_path: Path) -> dict[str, Any]:
    import numpy as np

    frozen = load_frozen_module()
    details = json.loads(details_path.read_text(encoding="utf-8"))
    if not isinstance(details, list) or len(details) != 75:
        raise CompanionError("DETAILS_SET_INVALID")
    normal_all = [row for row in details if row.get("condition") == "NORMAL"]
    normal = [row for row in normal_all if row.get("target_status") == "SCORABLE"]
    if len(normal_all) != 50 or len(normal) < 45:
        raise CompanionError("PROFILE_NORMAL_COVERAGE_INSUFFICIENT")

    calibration_scores: list[float] = []
    for item in normal:
        training = [candidate for candidate in normal if candidate.get("id") != item.get("id")]
        score = frozen.vowel_anomaly_score(training, item)
        if score is not None:
            calibration_scores.append(float(score))
    if len(calibration_scores) < 20:
        raise CompanionError("PROFILE_VOWEL_CALIBRATION_INSUFFICIENT")

    stress_values = [
        float(row["expected_prominence_lead"])
        for row in normal
        if row.get("expected_prominence_lead") is not None
    ]
    if len(stress_values) < 10:
        raise CompanionError("PROFILE_STRESS_CALIBRATION_INSUFFICIENT")

    classes, centroids, scale = _vowel_model(normal)
    return {
        "schema_version": PROFILE_SCHEMA_VERSION,
        "source_details_sha256": sha256(details_path),
        "normal_total": len(normal_all),
        "normal_scorable": len(normal),
        "vowel_classes": classes,
        "vowel_centroids_hz": centroids,
        "vowel_scale_hz": scale,
        "vowel_threshold": float(np.quantile(calibration_scores, 0.80)),
        "stress_threshold": float(np.quantile(stress_values, 0.10)),
        "quality_disclosure": QUALITY_DISCLOSURE,
        "personal_profile": True,
        "storage_contract": "LOCAL_ONLY_DO_NOT_UPLOAD_OR_COMMIT",
    }


def write_profile(details_path: Path, output_path: Path) -> dict[str, Any]:
    profile = derive_profile(details_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(output_path)
    return profile


def validate_profile(profile: Any) -> dict[str, Any]:
    if not isinstance(profile, dict) or profile.get("schema_version") != PROFILE_SCHEMA_VERSION:
        raise CompanionError("PROFILE_SCHEMA_INVALID")
    classes = profile.get("vowel_classes")
    centroids = profile.get("vowel_centroids_hz")
    scale = profile.get("vowel_scale_hz")
    if not isinstance(classes, list) or len(classes) < 3:
        raise CompanionError("PROFILE_VOWEL_CLASSES_INVALID")
    if not isinstance(centroids, dict) or any(label not in centroids for label in classes):
        raise CompanionError("PROFILE_CENTROIDS_INVALID")
    if not isinstance(scale, list) or len(scale) != 2 or any(float(value) <= 0 for value in scale):
        raise CompanionError("PROFILE_SCALE_INVALID")
    for key in ("vowel_threshold", "stress_threshold"):
        if not math.isfinite(float(profile.get(key, float("nan")))):
            raise CompanionError("PROFILE_THRESHOLD_INVALID")
    return profile


def apply_profile(item: dict[str, Any], profile: dict[str, Any]) -> list[str]:
    import numpy as np

    if item.get("target_status") != "SCORABLE":
        return []
    classes = profile["vowel_classes"]
    centroids = {label: np.asarray(profile["vowel_centroids_hz"][label]) for label in classes}
    scale = np.asarray(profile["vowel_scale_hz"], dtype=np.float64)
    vowel_scores: list[float] = []
    for vowel in item.get("vowels", []):
        expected = vowel.get("expected")
        if expected not in centroids:
            continue
        point = np.asarray([float(vowel["f1"]), float(vowel["f2"])], dtype=np.float64)
        distances = {label: float(np.linalg.norm((point - center) / scale)) for label, center in centroids.items()}
        alternatives = [value for label, value in distances.items() if label != expected]
        if alternatives:
            vowel_scores.append(distances[expected] - min(alternatives))
    issues: list[str] = []
    if vowel_scores and max(vowel_scores) > float(profile["vowel_threshold"]):
        issues.append("POSSIBLE_VOWEL_SUBSTITUTION")
    prominence = item.get("expected_prominence_lead")
    if prominence is not None and float(prominence) < float(profile["stress_threshold"]):
        issues.append("POSSIBLE_STRESS_SHIFT")
    return issues


def validate_wav(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as handle:
            channels = handle.getnchannels()
            rate = handle.getframerate()
            frames = handle.getnframes()
            width = handle.getsampwidth()
    except (wave.Error, EOFError) as error:
        raise CompanionError("AUDIO_WAV_INVALID") from error
    if channels not in (1, 2) or rate < 8_000 or rate > 96_000 or width not in (2, 3, 4):
        raise CompanionError("AUDIO_FORMAT_UNSUPPORTED")
    duration = frames / rate if rate else 0.0
    if duration < MIN_DURATION_S:
        raise CompanionError("AUDIO_TOO_SHORT")
    if duration > MAX_DURATION_S:
        raise CompanionError("AUDIO_TOO_LONG")
    return duration


def load_local_phonikud(model_path: Path, tokenizer_path: Path) -> Any:
    """Load Phonikud without a repository lookup or Hugging Face network path."""
    if not tokenizer_path.is_file() or sha256(tokenizer_path) != PHONIKUD_TOKENIZER_SHA256:
        raise CompanionError("PHONIKUD_TOKENIZER_MISSING_OR_MISMATCH", 503)
    import onnxruntime as ort
    from phonikud_onnx import OnnxModel, Phonikud
    from tokenizers import Tokenizer

    model = OnnxModel.__new__(OnnxModel)
    model.tokenizer = Tokenizer.from_file(str(tokenizer_path))
    model.max_context_length = 2046
    model.session = ort.InferenceSession(str(model_path))
    model.input_names = [item.name for item in model.session.get_inputs()]
    model.output_names = [item.name for item in model.session.get_outputs()]
    g2p = Phonikud.__new__(Phonikud)
    g2p.model = model
    return g2p


class CompanionEngine:
    def __init__(self, profile_path: Path, phonikud_model: Path, torch_home: Path, scratch_dir: Path):
        self.profile_path = profile_path
        self.phonikud_model = phonikud_model
        self.torch_home = torch_home
        self.scratch_dir = scratch_dir
        self.exercises = load_exercises()
        self._profile: dict[str, Any] | None = None
        self._frozen: Any = None
        self._runtime: Any = None
        self._g2p: Any = None
        self._phonemize: Any = None
        self._lock = threading.Lock()

    def profile(self) -> dict[str, Any]:
        if self._profile is None:
            if not self.profile_path.is_file():
                raise CompanionError("PROFILE_REQUIRED", 409)
            self._profile = validate_profile(json.loads(self.profile_path.read_text(encoding="utf-8")))
        return self._profile

    def _load_runtime(self) -> None:
        if self._runtime is not None:
            return
        frozen = load_frozen_module()
        checkpoint = self.torch_home / "hub" / "checkpoints" / "model.pt"
        if not checkpoint.is_file() or frozen.sha256(checkpoint) != frozen.MMS_FA_SHA256:
            raise CompanionError("MMS_FA_CHECKPOINT_MISSING_OR_MISMATCH", 503)
        if not self.phonikud_model.is_file() or frozen.sha256(self.phonikud_model) != frozen.PHONIKUD_SHA256:
            raise CompanionError("PHONIKUD_MODEL_MISSING_OR_MISMATCH", 503)
        os.environ["TORCH_HOME"] = str(self.torch_home)
        from phonikud import phonemize

        self._frozen = frozen
        tokenizer_file = os.environ.get("C1_PHONIKUD_TOKENIZER", "").strip()
        if tokenizer_file:
            self._g2p = load_local_phonikud(self.phonikud_model, Path(tokenizer_file).resolve())
        else:
            # Backward-compatible C1-X loopback path. C1-P always supplies the
            # pinned local tokenizer and therefore never reaches this branch.
            from phonikud_onnx import Phonikud

            self._g2p = Phonikud(str(self.phonikud_model))
        self._phonemize = phonemize
        self._runtime = frozen.load_runtime()

    def health(self) -> dict[str, Any]:
        checkpoint = self.torch_home / "hub" / "checkpoints" / "model.pt"
        return {
            "ok": True,
            "schema_version": SCHEMA_VERSION,
            "bind_contract": "LOOPBACK_ONLY",
            "profile_ready": self.profile_path.is_file(),
            "phonikud_model_present": self.phonikud_model.is_file(),
            "mms_fa_checkpoint_present": checkpoint.is_file(),
            "runtime_loaded": self._runtime is not None,
            "exercise_count": len(self.exercises),
            "quality_disclosure": QUALITY_DISCLOSURE,
        }

    def public_exercises(self) -> list[dict[str, Any]]:
        return [
            {
                "id": exercise_id,
                "target_word": row["target_word"],
                "expected_target_vocalized": row["expected_target_vocalized"],
                "target_transliteration": row["target_transliteration"],
                "sentence": row["sentence"],
                "sentence_translation_ru": row["sentence_translation_ru"],
                "target_index": int(row["target_index"]),
            }
            for exercise_id, row in self.exercises.items()
        ]

    def score(self, exercise_id: str, wav_bytes: bytes) -> dict[str, Any]:
        if exercise_id not in self.exercises:
            raise CompanionError("EXERCISE_NOT_ALLOWED", 404)
        if not self._lock.acquire(blocking=False):
            raise CompanionError("COMPANION_BUSY", 429)
        temp_path: Path | None = None
        try:
            profile = self.profile()
            self._load_runtime()
            self.scratch_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(prefix="c1-attempt-", suffix=".wav", dir=self.scratch_dir, delete=False) as handle:
                handle.write(wav_bytes)
                temp_path = Path(handle.name)
            duration = validate_wav(temp_path)
            row = dict(self.exercises[exercise_id])
            item = self._frozen.score_item(row, temp_path, self._runtime, self._g2p, self._phonemize)
            issues = apply_profile(item, profile)
            alignment_score = item.get("alignment_score")
            alignment = "UNAVAILABLE"
            if alignment_score is not None:
                alignment = "LOW" if alignment_score < 0.15 else ("MEDIUM" if alignment_score < 0.30 else "HIGH")
            return {
                "ok": True,
                "schema_version": RESULT_SCHEMA_VERSION,
                "exercise_id": exercise_id,
                "target_word": row["target_word"],
                "target_status": item.get("target_status", "UNSCORABLE"),
                "reason": item.get("reason"),
                "possible_issues": issues,
                "alignment_quality": alignment,
                "duration_s": round(duration, 3),
                "advisory_only": True,
                "quality_disclosure": QUALITY_DISCLOSURE,
            }
        finally:
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass
            self._lock.release()


class CompanionServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], engine: CompanionEngine, token: str, allowed_origins: set[str]):
        super().__init__(address, CompanionHandler)
        self.engine = engine
        self.token = token
        self.allowed_origins = allowed_origins


class CompanionHandler(BaseHTTPRequestHandler):
    server: CompanionServer
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[c1-companion] {self.command} {urlparse(self.path).path} {args[1] if len(args) > 1 else ''}", file=sys.stderr)

    def _origin(self) -> str | None:
        origin = self.headers.get("Origin")
        return origin if origin in self.server.allowed_origins else None

    def _headers(self, status: int, content_type: str = "application/json; charset=utf-8", length: int = 0) -> None:
        self.send_response(status)
        origin = self._origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.end_headers()

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._headers(status, length=len(body))
        self.wfile.write(body)

    def _authorize(self) -> None:
        if self.headers.get("Origin") not in self.server.allowed_origins:
            raise CompanionError("ORIGIN_NOT_ALLOWED", 403)
        supplied = self.headers.get("X-C1-Token", "")
        if not hmac.compare_digest(supplied, self.server.token):
            raise CompanionError("TOKEN_INVALID", 401)

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self.headers.get("Origin") not in self.server.allowed_origins:
            self._json(403, {"ok": False, "error": "ORIGIN_NOT_ALLOWED"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-C1-Token")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        try:
            self._authorize()
            path = urlparse(self.path).path
            if path == "/v1/health":
                self._json(200, self.server.engine.health())
            elif path == "/v1/exercises":
                self._json(200, {"ok": True, "schema_version": SCHEMA_VERSION, "exercises": self.server.engine.public_exercises()})
            else:
                raise CompanionError("NOT_FOUND", 404)
        except CompanionError as error:
            self._json(error.status, {"ok": False, "error": error.code})
        except Exception:
            self._json(500, {"ok": False, "error": "INTERNAL_ERROR"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            self._authorize()
            parsed = urlparse(self.path)
            if parsed.path != "/v1/score":
                raise CompanionError("NOT_FOUND", 404)
            if self.headers.get_content_type() not in ("audio/wav", "audio/x-wav", "audio/wave"):
                raise CompanionError("CONTENT_TYPE_WAV_REQUIRED", 415)
            raw_length = self.headers.get("Content-Length")
            if raw_length is None:
                raise CompanionError("CONTENT_LENGTH_REQUIRED", 411)
            length = int(raw_length)
            if length <= 0 or length > MAX_AUDIO_BYTES:
                raise CompanionError("AUDIO_SIZE_INVALID", 413)
            payload = self.rfile.read(length)
            if len(payload) != length:
                raise CompanionError("AUDIO_BODY_INCOMPLETE")
            exercise_id = parse_qs(parsed.query).get("exercise_id", [""])[0]
            self._json(200, self.server.engine.score(exercise_id, payload))
        except ValueError:
            self._json(400, {"ok": False, "error": "REQUEST_INVALID"})
        except CompanionError as error:
            self._json(error.status, {"ok": False, "error": error.code})
        except Exception:
            self._json(500, {"ok": False, "error": "INTERNAL_ERROR"})


def load_or_create_token(path: Path) -> str:
    if path.is_file():
        token = path.read_text(encoding="utf-8").strip()
        if len(token) >= 32:
            return token
        raise CompanionError("TOKEN_FILE_INVALID")
    path.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(32)
    path.write_text(token + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return token


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    profile = sub.add_parser("build-profile")
    profile.add_argument("--details", type=Path, required=True)
    profile.add_argument("--output", type=Path, required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--profile", type=Path, required=True)
    serve.add_argument("--phonikud-model", type=Path, required=True)
    serve.add_argument("--torch-home", type=Path, required=True)
    serve.add_argument("--scratch-dir", type=Path, required=True)
    serve.add_argument("--token-file", type=Path, required=True)
    serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    serve.add_argument("--allowed-origin", action="append", required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "build-profile":
        profile = write_profile(args.details.resolve(), args.output.resolve())
        print(json.dumps({
            "status": "PASS",
            "schema_version": profile["schema_version"],
            "normal_total": profile["normal_total"],
            "normal_scorable": profile["normal_scorable"],
            "output": str(args.output.resolve()),
        }, ensure_ascii=False))
        return 0
    if args.port < 1024 or args.port > 65535:
        raise CompanionError("PORT_INVALID")
    allowed = {origin.rstrip("/") for origin in args.allowed_origin}
    if any(not (origin.startswith("https://") or origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")) for origin in allowed):
        raise CompanionError("ALLOWED_ORIGIN_INVALID")
    token = load_or_create_token(args.token_file.resolve())
    engine = CompanionEngine(
        args.profile.resolve(), args.phonikud_model.resolve(), args.torch_home.resolve(), args.scratch_dir.resolve()
    )
    server = CompanionServer(("127.0.0.1", args.port), engine, token, allowed)
    print(f"C1 companion: http://127.0.0.1:{args.port}")
    print(f"C1 companion token: {token}")
    print("Audio and calibration remain local. Press Ctrl+C to stop.")
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
