#!/usr/bin/env python3
"""Prepare local, source-faithful inputs and ledgers for Materials Science PB2.

This command is intentionally offline. It does not read credentials, call a provider,
import data, author solutions, or publish anything.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

import fitz
from PIL import Image, ImageDraw, ImageFont


SOURCE_PDF = "Задачник 2.pdf"
LEGACY_JSON = "Материаловедение_library_export_20260119.json"
SOLUTION_PDF = "Решебник к Задачник2_v2026-01-15.pdf"
EXPECTED = {
    SOURCE_PDF: {
        "sha256": "3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435",
        "bytes": 6556604,
    },
    LEGACY_JSON: {
        "sha256": "2a2f3191dd73a5e5bc99b096cda704a54172b33ebd3416c969d2f03299e2cb21",
        "bytes": 5440492,
    },
    SOLUTION_PDF: {
        "sha256": "9ac844e637e5740d9487642438387323f32a6edd6b9bd546e3c7c246b181f00f",
        "bytes": 7664344,
    },
}
SOURCE_EDITION = "problem-book-2-pdf-sha256-3d87b9f5"
CORPUS_SLUG = "materials-science-year1-problem-book-2"
MAX_PREPARED_PDF_BYTES = 6 * 1024 * 1024
FULL = [0.0, 0.0, 1.0, 1.0]


def task(task_id: str, display_number: int | None, page: int,
         bbox: list[float] | None = None, *, status: str = "PROVISIONAL_SOURCE_MAPPED",
         note: str | None = None, extra_anchors: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    anchors = [{"source_page": page, "normalized_bbox": bbox or FULL, "role": "condition"}]
    if extra_anchors:
        anchors.extend(extra_anchors)
    item = {
        "task_id": task_id,
        "display_number": display_number,
        "display_alias": str(display_number) if display_number is not None else None,
        "source_edition": SOURCE_EDITION,
        "source_anchors": anchors,
        "mapping_status": status,
        "diagram_completeness": "PRESERVED_IN_SOURCE_ANCHOR_PENDING_SEMANTIC_CLASSIFICATION",
    }
    if note:
        item["mapping_note"] = note
    return item


TASKS = [
    task("materials-science-y1-pb2-q001", 1, 3),
    task("materials-science-y1-pb2-q002", 2, 4, extra_anchors=[
        {"source_page": 5, "normalized_bbox": [0.0, 0.0, 1.0, 0.22], "role": "condition_continuation"}
    ]),
    task("materials-science-y1-pb2-exercise-p005-allotropy", None, 5, [0.0, 0.22, 1.0, 1.0],
         status="OWNER_APPROVED_CANONICAL_2026_08_30",
         note="Unnumbered exercise begins after the continuation of question 2."),
    task("materials-science-y1-pb2-q003", 3, 6, [0.0, 0.0, 1.0, 0.37]),
    task("materials-science-y1-pb2-q004", 4, 6, [0.0, 0.35, 1.0, 0.66]),
    task("materials-science-y1-pb2-q005", 5, 6, [0.0, 0.64, 1.0, 1.0]),
    *[task(f"materials-science-y1-pb2-q{n:03d}", n, page) for n, page in [
        (6, 7), (7, 8), (8, 9)
    ]],
    task("materials-science-y1-pb2-q009", 9, 12, [0.0, 0.0, 1.0, 0.565]),
    *[task(f"materials-science-y1-pb2-q{n:03d}", n, page) for n, page in [
        (10, 14), (11, 15), (12, 16), (13, 17), (14, 18), (15, 20), (16, 21),
        (17, 22), (18, 23), (19, 25), (20, 26)
    ]],
    task("materials-science-y1-pb2-q021", 21, 27, [0.0, 0.0, 1.0, 0.39]),
    *[task(f"materials-science-y1-pb2-q{n:03d}", n, page) for n, page in [
        (22, 28), (23, 29), (24, 30), (25, 31), (26, 33), (27, 35), (28, 36),
        (29, 37), (30, 38)
    ]],
    task("materials-science-y1-pb2-q031", 31, 39, [0.0, 0.0, 1.0, 0.34]),
    task("materials-science-y1-pb2-q032", 32, 39, [0.0, 0.32, 1.0, 1.0]),
    *[task(f"materials-science-y1-pb2-q{n:03d}", n, page) for n, page in [
        (33, 40), (34, 41), (35, 42), (36, 43), (37, 44)
    ]],
    task("materials-science-y1-pb2-p045-q038", 38, 45,
         status="OWNER_APPROVED_CANONICAL_DUPLICATE_DISPLAY_NUMBER_2026_08_30",
         note="First distinct source occurrence labelled question 38; topic: annealing."),
    task("materials-science-y1-pb2-p047-q038", 38, 47, [0.0, 0.0, 1.0, 0.46],
         status="OWNER_APPROVED_CANONICAL_DUPLICATE_DISPLAY_NUMBER_2026_08_30",
         note="Second distinct source occurrence labelled question 38; topic: steel selection."),
    task("materials-science-y1-pb2-q039", 39, 48, [0.0, 0.0, 1.0, 0.36]),
    task("materials-science-y1-pb2-q040", 40, 49),
    task("materials-science-y1-pb2-q041", 41, 51, [0.0, 0.0, 1.0, 0.82]),
    task("materials-science-y1-pb2-q042", 42, 52, [0.0, 0.65, 1.0, 1.0],
         note="Condition-only crop excludes the preceding embedded solution for question 41."),
    task("materials-science-y1-pb2-q043", 43, 53, [0.0, 0.0, 1.0, 0.52]),
    task("materials-science-y1-pb2-q044", 44, 54, [0.0, 0.42, 1.0, 1.0],
         note="Condition-only crop excludes the preceding embedded solution for question 43."),
    *[task(f"materials-science-y1-pb2-q{n:03d}", n, page) for n, page in [
        (45, 55), (46, 56)
    ]],
    task("materials-science-y1-pb2-q047", 47, 57, [0.0, 0.0, 1.0, 0.60]),
    *[task(f"materials-science-y1-pb2-q{n:03d}", n, page) for n, page in [
        (48, 58), (49, 59), (50, 60), (51, 61), (52, 62)
    ]],
    task("materials-science-y1-pb2-q053", 53, 63, [0.0, 0.0, 1.0, 0.48]),
    task("materials-science-y1-pb2-q054", 54, 63, [0.0, 0.46, 1.0, 0.72]),
    task("materials-science-y1-pb2-q055", 55, 63, [0.0, 0.69, 1.0, 1.0]),
    task("materials-science-y1-pb2-q056", 56, 64, [0.0, 0.0, 1.0, 0.58]),
    task("materials-science-y1-pb2-q057", 57, 64, [0.0, 0.54, 1.0, 1.0]),
    task("materials-science-y1-pb2-q058", 58, 65),
]

for _task in TASKS:
    if _task["task_id"] == "materials-science-y1-pb2-exercise-p005-allotropy":
        _task["display_alias"] = "Упражнение — Аллотропия железа"
    elif _task["task_id"] == "materials-science-y1-pb2-p045-q038":
        _task["display_alias"] = "38-A"
    elif _task["task_id"] == "materials-science-y1-pb2-p047-q038":
        _task["display_alias"] = "38-B"
    elif _task["mapping_status"] == "PROVISIONAL_SOURCE_MAPPED":
        _task["mapping_status"] = "LOCAL_SOURCE_ANCHOR_REVIEWED_2026_08_30"

REFERENCE_PAGES = [1, 2, 34, 46, *range(66, 74)]
SOLUTION_ONLY_PAGES = {10, 11, 13, 19, 24, 32, 50}
MIXED_PAGES = {5, 12, 27, 47, 48, 51, 53, 57}
PAGE_ROLE_OVERRIDES = {
    1: "table_of_contents",
    2: "reference_periodic_table",
    34: "reference_topic_intro",
    46: "reference_topic_notes",
    66: "appendix_title",
    67: "appendix_reference",
    68: "appendix_reference_rotated",
    69: "appendix_reference_rotated",
    70: "appendix_reference_landscape",
    71: "appendix_reference",
    72: "appendix_reference",
    73: "appendix_reference",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def git_head(repo: Path) -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True, encoding="utf-8").strip()


def verify_input(path: Path) -> dict[str, Any]:
    expected = EXPECTED[path.name]
    actual = {"filename": path.name, "bytes": path.stat().st_size, "sha256": sha256_file(path)}
    if actual["bytes"] != expected["bytes"] or actual["sha256"] != expected["sha256"]:
        raise RuntimeError(f"input drift: {path.name}: {actual}")
    return actual


def normalized_rect(page: fitz.Page, bbox: list[float]) -> fitz.Rect:
    rect = page.rect
    x0, y0, x1, y1 = bbox
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        raise ValueError(f"invalid normalized bbox {bbox}")
    return fitz.Rect(rect.x0 + rect.width * x0, rect.y0 + rect.height * y0,
                     rect.x0 + rect.width * x1, rect.y0 + rect.height * y1)


def image_metrics(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        gray = image.convert("L")
        pixels = gray.get_flattened_data() if hasattr(gray, "get_flattened_data") else gray.getdata()
        ink = sum(1 for value in pixels if value < 245) / (gray.width * gray.height)
        return {"width": image.width, "height": image.height, "ink_ratio": round(ink, 6)}


def contact_sheet(items: list[dict[str, Any]], destination: Path) -> None:
    thumb_w, thumb_h, label_h, columns = 320, 440, 44, 4
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
            label = f"out {item['output_page']:02d} <- src {item['source_page']:02d} {item['item_id']}"
            draw.text((col * thumb_w + 6, row * (thumb_h + label_h) + 4), label[:48], fill="black", font=font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=90)


def page_role(page_number: int, task_ids: list[str]) -> str:
    if page_number in PAGE_ROLE_OVERRIDES:
        return PAGE_ROLE_OVERRIDES[page_number]
    if page_number in SOLUTION_ONLY_PAGES:
        return "embedded_solution_only"
    if page_number in MIXED_PAGES:
        return "mixed_condition_and_non_source_material"
    if task_ids:
        return "task_condition"
    return "unclassified_requires_review"


def extract_provider_alias(meta_value: Any) -> str | None:
    if not meta_value:
        return None
    try:
        meta = json.loads(meta_value) if isinstance(meta_value, str) else meta_value
    except (TypeError, json.JSONDecodeError):
        return "UNPARSEABLE_META"
    for key in ("model", "model_alias", "providerModel"):
        if isinstance(meta, dict) and meta.get(key):
            return str(meta[key])
    return "META_PRESENT_MODEL_NOT_FOUND"


def legacy_projection(path: Path, source_page_tasks: dict[int, list[dict[str, Any]]]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cards = [item for item in raw.get("texts", []) if str(item.get("text", {}).get("title", "")).startswith("Задачник 2. Страница")]
    projection_cards = []
    mappings = []
    all_niqqud = []
    title_counter = Counter(item["text"]["title"] for item in cards)

    for item in cards:
        text = item.get("text", {})
        rows = item.get("sentences", [])
        title = str(text.get("title", ""))
        title_prefix = title.split("(", 1)[0]
        title_pages = [int(value) for value in re.findall(r"(?<!\d)(\d{1,2})(?!\d)", title_prefix)]
        title_pages = [page for page in title_pages if 1 <= page <= 73]
        candidates = []
        for page in title_pages:
            candidates.extend(source_page_tasks.get(page, []))
        candidates = list({candidate["task_id"]: candidate for candidate in candidates}.values())

        marker_text = "\n".join(str(row.get("he_plain", "")) for row in rows[:12])
        marker_text += "\n" + "\n".join(str(row.get("ru", "")) for row in rows[:12])
        markers = [int(value) for value in re.findall(r"(?:שאלה|Вопрос|Задача)\s*[.:—-]*\s*(\d{1,4})", marker_text, re.I)]
        valid_markers = sorted({value for value in markers if 1 <= value <= 58})
        source_numbers = sorted({candidate["display_number"] for candidate in candidates if candidate["display_number"] is not None})

        rows_out = []
        for index, row in enumerate(rows):
            aligned = {
                "he": str(row.get("he_plain", "")),
                "he_niqqud": str(row.get("he_niqqud", "")),
                "transliteration": str(row.get("translit", "")),
                "ru": str(row.get("ru", "")),
            }
            all_niqqud.append(aligned["he_niqqud"])
            rows_out.append({
                "row_index": index,
                "order_index": row.get("order_index"),
                "aligned_row_sha256": sha256_json(aligned),
                "field_sha256": {key: hashlib.sha256(value.encode("utf-8")).hexdigest() for key, value in aligned.items()},
                "has_audio_asset_key": bool(row.get("audio_asset_key")),
                "has_typed_meta_json": bool(row.get("meta_json")),
            })

        if title_counter[title] > 1:
            mapping_status = "AMBIGUOUS_DUPLICATE_LEGACY_TITLE"
        elif valid_markers and source_numbers and not set(valid_markers).intersection(source_numbers):
            mapping_status = "HEURISTIC_TASK_MARKER_CONFLICT_REQUIRES_MANUAL_REVIEW"
        elif len(candidates) == 1 and valid_markers and valid_markers == source_numbers:
            mapping_status = "PAGE_AND_MARKER_CANDIDATE_REQUIRES_ROW_REVIEW"
        elif len(candidates) > 1:
            mapping_status = "SOURCE_PAGE_HAS_MULTIPLE_TASKS_REQUIRES_ROW_SPLIT"
        elif not candidates:
            mapping_status = "NO_SOURCE_TASK_ON_TITLED_PAGE"
        else:
            mapping_status = "PAGE_ONLY_CANDIDATE_REQUIRES_ROW_REVIEW"

        private_id_hash = hashlib.sha256(str(text.get("id", "")).encode("utf-8")).hexdigest()
        card_projection = {
            "legacy_card_key_sha256": private_id_hash,
            "title": title,
            "topic": text.get("topic"),
            "created_at": text.get("created_at"),
            "updated_at": text.get("updated_at"),
            "row_count": len(rows),
            "rows_sha256": sha256_json(rows_out),
            "source_url_present": bool(text.get("source_url")),
            "provider_meta_present": bool(text.get("table_model_meta_json")),
            "provider_model_alias": extract_provider_alias(text.get("table_model_meta_json")),
            "rows": rows_out,
        }
        projection_cards.append(card_projection)
        mappings.append({
            "legacy_card_key_sha256": private_id_hash,
            "legacy_title": title,
            "title_pages": title_pages,
            "legacy_task_markers_first_12_rows": valid_markers,
            "candidate_source_task_ids": [candidate["task_id"] for candidate in candidates],
            "candidate_source_display_numbers": source_numbers,
            "mapping_status": mapping_status,
            "reviewer_disposition": None,
        })

    nonblank = [value for value in all_niqqud if value.strip()]
    unique = sorted(set(nonblank))
    projection = {
        "schema": "linguistpro-materials-pb2-legacy-projection-v1",
        "raw_input": verify_input(path),
        "policy": "HASH_ONLY_COMPARISON_LAYER_NO_CANONICAL_FALLBACK",
        "privacy": "NO_RAW_TEXT_UUID_OR_SOURCE_URL_VALUE_STORED",
        "card_count": len(projection_cards),
        "row_count": sum(card["row_count"] for card in projection_cards),
        "cards": projection_cards,
    }
    ledger = {
        "schema": "linguistpro-materials-pb2-mapping-ledger-v1",
        "status": "PROVISIONAL_ALL_ROWS_REQUIRE_REVIEW",
        "entries": mappings,
        "status_counts": dict(sorted(Counter(item["mapping_status"] for item in mappings).items())),
    }
    cost = {
        "schema": "linguistpro-materials-pb2-local-cost-envelope-v1",
        "provider_calls_made": 0,
        "secret_accessed": False,
        "legacy_all_rows_upper_bound": {
            "nonempty_rows": len(nonblank),
            "unique_exact_texts": len(unique),
            "all_characters": sum(len(value) for value in nonblank),
            "unique_characters": sum(len(value) for value in unique),
            "scope_warning": "MIXED_CONDITION_AND_SOLUTION_NOT_A_BUILD_OR_AUDIO_QUOTE",
        },
        "source_only_provider_token_envelope": "BLOCKED_UNTIL_REVIEWED_TASK_CROPS_AND_SHADOW_PROMPT_EXIST",
        "tts_profile_and_cost_ceiling": "OWNER_APPROVAL_REQUIRED",
    }
    return projection, ledger, cost


def build_prepared_pdf(source: fitz.Document, output: Path, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    document = fitz.open()
    manifest = []
    try:
        for output_index, item in enumerate(items, start=1):
            source_page = source[item["source_page"] - 1]
            bbox = item.get("normalized_bbox", FULL)
            if bbox == FULL:
                # Copy full pages verbatim so inherited /Rotate values (notably pages
                # 68-69) remain readable. show_pdf_page would flatten that rotation
                # against an already-rotated page rectangle and turn the table twice.
                document.insert_pdf(source, from_page=item["source_page"] - 1,
                                    to_page=item["source_page"] - 1)
            else:
                clip = normalized_rect(source_page, bbox)
                target = document.new_page(width=clip.width, height=clip.height)
                target.show_pdf_page(target.rect, source, item["source_page"] - 1, clip=clip)
            manifest.append({
                "output_page": output_index,
                "item_id": item["item_id"],
                "item_kind": item["item_kind"],
                "source_page": item["source_page"],
                "normalized_bbox": bbox,
                "source_pdf_sha256": EXPECTED[SOURCE_PDF]["sha256"],
            })
        document.set_metadata({
            "title": output.stem,
            "author": "LinguistPro local PREPARE",
            "subject": "Owner-local source-faithful prepared input; not publication",
            "creator": "prepare-materials-science-pb2.py",
            "producer": "PyMuPDF",
            "creationDate": "D:19700101000000Z",
            "modDate": "D:19700101000000Z",
        })
        output.parent.mkdir(parents=True, exist_ok=True)
        document.save(output, garbage=4, deflate=True, clean=True, no_new_id=True)
    finally:
        document.close()
    if output.stat().st_size >= MAX_PREPARED_PDF_BYTES:
        raise RuntimeError(f"prepared PDF exceeds internal 6 MiB ceiling: {output.name}")
    return manifest


def verify_prepared_pdf(path: Path, manifest: list[dict[str, Any]], scratch: Path,
                        contact_path: Path) -> dict[str, Any]:
    document = fitz.open(path)
    if document.page_count != len(manifest):
        raise RuntimeError(f"prepared page count mismatch: {path.name}")
    page_results = []
    try:
        batch_dir = scratch / path.stem
        batch_dir.mkdir(parents=True, exist_ok=True)
        for index, item in enumerate(manifest):
            page = document[index]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            render_path = batch_dir / f"page-{index + 1:03d}.png"
            pixmap.save(render_path)
            metrics = image_metrics(render_path)
            if metrics["ink_ratio"] < 0.001:
                raise RuntimeError(f"blank-looking prepared page: {path.name}#{index + 1}")
            page_results.append({**item, **metrics, "render_sha256": sha256_file(render_path),
                                 "render_path": str(render_path)})
        contact_sheet(page_results, contact_path)
    finally:
        document.close()
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "page_count": len(page_results),
        "min_ink_ratio": min(item["ink_ratio"] for item in page_results),
        "contact_sheet": str(contact_path.name),
        "pages": [{key: value for key, value in item.items() if key != "render_path"} for item in page_results],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--stable", required=True, type=Path)
    parser.add_argument("--scratch", required=True, type=Path)
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[2]
    paths = {name: args.source_dir / name for name in EXPECTED}
    identities = {name: verify_input(path) for name, path in paths.items()}
    args.stable.mkdir(parents=True, exist_ok=True)
    if args.scratch.exists():
        shutil.rmtree(args.scratch)
    args.scratch.mkdir(parents=True)

    source = fitz.open(paths[SOURCE_PDF])
    if source.page_count != 73:
        raise RuntimeError(f"expected 73 source pages, got {source.page_count}")
    source_page_tasks: dict[int, list[dict[str, Any]]] = {}
    for item in TASKS:
        item["task_record_sha256"] = sha256_json({key: item[key] for key in item if key != "task_record_sha256"})
        for anchor in item["source_anchors"]:
            source_page_tasks.setdefault(anchor["source_page"], []).append(item)

    page_render_dir = args.scratch / "source-pages"
    page_render_dir.mkdir(parents=True)
    pages = []
    for index in range(source.page_count):
        page = source[index]
        page_number = index + 1
        render = page_render_dir / f"source-page-{page_number:03d}.png"
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(render)
        task_ids = [item["task_id"] for item in source_page_tasks.get(page_number, [])]
        pages.append({
            "source_page": page_number,
            "page_role": page_role(page_number, task_ids),
            "rotation_degrees": page.rotation,
            "display_width_points": round(page.rect.width, 3),
            "display_height_points": round(page.rect.height, 3),
            "embedded_image_count": len(page.get_images(full=True)),
            "extracted_text_characters": len(page.get_text("text")),
            "render_sha256": sha256_file(render),
            **image_metrics(render),
            "task_ids": task_ids,
            "visual_review_status": "CONTACT_SHEET_REVIEWED_PREPARE_2026_08_30",
        })

    source_manifest = {
        "schema": "linguistpro-materials-pb2-source-manifest-v1",
        "generated_on": "2026-08-30",
        "source_commit": git_head(repo),
        "corpus_slug": CORPUS_SLUG,
        "source_edition": SOURCE_EDITION,
        "owner_path_policy": "SOURCE_DIR_ACCEPTED_AT_RUNTIME_NOT_STORED",
        "inputs": identities,
        "source_pdf_pages": 73,
        "canonical_task_units": len(TASKS),
        "numbered_task_occurrences": sum(item["display_number"] is not None for item in TASKS),
        "unique_display_numbers": len({item["display_number"] for item in TASKS if item["display_number"] is not None}),
        "duplicate_display_numbers": [number for number, count in Counter(
            item["display_number"] for item in TASKS if item["display_number"] is not None).items() if count > 1],
        "unnumbered_canonical_units": sum(item["display_number"] is None for item in TASKS),
        "owner_identity_decision": {
            "approved_on": "2026-08-30",
            "unnumbered_page_5_exercise_included": True,
            "duplicate_38_aliases": {"source_page_45": "38-A", "source_page_47": "38-B"},
        },
        "rights_status": "UNCONFIRMED_NO_PUBLICATION_AUTHORITY",
    }
    page_manifest = {
        "schema": "linguistpro-materials-pb2-page-manifest-v1",
        "source_edition": SOURCE_EDITION,
        "source_pdf_sha256": identities[SOURCE_PDF]["sha256"],
        "page_count": len(pages),
        "pages": pages,
    }
    task_manifest = {
        "schema": "linguistpro-materials-pb2-task-manifest-v1",
        "status": "OWNER_APPROVED_TASK_SET_LOCAL_SOURCE_ANCHORS_REVIEWED",
        "source_edition": SOURCE_EDITION,
        "identity_policy": "PAGE_BOUND_TASK_IDENTITY_DISPLAY_NUMBER_IS_NOT_IDENTITY",
        "canonical_task_count": len(TASKS),
        "tasks": TASKS,
    }

    task_batches = {
        "materials-pb2-task-input-01.pdf": [item for item in TASKS if (item["display_number"] or 0) <= 17],
        "materials-pb2-task-input-02.pdf": [item for item in TASKS if item["display_number"] is not None and 18 <= item["display_number"] <= 37],
        "materials-pb2-task-input-03.pdf": [item for item in TASKS if item["display_number"] is not None and item["display_number"] >= 38],
    }
    prepared_dir = args.stable / "prepared-inputs"
    visual_dir = args.stable / "visual-review"
    prepared_batches = []
    for filename, tasks in task_batches.items():
        items = []
        for task_item in tasks:
            for anchor in task_item["source_anchors"]:
                items.append({"item_id": task_item["task_id"], "item_kind": "task_condition", **anchor})
        output = prepared_dir / filename
        manifest = build_prepared_pdf(source, output, items)
        prepared_batches.append(verify_prepared_pdf(
            output, manifest, args.scratch / "prepared-renders", visual_dir / f"{output.stem}-contact.jpg"
        ))

    reference_items = [{"item_id": f"source-reference-p{page:03d}", "item_kind": "source_reference",
                        "source_page": page, "normalized_bbox": FULL, "role": PAGE_ROLE_OVERRIDES[page]}
                       for page in REFERENCE_PAGES]
    reference_output = prepared_dir / "materials-pb2-reference-input-04.pdf"
    reference_manifest = build_prepared_pdf(source, reference_output, reference_items)
    prepared_batches.append(verify_prepared_pdf(
        reference_output, reference_manifest, args.scratch / "prepared-renders",
        visual_dir / f"{reference_output.stem}-contact.jpg"
    ))
    source.close()

    projection, mapping_ledger, cost = legacy_projection(paths[LEGACY_JSON], source_page_tasks)
    correction_ledger = {
        "schema": "linguistpro-materials-pb2-correction-ledger-v1",
        "status": "LOCAL_SOURCE_ANCHOR_CORRECTIONS_APPLIED",
        "apply_policy": "FAIL_IF_EXPECTED_OLD_HASH_DRIFTS",
        "entries": [
            {
                "correction_id": "anchor-q042-exclude-q041-solution",
                "task_id": "materials-science-y1-pb2-q042",
                "source_page": 52,
                "old_normalized_bbox": FULL,
                "new_normalized_bbox": [0.0, 0.65, 1.0, 1.0],
                "reason": "Full page includes the preceding embedded solution for question 41.",
                "evidence": "Manual source-render readback on 2026-08-30.",
                "meaning_changed": False,
            },
            {
                "correction_id": "anchor-q044-exclude-q043-solution",
                "task_id": "materials-science-y1-pb2-q044",
                "source_page": 54,
                "old_normalized_bbox": FULL,
                "new_normalized_bbox": [0.0, 0.42, 1.0, 1.0],
                "reason": "Full page includes the preceding embedded solution for question 43.",
                "evidence": "Manual source-render readback on 2026-08-30.",
                "meaning_changed": False,
            },
        ],
    }
    prepared_manifest = {
        "schema": "linguistpro-materials-pb2-prepared-input-manifest-v1",
        "status": "LOCAL_OWNER_ONLY_NOT_PROVIDER_SUBMITTED_NOT_FOR_PUBLICATION",
        "source_edition": SOURCE_EDITION,
        "internal_pdf_size_ceiling_bytes": MAX_PREPARED_PDF_BYTES,
        "crop_policy": "SOURCE_CONDITION_ONLY_WHERE_SOLUTION_SHARES_A_PAGE_FULL_PAGE_OTHERWISE",
        "batches": prepared_batches,
    }
    verification = {
        "schema": "linguistpro-materials-pb2-prepare-verification-v1",
        "status": "PASS_OWNER_IDENTITIES_APPROVED_ROW_MAPPING_AND_DIAGRAM_REVIEW_NEXT",
        "checks": {
            "source_hashes_match": True,
            "source_page_count_73": len(pages) == 73,
            "canonical_task_count_60": len(TASKS) == 60,
            "numbered_occurrence_count_59": sum(item["display_number"] is not None for item in TASKS) == 59,
            "unique_display_number_count_58": len({item["display_number"] for item in TASKS if item["display_number"] is not None}) == 58,
            "duplicate_display_number_38_preserved": source_manifest["duplicate_display_numbers"] == [38],
            "prepared_pdfs_under_internal_ceiling": all(item["bytes"] < MAX_PREPARED_PDF_BYTES for item in prepared_batches),
            "prepared_pages_nonblank": all(item["min_ink_ratio"] >= 0.001 for item in prepared_batches),
            "legacy_projection_is_hash_only": True,
            "provider_calls": 0,
            "secret_access": False,
            "import_or_publication": False,
        },
        "resolved_owner_decisions": [
            "unnumbered page 5 exercise included as the 60th canonical unit",
            "both source question 38 occurrences retained as aliases 38-A and 38-B",
        ],
        "unresolved": [
            "row-level legacy-to-source mapping review",
            "semantic diagram classification per task",
            "rights, provider shadow, TTS, solutions, import, and publication remain unauthorized",
        ],
    }

    write_json(args.stable / "source-manifest.json", source_manifest)
    write_json(args.stable / "page-manifest.json", page_manifest)
    write_json(args.stable / "task-manifest.json", task_manifest)
    write_json(args.stable / "prepared-input-manifest.json", prepared_manifest)
    write_json(args.stable / "legacy-projection-manifest.json", projection)
    write_json(args.stable / "mapping-ledger.json", mapping_ledger)
    write_json(args.stable / "correction-ledger.json", correction_ledger)
    write_json(args.stable / "cost-envelope.json", cost)
    write_json(args.stable / "prepare-verification.json", verification)
    print(json.dumps({
        "stable": str(args.stable),
        "source_pages": len(pages),
        "candidate_tasks": len(TASKS),
        "prepared_pdfs": [{"filename": item["filename"], "pages": item["page_count"],
                            "bytes": item["bytes"], "sha256": item["sha256"]} for item in prepared_batches],
        "legacy_cards": projection["card_count"],
        "legacy_rows": projection["row_count"],
        "mapping_status_counts": mapping_ledger["status_counts"],
        "external_calls": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
