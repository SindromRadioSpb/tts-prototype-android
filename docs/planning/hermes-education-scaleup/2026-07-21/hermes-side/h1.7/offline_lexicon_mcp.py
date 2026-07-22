"""Offline Hebrew Wiktionary/wordfreq MCP for the LinguistPro Hermes host."""

from __future__ import annotations

import json
import os
import unicodedata
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP
from wordfreq import zipf_frequency


DATASET_PATH = Path(
    os.environ.get(
        "KAIKKI_JSONL",
        "/workspace/datasets/kaikki/kaikki.org-dictionary-Hebrew-2026-07-20.jsonl",
    )
)
MAX_WORDS = 20
MAX_ENTRIES = 3
MAX_SENSES_PER_ENTRY = 3
MAX_GLOSSES_PER_SENSE = 2
MAX_FORMS_PER_ENTRY = 8
MAX_PRONUNCIATIONS_PER_ENTRY = 3
MAX_TEXT_LENGTH = 240
SOURCE_KAIKKI = "WIKTIONARY_VIA_KAIKKI"
SOURCE_WORDFREQ = "WORDFREQ_3.1.1"

mcp = FastMCP("hebrew-offline-reference")


def _error(code: str, message: str, retryable: bool = False) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {"code": code, "message": message, "retryable": retryable},
    }


def _normalized(text: str) -> str:
    return unicodedata.normalize("NFKC", text).strip()


def _clip(value: Any, limit: int = MAX_TEXT_LENGTH) -> str:
    text = str(value)
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


def _clean_senses(raw: Any) -> tuple[list[dict[str, Any]], bool]:
    if not isinstance(raw, list):
        return [], False
    result = []
    for sense in raw:
        if not isinstance(sense, dict):
            continue
        glosses = [
            _clip(gloss)
            for gloss in (sense.get("glosses") or [])[:MAX_GLOSSES_PER_SENSE]
        ]
        summary = {"glosses": glosses}
        if sense.get("tags"):
            summary["tags"] = sense["tags"][:5]
        result.append(summary)
    return result[:MAX_SENSES_PER_ENTRY], len(result) > MAX_SENSES_PER_ENTRY


def _clean_forms(raw: Any) -> tuple[list[dict[str, Any]], bool]:
    if not isinstance(raw, list):
        return [], False
    forms = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("form"):
            continue
        tags = item.get("tags") or []
        if "table-tags" in tags or "inflection-template" in tags:
            continue
        forms.append({"form": item["form"], "tags": tags})
    return forms[:MAX_FORMS_PER_ENTRY], len(forms) > MAX_FORMS_PER_ENTRY


def _clean_pronunciation(raw: Any) -> tuple[list[dict[str, Any]], bool]:
    if not isinstance(raw, list):
        return [], False
    result = []
    for sound in raw:
        if not isinstance(sound, dict):
            continue
        kept = {
            key: _clip(sound[key]) if key != "tags" else sound[key][:5]
            for key in ("ipa", "roman", "note", "tags")
            if key in sound
        }
        if kept:
            result.append(kept)
    return (
        result[:MAX_PRONUNCIATIONS_PER_ENTRY],
        len(result) > MAX_PRONUNCIATIONS_PER_ENTRY,
    )


def _entry_summary(entry: dict[str, Any]) -> dict[str, Any]:
    forms, forms_truncated = _clean_forms(entry.get("forms"))
    senses, senses_truncated = _clean_senses(entry.get("senses"))
    pronunciation, pronunciation_truncated = _clean_pronunciation(entry.get("sounds"))
    return {
        "word": entry.get("word"),
        "pos": entry.get("pos"),
        "senses": senses,
        "senses_truncated": senses_truncated,
        "forms": forms,
        "forms_truncated": forms_truncated,
        "pronunciation": pronunciation,
        "pronunciation_truncated": pronunciation_truncated,
        "etymology": _clip(entry["etymology_text"], 400)
        if entry.get("etymology_text")
        else None,
    }


@mcp.tool()
def kaikki_lookup(lemma: str) -> dict[str, Any]:
    """Look up one exact lemma offline. Make at most one lookup per assistant turn,
    wait for its result, and cite it as Wiktionary rather than canonical truth.
    In a due-list plus frequency workflow on Gemini free tier, look up at most two
    lemmas total so the final answer fits the five-request quota window."""
    lemma = _normalized(lemma)
    if not lemma or len(lemma) > 100:
        return _error("INVALID_ARGUMENT", "lemma must contain 1–100 characters.")
    try:
        matches = []
        entries_total = 0
        with DATASET_PATH.open(encoding="utf-8") as source:
            for line in source:
                entry = json.loads(line)
                if _normalized(str(entry.get("word", ""))) == lemma:
                    entries_total += 1
                    if len(matches) < MAX_ENTRIES:
                        matches.append(_entry_summary(entry))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return _error("DATASET_UNAVAILABLE", "The local Kaikki dataset is unavailable.", True)

    if not matches:
        return {
            "ok": False,
            "source": SOURCE_KAIKKI,
            "attribution": "по Викисловарю",
            "canonical": False,
            "not_found": True,
            "error": {
                "code": "NOT_FOUND",
                "message": "Exact lemma was not found in the local Kaikki snapshot.",
                "retryable": False,
            },
        }
    return {
        "ok": True,
        "source": SOURCE_KAIKKI,
        "attribution": "по Викисловарю",
        "canonical": False,
        "conflict_policy": "LinguistPro/Pealim remains canonical; report conflicts.",
        "response_compact": True,
        "limits": {
            "entries": MAX_ENTRIES,
            "senses_per_entry": MAX_SENSES_PER_ENTRY,
            "forms_per_entry": MAX_FORMS_PER_ENTRY,
            "pronunciations_per_entry": MAX_PRONUNCIATIONS_PER_ENTRY,
        },
        "lemma": lemma,
        "entries_total": entries_total,
        "entries_truncated": entries_total > len(matches),
        "entries": matches,
    }


def _frequency_label(zipf: float) -> str:
    if zipf >= 6:
        return "очень частое"
    if zipf >= 5:
        return "частое"
    if zipf >= 4:
        return "средней частотности"
    if zipf >= 3:
        return "нечастое"
    if zipf > 0:
        return "редкое"
    return "нет в частотном списке"


@mcp.tool()
def word_frequency(words: list[str]) -> dict[str, Any]:
    """Return only advisory Zipf estimates; do not infer translations or meanings."""
    if not isinstance(words, list) or not 1 <= len(words) <= MAX_WORDS:
        return _error("INVALID_ARGUMENT", "words must contain 1–20 items.")
    cleaned = [_normalized(str(word)) for word in words]
    if any(not word or len(word) > 100 for word in cleaned):
        return _error("INVALID_ARGUMENT", "Each word must contain 1–100 characters.")

    results = []
    for word in cleaned:
        zipf = float(zipf_frequency(word, "he", wordlist="best"))
        results.append(
            {"word": word, "zipf": round(zipf, 2), "interpretation": _frequency_label(zipf)}
        )
    return {
        "ok": True,
        "source": SOURCE_WORDFREQ,
        "language": "he",
        "advisory": True,
        "content_scope": "frequency only; no meanings or translations are provided",
        "scale": "Zipf log10 occurrences per billion words",
        "results": results,
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
