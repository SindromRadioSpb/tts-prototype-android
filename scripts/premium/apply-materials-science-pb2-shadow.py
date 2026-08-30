#!/usr/bin/env python3
"""Prepare and execute the owner-approved Materials Science PB2 shadow audit.

The command is fail-closed: it never imports, publishes, edits corpus truth, or
handles worked solutions. Raw provider responses are immutable resumable cache
entries; stable artifacts contain only derived audit evidence and hashes.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import tempfile
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz
from PIL import Image, ImageDraw, ImageFont


MODEL = "gemini-3.7-flash"
MODE = "STANDARD"
THINKING_LEVEL = "medium"
SCHEMA_ID = "linguistpro-materials-pb2-shadow-audit-v1"
SOURCE_EDITION = "problem-book-2-pdf-sha256-3d87b9f5"
SOURCE_PDF = "Задачник 2.pdf"
LEGACY_JSON = "Материаловедение_library_export_20260119.json"
SOURCE_SHA256 = "3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435"
LEGACY_SHA256 = "2a2f3191dd73a5e5bc99b096cda704a54172b33ebd3416c969d2f03299e2cb21"
INPUT_USD_PER_M = 0.75
OUTPUT_USD_PER_M = 3.75
INPUT_TOKEN_CAP = 50_000
OUTPUT_TOKEN_CAP = 16_384
PDF_PAGE_TOKENS = 258
MAX_PRIMARY_CALLS = 3
MAX_TOTAL_RETRIES = 1
FULL = [0.0, 0.0, 1.0, 1.0]
ALLOWED_LEGACY_ROLES = {
    "LEGACY_PAGE_MARKER",
    "LEGACY_TASK_HEADING",
    "LEGACY_MIXED_CONDITION_OR_SOLUTION_UNADJUDICATED",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def atomic_write_new_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise RuntimeError(f"refusing to overwrite immutable raw cache: {path}")
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


def normalized_rect(page: fitz.Page, bbox: list[float]) -> fitz.Rect:
    x0, y0, x1, y1 = bbox
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        raise ValueError(f"invalid normalized bbox: {bbox}")
    rect = page.rect
    return fitz.Rect(rect.x0 + rect.width * x0, rect.y0 + rect.height * y0,
                     rect.x0 + rect.width * x1, rect.y0 + rect.height * y1)


def union_bbox(values: list[list[float]]) -> list[float]:
    if any(value == FULL for value in values):
        return FULL.copy()
    return [min(value[0] for value in values), min(value[1] for value in values),
            max(value[2] for value in values), max(value[3] for value in values)]


def image_metrics(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        gray = image.convert("L")
        pixels = gray.get_flattened_data() if hasattr(gray, "get_flattened_data") else gray.getdata()
        ink = sum(1 for value in pixels if value < 245) / (gray.width * gray.height)
        return {"width": image.width, "height": image.height, "ink_ratio": round(ink, 6)}


def contact_sheet(items: list[dict[str, Any]], destination: Path) -> None:
    thumb_w, thumb_h, label_h, columns = 360, 500, 54, 3
    rows = math.ceil(len(items) / columns)
    sheet = Image.new("RGB", (columns * thumb_w, rows * (thumb_h + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)
    for index, item in enumerate(items):
        with Image.open(item["render_path"]) as source:
            thumb = source.convert("RGB")
            thumb.thumbnail((thumb_w - 12, thumb_h - 12), Image.Resampling.LANCZOS)
            col, row = index % columns, index // columns
            x = col * thumb_w + (thumb_w - thumb.width) // 2
            y = row * (thumb_h + label_h) + label_h
            sheet.paste(thumb, (x, y))
            label = f"out {item['output_page']:02d} <- src {item['source_page']:02d} {item['item_kind']}"
            draw.text((col * thumb_w + 6, row * (thumb_h + label_h) + 5), label, fill="black", font=font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=92)


def page_specs(sample: dict[str, Any], batch: dict[str, Any]) -> list[dict[str, Any]]:
    cases = {item["case_id"]: item for item in sample["cases"]}
    anchors: dict[int, list[dict[str, Any]]] = defaultdict(list)
    dependencies: dict[int, set[str]] = defaultdict(set)
    for case_id in batch["case_ids"]:
        for task in cases[case_id]["tasks"]:
            for anchor in task["source_anchors"]:
                anchors[anchor["source_page"]].append({
                    "task_id": task["task_id"], "bbox": anchor["normalized_bbox"], "role": anchor["role"],
                })
            for dependency in task["external_reference_dependencies"]:
                for page in dependency["source_pages"]:
                    dependencies[page].add(task["task_id"])
    result = []
    for page in batch["source_pages_once_per_batch"]:
        page_anchors = anchors.get(page, [])
        task_ids = sorted({item["task_id"] for item in page_anchors} | dependencies.get(page, set()))
        if page in dependencies:
            bbox = FULL.copy()
            item_kind = "appendix_reference"
        else:
            bbox = union_bbox([item["bbox"] for item in page_anchors])
            item_kind = "condition_union" if len(page_anchors) > 1 else "condition"
        result.append({
            "output_page": len(result) + 1,
            "source_page": page,
            "normalized_bbox": bbox,
            "item_kind": item_kind,
            "task_ids": task_ids,
            "anchor_roles": sorted({item["role"] for item in page_anchors}),
        })
    return result


def build_and_verify_pdfs(source_pdf: Path, shadow: Path, scratch: Path,
                          sample: dict[str, Any]) -> dict[str, Any]:
    if sha256_file(source_pdf) != SOURCE_SHA256:
        raise RuntimeError("source PDF hash drift")
    input_dir = shadow / "inputs"
    visual_dir = shadow / "visual-review"
    render_root = scratch / "materials-pb2-shadow"
    input_dir.mkdir(parents=True, exist_ok=True)
    render_root.mkdir(parents=True, exist_ok=True)
    source = fitz.open(source_pdf)
    batches = []
    try:
        for batch in sample["batches"]:
            specs = page_specs(sample, batch)
            output = input_dir / f"materials-pb2-shadow-{batch['batch_id']}.pdf"
            document = fitz.open()
            try:
                for item in specs:
                    source_page = source[item["source_page"] - 1]
                    bbox = item["normalized_bbox"]
                    clip = source_page.rect if bbox == FULL else normalized_rect(source_page, bbox)
                    # The source contains a broken embedded ICC profile accepted
                    # by desktop viewers but rejected by stricter APIs. Render at
                    # 216 DPI and rebuild each page from a high-quality JPEG so the
                    # provider receives source-faithful pixels without malformed
                    # PDF resources. Rotation is already reflected by page.rect.
                    pixmap = source_page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False)
                    image_bytes = pixmap.tobytes("jpeg", jpg_quality=92)
                    target = document.new_page(width=clip.width, height=clip.height)
                    target.insert_image(target.rect, stream=image_bytes)
                document.set_metadata({
                    "title": output.stem,
                    "author": "LinguistPro local Shadow APPLY",
                    "subject": "Owner-approved bounded provider input; source-corpus audit only",
                    "creator": "apply-materials-science-pb2-shadow.py",
                    "producer": "PyMuPDF",
                    "creationDate": "D:19700101000000Z",
                    "modDate": "D:19700101000000Z",
                })
                temporary = output.with_suffix(".pdf.tmp")
                document.save(temporary, garbage=4, deflate=True, clean=True, no_new_id=True)
                os.replace(temporary, output)
            finally:
                document.close()

            readback = fitz.open(output)
            page_results = []
            try:
                if readback.page_count != len(specs):
                    raise RuntimeError(f"page-count mismatch for {batch['batch_id']}")
                batch_render_dir = render_root / batch["batch_id"]
                batch_render_dir.mkdir(parents=True, exist_ok=True)
                for index, spec in enumerate(specs):
                    render_path = batch_render_dir / f"page-{index + 1:03d}-source-{spec['source_page']:03d}.png"
                    readback[index].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(render_path)
                    metrics = image_metrics(render_path)
                    if metrics["ink_ratio"] < 0.001:
                        raise RuntimeError(f"blank-looking page in {batch['batch_id']}: {index + 1}")
                    page_results.append({**spec, **metrics, "render_sha256": sha256_file(render_path),
                                         "render_path": str(render_path)})
            finally:
                readback.close()
            contact = visual_dir / f"materials-pb2-shadow-{batch['batch_id']}-contact.jpg"
            contact_sheet(page_results, contact)
            batches.append({
                "batch_id": batch["batch_id"],
                "filename": output.name,
                "bytes": output.stat().st_size,
                "sha256": sha256_file(output),
                "page_count": len(page_results),
                "source_pages": [item["source_page"] for item in page_results],
                "min_ink_ratio": min(item["ink_ratio"] for item in page_results),
                "contact_sheet": contact.name,
                "contact_sheet_sha256": sha256_file(contact),
                "pages": [{key: value for key, value in item.items() if key != "render_path"}
                          for item in page_results],
            })
    finally:
        source.close()
    return {
        "schema": "linguistpro-materials-pb2-shadow-input-manifest-v1",
        "status": "PASS_LOCAL_RENDER_READBACK_PENDING_MANUAL_VISUAL_REVIEW",
        "source_edition": SOURCE_EDITION,
        "source_pdf_sha256": SOURCE_SHA256,
        "crop_policy": "UNION_TASK_ANCHORS_ONCE_PER_BATCH_FULL_APPENDICES_RASTER_SANITIZED_216DPI_PRESERVE_ROTATION",
        "batches": batches,
        "checks": {
            "exactly_three_pdfs": len(batches) == 3,
            "page_exposures_20": sum(item["page_count"] for item in batches) == 20,
            "all_nonblank": all(item["min_ink_ratio"] >= 0.001 for item in batches),
            "all_under_20mb_inline_limit": all(item["bytes"] < 20 * 1024 * 1024 for item in batches),
        },
    }


def build_legacy_index(legacy_path: Path, projection: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if sha256_file(legacy_path) != LEGACY_SHA256:
        raise RuntimeError("legacy JSON hash drift")
    raw = read_json(legacy_path)
    raw_cards = {}
    for item in raw.get("texts", []):
        title = str(item.get("text", {}).get("title", ""))
        if not title.startswith("Задачник 2. Страница"):
            continue
        key = sha256_bytes(str(item.get("text", {}).get("id", "")).encode("utf-8"))
        raw_cards[key] = item
    projection_cards = {item["legacy_card_key_sha256"]: item for item in projection["cards"]}
    if set(raw_cards) != set(projection_cards):
        raise RuntimeError("legacy projection card identity drift")
    result = {}
    for key, card in raw_cards.items():
        projection_rows = projection_cards[key]["rows"]
        raw_rows = card.get("sentences", [])
        if len(raw_rows) != len(projection_rows):
            raise RuntimeError(f"legacy row-count drift for card {key}")
        checked = []
        for index, row in enumerate(raw_rows):
            aligned = {
                "he": str(row.get("he_plain", "")),
                "he_niqqud": str(row.get("he_niqqud", "")),
                "transliteration": str(row.get("translit", "")),
                "ru": str(row.get("ru", "")),
            }
            projected = projection_rows[index]
            if sha256_json(aligned) != projected["aligned_row_sha256"]:
                raise RuntimeError(f"legacy aligned-row drift for card {key} row {index}")
            for field, value in aligned.items():
                if sha256_bytes(value.encode("utf-8")) != projected["field_sha256"][field]:
                    raise RuntimeError(f"legacy field drift for card {key} row {index} field {field}")
            checked.append({**aligned, "aligned_row_sha256": projected["aligned_row_sha256"]})
        result[key] = {"title": title, "rows": checked}
    return result


def case_manifest_for_provider(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "case_id": case["case_id"],
        "task_ids": case["task_ids"],
        "risk_tags": case["risk_tags"],
        "reason": case["reason"],
        "input_source_pages": case["input_source_pages"],
        "tasks": case["tasks"],
        "legacy_state": case["legacy_state"],
    }


def eligible_legacy_rows(mapping: dict[str, Any], legacy_index: dict[str, dict[str, Any]],
                         task_ids: set[str]) -> list[dict[str, Any]]:
    rows = []
    for card in mapping["cards"]:
        key = card["legacy_card_key_sha256"]
        raw_rows = legacy_index[key]["rows"]
        for item in card["rows"]:
            if item["target_id"] not in task_ids or item["legacy_row_role"] not in ALLOWED_LEGACY_ROLES:
                continue
            raw = raw_rows[item["row_index"]]
            if raw["aligned_row_sha256"] != item["aligned_row_sha256"]:
                raise RuntimeError("reviewed mapping hash no longer matches legacy projection")
            rows.append({
                "legacy_row_ref_sha256": sha256_json({
                    "legacy_card_key_sha256": key,
                    "row_index": item["row_index"],
                    "aligned_row_sha256": item["aligned_row_sha256"],
                }),
                "aligned_row_sha256": item["aligned_row_sha256"],
                "task_id": item["target_id"],
                "role": item["legacy_row_role"],
                "row_index": item["row_index"],
                "he": raw["he"],
                "he_niqqud": raw["he_niqqud"],
                "transliteration": raw["transliteration"],
                "ru": raw["ru"],
            })
    return rows


def compact_legacy_rows(rows: list[dict[str, Any]]) -> list[list[Any]]:
    columns = ["legacy_row_ref_sha256", "aligned_row_sha256", "task_id", "role", "row_index", "he", "he_niqqud", "transliteration", "ru"]
    return [[row[column] for column in columns] for row in rows]


def prompt_and_candidates(prompt_template: str, schema: dict[str, Any], batch: dict[str, Any],
                          cases: list[dict[str, Any]], eligible: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    # Keep every marker/heading, then deterministically take the earliest mixed
    # rows per task. If the conservative envelope is still too large, trim only
    # mixed rows from the tail; every omission remains hash-accounted.
    fixed = [row for row in eligible if row["role"] != "LEGACY_MIXED_CONDITION_OR_SOLUTION_UNADJUDICATED"]
    mixed_by_task: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in eligible:
        if row["role"] == "LEGACY_MIXED_CONDITION_OR_SOLUTION_UNADJUDICATED":
            mixed_by_task[row["task_id"]].append(row)
    selected = fixed + [row for task_id in sorted(mixed_by_task)
                        for row in sorted(mixed_by_task[task_id], key=lambda value: value["row_index"])[:16]]
    selected.sort(key=lambda value: (value["task_id"], value["row_index"], value["legacy_row_ref_sha256"]))
    case_payload = [case_manifest_for_provider(case) for case in cases]
    columns = ["legacy_row_ref_sha256", "aligned_row_sha256", "task_id", "role", "row_index", "he", "he_niqqud", "transliteration", "ru"]

    def render(current: list[dict[str, Any]]) -> tuple[str, int]:
        payload = {
            "batch_id": batch["batch_id"],
            "source_edition": SOURCE_EDITION,
            "output_contract": {
                "schema_id": SCHEMA_ID,
                "batch_id": batch["batch_id"],
                "case_ids_exactly_once": batch["case_ids"],
                "solution_content_generated_must_be": False,
                "wire_root_fields": ["schema_id", "batch_id", "case_tasks", "task_boundaries", "source_rows", "visuals", "legacy_findings", "unknowns", "case_summaries", "batch_summary"],
                "case_task_fields": ["case_id", "task_ids"],
                "task_boundary_fields": ["task_id", "boundary_status"],
                "source_row_fields": ["row_kind", "he", "he_niqqud", "transliteration", "ru", "source_page", "confidence"],
                "visual_fields": ["source_page", "kind", "required_for_solving", "readability", "labels_or_values"],
                "legacy_finding_fields": ["legacy_row_ref_sha256", "field", "severity", "category", "source_page", "recommended_reviewed_value"],
                "summary_fields": ["critical_count", "major_count", "minor_count", "solution_content_generated"],
                "flat_array_rule": "Every source_rows, visuals, legacy_findings, and unknowns item also includes task_id. Every case_summaries item also includes case_id.",
            },
            "cases": case_payload,
            "legacy_candidate_columns": columns,
            "legacy_condition_candidates": compact_legacy_rows(current),
            "legacy_warning": "Comparison only. Candidate rows are unvalidated and may be wrong; PDF source outranks them.",
        }
        text = prompt_template.rstrip() + "\n\n# Batch manifest and comparison candidates\n" + json.dumps(
            payload, ensure_ascii=False, separators=(",", ":"))
        # PDF image tokens are accounted separately. This conservative local
        # estimate intentionally overcounts multilingual text and schema bytes.
        estimate = math.ceil(len(text) / 2) + math.ceil(len(canonical_json(schema)) / 3) \
            + len(batch["source_pages_once_per_batch"]) * PDF_PAGE_TOKENS
        return text, estimate

    text, estimate = render(selected)
    while estimate > 45_000:
        mixed_positions = [index for index, row in enumerate(selected)
                           if row["role"] == "LEGACY_MIXED_CONDITION_OR_SOLUTION_UNADJUDICATED"]
        if not mixed_positions:
            raise RuntimeError(f"batch {batch['batch_id']} exceeds conservative input envelope")
        selected.pop(mixed_positions[-1])
        text, estimate = render(selected)
    selected_hashes = {row["legacy_row_ref_sha256"] for row in selected}
    selection = {
        "eligible_count": len(eligible),
        "selected_count": len(selected),
        "omitted_count": len(eligible) - len(selected),
        "selected_sha256": sorted(selected_hashes),
        "omitted_sha256": sorted(row["legacy_row_ref_sha256"] for row in eligible
                                 if row["legacy_row_ref_sha256"] not in selected_hashes),
        "selection_policy": "ALL_MARKERS_HEADINGS_PLUS_EARLIEST_UP_TO_16_MIXED_ROWS_PER_TASK_THEN_TAIL_TRIM_TO_45K_ESTIMATE",
        "conservative_input_token_estimate": estimate,
    }
    return text, selected, selection


def build_requests(source_dir: Path, shadow: Path, input_manifest: dict[str, Any]) -> dict[str, Any]:
    sample = read_json(shadow / "shadow-sample-manifest.json")
    schema = read_json(shadow / "shadow-audit-schema.json")
    mapping = read_json(shadow.parent / "prepare" / "reviewed-legacy-row-mapping.json")
    projection = read_json(shadow.parent / "prepare" / "legacy-projection-manifest.json")
    legacy_index = build_legacy_index(source_dir / LEGACY_JSON, projection)
    prompt_template = (shadow / "shadow-audit-prompt.md").read_text(encoding="utf-8")
    cases_by_id = {item["case_id"]: item for item in sample["cases"]}
    inputs_by_batch = {item["batch_id"]: item for item in input_manifest["batches"]}
    requests = []
    summary_properties = {
        "critical_count": {"type": "integer"},
        "major_count": {"type": "integer"},
        "minor_count": {"type": "integer"},
        "solution_content_generated": {"type": "boolean"},
    }
    def array_of(required: list[str], properties: dict[str, Any]) -> dict[str, Any]:
        return {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                            "required": required, "properties": properties}}

    # Flat arrays avoid the deeply nested schema rejected by Gemini while
    # retaining every field. normalize_wire_output reconstructs the canonical
    # case/task shape before the full independent validator runs.
    provider_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["schema_id", "batch_id", "case_tasks", "task_boundaries", "source_rows",
                     "visuals", "legacy_findings", "unknowns", "case_summaries", "batch_summary"],
        "properties": {
            "schema_id": {"type": "string", "enum": [SCHEMA_ID]},
            "batch_id": {"type": "string", "enum": ["B01", "B02", "B03"]},
            "case_tasks": array_of(["case_id", "task_ids"], {
                "case_id": {"type": "string"}, "task_ids": {"type": "array", "items": {"type": "string"}},
            }),
            "task_boundaries": array_of(["task_id", "boundary_status"], {
                "task_id": {"type": "string"}, "boundary_status": {"type": "string"},
            }),
            "source_rows": array_of(
                ["task_id", "row_kind", "he", "he_niqqud", "transliteration", "ru", "source_page", "confidence"],
                {"task_id": {"type": "string"}, "row_kind": {"type": "string"}, "he": {"type": "string"},
                 "he_niqqud": {"type": "string"}, "transliteration": {"type": "string"}, "ru": {"type": "string"},
                 "source_page": {"type": "integer"}, "confidence": {"type": "string"}},
            ),
            "visuals": array_of(
                ["task_id", "source_page", "kind", "required_for_solving", "readability", "labels_or_values"],
                {"task_id": {"type": "string"}, "source_page": {"type": "integer"}, "kind": {"type": "string"},
                 "required_for_solving": {"type": "boolean"}, "readability": {"type": "string"},
                 "labels_or_values": {"type": "array", "items": {"type": "string"}}},
            ),
            "legacy_findings": array_of(
                ["task_id", "legacy_row_ref_sha256", "field", "severity", "category", "source_page", "recommended_reviewed_value"],
                {"task_id": {"type": "string"}, "legacy_row_ref_sha256": {"type": "string"},
                 "field": {"type": "string"}, "severity": {"type": "string"}, "category": {"type": "string"},
                 "source_page": {"type": "integer"}, "recommended_reviewed_value": {"type": "string"}},
            ),
            "unknowns": array_of(["task_id", "value"], {
                "task_id": {"type": "string"}, "value": {"type": "string"},
            }),
            "case_summaries": array_of(
                ["case_id", "critical_count", "major_count", "minor_count", "solution_content_generated"],
                {"case_id": {"type": "string"}, **summary_properties},
            ),
            "batch_summary": {"type": "object", "additionalProperties": False,
                              "required": list(summary_properties), "properties": summary_properties},
        },
    }
    for batch in sample["batches"]:
        cases = [cases_by_id[case_id] for case_id in batch["case_ids"]]
        task_ids = {task_id for case in cases for task_id in case["task_ids"]}
        eligible = eligible_legacy_rows(mapping, legacy_index, task_ids)
        prompt, selected, selection = prompt_and_candidates(prompt_template, provider_schema, batch, cases, eligible)
        pdf_path = shadow / "inputs" / inputs_by_batch[batch["batch_id"]]["filename"]
        request_body = {
            "contents": [{"role": "user", "parts": [
                {"inline_data": {"mime_type": "application/pdf",
                                 "data": base64.b64encode(pdf_path.read_bytes()).decode("ascii")}},
                {"text": prompt},
            ]}],
            "generationConfig": {
                "thinkingConfig": {"thinkingLevel": THINKING_LEVEL},
                "maxOutputTokens": OUTPUT_TOKEN_CAP,
                "responseFormat": {"text": {"mimeType": "APPLICATION_JSON", "schema": provider_schema}},
            },
        }
        if selection["conservative_input_token_estimate"] > INPUT_TOKEN_CAP:
            raise RuntimeError(f"input cap exceeded for {batch['batch_id']}")
        requests.append({
            "batch_id": batch["batch_id"],
            "case_ids": batch["case_ids"],
            "task_ids": sorted(task_ids),
            "case_task_ids": {case["case_id"]: case["task_ids"] for case in cases},
            "allowed_source_pages": batch["source_pages_once_per_batch"],
            "pdf_filename": pdf_path.name,
            "pdf_sha256": sha256_file(pdf_path),
            "prompt_sha256": sha256_bytes(prompt.encode("utf-8")),
            "schema_sha256": sha256_json(provider_schema),
            "full_validation_schema_sha256": sha256_json(schema),
            "request_body_sha256": sha256_json(request_body),
            "source_input_sha256": sha256_json({"pdf": sha256_file(pdf_path),
                                                  "legacy_rows": selection["selected_sha256"]}),
            "legacy_selection": selection,
            "request_body": request_body,
            "allowed_legacy_hashes": sorted(row["legacy_row_ref_sha256"] for row in selected),
        })
    return {
        "schema": "linguistpro-materials-pb2-shadow-request-plan-v1",
        "model": MODEL,
        "mode": MODE,
        "thinking_level": THINKING_LEVEL,
        "requests": requests,
    }


def extract_json_response(response: dict[str, Any]) -> tuple[dict[str, Any], str]:
    candidates = response.get("candidates") or []
    if len(candidates) != 1:
        raise ValueError(f"expected one candidate, got {len(candidates)}")
    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [part.get("text", "") for part in parts if isinstance(part.get("text"), str) and not part.get("thought")]
    text = "".join(texts).strip()
    if not text:
        raise ValueError("provider returned no non-thought text")
    return json.loads(text), text


def normalize_wire_output(value: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    expected_root = {"schema_id", "batch_id", "case_tasks", "task_boundaries", "source_rows",
                     "visuals", "legacy_findings", "unknowns", "case_summaries", "batch_summary"}
    if not isinstance(value, dict) or set(value) != expected_root:
        raise ValueError("flat wire root fields mismatch")
    expected_tasks = set(request["task_ids"])
    for name in ("case_tasks", "task_boundaries", "source_rows", "visuals", "legacy_findings", "unknowns", "case_summaries"):
        if not isinstance(value.get(name), list):
            raise ValueError(f"flat wire {name} must be an array")
    case_tasks = {item.get("case_id"): item.get("task_ids") for item in value["case_tasks"] if isinstance(item, dict)}
    if case_tasks != request["case_task_ids"] or len(value["case_tasks"]) != len(request["case_ids"]):
        raise ValueError("flat wire case/task map mismatch")
    boundaries = {item.get("task_id"): item.get("boundary_status") for item in value["task_boundaries"]
                  if isinstance(item, dict)}
    if set(boundaries) != expected_tasks or len(value["task_boundaries"]) != len(expected_tasks):
        raise ValueError("flat wire task boundaries mismatch")
    case_summaries = {item.get("case_id"): {key: item.get(key) for key in (
        "critical_count", "major_count", "minor_count", "solution_content_generated"
    )} for item in value["case_summaries"] if isinstance(item, dict)}
    if set(case_summaries) != set(request["case_ids"]) or len(value["case_summaries"]) != len(request["case_ids"]):
        raise ValueError("flat wire case summaries mismatch")
    grouped: dict[str, dict[str, list[Any]]] = {
        task_id: {"source_rows": [], "visuals": [], "legacy_findings": [], "unknowns": []}
        for task_id in expected_tasks
    }
    for name in ("source_rows", "visuals", "legacy_findings"):
        for item in value[name]:
            if not isinstance(item, dict) or item.get("task_id") not in expected_tasks:
                raise ValueError(f"flat wire {name} has unknown task")
            task_id = item["task_id"]
            grouped[task_id][name].append({key: field for key, field in item.items() if key != "task_id"})
    for item in value["unknowns"]:
        if not isinstance(item, dict) or item.get("task_id") not in expected_tasks or not isinstance(item.get("value"), str):
            raise ValueError("flat wire unknowns has invalid item")
        grouped[item["task_id"]]["unknowns"].append(item["value"])
    cases = []
    for case_id in request["case_ids"]:
        tasks = []
        for task_id in request["case_task_ids"][case_id]:
            tasks.append({
                "task_id": task_id,
                "boundary_status": boundaries[task_id],
                **grouped[task_id],
            })
        cases.append({"case_id": case_id, "tasks": tasks, "audit_summary": case_summaries[case_id]})
    return {
        "schema_id": value.get("schema_id"),
        "batch_id": value.get("batch_id"),
        "cases": cases,
        "batch_summary": value.get("batch_summary"),
    }


def validate_output(value: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    errors = []
    if not isinstance(value, dict) or set(value) != {"schema_id", "batch_id", "cases", "batch_summary"}:
        errors.append("root fields mismatch")
    if value.get("schema_id") != SCHEMA_ID:
        errors.append("schema_id mismatch")
    if value.get("batch_id") != request["batch_id"]:
        errors.append("batch_id mismatch")
    cases = value.get("cases")
    if not isinstance(cases, list) or len(cases) != 4:
        errors.append("cases must contain exactly four objects")
        cases = []
    actual_case_ids = [case.get("case_id") for case in cases if isinstance(case, dict)]
    if actual_case_ids != request["case_ids"]:
        errors.append(f"case sequence mismatch: {actual_case_ids}")
    expected_task_ids = set(request["task_ids"])
    actual_task_ids = set()
    severity_counts = Counter()
    allowed_hashes = set(request["allowed_legacy_hashes"])
    for case in cases:
        if not isinstance(case, dict):
            errors.append("non-object case")
            continue
        if set(case) != {"case_id", "tasks", "audit_summary"}:
            errors.append(f"case fields mismatch in {case.get('case_id')}")
        case_id = case.get("case_id")
        summary = case.get("audit_summary", {})
        if not isinstance(summary, dict) or set(summary) != {
            "critical_count", "major_count", "minor_count", "solution_content_generated"
        }:
            errors.append(f"audit_summary fields mismatch in {case_id}")
            summary = {}
        if summary.get("solution_content_generated") is not False:
            errors.append(f"solution flag violated in {case_id}")
        case_counts = Counter()
        tasks = case.get("tasks", [])
        if not isinstance(tasks, list) or not 1 <= len(tasks) <= 2:
            errors.append(f"invalid task count in {case_id}")
            continue
        expected_case_tasks = request["case_task_ids"].get(case_id, [])
        if [task.get("task_id") for task in tasks if isinstance(task, dict)] != expected_case_tasks:
            errors.append(f"case task sequence mismatch in {case_id}")
        for task in tasks:
            if not isinstance(task, dict):
                errors.append(f"non-object task in {case_id}")
                continue
            if set(task) != {"task_id", "boundary_status", "source_rows", "visuals", "legacy_findings", "unknowns"}:
                errors.append(f"task fields mismatch for {task.get('task_id')}")
            task_id = task.get("task_id")
            actual_task_ids.add(task_id)
            if task_id not in expected_task_ids:
                errors.append(f"unexpected task_id {task_id}")
            if task.get("boundary_status") not in {"exact", "ambiguous", "not_found"}:
                errors.append(f"invalid boundary_status for {task_id}")
            source_rows = task.get("source_rows")
            if not isinstance(source_rows, list):
                errors.append(f"source_rows must be an array for {task_id}")
                source_rows = []
            if task.get("boundary_status") == "exact" and not source_rows:
                errors.append(f"exact task has no source_rows: {task_id}")
            for row in source_rows:
                if not isinstance(row, dict) or set(row) != {
                    "row_kind", "he", "he_niqqud", "transliteration", "ru", "source_page", "confidence"
                }:
                    errors.append(f"source row fields mismatch for {task_id}")
                    continue
                if row.get("row_kind") not in {"task_heading", "condition", "subpart", "note", "source_note", "diagram_reference"}:
                    errors.append(f"invalid row_kind for {task_id}")
                if row.get("confidence") not in {"high", "medium", "low", "not_found"}:
                    errors.append(f"invalid confidence for {task_id}")
                if row.get("source_page") not in request["allowed_source_pages"]:
                    errors.append(f"source row page outside batch for {task_id}")
                for field in ("he", "he_niqqud", "transliteration", "ru"):
                    if not isinstance(row.get(field), str):
                        errors.append(f"non-string {field} for {task_id}")
            visuals = task.get("visuals")
            if not isinstance(visuals, list):
                errors.append(f"visuals must be an array for {task_id}")
                visuals = []
            for visual in visuals:
                if not isinstance(visual, dict) or set(visual) != {
                    "source_page", "kind", "required_for_solving", "readability", "labels_or_values"
                }:
                    errors.append(f"visual fields mismatch for {task_id}")
                    continue
                if visual.get("source_page") not in request["allowed_source_pages"]:
                    errors.append(f"visual page outside batch for {task_id}")
                if not isinstance(visual.get("kind"), str) or not isinstance(visual.get("required_for_solving"), bool):
                    errors.append(f"visual scalar type mismatch for {task_id}")
                if visual.get("readability") not in {"readable", "partial", "unreadable", "not_found"}:
                    errors.append(f"invalid visual readability for {task_id}")
                if not isinstance(visual.get("labels_or_values"), list) or not all(
                    isinstance(item, str) for item in visual.get("labels_or_values", [])
                ):
                    errors.append(f"invalid visual labels for {task_id}")
            findings = task.get("legacy_findings")
            if not isinstance(findings, list):
                errors.append(f"legacy_findings must be an array for {task_id}")
                findings = []
            for finding in findings:
                if not isinstance(finding, dict) or set(finding) != {
                    "legacy_row_ref_sha256", "field", "severity", "category", "source_page", "recommended_reviewed_value"
                }:
                    errors.append(f"legacy finding fields mismatch for {task_id}")
                    continue
                row_hash = finding.get("legacy_row_ref_sha256")
                if row_hash not in allowed_hashes:
                    errors.append(f"unbound legacy hash {row_hash}")
                if finding.get("field") not in {"boundary", "he", "he_niqqud", "transliteration", "ru", "formula", "unit", "visual", "identity"}:
                    errors.append(f"invalid legacy field for {task_id}")
                severity = finding.get("severity")
                if severity in {"critical", "major", "minor"}:
                    case_counts[severity] += 1
                    severity_counts[severity] += 1
                elif severity != "none":
                    errors.append(f"invalid legacy severity for {task_id}")
                if finding.get("source_page") not in request["allowed_source_pages"]:
                    errors.append(f"legacy finding page outside batch for {task_id}")
                if not isinstance(finding.get("category"), str) or not isinstance(
                    finding.get("recommended_reviewed_value"), str
                ):
                    errors.append(f"legacy finding text type mismatch for {task_id}")
            unknowns = task.get("unknowns")
            if not isinstance(unknowns, list) or not all(isinstance(item, str) for item in unknowns):
                errors.append(f"unknowns must be a string array for {task_id}")
        for severity in ("critical", "major", "minor"):
            if not isinstance(summary.get(f"{severity}_count"), int) or summary.get(f"{severity}_count") != case_counts[severity]:
                errors.append(f"case summary mismatch for {case_id} {severity}")
    if actual_task_ids != expected_task_ids:
        errors.append(f"task identity mismatch: {sorted(actual_task_ids)}")
    batch_summary = value.get("batch_summary", {})
    if not isinstance(batch_summary, dict) or set(batch_summary) != {
        "critical_count", "major_count", "minor_count", "solution_content_generated"
    }:
        errors.append("batch_summary fields mismatch")
        batch_summary = {}
    if batch_summary.get("solution_content_generated") is not False:
        errors.append("batch solution flag violated")
    for severity in ("critical", "major", "minor"):
        if batch_summary.get(f"{severity}_count") != severity_counts[severity]:
            errors.append(f"batch summary mismatch for {severity}")
    if errors:
        raise ValueError("; ".join(errors))
    return {
        "case_count": len(cases),
        "task_count": len(actual_task_ids),
        "severity_counts": dict(severity_counts),
        "solution_content_generated": False,
    }


def usage_and_cost(response: dict[str, Any]) -> dict[str, Any]:
    usage = response.get("usageMetadata", {})
    prompt = int(usage.get("promptTokenCount", 0) or 0)
    candidate = int(usage.get("candidatesTokenCount", 0) or 0)
    thoughts = int(usage.get("thoughtsTokenCount", 0) or 0)
    if prompt <= 0 or candidate <= 0:
        raise RuntimeError(f"missing billable usage metadata: {sorted(usage)}")
    cost = prompt * INPUT_USD_PER_M / 1_000_000 + (candidate + thoughts) * OUTPUT_USD_PER_M / 1_000_000
    return {
        "prompt_tokens": prompt,
        "candidate_tokens": candidate,
        "thinking_tokens": thoughts,
        "total_tokens_reported": int(usage.get("totalTokenCount", prompt + candidate + thoughts) or 0),
        "calculated_usd": round(cost, 8),
    }


def post_request(api_key: str, body: dict[str, Any]) -> dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
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
        code = error.code
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = str(payload.get("error", {}).get("message", "provider HTTP error"))[:500]
        except Exception:
            message = "provider HTTP error with unreadable body"
        raise RuntimeError(f"PROVIDER_HTTP_{code}: {message}") from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"PROVIDER_TRANSPORT: {type(error.reason).__name__}") from None


def load_api_key(path: Path) -> str:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise RuntimeError("key file is empty")
    # Accept a raw key, KEY=value, or a tiny local JSON secret without ever
    # echoing, hashing, or persisting the value.
    if raw.startswith("{"):
        value = json.loads(raw)
        for name in ("api_key", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
            if isinstance(value.get(name), str) and value[name].strip():
                return value[name].strip()
        raise RuntimeError("key JSON has no recognized key field")
    if "=" in raw:
        raw = raw.split("=", 1)[1].strip()
    raw = raw.strip("\"'").strip()
    if not raw:
        raise RuntimeError("key file contains no key value")
    return raw


def run_apply(request_plan: dict[str, Any], cache_root: Path, key_file: Path,
              max_usd: float, prior_calls: int, prior_retries: int,
              prior_cost_reserve: float, max_provider_attempts: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if request_plan["model"] != MODEL or request_plan["mode"] != MODE:
        raise RuntimeError("request plan model/mode drift")
    if max_usd <= 0 or max_usd > 1.0:
        raise RuntimeError("MAX_USD must be within the owner-approved (0, 1.0] ceiling")
    if max_provider_attempts < prior_calls + len(request_plan["requests"]) or max_provider_attempts > 6:
        raise RuntimeError("provider-attempt cap does not cover exactly the approved recovery envelope")
    # Deliberately do not echo, hash, copy, or persist the secret.
    api_key = load_api_key(key_file)
    outputs = []
    receipts = []
    spent = prior_cost_reserve
    calls = prior_calls
    retries = prior_retries
    runtime_model_version = None
    for request in request_plan["requests"]:
        identity = request["request_body_sha256"]
        cache_path = cache_root / request["batch_id"] / f"{identity}.response.json"
        attempt = 0
        while True:
            attempt += 1
            if cache_path.exists():
                wrapper = read_json(cache_path)
                if wrapper.get("request_body_sha256") != identity:
                    raise RuntimeError(f"raw cache identity mismatch for {request['batch_id']}")
                response = wrapper["raw_response"]
                cache_state = "RESUMED_EXACT_RAW_CACHE"
            else:
                worst_single = INPUT_TOKEN_CAP * INPUT_USD_PER_M / 1_000_000 \
                    + OUTPUT_TOKEN_CAP * OUTPUT_USD_PER_M / 1_000_000
                if spent + worst_single > max_usd:
                    raise RuntimeError(f"cost ceiling would be exceeded before {request['batch_id']}")
                calls += 1
                if calls > max_provider_attempts:
                    raise RuntimeError("provider call-count ceiling reached")
                print(json.dumps({"event": "provider_call_start", "batch_id": request["batch_id"],
                                  "call_number": calls, "max_calls": max_provider_attempts}, ensure_ascii=False), flush=True)
                try:
                    response = post_request(api_key, request["request_body"])
                except RuntimeError as error:
                    retryable = str(error).startswith("PROVIDER_TRANSPORT") or any(
                        str(error).startswith(f"PROVIDER_HTTP_{code}") for code in (429, 500, 502, 503, 504)
                    )
                    if not retryable or retries >= MAX_TOTAL_RETRIES:
                        raise
                    retries += 1
                    cache_path = cache_path.with_name(f"{identity}.retry-{retries}.response.json")
                    print(json.dumps({"event": "transport_retry", "batch_id": request["batch_id"],
                                      "retry_number": retries}, ensure_ascii=False), flush=True)
                    continue
                wrapper = {
                    "cache_schema": "linguistpro-gemini-raw-response-cache-v1",
                    "batch_id": request["batch_id"],
                    "model": MODEL,
                    "request_body_sha256": identity,
                    "prompt_sha256": request["prompt_sha256"],
                    "schema_sha256": request["schema_sha256"],
                    "source_input_sha256": request["source_input_sha256"],
                    "received_at": datetime.now(timezone.utc).isoformat(),
                    "raw_response": response,
                }
                atomic_write_new_json(cache_path, wrapper)
                cache_state = "NEW_PROVIDER_RESPONSE_CACHED_IMMUTABLY"
            try:
                wire_parsed, raw_text = extract_json_response(response)
                parsed = normalize_wire_output(wire_parsed, request)
                validation = validate_output(parsed, request)
                usage = usage_and_cost(response)
                break
            except (ValueError, RuntimeError, json.JSONDecodeError) as error:
                if cache_state.startswith("RESUMED") or retries >= MAX_TOTAL_RETRIES:
                    raise RuntimeError(f"unrecoverable response for {request['batch_id']}: {error}") from None
                retries += 1
                # A schema-invalid response remains immutable evidence. The retry
                # gets a distinct attempt suffix while preserving request identity.
                retry_path = cache_path.with_name(f"{identity}.retry-{retries}.response.json")
                cache_path = retry_path
                print(json.dumps({"event": "schema_retry", "batch_id": request["batch_id"],
                                  "retry_number": retries}, ensure_ascii=False), flush=True)
                continue
        model_version = response.get("modelVersion")
        if not model_version:
            raise RuntimeError(f"provider omitted modelVersion for {request['batch_id']}")
        if runtime_model_version is None:
            runtime_model_version = model_version
        elif model_version != runtime_model_version:
            raise RuntimeError(f"runtime modelVersion drift: {runtime_model_version} -> {model_version}")
        spent += usage["calculated_usd"]
        if spent > max_usd:
            raise RuntimeError(f"actual calculated cost exceeded owner ceiling: {spent}")
        raw_cache_sha256 = sha256_file(cache_path)
        outputs.append({"batch_id": request["batch_id"], "output": parsed})
        receipts.append({
            "batch_id": request["batch_id"],
            "state": "VALIDATED",
            "cache_state": cache_state,
            "attempt_count_this_run": attempt,
            "model": MODEL,
            "model_version": model_version,
            "request_body_sha256": identity,
            "prompt_sha256": request["prompt_sha256"],
            "schema_sha256": request["schema_sha256"],
            "source_input_sha256": request["source_input_sha256"],
            "raw_response_sha256": raw_cache_sha256,
            "provider_text_sha256": sha256_bytes(raw_text.encode("utf-8")),
            "usage": usage,
            "validation": validation,
        })
        print(json.dumps({"event": "batch_validated", "batch_id": request["batch_id"],
                          "model_version": model_version, "usage": usage,
                          "running_cost_usd": round(spent, 8)}, ensure_ascii=False), flush=True)
    return outputs, receipts


def build_apply_artifacts(shadow: Path, input_manifest: dict[str, Any], request_plan: dict[str, Any],
                          outputs: list[dict[str, Any]], receipts: list[dict[str, Any]],
                          max_usd: float, prior_calls: int, prior_cost_reserve: float,
                          max_provider_attempts: int) -> None:
    apply_dir = shadow / "apply"
    total_usage = {
        "prompt_tokens": sum(item["usage"]["prompt_tokens"] for item in receipts),
        "candidate_tokens": sum(item["usage"]["candidate_tokens"] for item in receipts),
        "thinking_tokens": sum(item["usage"]["thinking_tokens"] for item in receipts),
        "calculated_usd": round(sum(item["usage"]["calculated_usd"] for item in receipts), 8),
    }
    ledger = {
        "schema": "linguistpro-materials-pb2-shadow-apply-ledger-v1",
        "status": "PASS_THREE_BATCHES_VALIDATED_NO_CORPUS_MUTATION",
        "owner_approval": {
            "approved_on": "2026-08-30",
            "model": MODEL,
            "mode": MODE,
            "max_usd": max_usd,
            "selected_source_and_legacy_condition_candidate_egress": True,
            "recovery_additional_calls": max_provider_attempts - prior_calls,
            "recovery_retries": 0,
        },
        "pricing_checked_on": "2026-08-30",
        "pricing_usd_per_1m_tokens": {"input": INPUT_USD_PER_M,
                                       "output_including_thinking": OUTPUT_USD_PER_M},
        "batches": receipts,
        "totals": total_usage,
        "provider_call_attempt_count": prior_calls + sum(item["attempt_count_this_run"] for item in receipts),
        "provider_call_attempt_cap": max_provider_attempts,
        "rejected_pre_inference_calls": prior_calls,
        "unmetered_rejected_call_cost_reserve_usd": prior_cost_reserve,
        "successful_measured_plus_reserve_usd": round(total_usage["calculated_usd"] + prior_cost_reserve, 8),
        "corpus_import": False,
        "publication": False,
        "solution_adjudication": False,
        "secret_persisted": False,
    }
    normalized = {
        "schema": "linguistpro-materials-pb2-shadow-normalized-audit-v1",
        "truth_status": "GENERATED_UNREVIEWED_ADVISORY_ONLY_NOT_CORPUS_TRUTH",
        "source_edition": SOURCE_EDITION,
        "model": MODEL,
        "model_version": receipts[0]["model_version"],
        "batches": outputs,
    }
    request_receipt = {
        "schema": "linguistpro-materials-pb2-shadow-request-receipt-v1",
        "status": "SOURCE_AND_LEGACY_SELECTION_HASH_BOUND",
        "model": MODEL,
        "mode": MODE,
        "thinking_level": THINKING_LEVEL,
        "input_manifest_sha256": sha256_json(input_manifest),
        "requests": [{key: value for key, value in item.items()
                      if key not in {"request_body", "allowed_legacy_hashes"}}
                     for item in request_plan["requests"]],
    }
    verification = {
        "schema": "linguistpro-materials-pb2-shadow-apply-verification-v1",
        "status": "PASS_APPLY_ONLY_REVIEW_GATE_REQUIRED",
        "checks": {
            "three_validated_batches": len(receipts) == 3 and all(item["state"] == "VALIDATED" for item in receipts),
            "one_runtime_model_version": len({item["model_version"] for item in receipts}) == 1,
            "cost_within_owner_ceiling": total_usage["calculated_usd"] + prior_cost_reserve <= max_usd,
            "all_solution_flags_false": all(item["validation"]["solution_content_generated"] is False for item in receipts),
            "thirteen_exact_tasks": sum(item["validation"]["task_count"] for item in receipts) == 13,
            "pdf_inputs_render_verified": all(input_manifest["checks"].values()),
            "no_import_or_publication": True,
        },
        "release_decision": "HOLD_FOR_INDEPENDENT_HUMAN_SOURCE_REVIEW",
    }
    if not all(verification["checks"].values()):
        raise RuntimeError(f"stable APPLY verification failed: {verification['checks']}")
    write_json(apply_dir / "shadow-request-receipt.json", request_receipt)
    write_json(apply_dir / "shadow-apply-ledger.json", ledger)
    write_json(apply_dir / "shadow-normalized-audit.json", normalized)
    write_json(apply_dir / "shadow-apply-verification.json", verification)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--shadow", required=True, type=Path)
    parser.add_argument("--scratch", required=True, type=Path)
    parser.add_argument("--cache-root", type=Path)
    parser.add_argument("--key-file", type=Path)
    parser.add_argument("--max-usd", type=float, default=1.0)
    parser.add_argument("--prior-provider-calls", type=int, default=0)
    parser.add_argument("--prior-retries", type=int, default=0)
    parser.add_argument("--prior-cost-reserve-usd", type=float, default=0.0)
    parser.add_argument("--max-provider-attempts", type=int, default=4)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--mode", default=MODE)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    if args.model != MODEL or args.mode.upper() != MODE:
        raise RuntimeError(f"only owner-approved MODEL={MODEL} MODE={MODE} is allowed")
    sample = read_json(args.shadow / "shadow-sample-manifest.json")
    input_manifest = build_and_verify_pdfs(args.source_dir / SOURCE_PDF, args.shadow, args.scratch, sample)
    if not all(input_manifest["checks"].values()):
        raise RuntimeError(f"input PDF checks failed: {input_manifest['checks']}")
    write_json(args.shadow / "shadow-apply-input-manifest.json", input_manifest)
    request_plan = build_requests(args.source_dir, args.shadow, input_manifest)
    request_receipt = {
        "schema": request_plan["schema"],
        "model": request_plan["model"],
        "mode": request_plan["mode"],
        "thinking_level": request_plan["thinking_level"],
        "requests": [{key: value for key, value in item.items()
                      if key not in {"request_body", "allowed_legacy_hashes"}}
                     for item in request_plan["requests"]],
    }
    write_json(args.shadow / "shadow-request-plan.json", request_receipt)
    print(json.dumps({
        "event": "local_inputs_ready",
        "pdfs": [{"batch_id": item["batch_id"], "filename": item["filename"],
                  "pages": item["page_count"], "bytes": item["bytes"], "sha256": item["sha256"]}
                 for item in input_manifest["batches"]],
        "request_envelopes": [{"batch_id": item["batch_id"],
                               "eligible_count": item["legacy_selection"]["eligible_count"],
                               "selected_count": item["legacy_selection"]["selected_count"],
                               "omitted_count": item["legacy_selection"]["omitted_count"],
                               "conservative_input_token_estimate": item["legacy_selection"]["conservative_input_token_estimate"]}
                              for item in request_plan["requests"]],
        "provider_calls": 0,
    }, ensure_ascii=False, indent=2), flush=True)
    if args.prepare_only:
        return
    if not args.cache_root or not args.key_file:
        raise RuntimeError("--cache-root and --key-file are required for APPLY")
    visual_review = read_json(args.shadow / "shadow-manual-visual-review.json")
    reviewed_hashes = {item["batch_id"]: item["pdf_sha256"] for item in visual_review.get("batches", [])}
    current_hashes = {item["batch_id"]: item["sha256"] for item in input_manifest["batches"]}
    if visual_review.get("status") != "PASS_MANUAL_VISUAL_REVIEW" or reviewed_hashes != current_hashes:
        raise RuntimeError("manual visual review is absent, failed, or bound to different PDFs")
    outputs, receipts = run_apply(request_plan, args.cache_root, args.key_file, args.max_usd,
                                  args.prior_provider_calls, args.prior_retries,
                                  args.prior_cost_reserve_usd, args.max_provider_attempts)
    build_apply_artifacts(args.shadow, input_manifest, request_plan, outputs, receipts, args.max_usd,
                          args.prior_provider_calls, args.prior_cost_reserve_usd,
                          args.max_provider_attempts)


if __name__ == "__main__":
    main()
