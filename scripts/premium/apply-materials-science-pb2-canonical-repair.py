#!/usr/bin/env python3
"""Execute the separately approved, finite Materials PB2 text repair.

Without --execute this command is a read-only preflight and cannot read a
credential or call the provider. Execution requires the exact owner token from
the costed plan. It never imports, publishes, creates audio, or handles worked
solutions.
"""

from __future__ import annotations

import argparse
import base64
import difflib
import hashlib
import json
import os
import re
import math
import tempfile
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PLAN_STATUS = "PLANNED_NOT_APPROVED_NO_PROVIDER_CALLS"
PREFLIGHT_STATUS = "PASS_OFFLINE_PREFLIGHT_AWAITING_OWNER_APPROVAL_NO_PROVIDER_CALLS"
INPUT_RATE = 0.75
OUTPUT_RATE = 3.75
INPUT_CAP = 50_000
OUTPUT_CAP = 32_768
MAX_CALLS = 12
MAX_ATTEMPTS_PER_BATCH = 2
HARD_MAX_USD = 2.0
NIQQUD = re.compile(r"[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7]")
HEBREW = re.compile(r"[\u05D0-\u05EA]")
CYRILLIC = re.compile(r"[А-Яа-яЁё]")
LATIN = re.compile(r"[A-Za-z]")
HEBREW_OR_NIQQUD = re.compile(r"[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA]")
HEBREW_WORD = re.compile(r"[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA]+")
MATRES_LECTIONIS = frozenset("אהוי")
MIN_PROVIDER_TO_LEGACY_SEMANTIC_SIMILARITY = 0.72


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def atomic_write_new_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise RuntimeError(f"refusing to overwrite immutable raw cache: {path.name}")
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_api_key(path: Path) -> str:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise RuntimeError("credential file is empty")
    if raw.startswith("{"):
        value = json.loads(raw)
        for name in ("api_key", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
            if isinstance(value.get(name), str) and value[name].strip():
                return value[name].strip()
        raise RuntimeError("credential JSON has no recognized field")
    if "=" in raw:
        raw = raw.split("=", 1)[1].strip()
    raw = raw.strip("\"'").strip()
    if not raw:
        raise RuntimeError("credential file contains no value")
    return raw


def normalized_skeleton(value: str) -> str:
    return " ".join(NIQQUD.sub("", unicodedata.normalize("NFC", value)).split())


def niqqud_coverage(value: str) -> tuple[int, int]:
    return len(HEBREW.findall(value)), len(NIQQUD.findall(value))


def semantic_similarity(left: str, right: str) -> float:
    left = " ".join(normalized_skeleton(left).split())
    right = " ".join(normalized_skeleton(right).split())
    if not left or not right:
        return 1.0 if left == right else 0.0
    return difflib.SequenceMatcher(None, left, right, autojunk=False).ratio()


def _vocalized_clusters(word: str) -> list[tuple[str, str]]:
    clusters: list[tuple[str, str]] = []
    for character in unicodedata.normalize("NFC", word):
        if HEBREW.fullmatch(character):
            clusters.append((character, ""))
        elif NIQQUD.fullmatch(character) and clusters:
            base, marks = clusters[-1]
            clusters[-1] = (base, marks + character)
        else:
            raise ValueError("unexpected character inside Hebrew word")
    return clusters


def _project_word_niqqud(plain_word: str, vocalized_word: str) -> str | None:
    """Project points onto full spelling without accepting consonant changes."""
    plain_letters = list(plain_word)
    vocalized = _vocalized_clusters(vocalized_word)
    vocal_letters = [base for base, _marks in vocalized]
    height, width = len(plain_letters) + 1, len(vocal_letters) + 1
    infinity = height + width + 1
    costs = [[infinity] * width for _ in range(height)]
    previous: list[list[tuple[int, int, str] | None]] = [[None] * width for _ in range(height)]
    costs[0][0] = 0
    for plain_index in range(height):
        for vocal_index in range(width):
            current = costs[plain_index][vocal_index]
            if current == infinity:
                continue
            if plain_index < len(plain_letters) and vocal_index < len(vocal_letters) \
                    and plain_letters[plain_index] == vocal_letters[vocal_index] \
                    and current < costs[plain_index + 1][vocal_index + 1]:
                costs[plain_index + 1][vocal_index + 1] = current
                previous[plain_index + 1][vocal_index + 1] = (plain_index, vocal_index, "match")
            if plain_index < len(plain_letters) and plain_letters[plain_index] in MATRES_LECTIONIS \
                    and current + 1 < costs[plain_index + 1][vocal_index]:
                costs[plain_index + 1][vocal_index] = current + 1
                previous[plain_index + 1][vocal_index] = (plain_index, vocal_index, "plain_mater")
            if vocal_index < len(vocal_letters) and vocal_letters[vocal_index] in MATRES_LECTIONIS \
                    and current + 1 < costs[plain_index][vocal_index + 1]:
                costs[plain_index][vocal_index + 1] = current + 1
                previous[plain_index][vocal_index + 1] = (plain_index, vocal_index, "vocal_mater")
    if costs[-1][-1] == infinity:
        return None
    marks_by_plain_index = [""] * len(plain_letters)
    plain_index, vocal_index = len(plain_letters), len(vocal_letters)
    while plain_index or vocal_index:
        step = previous[plain_index][vocal_index]
        if step is None:
            return None
        prior_plain, prior_vocal, operation = step
        if operation == "match":
            marks_by_plain_index[prior_plain] = vocalized[prior_vocal][1]
        plain_index, vocal_index = prior_plain, prior_vocal
    return "".join(letter + marks_by_plain_index[index] for index, letter in enumerate(plain_letters))


def project_niqqud_to_plain_skeleton(plain: str, vocalized: str) -> str | None:
    plain = unicodedata.normalize("NFC", plain)
    vocalized = unicodedata.normalize("NFC", vocalized)
    plain_words = list(HEBREW_WORD.finditer(plain))
    vocalized_words = list(HEBREW_WORD.finditer(vocalized))
    if len(plain_words) != len(vocalized_words):
        return None
    if HEBREW.sub("", plain) != HEBREW_OR_NIQQUD.sub("", vocalized):
        return None
    projected_words: list[str] = []
    for plain_match, vocalized_match in zip(plain_words, vocalized_words):
        projected = _project_word_niqqud(plain_match.group(), vocalized_match.group())
        if projected is None:
            return None
        projected_words.append(projected)
    pieces: list[str] = []
    cursor = 0
    for match, projected in zip(plain_words, projected_words):
        pieces.append(plain[cursor:match.start()])
        pieces.append(projected)
        cursor = match.end()
    pieces.append(plain[cursor:])
    result = "".join(pieces)
    return result if normalized_skeleton(result) == normalized_skeleton(plain) else None


def project_niqqud_words_onto_source_plain(plain: str, vocalized: str) -> str | None:
    """Preserve source punctuation/data while transferring safe word-level points."""
    plain = unicodedata.normalize("NFC", plain)
    vocalized_words = list(HEBREW_WORD.finditer(unicodedata.normalize("NFC", vocalized)))
    plain_words = list(HEBREW_WORD.finditer(plain))
    if not plain_words or len(plain_words) != len(vocalized_words):
        return None
    projected_words: list[str] = []
    projected_count = 0
    for plain_match, vocalized_match in zip(plain_words, vocalized_words):
        projected = _project_word_niqqud(plain_match.group(), vocalized_match.group())
        if projected is None:
            projected = plain_match.group()
        else:
            projected_count += 1
        projected_words.append(projected)
    if projected_count / len(plain_words) < 0.8:
        return None
    pieces: list[str] = []
    cursor = 0
    for match, projected in zip(plain_words, projected_words):
        pieces.append(plain[cursor:match.start()])
        pieces.append(projected)
        cursor = match.end()
    pieces.append(plain[cursor:])
    result = "".join(pieces)
    return result if normalized_skeleton(result) == normalized_skeleton(plain) else None


def validate_payload(value: Any, blueprint: dict[str, Any], candidates: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    expected_ids = blueprint["expected_row_ids"]
    if not isinstance(value, dict) or set(value) != {"batch_id", "rows"}:
        raise ValueError("root fields must be exactly batch_id and rows")
    if value.get("batch_id") != blueprint["batch_id"]:
        errors.append("batch_id mismatch")
    rows = value.get("rows")
    if not isinstance(rows, list):
        raise ValueError("rows must be an array")
    actual_ids = [row.get("row_id") if isinstance(row, dict) else None for row in rows]
    if actual_ids != expected_ids:
        errors.append("row_id sequence mismatch")
    source_by_id = {row["row_id"]: row for row in candidates["rows"]}
    valid_rows: list[dict[str, str]] = []
    niqqud_skeleton_normalization_count = 0
    source_verified_legacy_fallback_row_ids: list[str] = []
    for index, row in enumerate(rows):
        row_id = actual_ids[index] if index < len(actual_ids) else None
        if not isinstance(row, dict) or set(row) != {"row_id", "he", "he_niqqud", "transliteration", "ru"}:
            errors.append(f"row fields mismatch at index {index}")
            continue
        if any(not isinstance(row.get(field), str) for field in ("row_id", "he", "he_niqqud", "transliteration", "ru")):
            errors.append(f"{row_id or index}: non-string row field")
            continue
        source = source_by_id.get(row_id, {})
        source_he = normalized_skeleton(str(source.get("he") or "").strip())
        source_row_complete = all(
            str(source.get(field) or "").strip()
            for field in ("he", "he_niqqud", "transliteration", "ru")
        )
        source_has_hebrew = bool(HEBREW.search(source_he))
        provider_he = unicodedata.normalize("NFC", row["he"].strip())
        provider_he_niqqud = unicodedata.normalize("NFC", row["he_niqqud"].strip())
        provider_points_on_source = project_niqqud_words_onto_source_plain(source_he, provider_he_niqqud)
        provider_skeleton_projectable = (
            normalized_skeleton(provider_he) == normalized_skeleton(provider_he_niqqud)
            or project_niqqud_to_plain_skeleton(provider_he, provider_he_niqqud) is not None
            or (
                semantic_similarity(source_he, provider_he) >= MIN_PROVIDER_TO_LEGACY_SEMANTIC_SIMILARITY
                and project_niqqud_words_onto_source_plain(provider_he, provider_he_niqqud) is not None
            )
        )
        provider_basic_gate_failed = (
            any(not row[field].strip() for field in ("he", "he_niqqud", "transliteration", "ru"))
            or bool(NIQQUD.search(provider_he))
            or not provider_skeleton_projectable
            or (source_has_hebrew and not HEBREW.search(provider_he))
            or (source_has_hebrew and not CYRILLIC.search(row["ru"]))
            or (source_has_hebrew and not LATIN.search(row["transliteration"]))
            or any(
                marker in field
                for field in (provider_he, provider_he_niqqud, row["transliteration"], row["ru"])
                for marker in ("```", "<script", "</script>")
            )
        )
        if source_row_complete and (
            provider_basic_gate_failed
            or semantic_similarity(source_he, provider_he) < MIN_PROVIDER_TO_LEGACY_SEMANTIC_SIMILARITY
        ):
            row = {
                "row_id": row_id,
                "he": source_he,
                "he_niqqud": provider_points_on_source or str(source.get("he_niqqud") or "").strip(),
                "transliteration": str(source.get("transliteration") or "").strip(),
                "ru": str(source.get("ru") or "").strip(),
            }
            source_verified_legacy_fallback_row_ids.append(row_id)
        for field in ("row_id", "he", "he_niqqud", "transliteration", "ru"):
            if not row[field].strip():
                errors.append(f"{row_id or index}: empty {field}")
        if errors and any(str(row_id or index) in item for item in errors[-5:]):
            continue
        he = unicodedata.normalize("NFC", row["he"].strip())
        he_niqqud = unicodedata.normalize("NFC", row["he_niqqud"].strip())
        transliteration = row["transliteration"].strip()
        ru = row["ru"].strip()
        if NIQQUD.search(he):
            errors.append(f"{row_id}: plain Hebrew contains niqqud")
        if normalized_skeleton(he) != normalized_skeleton(he_niqqud):
            projected = project_niqqud_to_plain_skeleton(he, he_niqqud) \
                or project_niqqud_words_onto_source_plain(he, he_niqqud)
            if projected is None:
                errors.append(f"{row_id}: Hebrew consonant skeleton mismatch")
            else:
                he_niqqud = projected
                niqqud_skeleton_normalization_count += 1
        hebrew_letters, niqqud_marks = niqqud_coverage(he_niqqud)
        if source_has_hebrew and hebrew_letters >= 3 \
                and niqqud_marks < max(1, math.ceil(hebrew_letters * 0.15)):
            errors.append(f"{row_id}: vocalized Hebrew has insufficient niqqud coverage")
        if source_has_hebrew and not HEBREW.search(he):
            errors.append(f"{row_id}: Hebrew content disappeared")
        if source_has_hebrew and not CYRILLIC.search(ru):
            errors.append(f"{row_id}: Russian translation lacks Cyrillic")
        if source_has_hebrew and not LATIN.search(transliteration):
            errors.append(f"{row_id}: transliteration lacks Latin characters")
        if any(marker in field for field in (he, he_niqqud, transliteration, ru) for marker in ("```", "<script", "</script>")):
            errors.append(f"{row_id}: prohibited wrapper or markup")
        valid_rows.append({
            "row_id": row_id,
            "he": he,
            "he_niqqud": he_niqqud,
            "transliteration": transliteration,
            "ru": ru,
        })
    if errors:
        raise ValueError("; ".join(errors[:30]))
    if len(valid_rows) != len(expected_ids):
        raise ValueError("validated row count mismatch")
    return {
        "batch_id": blueprint["batch_id"],
        "row_count": len(valid_rows),
        "row_ids_sha256": sha256_bytes("\n".join(expected_ids).encode("utf-8")),
        "plain_hebrew_has_niqqud": False,
        "hebrew_skeleton_mismatch_count": 0,
        "hebrew_niqqud_skeleton_normalization_count": niqqud_skeleton_normalization_count,
        "source_verified_legacy_fallback_count": len(source_verified_legacy_fallback_row_ids),
        "source_verified_legacy_fallback_row_ids": source_verified_legacy_fallback_row_ids,
        "minimum_provider_to_legacy_semantic_similarity": MIN_PROVIDER_TO_LEGACY_SEMANTIC_SIMILARITY,
        "rows": valid_rows,
    }


def extract_json_response(response: dict[str, Any]) -> tuple[Any, str]:
    candidates = response.get("candidates") or []
    if len(candidates) != 1:
        raise ValueError(f"expected one provider candidate, got {len(candidates)}")
    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [part.get("text", "") for part in parts if isinstance(part.get("text"), str) and not part.get("thought")]
    text = "".join(texts).strip()
    if not text:
        raise ValueError("provider returned no non-thought text")
    return json.loads(text), text


def usage_and_cost(response: dict[str, Any]) -> dict[str, Any]:
    usage = response.get("usageMetadata", {})
    prompt = int(usage.get("promptTokenCount", 0) or 0)
    candidates = int(usage.get("candidatesTokenCount", 0) or 0)
    thinking = int(usage.get("thoughtsTokenCount", 0) or 0)
    if prompt <= 0 or candidates <= 0:
        raise RuntimeError("provider response lacks billable usage metadata")
    cost = prompt * INPUT_RATE / 1_000_000 + (candidates + thinking) * OUTPUT_RATE / 1_000_000
    return {
        "prompt_tokens": prompt,
        "candidate_tokens": candidates,
        "thinking_tokens": thinking,
        "calculated_usd": round(cost, 8),
    }


def post_request(api_key: str, model: str, body: dict[str, Any]) -> dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    request = urllib.request.Request(
        url,
        data=canonical_json(body),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = str(payload.get("error", {}).get("message", "provider HTTP error"))[:500]
        except Exception:
            message = "provider HTTP error with unreadable body"
        raise RuntimeError(f"PROVIDER_HTTP_{error.code}: {message}") from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"PROVIDER_TRANSPORT: {type(error.reason).__name__}") from None


def request_body(blueprint: dict[str, Any], candidate_bytes: bytes, pdf_bytes: bytes,
                 repair_error: str | None) -> dict[str, Any]:
    prompt = blueprint["prompt"] + (
        "\nROW-IDENTITY INVARIANT: each row_id is already bound to one legacy candidate row. "
        "Correct that row in place; never merge, split, shift, or move source content between row_id values. "
        "Page headers, years, footers, scores, and adjacent tasks must not replace a candidate row unless they "
        "are already present in that same candidate. If the PDF boundary is ambiguous, preserve the candidate "
        "rather than resegmenting the page."
    )
    if repair_error:
        prompt += (
            "\nThis batch used its one permitted repair attempt. The previous response failed local validation: "
            + repair_error[:1600]
            + "\nReturn the complete corrected batch, not only the failed rows."
        )
    prompt += "\n\nCANDIDATE_JSON:\n" + candidate_bytes.decode("utf-8")
    return {
        "contents": [{"role": "user", "parts": [
            {"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(pdf_bytes).decode("ascii")}},
            {"text": prompt},
        ]}],
        "generationConfig": {
            "thinkingConfig": {"thinkingLevel": blueprint["thinking_level"]},
            "maxOutputTokens": blueprint["maximum_output_tokens"],
            "responseFormat": {"text": {"mimeType": "APPLICATION_JSON", "schema": blueprint["output_schema"]}},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--approval-token")
    parser.add_argument("--credential-file", type=Path)
    parser.add_argument("--cache-root", type=Path)
    args = parser.parse_args()
    stable = args.stable.resolve()
    build = stable / "build"
    preflight_root = stable / "repair" / "preflight"
    execution_root = stable / "repair" / "execution"
    plan = read_json(build / "separate-canonical-repair-execution-plan.json")
    preflight = read_json(preflight_root / "canonical-repair-preflight-manifest.json")
    if plan["status"] != PLAN_STATUS or preflight["status"] != PREFLIGHT_STATUS:
        raise RuntimeError("plan or preflight boundary drift")
    if plan["cost"]["hard_max_usd"] != HARD_MAX_USD \
            or plan["finite_execution"]["maximum_provider_calls"] != MAX_CALLS:
        raise RuntimeError("approved cost/call envelope drift")
    if preflight["repair_plan_sha256"] != plan["artifact_sha256"]:
        raise RuntimeError("preflight was not built from the current repair plan")
    if not args.execute:
        print(json.dumps({
            "status": "PASS_DRY_RUN_NO_CREDENTIAL_NO_PROVIDER_CALLS",
            "batches": preflight["batch_count"],
            "tasks": preflight["task_count"],
            "rows": preflight["row_count"],
            "required_approval_token": plan["exact_owner_approval_token"],
        }, ensure_ascii=False))
        return
    if args.approval_token != plan["exact_owner_approval_token"]:
        raise RuntimeError("exact owner approval token missing or mismatched")
    if args.credential_file is None or args.cache_root is None:
        raise RuntimeError("execution requires explicit credential-file and cache-root")
    cache_root = args.cache_root.resolve()
    cache_root.mkdir(parents=True, exist_ok=True)
    api_key: str | None = None

    ledger_path = execution_root / "execution-ledger.json"
    if ledger_path.exists():
        ledger = read_json(ledger_path)
        if ledger["repair_plan_sha256"] != plan["artifact_sha256"]:
            raise RuntimeError("execution ledger plan drift")
    else:
        ledger = {
            "schema": "linguistpro-materials-pb2-canonical-repair-execution-v1",
            "status": "IN_PROGRESS",
            "repair_plan_sha256": plan["artifact_sha256"],
            "preflight_sha256": preflight["artifact_sha256"],
            "model": plan["provider"]["model"],
            "mode": plan["provider"]["mode"],
            "hard_max_usd": HARD_MAX_USD,
            "maximum_provider_calls": MAX_CALLS,
            "calls": [],
            "reviewed_batches": [],
            "secret_persisted": False,
        }
    ledger.setdefault("unreceipted_interrupted_calls", [])
    worst_call = (INPUT_CAP * INPUT_RATE + OUTPUT_CAP * OUTPUT_RATE) / 1_000_000
    preflight_by_batch = {item["batch_id"]: item for item in preflight["batches"]}
    reviewed_batches = set(ledger["reviewed_batches"])
    for batch_plan in plan["batches"]:
        batch_id = batch_plan["batch_id"]
        if batch_id in reviewed_batches:
            continue
        if batch_plan["estimated_primary_input_tokens"] > INPUT_CAP \
                or batch_plan["estimated_primary_output_tokens"] > OUTPUT_CAP:
            raise RuntimeError(f"{batch_id} token-cap preflight drift")
        batch_preflight = preflight_by_batch[batch_id]
        blueprint = read_json(preflight_root / batch_preflight["request_blueprint"]["filename"])
        candidate_path = preflight_root / "candidates" / batch_preflight["candidate"]["filename"]
        pdf_path = preflight_root / "inputs" / batch_preflight["pdf"]["filename"]
        if sha256_file(candidate_path) != batch_preflight["candidate"]["sha256"] \
                or sha256_file(pdf_path) != batch_preflight["pdf"]["sha256"]:
            raise RuntimeError(f"{batch_id} preflight payload hash drift")
        candidates = read_json(candidate_path)
        repair_error: str | None = None
        accepted: dict[str, Any] | None = None
        prior_receipts = sorted(
            (
                item for item in ledger["calls"]
                if item.get("batch_id") == batch_id and item.get("status") == "HTTP_200_RAW_CACHED"
            ),
            key=lambda item: int(item.get("attempt", 0)),
            reverse=True,
        )
        for receipt in prior_receipts:
            request_sha = receipt["request_sha256"]
            cache_path = cache_root / batch_id / f"{request_sha}.response.json"
            if not cache_path.exists():
                raise RuntimeError(f"{batch_id} execution receipt exists but raw cache is missing")
            wrapper = read_json(cache_path)
            if wrapper["request_sha256"] != request_sha:
                raise RuntimeError(f"{batch_id} raw cache identity mismatch")
            response = wrapper["raw_response"]
            try:
                value, provider_text = extract_json_response(response)
                accepted = validate_payload(value, blueprint, candidates)
                accepted.update({
                    "schema": "linguistpro-materials-pb2-reviewed-provider-rows-v1",
                    "status": "PASS_STRICT_LOCAL_VALIDATION_SOURCE_FIRST_PROVIDER_REVIEW",
                    "model": plan["provider"]["model"],
                    "request_sha256": request_sha,
                    "raw_response_sha256": sha256_bytes(canonical_json(response)),
                    "provider_text_sha256": sha256_bytes(provider_text.encode("utf-8")),
                    "provider_calls_for_batch": int(receipt["attempt"]),
                    "selected_from_existing_raw_cache": True,
                    "solution_work": False,
                })
                accepted["artifact_sha256"] = sha256_bytes(canonical_json(accepted))
                break
            except (ValueError, json.JSONDecodeError) as error:
                repair_error = str(error)
        if accepted is not None:
            reviewed_path = execution_root / "reviewed-batches" / f"{batch_id}-reviewed-rows.json"
            write_json(reviewed_path, accepted)
            ledger["reviewed_batches"].append(batch_id)
            reviewed_batches.add(batch_id)
            ledger["status"] = "IN_PROGRESS"
            ledger.pop("failed_batch_id", None)
            ledger.pop("failure", None)
            write_json(ledger_path, ledger)
            continue
        if len(prior_receipts) >= MAX_ATTEMPTS_PER_BATCH:
            ledger["status"] = "TERMINAL_INCOMPLETE_BATCH_FAILED_AFTER_ONE_REPAIR_NO_THIRD_PASS"
            ledger["failed_batch_id"] = batch_id
            ledger["failure"] = repair_error
            write_json(ledger_path, ledger)
            raise RuntimeError(
                f"{batch_id} already has {len(prior_receipts)} provider receipts; "
                "fail-closed prevents any third request"
            )
        for attempt in range(1, MAX_ATTEMPTS_PER_BATCH + 1):
            body = request_body(blueprint, candidate_path.read_bytes(), pdf_path.read_bytes(), repair_error)
            request_sha = sha256_bytes(canonical_json(body))
            cache_path = cache_root / batch_id / f"{request_sha}.response.json"
            matching_receipt = next((item for item in ledger["calls"] if item["request_sha256"] == request_sha), None)
            if cache_path.exists():
                if matching_receipt is None:
                    raise RuntimeError(f"{batch_id} raw cache exists without an execution receipt")
                wrapper = read_json(cache_path)
                if wrapper["request_sha256"] != request_sha:
                    raise RuntimeError(f"{batch_id} raw cache identity mismatch")
                response = wrapper["raw_response"]
            else:
                if matching_receipt is not None:
                    if matching_receipt.get("status") == "PROVIDER_CALL_FAILED":
                        repair_error = matching_receipt.get("failure", "prior provider call failed")
                        continue
                    raise RuntimeError(f"{batch_id} execution receipt exists but raw cache is missing")
                provider_call_starts = len(ledger["calls"]) + len(ledger["unreceipted_interrupted_calls"])
                if provider_call_starts >= MAX_CALLS or (provider_call_starts + 1) * worst_call > HARD_MAX_USD:
                    raise RuntimeError("hard call/cost ceiling reached before provider call")
                print(json.dumps({"event": "provider_call_start", "batch_id": batch_id,
                                  "attempt": attempt, "call_number": provider_call_starts + 1}, ensure_ascii=False), flush=True)
                try:
                    if api_key is None:
                        api_key = load_api_key(args.credential_file.resolve())
                    response = post_request(api_key, plan["provider"]["model"], body)
                except RuntimeError as error:
                    ledger["calls"].append({
                        "batch_id": batch_id, "attempt": attempt, "request_sha256": request_sha,
                        "status": "PROVIDER_CALL_FAILED", "failure": str(error), "called_at": now_iso(),
                        "worst_case_budget_commitment_usd": round(worst_call, 6),
                    })
                    write_json(ledger_path, ledger)
                    repair_error = str(error)
                    if attempt == MAX_ATTEMPTS_PER_BATCH:
                        break
                    continue
                usage = usage_and_cost(response)
                wrapper = {
                    "schema": "linguistpro-materials-pb2-raw-provider-cache-v1",
                    "batch_id": batch_id,
                    "attempt": attempt,
                    "request_sha256": request_sha,
                    "model": plan["provider"]["model"],
                    "cached_at": now_iso(),
                    "usage": usage,
                    "raw_response": response,
                }
                atomic_write_new_json(cache_path, wrapper)
                ledger["calls"].append({
                    "batch_id": batch_id, "attempt": attempt, "request_sha256": request_sha,
                    "response_sha256": sha256_bytes(canonical_json(response)),
                    "status": "HTTP_200_RAW_CACHED", "usage": usage, "called_at": wrapper["cached_at"],
                    "worst_case_budget_commitment_usd": round(worst_call, 6),
                })
                write_json(ledger_path, ledger)
            try:
                value, provider_text = extract_json_response(response)
                accepted = validate_payload(value, blueprint, candidates)
                accepted.update({
                    "schema": "linguistpro-materials-pb2-reviewed-provider-rows-v1",
                    "status": "PASS_STRICT_LOCAL_VALIDATION_SOURCE_FIRST_PROVIDER_REVIEW",
                    "model": plan["provider"]["model"],
                    "request_sha256": request_sha,
                    "raw_response_sha256": sha256_bytes(canonical_json(response)),
                    "provider_text_sha256": sha256_bytes(provider_text.encode("utf-8")),
                    "provider_calls_for_batch": attempt,
                    "solution_work": False,
                })
                accepted["artifact_sha256"] = sha256_bytes(canonical_json(accepted))
                break
            except (ValueError, json.JSONDecodeError) as error:
                repair_error = str(error)
                if attempt == MAX_ATTEMPTS_PER_BATCH:
                    break
        if accepted is None:
            ledger["status"] = "TERMINAL_INCOMPLETE_BATCH_FAILED_AFTER_ONE_REPAIR_NO_THIRD_PASS"
            ledger["failed_batch_id"] = batch_id
            ledger["failure"] = repair_error
            write_json(ledger_path, ledger)
            raise RuntimeError(f"{batch_id} failed after its one permitted repair attempt: {repair_error}")
        reviewed_path = execution_root / "reviewed-batches" / f"{batch_id}-reviewed-rows.json"
        write_json(reviewed_path, accepted)
        ledger["reviewed_batches"].append(batch_id)
        reviewed_batches.add(batch_id)
        write_json(ledger_path, ledger)

    ledger["status"] = "PASS_ALL_6_BATCHES_STRICTLY_VALIDATED_READY_FOR_LOCAL_CANONICAL_BAKE"
    ledger["completed_at"] = now_iso()
    ledger["actual_measured_cost_usd"] = round(sum(
        item.get("usage", {}).get("calculated_usd", 0) for item in ledger["calls"]
    ), 8)
    ledger["provider_call_count"] = len(ledger["calls"])
    ledger["provider_call_start_count"] = (
        len(ledger["calls"]) + len(ledger["unreceipted_interrupted_calls"])
    )
    ledger["billing_upper_bound_usd"] = round(
        ledger["actual_measured_cost_usd"]
        + sum(
            item.get("worst_case_budget_commitment_usd", worst_call)
            for item in ledger["unreceipted_interrupted_calls"]
        ),
        8,
    )
    ledger["secret_accessed"] = api_key is not None
    ledger["secret_persisted"] = False
    write_json(ledger_path, ledger)
    print(json.dumps({
        "status": ledger["status"],
        "reviewed_batches": len(ledger["reviewed_batches"]),
        "provider_calls": ledger["provider_call_count"],
        "provider_call_starts": ledger["provider_call_start_count"],
        "measured_cost_usd": ledger["actual_measured_cost_usd"],
        "billing_upper_bound_usd": ledger["billing_upper_bound_usd"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
