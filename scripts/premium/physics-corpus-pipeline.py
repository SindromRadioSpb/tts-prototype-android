#!/usr/bin/env python3
"""Build and audit the private Physics Year 1 learning corpus.

The pipeline deliberately keeps source extraction, Gemini output, legacy
comparison and portable-library generation as separate evidence layers.  It
uses only Python's standard library so a clean producer checkout can inspect
the owner's XLSX/DOCX files without installing Office or extra packages.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


NS_XLSX = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
NS_DOCX = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def _text_nodes(node: ET.Element, namespace: dict[str, str], path: str) -> str:
    return "".join((item.text or "") for item in node.findall(path, namespace)).strip()


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return [_text_nodes(item, NS_XLSX, ".//m:t") for item in root.findall("m:si", NS_XLSX)]


def _xlsx_sheet_names(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("r:Relationship", rel_ns)
    }
    out: list[tuple[str, str]] = []
    rel_key = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    for sheet in workbook.findall("m:sheets/m:sheet", NS_XLSX):
        target = targets[sheet.attrib[rel_key]].replace("\\", "/")
        target = target.lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        out.append((sheet.attrib.get("name", "Sheet"), target))
    return out


def _xlsx_col_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref.upper())
    if not letters:
        return 0
    value = 0
    for char in letters.group(0):
        value = value * 26 + ord(char) - 64
    return value - 1


def read_xlsx(path: Path) -> list[dict[str, object]]:
    sheets: list[dict[str, object]] = []
    with zipfile.ZipFile(path) as archive:
        shared = _xlsx_shared_strings(archive)
        for name, target in _xlsx_sheet_names(archive):
            root = ET.fromstring(archive.read(target))
            rows: list[list[str]] = []
            for row in root.findall("m:sheetData/m:row", NS_XLSX):
                values: dict[int, str] = {}
                for cell in row.findall("m:c", NS_XLSX):
                    index = _xlsx_col_index(cell.attrib.get("r", "A1"))
                    kind = cell.attrib.get("t", "")
                    if kind == "inlineStr":
                        value = _text_nodes(cell, NS_XLSX, ".//m:t")
                    else:
                        value_node = cell.find("m:v", NS_XLSX)
                        value = (value_node.text or "") if value_node is not None else ""
                        if kind == "s" and value:
                            try:
                                value = shared[int(value)]
                            except (IndexError, ValueError):
                                pass
                    values[index] = value.strip()
                if values:
                    width = max(values) + 1
                    rows.append([values.get(index, "") for index in range(width)])
            sheets.append({"name": name, "rows": rows})
    return sheets


def read_docx_tables(path: Path) -> list[dict[str, object]]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    tables: list[dict[str, object]] = []
    for index, table in enumerate(root.findall(".//w:tbl", NS_DOCX), start=1):
        rows: list[list[str]] = []
        for row in table.findall("w:tr", NS_DOCX):
            cells = [_text_nodes(cell, NS_DOCX, ".//w:t") for cell in row.findall("w:tc", NS_DOCX)]
            if any(cells):
                rows.append(cells)
        tables.append({"name": f"table-{index:02d}", "rows": rows})
    return tables


def _print_preview(label: str, sections: Iterable[dict[str, object]], limit: int) -> None:
    print(f"\n{label}")
    for section in sections:
        rows = section["rows"]
        print(f"  [{section['name']}] rows={len(rows)}")
        for row in rows[:limit]:
            print("    " + json.dumps(row, ensure_ascii=False))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _reflow_pdf_ocr(value: str) -> str:
    """Mirror public/js/table-chunks.js::reflowDocumentText exactly."""
    normalized = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = re.split(r"\n\s*\n+", normalized)
    out: list[str] = []
    for paragraph in paragraphs:
        joined = " ".join(line.strip() for line in paragraph.split("\n") if line.strip())
        if joined:
            out.append(joined)
    return "\n".join(out)


def prepare_table_input(args: argparse.Namespace) -> int:
    cache_path = Path(args.ocr_cache)
    output = Path(args.output)
    manifest_path = Path(args.manifest)
    if not cache_path.is_file():
        print(json.dumps({"error": "OCR cache missing", "path": str(cache_path)}, ensure_ascii=False), file=sys.stderr)
        return 2
    cache = json.loads(cache_path.read_text(encoding="utf-8"))
    pages = cache.get("pages") or []
    if not isinstance(pages, list) or not pages or not all(isinstance(page, dict) for page in pages):
        print(json.dumps({"error": "OCR cache has no pages", "path": str(cache_path)}, ensure_ascii=False), file=sys.stderr)
        return 2
    raw_text = "\n\n".join(str(page.get("text") or "") for page in pages)
    corrected_text = raw_text
    replacement_reports: list[dict[str, object]] = []
    corrections_path: Path | None = Path(args.corrections) if args.corrections else None
    corrections_sha: str | None = None
    if corrections_path:
        if not corrections_path.is_file():
            print(json.dumps({"error": "correction spec missing", "path": str(corrections_path)}, ensure_ascii=False), file=sys.stderr)
            return 2
        correction_spec = json.loads(corrections_path.read_text(encoding="utf-8"))
        corrections_sha = sha256_file(corrections_path)
        for correction in correction_spec.get("replacements", []):
            old = str(correction.get("from") or "")
            new = str(correction.get("to") or "")
            expected = int(correction.get("expected_count", -1))
            actual = corrected_text.count(old)
            if not old or expected < 0 or actual != expected:
                print(json.dumps({
                    "error": "correction count mismatch", "from": old,
                    "expected_count": expected, "actual_count": actual,
                }, ensure_ascii=False), file=sys.stderr)
                return 3
            corrected_text = corrected_text.replace(old, new)
            replacement_reports.append({"from": old, "to": new, "count": actual})
    table_input = _reflow_pdf_ocr(corrected_text)
    # Independent losslessness oracle: layout projection may change whitespace
    # only; the approved replacements above are recorded separately.
    if re.sub(r"\s+", " ", corrected_text).strip() != re.sub(r"\s+", " ", table_input).strip():
        print(json.dumps({"error": "reflow changed non-whitespace content"}, ensure_ascii=False), file=sys.stderr)
        return 4
    # Some source pages place a chapter heading and its first task heading in
    # the same visual paragraph.  Count the task marker wherever it occurs;
    # card assembly later splits that known structural boundary locally.
    task_numbers = re.findall(r"שאלה\s+(\d+\.\d+)\s*:?", table_input)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(table_input + "\n")
    payload = {
        "schema": "linguistpro.physics.table-input.1",
        "source": {
            "ocr_cache": str(cache_path),
            "ocr_cache_sha256": sha256_file(cache_path),
            "model": cache.get("model"),
            "model_version": cache.get("modelVersion"),
            "prompt_id": cache.get("promptId"),
            "schema_id": cache.get("schemaId"),
            "created_at": cache.get("createdAt"),
            "page_count": len(pages),
        },
        "corrections": {
            "spec": str(corrections_path) if corrections_path else None,
            "spec_sha256": corrections_sha,
            "replacements": replacement_reports,
        },
        "projection": {
            "method": "pdf-visual-wrap-reflow-v1",
            "raw_chars": len(raw_text),
            "raw_lines": len(raw_text.splitlines()),
            "table_input_chars": len(table_input),
            "table_input_lines": len(table_input.splitlines()),
            "table_input_sha256": _sha256_text(table_input + "\n"),
            "task_count": len(task_numbers),
            "task_numbers": task_numbers,
        },
        "output": str(output),
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "manifest": str(manifest_path), **payload["projection"]}, ensure_ascii=False, indent=2))
    return 0


def strip_hebrew_marks(value: str) -> str:
    return re.sub(r"[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]", "", value or "")


def _column_map(header: list[str]) -> dict[str, int]:
    columns: dict[str, int] = {}
    for index, raw in enumerate(header):
        value = strip_hebrew_marks(raw).lower()
        if "original" in value or "כמו ב-pdf" in value or "как в pdf" in value:
            columns["he_plain"] = index
        elif "ניקוד" in value or "נקוד" in value or "некуд" in value:
            columns["he_niqqud"] = index
        elif "транскрип" in value or "транслитер" in value or "translit" in value:
            columns["translit"] = index
        elif "рус" in value or "перевод" in value:
            columns["ru"] = index
    required = {"he_plain", "he_niqqud", "translit", "ru"}
    if set(columns) != required:
        raise ValueError(f"cannot identify rich columns from header: {header!r}; got {columns!r}")
    return columns


def _semantic_kind(he_plain: str, ru: str) -> str:
    plain = strip_hebrew_marks(he_plain).strip()
    if re.match(r"^שאלה\s+\d+\.\d+\s*:?$", plain):
        return "task_heading"
    if re.match(r"^פרק\s+\d+\b", plain):
        return "chapter_heading"
    if re.match(r"^(הערה|שים לב|נתון נוסף)\b", plain) or re.match(r"^(примечание|обратите внимание)\b", ru.strip(), re.I):
        return "note"
    if re.match(r"^[א-ת](?:\s*)[.)]", plain) or re.match(r"^[а-яё](?:\s*)[.)]", ru.strip(), re.I):
        return "subpart"
    if re.search(r"(?:חורף|קיץ|אביב|סתיו).{0,40}(?:שאלה|מועד)", plain):
        return "source_note"
    return "condition"


def _semantic_field_parts(value: str, column: str, default_kind: str,
                          expected_hebrew_subparts: list[str] | None = None) -> list[dict[str, str]]:
    """Split embedded subparts/notes while keeping four columns aligned."""
    marks = r"[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]*"
    expected_translit_tokens: list[str] = []
    expected_ru_tokens: list[str] = []
    if column in {"he_plain", "he_niqqud"}:
        note_word = rf"(?:ה{marks}ע{marks}ר{marks}(?:ה{marks}|ו{marks}ת{marks})|ש{marks}י{marks}ם{marks}\s+ל{marks}ב{marks})"
        pattern = re.compile(
            rf"(?<!\S)(?:(?P<subpart>[אבגדהוזחט]{marks})\s*[.)](?=\s+\S)|"
            rf"(?P<note>{note_word})\s*:)", re.I)
    elif column == "ru":
        ru_token_names = {
            "א": "а", "ב": "б", "ג": "в", "ד": "г", "ה": "д", "ו": "е",
        }
        expected_ru_tokens = [
            ru_token_names[letter]
            for letter in (expected_hebrew_subparts or [])
            if letter in ru_token_names
        ]
        pattern = re.compile(
            r"(?<!\S)(?:(?P<subpart>[абвгде])\s*[.)](?=\s+\S)|"
            r"(?P<note>[Пп]римечани[ея]|[Оо]братите\s+внимание)\s*:)")
    else:
        # learner-latin maps א/ב/ג/ד/ה to '/V/G/D/H in the current profile.
        translit_markers = {
            "א": "'", "ב": "[Vv]", "ג": "[Gg]", "ד": "[Dd]", "ה": "[Hh]",
            "ו": "[Vv]", "ז": "[Zz]", "ח": "(?:Kh|kh)", "ט": "[Tt]",
        }
        allowed = [translit_markers[letter] for letter in (expected_hebrew_subparts or []) if letter in translit_markers]
        translit_token_names = {
            "א": "'", "ב": "v", "ג": "g", "ד": "d", "ה": "h",
            "ו": "v", "ז": "z", "ח": "kh", "ט": "t",
        }
        expected_translit_tokens = [
            translit_token_names[letter]
            for letter in (expected_hebrew_subparts or [])
            if letter in translit_token_names
        ]
        marker_expr = "|".join(dict.fromkeys(allowed)) or r"(?!)"
        pattern = re.compile(
            rf"(?<!\S)(?:(?P<subpart>{marker_expr})\s*[.)](?=\s+\S)|"
            r"(?P<note>He'?ar(?:a|ot)|Sim\s+lev)\s*:)")

    parts: list[dict[str, str]] = []
    for line in re.split(r"\r?\n", str(value or "")):
        line = line.strip()
        if not line:
            continue
        anchors = list(pattern.finditer(line))
        expected_tokens = expected_translit_tokens if column == "translit" else expected_ru_tokens
        if column in {"translit", "ru"} and anchors:
            keep = {index for index, anchor in enumerate(anchors) if anchor.group("note")}
            for token in set(expected_tokens):
                candidates = [
                    index for index, anchor in enumerate(anchors)
                    if anchor.group("subpart") and anchor.group("subpart").lower() == token
                ]
                allowed_count = expected_tokens.count(token)
                if len(candidates) <= allowed_count:
                    keep.update(candidates)
                    continue
                def marker_score(index: int) -> tuple[int, int]:
                    start = anchors[index].start()
                    before = line[:start].rstrip()
                    boundary = 2 if not before else (1 if before[-1] in ".?!" else 0)
                    return boundary, -start
                keep.update(sorted(candidates, key=marker_score, reverse=True)[:allowed_count])
            anchors = [anchor for index, anchor in enumerate(anchors) if index in keep]
        if not anchors:
            kind = default_kind
            if column in {"he_plain", "he_niqqud"}:
                kind = _semantic_kind(strip_hebrew_marks(line), "")
            elif column == "ru":
                kind = _semantic_kind("", line)
            elif column == "translit":
                kind = "condition"
            parts.append({"kind": kind, "text": line})
            continue
        if anchors[0].start() > 0:
            prefix = line[:anchors[0].start()].strip()
            if prefix:
                parts.append({"kind": default_kind, "text": prefix})
        for index, anchor in enumerate(anchors):
            end = anchors[index + 1].start() if index + 1 < len(anchors) else len(line)
            text = line[anchor.start():end].strip()
            if text:
                parts.append({"kind": "note" if anchor.group("note") else "subpart", "text": text})
    return parts


def expand_semantic_rows(rows: list[dict[str, object]], task_number: str) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for source_index, row in enumerate(rows):
        default_kind = str(row.get("kind") or "condition")
        plain_for_markers = strip_hebrew_marks(str(row.get("he_plain") or ""))
        expected_subparts = [
            match.group(1)
            for match in re.finditer(r"(?<!\S)([אבגדהוזחט])\s*[.)](?=\s+\S)", plain_for_markers)
        ]
        split = {
            column: _semantic_field_parts(
                str(row.get(column) or ""), column, default_kind, expected_subparts
            )
            for column in ("he_plain", "he_niqqud", "translit", "ru")
        }
        lengths = {column: len(parts) for column, parts in split.items()}
        if len(set(lengths.values())) != 1:
            raise ValueError(f"semantic split mismatch for task {task_number} row {source_index}: {lengths}")
        for part_index in range(lengths["he_plain"]):
            kinds = {column: split[column][part_index]["kind"] for column in split}
            structural = {kind for kind in kinds.values() if kind in {"subpart", "note"}}
            if len(structural) > 1 or (structural and kinds["he_plain"] not in structural):
                raise ValueError(
                    f"semantic kind mismatch for task {task_number} row {source_index}/{part_index}: {kinds}"
                )
            item = {
                **row,
                "he_plain": split["he_plain"][part_index]["text"],
                "he_niqqud": split["he_niqqud"][part_index]["text"],
                "translit": split["translit"][part_index]["text"],
                "ru": split["ru"][part_index]["text"],
                "kind": kinds["he_plain"],
                "source_row_index": source_index,
                "source_subrow_index": part_index,
                "order_index": len(out),
            }
            out.append(item)
    return out


def _split_structural_row(row: dict[str, object]) -> list[dict[str, object]]:
    """Split a provider row that merged a chapter title with its first task."""
    he_plain = str(row.get("he_plain") or "")
    plain_no_marks = strip_hebrew_marks(he_plain)
    if not re.match(r"^פרק\s+\d+\b", plain_no_marks.strip()) or not re.search(r"שאלה\s+\d+\.\d+", plain_no_marks):
        return [row]

    def split_marked(value: str, pattern: str) -> tuple[str, str]:
        original = str(value or "")
        normalized_chars: list[str] = []
        original_indexes: list[int] = []
        for index, char in enumerate(original):
            if re.match(r"[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]", char):
                continue
            normalized_chars.append(char)
            original_indexes.append(index)
        match = re.search(pattern, "".join(normalized_chars), re.I)
        if not match or match.start() >= len(original_indexes):
            return original.strip(), ""
        split_at = original_indexes[match.start()]
        return original[:split_at].rstrip(" ."), original[split_at:].lstrip()

    he_chapter, he_task = split_marked(he_plain, r"שאלה\s+\d+\.\d+")
    niqqud_chapter, niqqud_task = split_marked(str(row.get("he_niqqud") or ""), r"שאלה\s+\d+\.\d+")
    translit = str(row.get("translit") or "")
    translit_match = re.search(r"\bsh[e']*ela\s+\d+\.\d+", translit, re.I)
    if translit_match:
        translit_chapter = translit[:translit_match.start()].rstrip(" .")
        translit_task = translit[translit_match.start():].lstrip()
    else:
        translit_chapter, translit_task = translit, ""
    ru = str(row.get("ru") or "")
    ru_match = re.search(r"\b(?:задача|вопрос)\s+\d+\.\d+", ru, re.I)
    if ru_match:
        ru_chapter = ru[:ru_match.start()].rstrip(" .")
        ru_task = ru[ru_match.start():].lstrip()
    else:
        ru_chapter, ru_task = ru, ""
    return [
        {**row, "he_plain": he_chapter, "he_niqqud": niqqud_chapter,
         "translit": translit_chapter, "ru": ru_chapter},
        {**row, "he_plain": he_task, "he_niqqud": niqqud_task,
         "translit": translit_task, "ru": ru_task},
    ]


def _split_task_heading_row(row: dict[str, object]) -> list[dict[str, object]]:
    """Split `שאלה N.N:` from condition text returned in the same provider row."""
    he_plain = str(row.get("he_plain") or "")
    plain_match = re.match(r"^\s*(שאלה\s+(\d+\.\d+)\s*:)(.*)$", strip_hebrew_marks(he_plain), re.S)
    if not plain_match or not plain_match.group(3).strip():
        return [row]
    task_number = plain_match.group(2)

    def split_marked_heading(value: str) -> tuple[str, str]:
        original = str(value or "")
        normalized_chars: list[str] = []
        original_indexes: list[int] = []
        for index, char in enumerate(original):
            if re.match(r"[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]", char):
                continue
            normalized_chars.append(char)
            original_indexes.append(index)
        match = re.match(rf"^\s*שאלה\s+{re.escape(task_number)}\s*:", "".join(normalized_chars))
        if not match or match.end() <= 0:
            raise ValueError(f"cannot split vocalized task heading {task_number}")
        normalized_end = match.end() - 1
        split_at = original_indexes[normalized_end] + 1
        return original[:split_at].strip(), original[split_at:].strip()

    he_heading, he_tail = split_marked_heading(he_plain)
    niqqud_heading, niqqud_tail = split_marked_heading(str(row.get("he_niqqud") or ""))

    translit = str(row.get("translit") or "")
    translit_match = re.match(
        rf"^\s*(?:sh[e']*ela[h]?|she['’]?ela[h]?)\s+{re.escape(task_number)}\s*:",
        translit, re.I,
    )
    ru = str(row.get("ru") or "")
    ru_match = re.match(rf"^\s*(?:вопрос|задача)\s+{re.escape(task_number)}\s*:", ru, re.I)
    if not translit_match or not ru_match:
        raise ValueError(f"cannot align translated task heading {task_number}")
    return [
        {
            **row,
            "he_plain": he_heading,
            "he_niqqud": niqqud_heading,
            "translit": translit[:translit_match.end()].strip(),
            "ru": ru[:ru_match.end()].strip(),
        },
        {
            **row,
            "he_plain": he_tail,
            "he_niqqud": niqqud_tail,
            "translit": translit[translit_match.end():].strip(),
            "ru": ru[ru_match.end():].strip(),
        },
    ]


def _normalized_task_number(source_number: str, current_chapter: int | None) -> tuple[str, str | None]:
    chapter_text, suffix_text = source_number.split(".", 1)
    source_chapter, suffix = int(chapter_text), int(suffix_text)
    if current_chapter is not None and source_chapter != current_chapter and suffix == current_chapter:
        # Confirmed source transposition: chapter 3 contains header 8.3; its
        # chronological position and both legacy projections prove task 3.8.
        normalized = f"{current_chapter}.{source_chapter}"
        return normalized, f"source header {source_number} normalized to {normalized} under chapter {current_chapter}"
    return source_number, None


def _task_source_map(ocr_cache: dict[str, object], page_manifest: list[dict[str, object]],
                     initial_chapter: int | None = None) -> tuple[dict[str, dict[str, object]], list[str]]:
    pages = ocr_cache.get("pages") or []
    if len(pages) != len(page_manifest):
        raise ValueError(f"OCR/page manifest length mismatch: {len(pages)} != {len(page_manifest)}")
    current_chapter = initial_chapter
    mapping: dict[str, dict[str, object]] = {}
    warnings: list[str] = []
    for page, source in zip(pages, page_manifest):
        text = str(page.get("text") or "")
        events: list[tuple[int, str | None, str | None]] = []
        for match in re.finditer(r"פרק\s+(\d+)\b|שאלה\s+(\d+\.\d+)", text):
            events.append((match.start(), match.group(1), match.group(2)))
        for _, chapter_number, task_number in sorted(events):
            if chapter_number:
                current_chapter = int(chapter_number)
                continue
            normalized, warning = _normalized_task_number(str(task_number), current_chapter)
            if warning and warning not in warnings:
                warnings.append(warning)
            if normalized in mapping:
                raise ValueError(f"duplicate task marker in OCR pages: {normalized}")
            mapping[normalized] = {
                "source_task_number": str(task_number),
                "source_page": int(source.get("sourcePage")),
                "source_filename": str(source.get("sourceFilename") or ""),
                "source_image_sha256": str(source.get("sourceSha256") or ""),
            }
    return mapping, warnings


def normalize_table_cache(args: argparse.Namespace) -> int:
    table_path = Path(args.table_cache)
    ocr_path = Path(args.ocr_cache)
    page_manifest_path = Path(args.page_manifest)
    if not table_path.is_file() or not ocr_path.is_file() or not page_manifest_path.is_file():
        print(json.dumps({"error": "normalization input missing"}, ensure_ascii=False), file=sys.stderr)
        return 2
    table = json.loads(table_path.read_text(encoding="utf-8"))
    ocr = json.loads(ocr_path.read_text(encoding="utf-8"))
    page_manifest = json.loads(page_manifest_path.read_text(encoding="utf-8"))
    input_path = Path(args.table_input) if args.table_input else None
    if input_path:
        expected_text = input_path.read_text(encoding="utf-8").rstrip("\n")
        if str(table.get("text") or "") != expected_text:
            print(json.dumps({"error": "table cache text does not match frozen table input"}, ensure_ascii=False), file=sys.stderr)
            return 3

    source_map, warnings = _task_source_map(ocr, page_manifest, args.initial_chapter)
    raw_rows = table.get("rows") or []
    projected: list[dict[str, object]] = []
    for provider_index, raw in enumerate(raw_rows):
        row = {
            "provider_row_index": provider_index,
            "he_plain": str(raw.get("he") or "").strip(),
            "he_niqqud": str(raw.get("he_niqqud") or "").strip(),
            "translit": str(raw.get("translit") or "").strip(),
            "ru": str(raw.get("ru") or "").strip(),
        }
        for structural_part in _split_structural_row(row):
            projected.extend(_split_task_heading_row(structural_part))

    current_chapter = args.initial_chapter
    current_chapter_row: dict[str, object] | None = None
    current_task: dict[str, object] | None = None
    tasks: list[dict[str, object]] = []
    rendered_rows: list[dict[str, object]] = []
    for row in projected:
        plain = strip_hebrew_marks(str(row.get("he_plain") or "")).strip()
        chapter_match = re.match(r"^פרק\s+(\d+)\b", plain)
        task_match = re.match(r"^שאלה\s+(\d+\.\d+)\b", plain)
        if chapter_match:
            current_chapter = int(chapter_match.group(1))
            current_chapter_row = {**row, "kind": "chapter_heading", "chapter": current_chapter}
            current_task = None
            rendered_rows.append(current_chapter_row)
            continue
        if task_match:
            source_number = task_match.group(1)
            if current_chapter is None:
                current_chapter = int(source_number.split(".", 1)[0])
            number, warning = _normalized_task_number(source_number, current_chapter)
            if warning and warning not in warnings:
                warnings.append(warning)
            source = source_map.get(number)
            if not source:
                raise ValueError(f"task {number} has no source-page provenance")
            heading = {**row, "kind": "task_heading", "chapter": current_chapter,
                       "task_number": number, "source_task_number": source_number}
            rendered_rows.append(heading)
            current_task = {
                "chapter": current_chapter,
                "task_number": number,
                "source_task_number": source_number,
                "chapter_heading": current_chapter_row,
                "task_heading": heading,
                **source,
                "ocr_provider": {
                    "provider": "gemini", "model": ocr.get("model"),
                    "model_version": ocr.get("modelVersion"), "prompt_id": ocr.get("promptId"),
                    "schema_id": ocr.get("schemaId"),
                },
                "translator": {
                    "provider": "gemini", "model": table.get("model"),
                    "model_version": table.get("modelVersion"), "prompt_id": table.get("promptId"),
                    "schema_id": table.get("schemaId"), "translit_profile": table.get("translitProfile"),
                    "translit_profile_version": table.get("translitProfileVersion"),
                },
                "verification_status": "generated_unreviewed",
                "rows": [],
            }
            tasks.append(current_task)
            continue
        if current_task is None:
            continue
        content_row = {**row,
                       "kind": _semantic_kind(str(row.get("he_plain") or ""), str(row.get("ru") or "")),
                       "chapter": current_task["chapter"], "task_number": current_task["task_number"],
                       "order_index": len(current_task["rows"])}
        current_task["rows"].append(content_row)
        rendered_rows.append(content_row)

    numbers = [str(task["task_number"]) for task in tasks]
    if len(numbers) != len(set(numbers)):
        raise ValueError("duplicate normalized task numbers in table cache")
    if set(numbers) != set(source_map):
        raise ValueError(f"table/OCR task mismatch: table={numbers!r}, ocr={list(source_map)!r}")
    payload = {
        "schema": "linguistpro.physics.rendered-table.1",
        "source": {
            "table_cache": str(table_path), "table_cache_sha256": sha256_file(table_path),
            "ocr_cache": str(ocr_path), "ocr_cache_sha256": sha256_file(ocr_path),
            "page_manifest": str(page_manifest_path), "page_manifest_sha256": sha256_file(page_manifest_path),
        },
        "summary": {"task_count": len(tasks), "row_count": sum(len(task["rows"]) for task in tasks)},
        "warnings": warnings,
        "rows": rendered_rows,
        "tasks": tasks,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **payload["summary"], "warnings": warnings}, ensure_ascii=False, indent=2))
    return 0


@dataclass
class LegacyTask:
    chapter: int
    task_number: str
    legacy_task_number: str
    title_he: str
    title_ru: str
    rows: list[dict[str, object]]


def normalize_rich_sections(sections: list[dict[str, object]]) -> tuple[list[LegacyTask], list[str]]:
    tasks: list[LegacyTask] = []
    warnings: list[str] = []
    current_chapter: int | None = None
    current_chapter_he = ""
    current_chapter_ru = ""
    current_task: LegacyTask | None = None
    source_order = 0

    for section in sections:
        raw_rows = section.get("rows") or []
        if not raw_rows:
            continue
        columns = _column_map(raw_rows[0])
        for raw in raw_rows[1:]:
            values = {
                name: (raw[index].strip() if index < len(raw) else "")
                for name, index in columns.items()
            }
            if not any(values.values()):
                continue
            plain = strip_hebrew_marks(values["he_plain"])
            chapter_match = re.match(r"^פרק\s+(\d+)\b", plain.strip())
            if chapter_match:
                current_chapter = int(chapter_match.group(1))
                current_chapter_he = values["he_plain"]
                current_chapter_ru = values["ru"]
                current_task = None
                continue
            task_match = re.match(r"^שאלה\s+(\d+)\.(\d+)\s*:?$", plain.strip())
            if task_match:
                header_chapter = int(task_match.group(1))
                suffix = int(task_match.group(2))
                legacy_task_number = f"{header_chapter}.{suffix}"
                if current_chapter is None:
                    current_chapter = header_chapter
                if header_chapter != current_chapter:
                    normalized_suffix = header_chapter if suffix == current_chapter else suffix
                    warnings.append(
                        f"legacy header {legacy_task_number} appears under chapter {current_chapter}; normalized to {current_chapter}.{normalized_suffix}"
                    )
                else:
                    normalized_suffix = suffix
                task_number = f"{current_chapter}.{normalized_suffix}"
                current_task = LegacyTask(
                    chapter=current_chapter,
                    task_number=task_number,
                    legacy_task_number=legacy_task_number,
                    title_he=current_chapter_he,
                    title_ru=current_chapter_ru,
                    rows=[],
                )
                tasks.append(current_task)
                continue
            if current_task is None:
                # Book/course headings before the first chapter are source context,
                # not a task card and therefore stay out of card rows.
                continue
            source_order += 1
            current_task.rows.append({
                "order_index": len(current_task.rows),
                "legacy_source_order": source_order,
                "kind": _semantic_kind(values["he_plain"], values["ru"]),
                **values,
            })
    return tasks, warnings


def normalize_legacy(args: argparse.Namespace) -> int:
    root = Path(args.root)
    rich_xlsx = root / "Главы_1_7,_колонки_Иврит+С_некудом+Транслит+Перевод.xlsx"
    rich_docx = root / "Главы_8_9_Учебная_таблица_перевод_с_транскрипцией.docx"
    if not rich_xlsx.is_file() or not rich_docx.is_file():
        print("rich legacy sources missing", file=sys.stderr)
        return 2
    # The rich workbook intentionally contains two projection sheets.  The
    # four-column sheet is the authority; the one/two-column copies are views.
    xlsx_sections = read_xlsx(rich_xlsx)
    rich_17 = [xlsx_sections[0]]
    rich_89 = read_docx_tables(rich_docx)
    tasks_17, warnings_17 = normalize_rich_sections(rich_17)
    tasks_89, warnings_89 = normalize_rich_sections(rich_89)
    tasks = tasks_17 + tasks_89
    numbers = [task.task_number for task in tasks]
    duplicate_numbers = sorted({number for number in numbers if numbers.count(number) > 1})
    expected_counts = {1: 10, 2: 3, 3: 8, 4: 14, 5: 3, 6: 12, 7: 8, 8: 5, 9: 11}
    expected_numbers = [f"{chapter}.{number}" for chapter, count in expected_counts.items() for number in range(1, count + 1)]
    missing_numbers = [number for number in expected_numbers if number not in set(numbers)]
    unexpected_numbers = [number for number in numbers if number not in set(expected_numbers)]
    by_chapter = {
        str(chapter): sum(1 for task in tasks if task.chapter == chapter)
        for chapter in range(1, 10)
    }
    payload = {
        "schema": "linguistpro.physics.legacy-reference.1",
        "source_files": [
            {"name": rich_xlsx.name, "sha256": sha256_file(rich_xlsx)},
            {"name": rich_docx.name, "sha256": sha256_file(rich_docx)},
        ],
        "summary": {
            "task_count": len(tasks),
            "row_count": sum(len(task.rows) for task in tasks),
            "by_chapter": by_chapter,
            "duplicate_task_numbers": duplicate_numbers,
            "expected_task_count": len(expected_numbers),
            "missing_task_numbers": missing_numbers,
            "unexpected_task_numbers": unexpected_numbers,
        },
        "warnings": warnings_17 + warnings_89,
        "tasks": [
            {
                "chapter": task.chapter,
                "task_number": task.task_number,
                "legacy_task_number": task.legacy_task_number,
                "chapter_title_he": task.title_he,
                "chapter_title_ru": task.title_ru,
                "rows": task.rows,
            }
            for task in tasks
        ],
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **payload["summary"], "warnings": payload["warnings"]}, ensure_ascii=False, indent=2))
    return 0


def legacy_audit(args: argparse.Namespace) -> int:
    root = Path(args.root)
    rich_xlsx = root / "Главы_1_7,_колонки_Иврит+С_некудом+Транслит+Перевод.xlsx"
    plain_xlsx = root / "Главы 1-7, колонки Иврит+Перевод.xlsx"
    rich_docx = root / "Главы_8_9_Учебная_таблица_перевод_с_транскрипцией.docx"
    plain_docx = root / "ДЛЯ_ПЕЧАТИ_Главы_8_9_Учебная_таблица_перевод_без_транскрипции.docx"
    required = [rich_xlsx, plain_xlsx, rich_docx, plain_docx]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        print(json.dumps({"error": "missing legacy sources", "paths": missing}, ensure_ascii=False), file=sys.stderr)
        return 2

    rich_17 = read_xlsx(rich_xlsx)
    plain_17 = read_xlsx(plain_xlsx)
    rich_89 = read_docx_tables(rich_docx)
    plain_89 = read_docx_tables(plain_docx)
    summary = {
        "rich_1_7": {"sections": len(rich_17), "rows": sum(len(x["rows"]) for x in rich_17)},
        "plain_1_7": {"sections": len(plain_17), "rows": sum(len(x["rows"]) for x in plain_17)},
        "rich_8_9": {"sections": len(rich_89), "rows": sum(len(x["rows"]) for x in rich_89)},
        "plain_8_9": {"sections": len(plain_89), "rows": sum(len(x["rows"]) for x in plain_89)},
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.preview:
        _print_preview("rich XLSX chapters 1-7", rich_17, args.preview)
        _print_preview("plain XLSX chapters 1-7", plain_17, args.preview)
        _print_preview("rich DOCX chapters 8-9", rich_89, args.preview)
        _print_preview("plain DOCX chapters 8-9", plain_89, args.preview)
    return 0


def _comparison_text(value: str) -> str:
    value = strip_hebrew_marks(value or "")
    value = value.replace("־", "-").replace("–", "-").replace("—", "-")
    value = value.replace("״", '"').replace("׳", "'")
    return re.sub(r"\s+", " ", value).strip().lower()


def _joined_rows(rows: list[dict[str, object]], column: str) -> str:
    return " ".join(str(row.get(column) or "").strip() for row in rows if str(row.get(column) or "").strip())


def _token_diff(old_text: str, new_text: str, limit: int = 24) -> list[dict[str, object]]:
    old_tokens = _comparison_text(old_text).split()
    new_tokens = _comparison_text(new_text).split()
    matcher = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
    changes: list[dict[str, object]] = []
    for tag, old_start, old_end, new_start, new_end in matcher.get_opcodes():
        if tag == "equal":
            continue
        changes.append({
            "operation": tag,
            "legacy": " ".join(old_tokens[old_start:old_end]),
            "gold": " ".join(new_tokens[new_start:new_end]),
        })
        if len(changes) >= limit:
            break
    return changes


def _split_gold_tasks(rows: list[dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    tasks: dict[str, list[dict[str, object]]] = {}
    current: str | None = None
    for row in rows:
        plain = strip_hebrew_marks(str(row.get("he_plain") or "")).strip()
        match = re.match(r"^שאלה\s+(\d+\.\d+)\s*:?$", plain)
        if match:
            current = match.group(1)
            tasks.setdefault(current, [])
            continue
        if current is not None and str(row.get("kind") or "") != "chapter_header":
            tasks[current].append(row)
    return tasks


def compare_gold(args: argparse.Namespace) -> int:
    legacy_path = Path(args.legacy)
    gold_path = Path(args.gold)
    if not legacy_path.is_file() or not gold_path.is_file():
        print(json.dumps({"error": "comparison input missing", "legacy": str(legacy_path), "gold": str(gold_path)}, ensure_ascii=False), file=sys.stderr)
        return 2
    legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
    gold = json.loads(gold_path.read_text(encoding="utf-8"))
    legacy_tasks = {str(task.get("task_number")): task for task in legacy.get("tasks", [])}
    if isinstance(gold.get("tasks"), list) and gold.get("tasks"):
        gold_tasks = {
            str(task.get("task_number")): list(task.get("rows") or [])
            for task in gold["tasks"]
        }
    else:
        gold_tasks = _split_gold_tasks(gold.get("rows", []))
    task_reports: list[dict[str, object]] = []
    for number, gold_rows in gold_tasks.items():
        legacy_task = legacy_tasks.get(number)
        if not legacy_task:
            task_reports.append({"task_number": number, "status": "missing_in_legacy", "gold_row_count": len(gold_rows)})
            continue
        legacy_rows = legacy_task.get("rows", [])
        columns: dict[str, object] = {}
        for column in ("he_plain", "he_niqqud", "translit", "ru"):
            old_text = _joined_rows(legacy_rows, column)
            new_text = _joined_rows(gold_rows, column)
            old_normalized = _comparison_text(old_text)
            new_normalized = _comparison_text(new_text)
            columns[column] = {
                "similarity": round(difflib.SequenceMatcher(a=old_normalized, b=new_normalized, autojunk=False).ratio(), 6),
                "legacy_chars": len(old_text),
                "gold_chars": len(new_text),
                "token_changes": _token_diff(old_text, new_text),
            }
        task_reports.append({
            "task_number": number,
            "status": "compared",
            "legacy_row_count": len(legacy_rows),
            "gold_row_count": len(gold_rows),
            "segmentation_changed": len(legacy_rows) != len(gold_rows),
            "columns": columns,
        })
    payload = {
        "schema": "linguistpro.physics.gold-legacy-comparison.1",
        "legacy": {"path": str(legacy_path), "sha256": sha256_file(legacy_path)},
        "gold": {"path": str(gold_path), "sha256": sha256_file(gold_path)},
        "summary": {
            "gold_task_count": len(gold_tasks),
            "compared_task_count": sum(1 for task in task_reports if task["status"] == "compared"),
            "missing_in_legacy": [task["task_number"] for task in task_reports if task["status"] == "missing_in_legacy"],
        },
        "tasks": task_reports,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **payload["summary"], "tasks": task_reports}, ensure_ascii=False, indent=2))
    return 0


PHYSICS_TASK_COUNTS = {1: 10, 2: 3, 3: 8, 4: 14, 5: 3, 6: 12, 7: 8, 8: 5, 9: 11}
PHYSICS_CORPUS_TITLE = "Физика — задачник, 1 год"


def _expected_physics_tasks() -> list[str]:
    return [
        f"{chapter}.{number}"
        for chapter, count in PHYSICS_TASK_COUNTS.items()
        for number in range(1, count + 1)
    ]


def _has_missing_illustration_reference(rows: list[dict[str, object]]) -> bool:
    value = " ".join(
        f"{row.get('he_plain', '')} {row.get('ru', '')}"
        for row in rows
    )
    return bool(re.search(
        r"(?:תרשים|איור|גרף|שרטוט|схем|рисунк|диаграмм|график|чертеж)",
        value, re.I,
    ))


def _deterministic_id(prefix: str, value: str) -> str:
    return f"{prefix}-{hashlib.sha256(value.encode('utf-8')).hexdigest()[:24]}"


def _comparison_map(paths: list[str]) -> dict[str, dict[str, object]]:
    out: dict[str, dict[str, object]] = {}
    for raw_path in paths:
        path = Path(raw_path)
        payload = json.loads(path.read_text(encoding="utf-8"))
        for task in payload.get("tasks", []):
            number = str(task.get("task_number") or "")
            if number:
                out[number] = {
                    **task,
                    "comparison_file": str(path),
                    "comparison_file_sha256": sha256_file(path),
                }
    return out


def _task_to_library_text(task: dict[str, object], generated_at: str) -> dict[str, object]:
    number = str(task["task_number"])
    chapter = int(task["chapter"])
    text_key = f"physics-year1-task-{number.replace('.', '-')}"
    rows: list[dict[str, object]] = []
    translator = task.get("translator") or {}
    provider_name = f"gemini:{translator.get('model')}" if translator.get("provider") == "gemini" else str(translator.get("provider") or "")
    for index, source_row in enumerate(task.get("rows") or []):
        row_meta = {
            "physics": {
                "schema": "linguistpro.physics.row.1",
                "chapter": chapter,
                "task_number": number,
                "kind": source_row.get("kind"),
                "source_page": task.get("source_page"),
                "source_image_sha256": task.get("source_image_sha256"),
                "source_row_index": source_row.get("source_row_index"),
                "source_subrow_index": source_row.get("source_subrow_index"),
            }
        }
        translation_meta = {
            **translator,
            "verification_status": task.get("verification_status"),
            "comparison_status": (task.get("legacy_comparison") or {}).get("status"),
        }
        rows.append({
            "row_id": _deterministic_id("physics-row", f"{number}:{index}"),
            "order_index": index,
            "hebrew_plain": str(source_row.get("he_plain") or ""),
            "hebrew_niqqud": str(source_row.get("he_niqqud") or ""),
            "translit": str(source_row.get("translit") or ""),
            "translit_ru": "",
            "russian": str(source_row.get("ru") or ""),
            "edit_meta": None,
            "audio_asset_key": None,
            "translation_provider": provider_name or None,
            "translation_meta": translation_meta,
            "niqqud_authority": "ASSERTED",
            "niqqud_provenance": provider_name or None,
            "meta": row_meta,
            "source_segment_id": None,
            "source_segment_ids": [],
            "caption_segment_id": None,
            "source_line_index": index,
            "sentence_index": index,
            "note": None,
        })

    source_meta = {
        "physics_task": {
            "schema": "linguistpro.physics.task-card.1",
            "corpus_title": PHYSICS_CORPUS_TITLE,
            "chapter": chapter,
            "task_number": number,
            "source_task_number": task.get("source_task_number"),
            "source_page": task.get("source_page"),
            "source_filename": task.get("source_filename"),
            "source_image_sha256": task.get("source_image_sha256"),
            "ocr_provider": task.get("ocr_provider"),
            "translator": translator,
            "verification_status": task.get("verification_status"),
            "base_verification_status": task.get("base_verification_status"),
            "illustration_status": task.get("illustration_status"),
            "source_attachment": {
                "kind": "image",
                "embedded": False,
                "filename": task.get("source_filename"),
                "sha256": task.get("source_image_sha256"),
                "replaceable": True,
            },
            "legacy_comparison": task.get("legacy_comparison"),
        }
    }
    return {
        "text_id": _deterministic_id("physics-text", number),
        "text_key": text_key,
        "title": f"Физика — задача {number}",
        "level": "year-1",
        "tags": ["physics", "year-1", f"chapter-{chapter}", f"task-{number}", str(task.get("verification_status"))],
        "source_label": PHYSICS_CORPUS_TITLE,
        "topic": f"Глава {chapter}",
        "source_text": "\n".join(str(row.get("he_plain") or "") for row in task.get("rows") or []),
        "source_meta": source_meta,
        "corpus": None,
        "table_model_meta": {
            "physics_task": {
                "translator": translator,
                "ocr_provider": task.get("ocr_provider"),
                "verification_status": task.get("verification_status"),
            }
        },
        "rows": rows,
        "text_audio_asset_key": None,
        "created_at": generated_at,
        "updated_at": generated_at,
        "is_archived": False,
        "is_pinned": False,
        "pin_order": None,
        "manual_smart_tag": None,
        "tts_profile_json": "null",
        "progress": None,
        "bookmarks": [],
    }


def _zip_write_json(archive: zipfile.ZipFile, name: str, payload: object, timestamp: tuple[int, int, int, int, int, int]) -> None:
    info = zipfile.ZipInfo(name, date_time=timestamp)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def build_corpus(args: argparse.Namespace) -> int:
    batch_paths = [Path(path) for path in args.batch]
    if len(batch_paths) != 3 or not all(path.is_file() for path in batch_paths):
        print(json.dumps({"error": "exactly three rendered batches are required"}), file=sys.stderr)
        return 2
    comparison = _comparison_map(args.comparison or [])
    raw_tasks: list[dict[str, object]] = []
    batch_sources: list[dict[str, str]] = []
    for batch_index, path in enumerate(batch_paths, start=1):
        payload = json.loads(path.read_text(encoding="utf-8"))
        batch_sources.append({"path": str(path), "sha256": sha256_file(path)})
        for task in payload.get("tasks", []):
            raw_tasks.append({**task, "source_batch": batch_index})

    expected = _expected_physics_tasks()
    actual = [str(task.get("task_number") or "") for task in raw_tasks]
    if actual != expected or len(set(actual)) != len(expected):
        print(json.dumps({"error": "task sequence mismatch", "expected": expected, "actual": actual}, ensure_ascii=False), file=sys.stderr)
        return 3

    tasks: list[dict[str, object]] = []
    status_counts: dict[str, int] = {}
    for source_task in raw_tasks:
        number = str(source_task["task_number"])
        rows = expand_semantic_rows(list(source_task.get("rows") or []), number)
        if not rows or any(not str(row.get(column) or "").strip() for row in rows for column in ("he_plain", "he_niqqud", "translit", "ru")):
            raise ValueError(f"task {number} contains an empty required row field")
        if any("\n" in str(row.get(column) or "") for row in rows for column in ("he_plain", "he_niqqud", "translit", "ru")):
            raise ValueError(f"task {number} still contains an embedded newline")
        has_illustration = _has_missing_illustration_reference(rows)
        base_status = str(source_task.get("verification_status") or "generated_unreviewed")
        status = "incomplete_missing_diagram" if has_illustration else base_status
        status_counts[status] = status_counts.get(status, 0) + 1
        tasks.append({
            **source_task,
            "rows": rows,
            "base_verification_status": base_status,
            "verification_status": status,
            "illustration_status": "missing_referenced" if has_illustration else "not_referenced",
            "legacy_comparison": comparison.get(number, {"task_number": number, "status": "missing_in_legacy"}),
        })

    generated_at = args.generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    records = {
        "schema": "linguistpro.physics.corpus-records.1",
        "corpus_title": PHYSICS_CORPUS_TITLE,
        "generated_at": generated_at,
        "sources": batch_sources,
        "summary": {
            "chapter_count": 9,
            "task_count": len(tasks),
            "row_count": sum(len(task["rows"]) for task in tasks),
            "by_chapter": {str(chapter): sum(1 for task in tasks if int(task["chapter"]) == chapter) for chapter in PHYSICS_TASK_COUNTS},
            "verification_statuses": status_counts,
            "legacy_compared": sum(1 for task in tasks if (task.get("legacy_comparison") or {}).get("status") == "compared"),
            "legacy_missing": [task["task_number"] for task in tasks if (task.get("legacy_comparison") or {}).get("status") != "compared"],
        },
        "tasks": tasks,
    }
    records_path = Path(args.records_output)
    records_path.parent.mkdir(parents=True, exist_ok=True)
    records_path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    texts = [_task_to_library_text(task, generated_at) for task in tasks]
    shelf_items = [{"text_key": text["text_key"], "order": index} for index, text in enumerate(texts)]
    library = {
        "schema_version": 1,
        "corpus_meta_version": 1,
        "shelves": [{
            "schema": 1,
            "slug": "physics-year1-problems",
            "title": PHYSICS_CORPUS_TITLE,
            "track": "accessible",
            "era": "education",
            "genre": "physics",
            "editorial_intro": "9 глав, 74 задачи. Одна задача на карточку; условия, подпункты и примечания разделены по смыслу.",
            "items": shelf_items,
            "order": 1,
            "origin": None,
            "canon_version": None,
        }],
        "texts": texts,
        "audio_assets": [],
    }
    manifest = {
        "format": "linguistpro-bundle",
        "schema_version": 1,
        "generated_at": generated_at,
        "generator": "physics-corpus-pipeline",
        "corpus_title": PHYSICS_CORPUS_TITLE,
        "chapter_count": 9,
        "text_count": len(texts),
        "row_count": sum(len(text["rows"]) for text in texts),
        "audio_count": 0,
        "missing_audio": 0,
        "library_json_path": "library/library.json",
        "records_sha256": sha256_file(records_path),
    }
    bundle_path = Path(args.bundle_output)
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    dt = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    timestamp = (max(1980, dt.year), dt.month, dt.day, dt.hour, dt.minute, dt.second)
    with zipfile.ZipFile(bundle_path, "w") as archive:
        _zip_write_json(archive, "manifest.json", manifest, timestamp)
        _zip_write_json(archive, "library/library.json", library, timestamp)
        _zip_write_json(archive, "metadata/physics-corpus-summary.json", records["summary"], timestamp)
    manifest["bundle_sha256"] = sha256_file(bundle_path)
    manifest_path = Path(args.manifest_output)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "records": str(records_path),
        "bundle": str(bundle_path),
        "manifest": str(manifest_path),
        **records["summary"],
        "bundle_sha256": manifest["bundle_sha256"],
    }, ensure_ascii=False, indent=2))
    return 0


def verify_corpus_bundle(args: argparse.Namespace) -> int:
    bundle_path = Path(args.bundle)
    records_path = Path(args.records)
    if not bundle_path.is_file() or not records_path.is_file():
        print(json.dumps({"error": "bundle or records missing"}), file=sys.stderr)
        return 2
    records = json.loads(records_path.read_text(encoding="utf-8"))
    with zipfile.ZipFile(bundle_path) as archive:
        names = set(archive.namelist())
        required = {"manifest.json", "library/library.json", "metadata/physics-corpus-summary.json"}
        if not required.issubset(names):
            raise ValueError(f"bundle entries missing: {sorted(required - names)}")
        manifest = json.loads(archive.read("manifest.json"))
        library = json.loads(archive.read("library/library.json"))
    texts = library.get("texts") or []
    expected = _expected_physics_tasks()
    numbers = [str(((text.get("source_meta") or {}).get("physics_task") or {}).get("task_number") or "") for text in texts]
    if manifest.get("text_count") != 74 or len(texts) != 74 or numbers != expected:
        raise ValueError("bundle does not contain the canonical 74-task sequence")
    if len({text.get("text_key") for text in texts}) != 74:
        raise ValueError("duplicate text_key in corpus bundle")
    for text in texts:
        meta = ((text.get("source_meta") or {}).get("physics_task") or {})
        for field in ("chapter", "task_number", "source_page", "source_image_sha256", "ocr_provider", "translator", "verification_status"):
            if meta.get(field) in (None, "", {}):
                raise ValueError(f"{text.get('text_key')} missing mandatory field {field}")
        if not re.fullmatch(r"[a-f0-9]{64}", str(meta.get("source_image_sha256"))):
            raise ValueError(f"{text.get('text_key')} has invalid image SHA-256")
        for index, row in enumerate(text.get("rows") or []):
            for field in ("hebrew_plain", "hebrew_niqqud", "translit", "russian"):
                if not str(row.get(field) or "").strip() or "\n" in str(row.get(field) or ""):
                    raise ValueError(f"{text.get('text_key')} row {index} invalid {field}")
            row_meta = ((row.get("meta") or {}).get("physics") or {})
            kind = str(row_meta.get("kind") or "")
            plain = strip_hebrew_marks(str(row.get("hebrew_plain") or ""))
            subparts = list(re.finditer(r"(?<!\S)[אבגדהוזחט]\s*[.)](?=\s+\S)", plain))
            if kind == "subpart":
                if len(subparts) != 1 or subparts[0].start() != 0:
                    raise ValueError(f"{text.get('text_key')} row {index} has an unsplit or misaligned subpart")
            elif subparts:
                raise ValueError(f"{text.get('text_key')} row {index} contains an embedded subpart marker")
            note_match = re.match(r"^(?:הער(?:ה|ות)|שים\s+לב)\s*:", plain)
            if kind == "note" and not note_match:
                raise ValueError(f"{text.get('text_key')} row {index} note kind does not start with a note marker")
    if records.get("summary", {}).get("task_count") != 74:
        raise ValueError("records summary task count is not 74")
    print(json.dumps({
        "bundle": str(bundle_path),
        "bundle_sha256": sha256_file(bundle_path),
        "text_count": len(texts),
        "row_count": sum(len(text.get("rows") or []) for text in texts),
        "shelf_count": len(library.get("shelves") or []),
        "mandatory_fields": "pass",
        "semantic_rows": "pass",
    }, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    audit = sub.add_parser("legacy-audit", help="Read and summarize the four owner legacy tables")
    audit.add_argument("--root", required=True, help="Physics source directory")
    audit.add_argument("--preview", type=int, default=0, help="Print the first N rows of every section")
    audit.set_defaults(func=legacy_audit)
    normalize = sub.add_parser("normalize-legacy", help="Create the canonical four-column legacy reference JSON")
    normalize.add_argument("--root", required=True, help="Physics source directory")
    normalize.add_argument("--output", required=True, help="Output JSON path")
    normalize.set_defaults(func=normalize_legacy)
    compare = sub.add_parser("compare-gold", help="Compare a rendered Gemini gold record with the normalized legacy reference")
    compare.add_argument("--legacy", required=True, help="Normalized legacy reference JSON")
    compare.add_argument("--gold", required=True, help="Rendered live-gold evidence JSON")
    compare.add_argument("--output", required=True, help="Output comparison JSON path")
    compare.set_defaults(func=compare_gold)
    table_input = sub.add_parser("prepare-table-input", help="Create a deterministic one-line-per-semantic-row table input from an OCR provider cache")
    table_input.add_argument("--ocr-cache", required=True, help="Immutable OCR provider-cache JSON")
    table_input.add_argument("--corrections", help="Optional approved exact-replacement JSON")
    table_input.add_argument("--output", required=True, help="Output UTF-8 table-input text")
    table_input.add_argument("--manifest", required=True, help="Output provenance and checksum manifest")
    table_input.set_defaults(func=prepare_table_input)
    normalize_table = sub.add_parser("normalize-table-cache", help="Normalize one Gemini table cache into task records with source-page provenance")
    normalize_table.add_argument("--table-cache", required=True, help="Immutable successful Gemini table cache")
    normalize_table.add_argument("--ocr-cache", required=True, help="Matching immutable OCR provider cache")
    normalize_table.add_argument("--page-manifest", required=True, help="Matching source page/image SHA manifest")
    normalize_table.add_argument("--table-input", help="Optional frozen table input for exact text verification")
    normalize_table.add_argument("--initial-chapter", type=int, help="Chapter context when a batch begins mid-chapter")
    normalize_table.add_argument("--output", required=True, help="Output rendered-table JSON")
    normalize_table.set_defaults(func=normalize_table_cache)
    corpus = sub.add_parser("build-corpus", help="Build the canonical 74-card Physics Year 1 records and import bundle")
    corpus.add_argument("--batch", action="append", required=True, help="Rendered table JSON; pass exactly three in chapter order")
    corpus.add_argument("--comparison", action="append", default=[], help="Optional legacy-comparison JSON; may be repeated")
    corpus.add_argument("--records-output", required=True, help="Output canonical corpus records JSON")
    corpus.add_argument("--bundle-output", required=True, help="Output LinguistPro bundle ZIP")
    corpus.add_argument("--manifest-output", required=True, help="Output bundle manifest/evidence JSON")
    corpus.add_argument("--generated-at", help="Deterministic ISO-8601 generation timestamp")
    corpus.set_defaults(func=build_corpus)
    verify_corpus = sub.add_parser("verify-corpus-bundle", help="Verify the 74-card Physics bundle and mandatory metadata")
    verify_corpus.add_argument("--bundle", required=True, help="LinguistPro bundle ZIP")
    verify_corpus.add_argument("--records", required=True, help="Canonical corpus records JSON")
    verify_corpus.set_defaults(func=verify_corpus_bundle)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
