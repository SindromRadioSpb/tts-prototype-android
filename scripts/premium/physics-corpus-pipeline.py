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
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
