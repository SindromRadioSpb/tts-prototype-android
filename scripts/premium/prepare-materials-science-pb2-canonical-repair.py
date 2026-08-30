#!/usr/bin/env python3
"""Prepare and verify the offline egress payloads for Materials PB2 repair.

No network or credential capability exists in this script. It creates six
source-cropped, raster-sanitized PDFs plus exact legacy-candidate JSON payloads.
It never includes solutions, audio, import data, or publication state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import fitz
from PIL import Image, ImageDraw, ImageFont


SCHEMA = "linguistpro-materials-pb2-canonical-repair-preflight-v1"
SOURCE_SHA256 = "3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435"
PLAN_STATUS = "PLANNED_NOT_APPROVED_NO_PROVIDER_CALLS"
FULL = [0.0, 0.0, 1.0, 1.0]
ZOOM = 3.0


def q(number: int) -> str:
    return f"materials-science-y1-pb2-q{number:03d}"


# These three boundary corrections were discovered by the all-batch preflight
# contact-sheet review after the immutable two-pass Build had already closed.
# They are an additive repair layer, not a rewrite or third Build pass.
PREFLIGHT_ANCHOR_OVERRIDES: dict[str, list[dict[str, Any]]] = {
    q(21): [
        {"source_page": 27, "normalized_bbox": FULL.copy(), "role": "condition"},
        {"source_page": 28, "normalized_bbox": [0.0, 0.0, 1.0, 0.22], "role": "condition_continuation"},
    ],
    q(22): [
        {"source_page": 28, "normalized_bbox": [0.0, 0.18, 1.0, 1.0], "role": "condition"},
    ],
    q(28): [
        {"source_page": 36, "normalized_bbox": [0.0, 0.38, 1.0, 1.0], "role": "condition"},
    ],
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(raw)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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


def ink_ratio(pixmap: fitz.Pixmap) -> float:
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    gray = image.convert("L")
    histogram = gray.histogram()
    ink = sum(histogram[:245])
    return round(ink / (pixmap.width * pixmap.height), 6)


def make_contact_sheet(render_paths: list[Path], labels: list[str], destination: Path) -> None:
    thumb_w, thumb_h, label_h, columns = 340, 440, 44, 3
    rows = math.ceil(len(render_paths) / columns)
    sheet = Image.new("RGB", (columns * thumb_w, rows * (thumb_h + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=14)
    for index, (path, label) in enumerate(zip(render_paths, labels, strict=True)):
        with Image.open(path) as source:
            thumb = source.convert("RGB")
            thumb.thumbnail((thumb_w - 12, thumb_h - 12), Image.Resampling.LANCZOS)
        column, row = index % columns, index // columns
        x = column * thumb_w + (thumb_w - thumb.width) // 2
        y = row * (thumb_h + label_h) + label_h
        sheet.paste(thumb, (x, y))
        draw.text((column * thumb_w + 6, row * (thumb_h + label_h) + 5), label, fill="black", font=font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=90)


def output_schema(batch_id: str, row_ids: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["batch_id", "rows"],
        "properties": {
            "batch_id": {"type": "string"},
            "rows": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["row_id", "he", "he_niqqud", "transliteration", "ru"],
                    "properties": {
                        "row_id": {"type": "string"},
                        "he": {"type": "string"},
                        "he_niqqud": {"type": "string"},
                        "transliteration": {"type": "string"},
                        "ru": {"type": "string"},
                    },
                },
            },
        },
    }


def prompt_text(batch_id: str, row_count: int) -> str:
    return f"""You are repairing bilingual learning rows for a materials-science problem corpus.
Batch: {batch_id}. Exact row count: {row_count}.

The attached PDF contains only source condition crops and explicitly required reference appendices.
The attached candidate JSON contains stable row_id values and legacy candidate columns.

For every input row, return exactly one output row with the same row_id and no extra rows.
Use the PDF as source truth. Legacy columns are comparison evidence only.
- he: exact plain Hebrew condition text for that row, without niqqud.
- he_niqqud: the same Hebrew text with accurate niqqud; consonant skeleton must equal he.
- transliteration: faithful readable Latin transliteration of he_niqqud, preserving formulas and symbols.
- ru: faithful Russian translation of the condition, preserving formulas, units, subparts, and uncertainty.
Do not answer, solve, explain, infer missing values, or emit status/severity fields.
If the row is a heading or formula-only row, preserve that semantic role and content.
Return JSON matching the supplied schema only.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    parser.add_argument("--source-pdf", type=Path, required=True)
    args = parser.parse_args()
    stable = args.stable.resolve()
    source_pdf = args.source_pdf.resolve()
    build = stable / "build"
    repair = stable / "repair" / "preflight"
    inputs = repair / "inputs"
    candidates_dir = repair / "candidates"
    review_dir = repair / "visual-review"
    inputs.mkdir(parents=True, exist_ok=True)
    candidates_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)

    if sha256_file(source_pdf) != SOURCE_SHA256:
        raise RuntimeError("source PDF hash drift")
    plan = read_json(build / "separate-canonical-repair-execution-plan.json")
    if plan["status"] != PLAN_STATUS or plan["provider_calls_made"] != 0 or plan["secret_accessed"]:
        raise RuntimeError("repair plan is not at the offline preflight boundary")

    source = fitz.open(source_pdf)
    manifest_batches: list[dict[str, Any]] = []
    try:
        for planned in plan["batches"]:
            batch_id = planned["batch_id"]
            final = read_json(build / f"batch-{batch_id}" / "pass2-final-candidates.json")
            records = [record for record in final["records"] if record["task_id"] in planned["task_ids"]]
            record_ids = [record["task_id"] for record in records]
            if record_ids != planned["task_ids"]:
                raise RuntimeError(f"{batch_id} task sequence drift")
            if any(record["solution_rows_included"] or record["provider_output_used"] for record in records):
                raise RuntimeError(f"{batch_id} contains prohibited solution/provider truth")

            rows = [
                {
                    "row_id": row["row_id"],
                    "semantic_kind": row["semantic_kind"],
                    "he": row.get("he"),
                    "he_niqqud": row.get("he_niqqud"),
                    "transliteration": row.get("transliteration"),
                    "ru": row.get("ru"),
                }
                for record in records
                for row in record["rows"]
                if not row["pass_2_row_status"].startswith("PASS_")
            ]
            row_ids = [row["row_id"] for row in rows]
            if row_ids != planned["blocked_row_ids"]:
                raise RuntimeError(f"{batch_id} blocked-row sequence drift")
            candidate_payload = {
                "schema": f"{SCHEMA}.candidate-input",
                "batch_id": batch_id,
                "source_edition": final["source_edition"],
                "truth_status": "LEGACY_COMPARISON_ONLY_SOURCE_PDF_CANONICAL",
                "solution_rows_included": False,
                "rows": rows,
            }
            candidate_path = candidates_dir / f"{batch_id}-candidate-rows.json"
            write_json(candidate_path, candidate_payload)

            page_specs: list[dict[str, Any]] = []
            for record in records:
                active_anchors = PREFLIGHT_ANCHOR_OVERRIDES.get(record["task_id"], record["source_anchors"])
                for anchor in active_anchors:
                    if "solution" in anchor["role"].lower():
                        raise RuntimeError(f"prohibited solution anchor in {batch_id}")
                    page_specs.append({
                        "task_ids": [record["task_id"]],
                        "source_page": anchor["source_page"],
                        "normalized_bbox": anchor["normalized_bbox"],
                        "role": anchor["role"],
                    })
            reference_users: dict[tuple[int, str], set[str]] = defaultdict(set)
            for record in records:
                for dependency in record["external_reference_dependencies"]:
                    for page in dependency["source_pages"]:
                        reference_users[(page, dependency["dependency_kind"])].add(record["task_id"])
            for (page, dependency_kind), task_ids in sorted(reference_users.items()):
                page_specs.append({
                    "task_ids": sorted(task_ids),
                    "source_page": page,
                    "normalized_bbox": FULL.copy(),
                    "role": f"external_reference:{dependency_kind}",
                })
            if sorted({item["source_page"] for item in page_specs}) != planned["source_pages"]:
                raise RuntimeError(f"{batch_id} source-page egress drift")

            output_pdf = fitz.open()
            page_manifest: list[dict[str, Any]] = []
            for output_index, spec in enumerate(page_specs, start=1):
                page = source[spec["source_page"] - 1]
                clip = normalized_rect(page, spec["normalized_bbox"])
                pixmap = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=clip, alpha=False)
                image_bytes = pixmap.tobytes("jpeg", jpg_quality=92)
                out_page = output_pdf.new_page(width=clip.width, height=clip.height)
                out_page.insert_image(out_page.rect, stream=image_bytes)
                page_manifest.append({
                    "output_page": output_index,
                    **spec,
                    "pixel_width": pixmap.width,
                    "pixel_height": pixmap.height,
                    "render_sha256": sha256_bytes(image_bytes),
                    "ink_ratio": ink_ratio(pixmap),
                })
            pdf_path = inputs / f"materials-pb2-canonical-repair-{batch_id}.pdf"
            output_pdf.set_metadata({
                "title": f"Materials PB2 canonical repair {batch_id}",
                "author": "LinguistPro local corpus pipeline",
                "subject": "Source-grounded condition input",
                "keywords": "materials-science,problem-book-2,source-condition",
                "creator": "prepare-materials-science-pb2-canonical-repair.py",
                "producer": "PyMuPDF deterministic local preflight",
                "creationDate": "D:20260830000000Z",
                "modDate": "D:20260830000000Z",
            })
            output_pdf.save(pdf_path, garbage=4, deflate=True, no_new_id=True, preserve_metadata=True)
            output_pdf.close()

            readback = fitz.open(pdf_path)
            render_paths: list[Path] = []
            labels: list[str] = []
            readback_pages: list[dict[str, Any]] = []
            try:
                if readback.page_count != len(page_manifest):
                    raise RuntimeError(f"{batch_id} PDF page-count readback mismatch")
                for index, page in enumerate(readback):
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False)
                    ratio = ink_ratio(pixmap)
                    if ratio < 0.002:
                        raise RuntimeError(f"{batch_id} output page {index + 1} is effectively blank")
                    render_path = review_dir / f"{batch_id}-p{index + 1:02d}.png"
                    pixmap.save(render_path)
                    render_paths.append(render_path)
                    spec = page_manifest[index]
                    labels.append(f"out {index + 1:02d} src {spec['source_page']:02d} {spec['role'][:22]}")
                    readback_pages.append({
                        "output_page": index + 1,
                        "render_sha256": sha256_file(render_path),
                        "ink_ratio": ratio,
                    })
            finally:
                readback.close()
            contact_path = review_dir / f"{batch_id}-contact-sheet.jpg"
            make_contact_sheet(render_paths, labels, contact_path)

            schema = output_schema(batch_id, row_ids)
            prompt = prompt_text(batch_id, len(row_ids))
            request_blueprint = {
                "schema": f"{SCHEMA}.request-blueprint",
                "batch_id": batch_id,
                "model": plan["provider"]["model"],
                "mode": plan["provider"]["mode"],
                "thinking_level": plan["provider"]["thinking_level"],
                "pdf_filename": pdf_path.name,
                "pdf_sha256": sha256_file(pdf_path),
                "candidate_filename": candidate_path.name,
                "candidate_sha256": sha256_file(candidate_path),
                "prompt": prompt,
                "prompt_sha256": sha256_bytes(prompt.encode("utf-8")),
                "output_schema": schema,
                "output_schema_sha256": sha256_json(schema),
                "expected_row_ids": row_ids,
                "maximum_output_tokens": plan["finite_execution"]["output_token_cap_per_call_including_thinking"],
                "provider_calls_made": 0,
            }
            blueprint_path = repair / f"{batch_id}-request-blueprint.json"
            write_json(blueprint_path, request_blueprint)
            manifest_batches.append({
                "batch_id": batch_id,
                "task_ids": record_ids,
                "row_count": len(rows),
                "source_pages": planned["source_pages"],
                "pdf": {"filename": pdf_path.name, "bytes": pdf_path.stat().st_size, "sha256": sha256_file(pdf_path)},
                "candidate": {"filename": candidate_path.name, "bytes": candidate_path.stat().st_size,
                              "sha256": sha256_file(candidate_path)},
                "request_blueprint": {"filename": blueprint_path.name, "sha256": sha256_file(blueprint_path)},
                "page_manifest": page_manifest,
                "readback_pages": readback_pages,
                "contact_sheet": {"filename": contact_path.name, "sha256": sha256_file(contact_path)},
            })
    finally:
        source.close()

    manifest: dict[str, Any] = {
        "schema": f"{SCHEMA}.manifest",
        "status": "PASS_OFFLINE_PREFLIGHT_AWAITING_OWNER_APPROVAL_NO_PROVIDER_CALLS",
        "source_edition": "problem-book-2-pdf-sha256-3d87b9f5",
        "source_pdf_sha256": SOURCE_SHA256,
        "repair_plan_sha256": plan["artifact_sha256"],
        "batch_count": len(manifest_batches),
        "task_count": sum(len(item["task_ids"]) for item in manifest_batches),
        "row_count": sum(item["row_count"] for item in manifest_batches),
        "pdf_page_exposure_count": sum(len(item["page_manifest"]) for item in manifest_batches),
        "post_build_source_anchor_correction_task_count": len(PREFLIGHT_ANCHOR_OVERRIDES),
        "batches": manifest_batches,
        "checks": {
            "source_hash_verified": True,
            "six_batches": len(manifest_batches) == 6,
            "fifty_nine_tasks": sum(len(item["task_ids"]) for item in manifest_batches) == 59,
            "six_hundred_forty_two_rows": sum(item["row_count"] for item in manifest_batches) == 642,
            "all_pdf_pages_render_read_back": all(
                len(item["page_manifest"]) == len(item["readback_pages"]) for item in manifest_batches
            ),
            "solution_rows_included": False,
            "provider_calls_made": 0,
            "secret_accessed": False,
        },
        "provider_calls_made": 0,
        "secret_accessed": False,
    }
    if not all(manifest["checks"][key] is True for key in (
        "source_hash_verified", "six_batches", "fifty_nine_tasks",
        "six_hundred_forty_two_rows", "all_pdf_pages_render_read_back",
    )) or manifest["checks"]["solution_rows_included"] is not False \
            or manifest["checks"]["provider_calls_made"] != 0 \
            or manifest["checks"]["secret_accessed"] is not False:
        raise RuntimeError("offline preflight acceptance failed")
    manifest["artifact_sha256"] = sha256_json(manifest)
    write_json(repair / "canonical-repair-preflight-manifest.json", manifest)
    correction_ledger: dict[str, Any] = {
        "schema": f"{SCHEMA}.source-anchor-corrections",
        "status": "APPLIED_TO_REPAIR_PREFLIGHT_ONLY_IMMUTABLE_BUILD_EVIDENCE_PRESERVED",
        "source_pdf_sha256": SOURCE_SHA256,
        "discovered_by": "ALL_BATCH_CANONICAL_REPAIR_CONTACT_SHEET_VISUAL_REVIEW",
        "entry_count": len(PREFLIGHT_ANCHOR_OVERRIDES),
        "entries": [
            {
                "task_id": task_id,
                "before": next(
                    record["source_anchors"]
                    for batch_id in ("B03",)
                    for record in read_json(build / f"batch-{batch_id}" / "pass2-final-candidates.json")["records"]
                    if record["task_id"] == task_id
                ),
                "after": anchors,
                "reason": (
                    "Q021_CONTINUES_AT_TOP_OF_P028" if task_id == q(21) else
                    "Q022_CROP_EXCLUDES_Q021_CONTINUATION" if task_id == q(22) else
                    "Q028_CROP_EXCLUDES_Q027_CONTINUATION"
                ),
                "repair_preflight_contact_sheet": "B03-contact-sheet.jpg",
            }
            for task_id, anchors in PREFLIGHT_ANCHOR_OVERRIDES.items()
        ],
        "provider_calls_made": 0,
        "secret_accessed": False,
    }
    correction_ledger["artifact_sha256"] = sha256_json(correction_ledger)
    write_json(repair / "source-anchor-repair-ledger.json", correction_ledger)
    print(json.dumps({
        "status": manifest["status"],
        "batches": manifest["batch_count"],
        "tasks": manifest["task_count"],
        "rows": manifest["row_count"],
        "pdf_page_exposures": manifest["pdf_page_exposure_count"],
        "provider_calls": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
