#!/usr/bin/env python3
"""Bake the reviewed Materials PB2 rows into a local LinguistPro bundle.

The command is offline and fail-closed. It cannot call providers, read secrets,
import, publish, create audio, or handle solutions. Without --bake it reports
readiness only. A bundle is emitted only after all six repair batches pass.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import unicodedata
import zipfile
from pathlib import Path
from typing import Any

import fitz


SOURCE_SHA256 = "3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435"
EXECUTION_PASS = "PASS_ALL_6_BATCHES_STRICTLY_VALIDATED_READY_FOR_LOCAL_CANONICAL_BAKE"
FIXED_ISO = "2026-08-30T00:00:00Z"
FIXED_ZIP_TIME = (2026, 8, 30, 0, 0, 0)
NIQQUD = re.compile(r"[\u0591-\u05BD\u05BF-\u05C2\u05C4\u05C5\u05C7]")
HEBREW = re.compile(r"[\u05D0-\u05EA]")
ZOOM = 3.0


def canonical_json(value: Any, *, pretty: bool = False) -> bytes:
    if pretty:
        return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
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


def normalized_skeleton(value: str) -> str:
    return " ".join(NIQQUD.sub("", unicodedata.normalize("NFC", value)).split())


def normalized_rect(page: fitz.Page, bbox: list[float]) -> fitz.Rect:
    x0, y0, x1, y1 = bbox
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        raise RuntimeError(f"invalid normalized bbox: {bbox}")
    rect = page.rect
    return fitz.Rect(
        rect.x0 + rect.width * x0,
        rect.y0 + rect.height * y0,
        rect.x0 + rect.width * x1,
        rect.y0 + rect.height * y1,
    )


def zip_write(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def text_title(record: dict[str, Any]) -> str:
    alias = record["display_alias"]
    if record["task_id"].endswith("exercise-p005-allotropy"):
        return "Материаловедение — упражнение «Аллотропия железа»"
    return f"Материаловедение — задача {alias}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    parser.add_argument("--source-pdf", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--bake", action="store_true")
    args = parser.parse_args()
    stable = args.stable.resolve()
    build = stable / "build"
    repair = stable / "repair"
    execution = repair / "execution"
    ledger_path = execution / "execution-ledger.json"
    if not ledger_path.exists():
        print(json.dumps({
            "status": "WAITING_FOR_APPROVED_PROVIDER_REPAIR_NO_PACKAGE",
            "provider_calls": 0,
            "package_emitted": False,
        }))
        return
    ledger = read_json(ledger_path)
    if ledger.get("status") != EXECUTION_PASS:
        raise RuntimeError("repair execution is not fully PASS; canonical bake remains blocked")
    if not args.bake:
        print(json.dumps({
            "status": "PASS_CANONICAL_BAKE_DRY_RUN_READY_NO_PACKAGE_WRITTEN",
            "reviewed_batches": len(ledger["reviewed_batches"]),
            "package_emitted": False,
        }))
        return
    if args.source_pdf is None or args.output is None:
        raise RuntimeError("--bake requires explicit source-pdf and output")
    source_pdf = args.source_pdf.resolve()
    output = args.output.resolve()
    if sha256_file(source_pdf) != SOURCE_SHA256:
        raise RuntimeError("source PDF hash drift")
    plan = read_json(build / "separate-canonical-repair-execution-plan.json")
    preflight = read_json(repair / "preflight" / "canonical-repair-preflight-manifest.json")
    anchor_corrections = read_json(repair / "preflight" / "source-anchor-repair-ledger.json")
    condition_corrections_path = repair / "source-condition-corrections.json"
    condition_corrections = (
        read_json(condition_corrections_path)
        if condition_corrections_path.exists()
        else {"entries": []}
    )
    if condition_corrections.get("entries"):
        if condition_corrections.get("status") != "PASS_SOURCE_VISUAL_AND_LEGACY_ROW_EXACT_MATCH" \
                or condition_corrections.get("source_pdf_sha256") != SOURCE_SHA256:
            raise RuntimeError("source condition correction ledger is not bound to the canonical source")
    if ledger["repair_plan_sha256"] != plan["artifact_sha256"] \
            or ledger["preflight_sha256"] != preflight["artifact_sha256"]:
        raise RuntimeError("reviewed execution is not bound to current plan/preflight")
    reviewed_rows: dict[str, dict[str, str]] = {}
    source_verified_legacy_fallback_ids: set[str] = set()
    for batch_id in ("B01", "B02", "B03", "B04", "B05", "B06"):
        reviewed = read_json(execution / "reviewed-batches" / f"{batch_id}-reviewed-rows.json")
        if reviewed["status"] != "PASS_STRICT_LOCAL_VALIDATION_SOURCE_FIRST_PROVIDER_REVIEW":
            raise RuntimeError(f"{batch_id} reviewed output is not PASS")
        source_verified_legacy_fallback_ids.update(reviewed["source_verified_legacy_fallback_row_ids"])
        for row in reviewed["rows"]:
            if row["row_id"] in reviewed_rows:
                raise RuntimeError(f"duplicate reviewed row {row['row_id']}")
            reviewed_rows[row["row_id"]] = row
    if len(reviewed_rows) != 642:
        raise RuntimeError("expected exactly 642 reviewed repair rows")

    records: list[dict[str, Any]] = []
    for batch_id in ("B01", "B02", "B03", "B04", "B05", "B06"):
        final = read_json(build / f"batch-{batch_id}" / "pass2-final-candidates.json")
        records.extend(copy.deepcopy(final["records"]))
    if len(records) != 60 or len({record["task_id"] for record in records}) != 60:
        raise RuntimeError("terminal record inventory drift")
    diagram_manifest = read_json(stable / "prepare" / "diagram-manifest.json")
    if diagram_manifest.get("status") != "PASS_ALL_60_TASKS_SEMANTICALLY_CLASSIFIED" \
            or diagram_manifest.get("task_count") != 60:
        raise RuntimeError("reviewed diagram manifest is not a complete 60-task PASS")
    diagram_by_task = {item["task_id"]: item for item in diagram_manifest["tasks"]}
    if set(diagram_by_task) != {record["task_id"] for record in records}:
        raise RuntimeError("reviewed diagram manifest task inventory drift")
    # Provider repair owns only the four learning columns. Visual and appendix
    # dependencies remain local reviewed source truth and may be corrected after
    # provider execution without replaying or expanding the paid repair scope.
    for record in records:
        reviewed_visuals = diagram_by_task[record["task_id"]]
        record["visual_requirement"] = reviewed_visuals["visual_requirement"]
        record["semantic_visuals"] = copy.deepcopy(reviewed_visuals["semantic_visuals"])
        record["external_reference_dependencies"] = copy.deepcopy(
            reviewed_visuals["external_reference_dependencies"]
        )
    corrections = {entry["task_id"]: entry["after"] for entry in anchor_corrections["entries"]}
    row_corrections = {entry["row_id"]: entry for entry in condition_corrections.get("entries", [])}
    if len(row_corrections) != len(condition_corrections.get("entries", [])):
        raise RuntimeError("duplicate source condition correction row")
    applied_row_corrections: set[str] = set()
    for record in records:
        if record["task_id"] in corrections:
            record["source_anchors"] = corrections[record["task_id"]]
        for row in record["rows"]:
            if row["row_id"] in reviewed_rows:
                replacement = reviewed_rows[row["row_id"]]
                row.update({field: replacement[field] for field in ("he", "he_niqqud", "transliteration", "ru")})
                row["_canonical_provenance"] = (
                    "source_verified_legacy_fallback"
                    if row["row_id"] in source_verified_legacy_fallback_ids
                    else "provider_reviewed"
                )
            else:
                row["_canonical_provenance"] = "existing_canonical_pass"
            if row["row_id"] in row_corrections:
                correction = row_corrections[row["row_id"]]
                if correction["task_id"] != record["task_id"]:
                    raise RuntimeError(f"source condition correction task mismatch for {row['row_id']}")
                current = {field: row[field] for field in ("he", "he_niqqud", "transliteration", "ru")}
                if current != correction["before"]:
                    raise RuntimeError(f"source condition correction before-state drift for {row['row_id']}")
                row.update(correction["after"])
                row["_canonical_provenance"] = "source_verified_post_bake_correction"
                applied_row_corrections.add(row["row_id"])
            if any(not isinstance(row.get(field), str) or not row[field].strip()
                   for field in ("he", "he_niqqud", "transliteration", "ru")):
                raise RuntimeError(f"incomplete four-column row {row['row_id']}")
            if NIQQUD.search(row["he"]) or normalized_skeleton(row["he"]) != normalized_skeleton(row["he_niqqud"]):
                raise RuntimeError(f"Hebrew validation failed for {row['row_id']}")
            hebrew_letters = len(HEBREW.findall(row["he_niqqud"]))
            niqqud_marks = len(NIQQUD.findall(row["he_niqqud"]))
            if hebrew_letters >= 3 and niqqud_marks < max(1, math.ceil(hebrew_letters * 0.15)):
                raise RuntimeError(f"Hebrew niqqud coverage failed for {row['row_id']}")
    if applied_row_corrections != set(row_corrections):
        raise RuntimeError("not every source condition correction was applied")

    provenance_counts: dict[str, int] = {}
    for record in records:
        for row in record["rows"]:
            provenance = row["_canonical_provenance"]
            provenance_counts[provenance] = provenance_counts.get(provenance, 0) + 1

    source = fitz.open(source_pdf)
    asset_bytes: dict[str, bytes] = {}
    asset_meta_by_task: dict[str, list[dict[str, Any]]] = {record["task_id"]: [] for record in records}
    reference_cache: dict[tuple[int, str], str] = {}
    try:
        for record in records:
            task_id = record["task_id"]
            for anchor_index, anchor in enumerate(record["source_anchors"], start=1):
                page = source[anchor["source_page"] - 1]
                clip = normalized_rect(page, anchor["normalized_bbox"])
                pixmap = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=clip, alpha=False)
                data = pixmap.tobytes("jpeg", jpg_quality=92)
                name = f"assets/source/{task_id}/anchor-{anchor_index:02d}-p{anchor['source_page']:03d}.jpg"
                asset_bytes[name] = data
                asset_meta_by_task[task_id].append({
                    "path": name,
                    "sha256": sha256_bytes(data),
                    "bytes": len(data),
                    "source_page": anchor["source_page"],
                    "normalized_bbox": anchor["normalized_bbox"],
                    "role": anchor["role"],
                })
            for dependency in record["external_reference_dependencies"]:
                for page_number in dependency["source_pages"]:
                    key = (page_number, dependency["dependency_kind"])
                    if key not in reference_cache:
                        page = source[page_number - 1]
                        pixmap = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), alpha=False)
                        data = pixmap.tobytes("jpeg", jpg_quality=92)
                        name = f"assets/reference/{dependency['dependency_kind'].lower()}-p{page_number:03d}.jpg"
                        asset_bytes[name] = data
                        reference_cache[key] = name
                    name = reference_cache[key]
                    asset_meta_by_task[task_id].append({
                        "path": name,
                        "sha256": sha256_bytes(asset_bytes[name]),
                        "bytes": len(asset_bytes[name]),
                        "source_page": page_number,
                        "normalized_bbox": [0.0, 0.0, 1.0, 1.0],
                        "role": f"external_reference:{dependency['dependency_kind']}",
                    })
    finally:
        source.close()

    texts: list[dict[str, Any]] = []
    for order, record in enumerate(records):
        task_id = record["task_id"]
        rows = []
        for row in record["rows"]:
            provenance = row["_canonical_provenance"]
            if provenance == "provider_reviewed":
                translation_provider = f"gemini:{ledger['model']}"
                niqqud_provenance = f"gemini:{ledger['model']}+local-skeleton-projection"
                provider_name = "gemini"
                provider_model = ledger["model"]
            elif provenance == "source_verified_legacy_fallback":
                translation_provider = "legacy:source-bound-studio-export"
                niqqud_provenance = "hybrid:legacy-source+gemini-points+local-skeleton"
                provider_name = "legacy_source_bound"
                provider_model = None
            elif provenance == "source_verified_post_bake_correction":
                translation_provider = "local:source-visual-review"
                niqqud_provenance = "legacy:source-bound-studio-export+local-visual-review"
                provider_name = "local_source_visual_review"
                provider_model = None
            else:
                translation_provider = "legacy:existing-canonical-pass"
                niqqud_provenance = "legacy:existing-canonical-pass"
                provider_name = "legacy_existing_canonical"
                provider_model = None
            rows.append({
                "row_id": row["row_id"],
                "order_index": row["order_index"],
                "hebrew_plain": row["he"],
                "hebrew_niqqud": row["he_niqqud"],
                "translit": row["transliteration"],
                "translit_ru": "",
                "russian": row["ru"],
                "edit_meta": None,
                "audio_asset_key": None,
                "translation_provider": translation_provider,
                "translation_meta": {
                    "provider": provider_name,
                    "model": provider_model,
                    "model_version": provider_model,
                    "prompt_id": "materials-pb2-source-first-repair-v1",
                    "schema_id": "materials-pb2-four-column-rows-v1",
                    "translit_profile": "learner-latin",
                    "verification_status": "source_first_reviewed_visuals_materialized",
                    "canonical_provenance": provenance,
                },
                "niqqud_authority": "ASSERTED",
                "niqqud_provenance": niqqud_provenance,
                "meta": {"materials_science": {
                    "schema": "linguistpro.materials-science.row.1",
                    "task_id": task_id,
                    "kind": row["semantic_kind"],
                    "source_page": row.get("source_page") or record["source_anchors"][0]["source_page"],
                    "source_row_index": row["order_index"],
                    "canonical_provenance": provenance,
                }},
                "source_segment_id": None,
                "source_segment_ids": [],
                "caption_segment_id": None,
                "source_line_index": row["order_index"],
                "sentence_index": row["order_index"],
                "note": None,
            })
        condition_rows = [row for row in rows if row["meta"]["materials_science"]["kind"] != "task_heading"]
        assets = asset_meta_by_task[task_id]
        source_meta = {
            "materials_science_task": {
                "schema": "linguistpro.materials-science.task-card.1",
                "corpus_title": "Материаловедение — задачник 2",
                "task_id": task_id,
                "display_alias": record["display_alias"],
                "source_pages": sorted({item["source_page"] for item in assets}),
                "source_pdf_sha256": SOURCE_SHA256,
                "verification_status": "source_first_reviewed_visuals_materialized",
                "visual_requirement": record["visual_requirement"],
                "semantic_visuals": record["semantic_visuals"],
                "external_reference_dependencies": record["external_reference_dependencies"],
                "source_assets": assets,
                "translator": {
                    "provider": "gemini", "model": ledger["model"], "model_version": ledger["model"],
                    "prompt_id": "materials-pb2-source-first-repair-v1",
                    "schema_id": "materials-pb2-four-column-rows-v1",
                    "translit_profile": "learner-latin",
                },
                "legacy_comparison": {
                    "status": "source_first_reviewed_legacy_comparison_only",
                    "legacy_row_count": sum(1 for row in record["rows"] if row.get("legacy_evidence")),
                    "segmentation_reviewed": True,
                },
            }
        }
        tags = ["materials-science", "year-1", "problem-book-2", "source-first-reviewed"]
        if record["semantic_visuals"]:
            tags.append("visuals-materialized")
        texts.append({
            "text_id": f"materials-pb2-text-{sha256_bytes(task_id.encode('utf-8'))[:24]}",
            "text_key": task_id,
            "title": text_title(record),
            "level": "year-1",
            "tags": tags,
            "source_label": "Материаловедение — задачник 2",
            "topic": "Материаловедение",
            "source_text": "\n".join(row["hebrew_plain"] for row in condition_rows),
            "source_meta": source_meta,
            "corpus": None,
            "table_model_meta": {"materials_science_task": source_meta["materials_science_task"]["translator"] | {
                "verification_status": "source_first_reviewed_visuals_materialized"
            }},
            "rows": rows,
            "text_audio_asset_key": None,
            "created_at": FIXED_ISO,
            "updated_at": FIXED_ISO,
            "is_archived": False,
            "is_pinned": False,
            "pin_order": None,
            "manual_smart_tag": None,
            "tts_profile_json": "null",
            "progress": None,
            "bookmarks": [],
        })
    row_count = sum(len(text["rows"]) for text in texts)
    if row_count != 693:
        raise RuntimeError(f"canonical row count drift: {row_count}")
    shelf = {
        "schema": 1,
        "slug": "materials-science-year1-problem-book-2",
        "title": "Материаловедение — задачник 2",
        "track": "accessible",
        "era": "education",
        "genre": "materials-science",
        "editorial_intro": "60 source-grounded задач с четырьмя учебными колонками и материализованными схемами и таблицами.",
        "items": [{"text_key": text["text_key"], "order": order} for order, text in enumerate(texts)],
        "order": 1,
        "origin": None,
        "canon_version": None,
    }
    library = {"schema_version": 1, "corpus_meta_version": 1, "shelves": shelf, "texts": texts, "audio_assets": []}
    summary = {
        "task_count": len(texts),
        "row_count": row_count,
        "source_first_reviewed": len(texts),
        "tasks_with_semantic_visuals": sum(bool(record["semantic_visuals"]) for record in records),
        "semantic_visual_instance_count": sum(sum(item["instance_count"] for item in record["semantic_visuals"]) for record in records),
        "asset_count": len(asset_bytes),
        "asset_bytes": sum(len(value) for value in asset_bytes.values()),
        "audio_count": 0,
        "solution_count": 0,
        "provider_call_count": ledger["provider_call_count"],
        "provider_call_start_count": ledger.get("provider_call_start_count", ledger["provider_call_count"]),
        "measured_provider_cost_usd": ledger["actual_measured_cost_usd"],
        "provider_billing_upper_bound_usd": ledger.get(
            "billing_upper_bound_usd", ledger["actual_measured_cost_usd"]
        ),
        "provider_reviewed_row_count": provenance_counts.get("provider_reviewed", 0),
        "source_verified_legacy_fallback_row_count": provenance_counts.get("source_verified_legacy_fallback", 0),
        "source_verified_post_bake_correction_row_count": provenance_counts.get("source_verified_post_bake_correction", 0),
        "existing_canonical_pass_row_count": provenance_counts.get("existing_canonical_pass", 0),
    }
    library_bytes = canonical_json(library, pretty=True)
    summary_bytes = canonical_json(summary, pretty=True)
    manifest = {
        "format": "linguistpro-bundle",
        "schema_version": 1,
        "generated_at": FIXED_ISO,
        "generator": "materials-science-pb2-canonical-pipeline",
        "corpus_title": "Материаловедение — задачник 2",
        "text_count": len(texts),
        "row_count": row_count,
        "audio_count": 0,
        "missing_audio": row_count,
        "asset_count": len(asset_bytes),
        "library_json_path": "library/library.json",
        "library_sha256": sha256_bytes(library_bytes),
        "source_edition": "problem-book-2-pdf-sha256-3d87b9f5",
        "verification_status": "source_first_reviewed_visuals_materialized_post_source_correction",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w") as archive:
        zip_write(archive, "manifest.json", canonical_json(manifest, pretty=True))
        zip_write(archive, "library/library.json", library_bytes)
        zip_write(archive, "metadata/materials-pb2-summary.json", summary_bytes)
        for name in sorted(asset_bytes):
            zip_write(archive, name, asset_bytes[name])

    with zipfile.ZipFile(output, "r") as archive:
        names = set(archive.namelist())
        required = {"manifest.json", "library/library.json", "metadata/materials-pb2-summary.json"}
        if not required.issubset(names):
            raise RuntimeError("canonical bundle readback missing required entries")
        readback_library = json.loads(archive.read("library/library.json"))
        if len(readback_library["texts"]) != 60 \
                or sum(len(text["rows"]) for text in readback_library["texts"]) != 693:
            raise RuntimeError("canonical bundle readback count mismatch")
        for text in readback_library["texts"]:
            if not text["source_meta"]["materials_science_task"]["source_assets"]:
                raise RuntimeError(f"canonical task has no materialized source asset: {text['text_key']}")
            for asset in text["source_meta"]["materials_science_task"]["source_assets"]:
                if asset["path"] not in names or sha256_bytes(archive.read(asset["path"])) != asset["sha256"]:
                    raise RuntimeError(f"canonical asset readback failed: {asset['path']}")
    report = {
        "schema": "linguistpro-materials-pb2-canonical-bake-report-v1",
        "status": "PASS_LOCAL_CANONICAL_BUNDLE_DETERMINISTIC_READBACK_NOT_IMPORTED_NOT_PUBLISHED",
        "bundle_filename": output.name,
        "bundle_bytes": output.stat().st_size,
        "bundle_sha256": sha256_file(output),
        "task_count": 60,
        "row_count": 693,
        "asset_count": len(asset_bytes),
        "provider_reviewed_row_count": provenance_counts.get("provider_reviewed", 0),
        "source_verified_legacy_fallback_row_count": provenance_counts.get("source_verified_legacy_fallback", 0),
        "source_verified_post_bake_correction_row_count": provenance_counts.get("source_verified_post_bake_correction", 0),
        "existing_canonical_pass_row_count": provenance_counts.get("existing_canonical_pass", 0),
        "audio_count": 0,
        "missing_audio": 693,
        "solution_count": 0,
        "imported": False,
        "published": False,
    }
    write_json(repair / "canonical-bake-report.json", report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
