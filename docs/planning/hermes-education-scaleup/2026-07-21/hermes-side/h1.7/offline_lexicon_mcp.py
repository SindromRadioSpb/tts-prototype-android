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
MAX_ENTRIES = 10
MAX_FORMS_PER_ENTRY = 60
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


def _clean_senses(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    result = []
    for sense in raw:
        if not isinstance(sense, dict):
            continue
        result.append(
            {
                "glosses": sense.get("glosses") or [],
                "tags": sense.get("tags") or [],
                "topics": sense.get("topics") or [],
            }
        )
    return result


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


def _clean_pronunciation(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    result = []
    for sound in raw[:10]:
        if not isinstance(sound, dict):
            continue
        kept = {
            key: sound[key]
            for key in ("ipa", "roman", "note", "tags")
            if key in sound
        }
        if kept:
            result.append(kept)
    return result


def _entry_summary(entry: dict[str, Any]) -> dict[str, Any]:
    forms, forms_truncated = _clean_forms(entry.get("forms"))
    return {
        "word": entry.get("word"),
        "pos": entry.get("pos"),
        "senses": _clean_senses(entry.get("senses")),
        "forms": forms,
        "forms_truncated": forms_truncated,
        "pronunciation": _clean_pronunciation(entry.get("sounds")),
        "etymology": entry.get("etymology_text"),
    }


@mcp.tool()
def kaikki_lookup(lemma: str) -> dict[str, Any]:
    """Look up an exact Hebrew lemma offline; cite as Wiktionary, never as canon."""
    lemma = _normalized(lemma)
    if not lemma or len(lemma) > 100:
        return _error("INVALID_ARGUMENT", "lemma must contain 1–100 characters.")
    try:
        matches = []
        with DATASET_PATH.open(encoding="utf-8") as source:
            for line in source:
                entry = json.loads(line)
                if _normalized(str(entry.get("word", ""))) == lemma:
                    matches.append(_entry_summary(entry))
                    if len(matches) >= MAX_ENTRIES:
                        break
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
        "lemma": lemma,
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
