#!/usr/bin/env python3
"""Build the offline Materials Science PB2 shadow-audit PLAN.

This command never reads credentials, calls Gemini, copies source text into the
stable research packet, imports data, evaluates solutions, or publishes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


MODEL = "gemini-3.7-flash"
PROMPT_ID = "materials-pb2-shadow-source-audit-v1"
SCHEMA_ID = "materials-pb2-shadow-source-audit-schema-v1"
SOURCE_EDITION = "problem-book-2-pdf-sha256-3d87b9f5"
PDF_PAGE_TOKENS = 258
INPUT_TOKEN_CAP = 50_000
OUTPUT_TOKEN_CAP = 16_384
MAX_PROVIDER_CALLS = 4
INPUT_USD_PER_M = 0.75
OUTPUT_USD_PER_M = 3.75
PROPOSED_CEILING_USD = 0.50


CASES = [
    {
        "case_id": "S01-FIRST-VISUAL",
        "task_ids": ["materials-science-y1-pb2-q001"],
        "risk_tags": ["FIRST_TASK", "ATOM_DIAGRAMS", "VISUAL_LABEL_FIDELITY"],
        "reason": "First canonical task and four required atom-model diagrams.",
    },
    {
        "case_id": "S02-UNNUMBERED-EXERCISE",
        "task_ids": ["materials-science-y1-pb2-exercise-p005-allotropy"],
        "risk_tags": ["OWNER_APPROVED_UNNUMBERED_IDENTITY", "CURVE", "UNIT_CELL_SKETCHES"],
        "reason": "Owner-approved unnumbered exercise with five semantic visuals.",
    },
    {
        "case_id": "S03-MULTIPAGE-NO-LEGACY",
        "task_ids": ["materials-science-y1-pb2-q002"],
        "risk_tags": ["MULTIPAGE_BOUNDARY", "NO_LEGACY_ROWS", "CONTINUATION_CROP"],
        "reason": "Two-page condition; absence from legacy must never trigger a neighbor fallback.",
    },
    {
        "case_id": "S04-TITLE-PAGE-OVERRIDE",
        "task_ids": ["materials-science-y1-pb2-q010"],
        "risk_tags": ["LEGACY_TITLE_PAGE_MISMATCH", "GRAPH", "NUMERIC_LABELS"],
        "reason": "Source page 14 is mapped from a legacy title that says page 13.",
    },
    {
        "case_id": "S05-DUPLICATE-LEGACY-CARDS",
        "task_ids": ["materials-science-y1-pb2-q016"],
        "risk_tags": ["DUPLICATE_NONIDENTICAL_LEGACY_CARDS", "TABLE", "REQUIREMENTS_BLOCK"],
        "reason": "Two nonidentical legacy cards target one source task; neither may silently win.",
    },
    {
        "case_id": "S06-IMPORTANT-TITLE",
        "task_ids": ["materials-science-y1-pb2-q024"],
        "risk_tags": ["LEGACY_IMPORTANT_TITLE", "FORMULAS", "UNITS"],
        "reason": "Tests the legacy 'page 30 IMPORTANT' title and formula/unit preservation.",
    },
    {
        "case_id": "S07-MULTICARD-APPENDIX",
        "task_ids": ["materials-science-y1-pb2-q030"],
        "risk_tags": ["MULTIPLE_LEGACY_CARDS", "MICROGRAPH", "PHASE_DIAGRAM_APPENDIX"],
        "reason": "Two legacy cards, a required micrograph, and a page-70 appendix dependency.",
    },
    {
        "case_id": "S08-VISUAL-NO-LEGACY",
        "task_ids": ["materials-science-y1-pb2-q032"],
        "risk_tags": ["NO_LEGACY_ROWS", "THREE_CURVES", "SOURCE_ONLY_EXTRACTION"],
        "reason": "Second source-only gap; three curves make invention or omission visible.",
    },
    {
        "case_id": "S09-TABLE-SCHEMATIC-OVERRIDE",
        "task_ids": ["materials-science-y1-pb2-q035"],
        "risk_tags": ["LEGACY_MARKER_CONFLICT", "DATA_TABLE", "SAMPLING_SCHEMATIC"],
        "reason": "Legacy marker conflict plus two different semantic visual types.",
    },
    {
        "case_id": "S10-DUPLICATE-SOURCE-NUMBER-38",
        "task_ids": [
            "materials-science-y1-pb2-p045-q038",
            "materials-science-y1-pb2-p047-q038",
        ],
        "risk_tags": ["OWNER_APPROVED_38_A_38_B", "ROTATED_APPENDICES", "IDENTITY_COLLISION"],
        "reason": "Paired identity test: distinct 38-A/38-B and rotated pages 68-69.",
    },
    {
        "case_id": "S11-CORRECTED-CROP-APPENDICES",
        "task_ids": ["materials-science-y1-pb2-q044"],
        "risk_tags": ["REVIEWED_CROP_FIX", "THREE_APPENDICES", "NO_PREVIOUS_SOLUTION_LEAK"],
        "reason": "Corrected page-54 crop plus aluminum appendices 71-73.",
    },
    {
        "case_id": "S12-LAST-MULTITASK-SPLIT",
        "task_ids": ["materials-science-y1-pb2-q058"],
        "risk_tags": ["LAST_TASK", "LEGACY_MULTITASK_CARD_SPLIT", "COMPOSITE_CUBE"],
        "reason": "Last task; legacy rows are a reviewed tail segment of a three-task card.",
    },
]

BATCHES = [
    ("B01", ["S01-FIRST-VISUAL", "S02-UNNUMBERED-EXERCISE", "S03-MULTIPAGE-NO-LEGACY", "S04-TITLE-PAGE-OVERRIDE"]),
    ("B02", ["S05-DUPLICATE-LEGACY-CARDS", "S06-IMPORTANT-TITLE", "S07-MULTICARD-APPENDIX", "S08-VISUAL-NO-LEGACY"]),
    ("B03", ["S09-TABLE-SCHEMATIC-OVERRIDE", "S10-DUPLICATE-SOURCE-NUMBER-38", "S11-CORRECTED-CROP-APPENDICES", "S12-LAST-MULTITASK-SPLIT"]),
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def legacy_refs(mapping: dict[str, Any], task_ids: list[str]) -> list[dict[str, Any]]:
    refs = []
    wanted = set(task_ids)
    for card in mapping["cards"]:
        rows = [row for row in card["rows"] if row["target_kind"] == "task" and row["target_id"] in wanted]
        if not rows:
            continue
        refs.append({
            "legacy_card_key_sha256": card["legacy_card_key_sha256"],
            "legacy_title": card["legacy_title"],
            "row_start": min(row["row_index"] for row in rows),
            "row_end": max(row["row_index"] for row in rows),
            "row_count": len(rows),
            "aligned_row_sha256": [row["aligned_row_sha256"] for row in rows],
            "truth_status": "COMPARISON_ONLY_UNVALIDATED_NOT_CANONICAL",
        })
    return refs


def build_schema() -> dict[str, Any]:
    row_kind = ["task_heading", "condition", "subpart", "note", "source_note", "diagram_reference"]
    summary_schema = {
        "type": "object", "additionalProperties": False,
        "required": ["critical_count", "major_count", "minor_count", "solution_content_generated"],
        "properties": {
            "critical_count": {"type": "integer", "minimum": 0},
            "major_count": {"type": "integer", "minimum": 0},
            "minor_count": {"type": "integer", "minimum": 0},
            "solution_content_generated": {"type": "boolean"},
        },
    }
    task_schema = {
        "type": "object", "additionalProperties": False,
        "required": ["task_id", "boundary_status", "source_rows", "visuals", "legacy_findings", "unknowns"],
        "properties": {
            "task_id": {"type": "string"},
            "boundary_status": {"type": "string", "enum": ["exact", "ambiguous", "not_found"]},
            "source_rows": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["row_kind", "he", "he_niqqud", "transliteration", "ru", "source_page", "confidence"],
                    "properties": {
                        "row_kind": {"type": "string", "enum": row_kind},
                        "he": {"type": "string"},
                        "he_niqqud": {"type": "string"},
                        "transliteration": {"type": "string"},
                        "ru": {"type": "string"},
                        "source_page": {"type": "integer", "minimum": 1, "maximum": 73},
                        "confidence": {"type": "string", "enum": ["high", "medium", "low", "not_found"]},
                    },
                },
            },
            "visuals": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["source_page", "kind", "required_for_solving", "readability", "labels_or_values"],
                    "properties": {
                        "source_page": {"type": "integer", "minimum": 1, "maximum": 73},
                        "kind": {"type": "string"},
                        "required_for_solving": {"type": "boolean"},
                        "readability": {"type": "string", "enum": ["readable", "partial", "unreadable", "not_found"]},
                        "labels_or_values": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            "legacy_findings": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["legacy_row_ref_sha256", "field", "severity", "category", "source_page", "recommended_reviewed_value"],
                    "properties": {
                        "legacy_row_ref_sha256": {"type": "string"},
                        "field": {"type": "string", "enum": ["boundary", "he", "he_niqqud", "transliteration", "ru", "formula", "unit", "visual", "identity"]},
                        "severity": {"type": "string", "enum": ["critical", "major", "minor", "none"]},
                        "category": {"type": "string"},
                        "source_page": {"type": "integer", "minimum": 1, "maximum": 73},
                        "recommended_reviewed_value": {"type": "string"},
                    },
                },
            },
            "unknowns": {"type": "array", "items": {"type": "string"}},
        },
    }
    return {
        "title": SCHEMA_ID,
        "description": "Source-corpus audit only; worked solutions and answer adjudication are forbidden.",
        "type": "object",
        "additionalProperties": False,
        "required": ["schema_id", "batch_id", "cases", "batch_summary"],
        "properties": {
            "schema_id": {"type": "string", "enum": [SCHEMA_ID]},
            "batch_id": {"type": "string", "enum": ["B01", "B02", "B03"]},
            "cases": {
                "type": "array", "minItems": 4, "maxItems": 4,
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["case_id", "tasks", "audit_summary"],
                    "properties": {
                        "case_id": {"type": "string"},
                        "tasks": {"type": "array", "minItems": 1, "maxItems": 2, "items": task_schema},
                        "audit_summary": summary_schema,
                    },
                },
            },
            "batch_summary": summary_schema,
        },
    }


def prompt_text() -> str:
    return """# Materials PB2 source-corpus shadow audit v1

Audit only the supplied problem conditions and source visuals. Do not solve a
problem, verify an answer, reproduce a worked solution, or infer missing
geometry. Source PDF pixels and the supplied task/page manifest outrank every
legacy row. Legacy rows are comparison evidence only and may mix conditions
with solutions. If source evidence is absent or unreadable, return `not_found`.

For each declared task ID: preserve its exact identity; transcribe and split the
condition into typed learning rows; produce plain Hebrew, vocalized Hebrew,
learner Latin transliteration, and faithful Russian; inventory required diagrams,
tables, labels, formulas, numerals, and units; then report legacy discrepancies
against exact row hashes. Do not merge, renumber, or borrow from a neighboring
task. Output only JSON conforming to the supplied schema.
"""


def build(args: argparse.Namespace) -> None:
    prepare = args.stable / "prepare"
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    tasks_doc = read_json(prepare / "task-manifest.json")
    diagrams_doc = read_json(prepare / "diagram-manifest.json")
    mapping = read_json(prepare / "reviewed-legacy-row-mapping.json")
    tasks = {item["task_id"]: item for item in tasks_doc["tasks"]}
    diagrams = {item["task_id"]: item for item in diagrams_doc["tasks"]}

    built_cases = []
    for spec in CASES:
        task_entries = []
        pages = set()
        for task_id in spec["task_ids"]:
            task = tasks[task_id]
            diagram = diagrams[task_id]
            anchor_pages = sorted({anchor["source_page"] for anchor in task["source_anchors"]})
            dependency_pages = sorted({page for dep in diagram["external_reference_dependencies"] for page in dep["source_pages"]})
            pages.update(anchor_pages)
            pages.update(dependency_pages)
            task_entries.append({
                "task_id": task_id,
                "display_alias": task["display_alias"],
                "task_record_sha256": task["task_record_sha256"],
                "source_anchors": task["source_anchors"],
                "semantic_visuals": diagram["semantic_visuals"],
                "external_reference_dependencies": diagram["external_reference_dependencies"],
            })
        refs = legacy_refs(mapping, spec["task_ids"])
        built_cases.append({
            **spec,
            "source_edition": SOURCE_EDITION,
            "tasks": task_entries,
            "input_source_pages": sorted(pages),
            "legacy_state": "NO_LEGACY_ROWS" if not refs else "HASH_BOUND_COMPARISON_ROWS_AVAILABLE",
            "legacy_row_count": sum(ref["row_count"] for ref in refs),
            "legacy_references": refs,
            "provider_output_truth_status": "GENERATED_UNREVIEWED_ADVISORY_ONLY",
        })

    by_case = {item["case_id"]: item for item in built_cases}
    built_batches = []
    for batch_id, case_ids in BATCHES:
        pages = sorted({page for case_id in case_ids for page in by_case[case_id]["input_source_pages"]})
        built_batches.append({
            "batch_id": batch_id,
            "case_ids": case_ids,
            "source_pages_once_per_batch": pages,
            "pdf_page_exposures": len(pages),
            "estimated_pdf_image_tokens": len(pages) * PDF_PAGE_TOKENS,
            "request_status": "BLOCKED_PENDING_OWNER_APPLY",
        })

    prompt = prompt_text()
    schema = build_schema()
    source_files = {}
    for name in ["task-manifest.json", "diagram-manifest.json", "reviewed-legacy-row-mapping.json", "prepared-input-manifest.json"]:
        source_files[name] = sha256_file(prepare / name)
    sample = {
        "schema": "linguistpro-materials-pb2-shadow-sample-v1",
        "status": "PLAN_COMPLETE_APPLY_BLOCKED",
        "source_edition": SOURCE_EDITION,
        "base_head": args.base_head,
        "source_manifest_sha256": source_files,
        "sample_policy": "12_STRATIFIED_CASES_SOURCE_CORPUS_ONLY_NO_SOLUTION_ADJUDICATION",
        "case_count": len(built_cases),
        "task_count": len({task_id for case in CASES for task_id in case["task_ids"]}),
        "cases": built_cases,
        "batches": built_batches,
    }
    page_exposures = sum(batch["pdf_page_exposures"] for batch in built_batches)
    max_cost = MAX_PROVIDER_CALLS * (
        INPUT_TOKEN_CAP * INPUT_USD_PER_M / 1_000_000
        + OUTPUT_TOKEN_CAP * OUTPUT_USD_PER_M / 1_000_000
    )
    cost = {
        "schema": "linguistpro-materials-pb2-shadow-cost-plan-v1",
        "status": "PROPOSED_NOT_APPROVED_NO_CALLS_MADE",
        "pricing_checked_on": "2026-08-30",
        "model": MODEL,
        "consumption_mode": "STANDARD",
        "thinking_level": "medium",
        "grounding_or_tools": False,
        "pricing_usd_per_1m_tokens": {"input": INPUT_USD_PER_M, "output_including_thinking": OUTPUT_USD_PER_M},
        "pdf_page_token_rule": PDF_PAGE_TOKENS,
        "primary_request_count": 3,
        "total_retry_budget": 1,
        "max_provider_calls": MAX_PROVIDER_CALLS,
        "input_token_cap_per_call": INPUT_TOKEN_CAP,
        "output_token_cap_per_call_including_thinking": OUTPUT_TOKEN_CAP,
        "planned_pdf_page_exposures": page_exposures,
        "planned_pdf_image_tokens": page_exposures * PDF_PAGE_TOKENS,
        "formula_max_usd": "calls * ((input_cap * input_rate) + (output_cap * output_rate)) / 1000000",
        "calculated_worst_case_usd": round(max_cost, 6),
        "proposed_hard_ceiling_usd": PROPOSED_CEILING_USD,
        "headroom_usd": round(PROPOSED_CEILING_USD - max_cost, 6),
        "apply_preconditions": [
            "owner_approves exact model, sample, standard mode, and MAX_USD=0.50",
            "owner confirms selected source and legacy condition rows may be sent to Gemini paid tier",
            "official price is rechecked; any increase or model drift returns to PLAN",
            "three cropped/page-faithful input PDFs pass local render read-back",
            "serialized request stays within input cap before every call",
        ],
        "provider_calls_made": 0,
        "secret_accessed": False,
    }
    resume = {
        "schema": "linguistpro-materials-pb2-shadow-resume-ledger-v1",
        "status": "TEMPLATE_NO_PROVIDER_WORK",
        "cache_root": "gemini-cache/materials-science-pb2-shadow/",
        "raw_cache_policy": "WRITE_ONCE_ATOMIC_NEVER_EDIT_IN_PLACE",
        "cache_identity_fields": ["model", "model_version", "prompt_sha256", "schema_sha256", "request_body_sha256", "source_input_sha256"],
        "batches": [{
            "batch_id": batch["batch_id"], "state": "PLANNED",
            "attempt_count": 0, "raw_response_sha256": None,
            "usage": None, "error_code": None,
        } for batch in built_batches],
        "resume_rule": "SKIP_ONLY_WHEN_IDENTITY_FIELDS_AND_RAW_RESPONSE_HASH_ALL_MATCH",
        "retry_rule": "ONE_TOTAL_RETRY_ONLY_FOR_TRANSPORT_OR_SCHEMA_FAILURE_NEVER_FOR_DISAGREEMENT",
    }
    verification = {
        "schema": "linguistpro-materials-pb2-shadow-plan-verification-v1",
        "status": "PASS_PLAN_ONLY_APPLY_BLOCKED",
        "checks": {
            "exactly_12_cases": len(built_cases) == 12,
            "exactly_13_unique_tasks": sample["task_count"] == 13,
            "exactly_3_batches": len(built_batches) == 3,
            "planned_page_exposures_20": page_exposures == 20,
            "planned_pdf_tokens_5160": page_exposures * PDF_PAGE_TOKENS == 5160,
            "q2_and_q32_have_no_legacy": all(by_case[case]["legacy_state"] == "NO_LEGACY_ROWS" for case in ["S03-MULTIPAGE-NO-LEGACY", "S08-VISUAL-NO-LEGACY"]),
            "duplicate_38_is_paired": len(by_case["S10-DUPLICATE-SOURCE-NUMBER-38"]["task_ids"]) == 2,
            "cost_formula_below_proposed_ceiling": max_cost <= PROPOSED_CEILING_USD,
            "provider_calls_zero": cost["provider_calls_made"] == 0,
            "secret_access_zero": cost["secret_accessed"] is False,
            "solution_generation_forbidden": "Do not solve" in prompt and schema["properties"]["batch_summary"]["properties"]["solution_content_generated"]["type"] == "boolean",
        },
    }
    if not all(verification["checks"].values()):
        raise RuntimeError(f"shadow plan verification failed: {verification['checks']}")

    write_json(out / "shadow-sample-manifest.json", sample)
    write_json(out / "shadow-audit-schema.json", schema)
    write_json(out / "shadow-cost-plan.json", cost)
    write_json(out / "shadow-resume-ledger.template.json", resume)
    write_json(out / "shadow-verification.json", verification)
    (out / "shadow-audit-prompt.md").write_text(prompt, encoding="utf-8")

    plan = f"""# Shadow PLAN — Материаловедение. Задачник 2

Статус: **PLAN COMPLETE / APPLY BLOCKED**. Provider calls: **0**. Secret access: **0**.

## Рекомендация

Использовать stable `{MODEL}` в Standard-режиме, `thinking_level=medium`, без
grounding/tools. Модель принимает PDF и structured output; runtime APPLY обязан
записать фактический `modelVersion` и остановиться, если он меняется между
батчами. Provider output остаётся `generated_unreviewed` и не переписывает canon.

Выборка: 12 кейсов / 13 task IDs / 3 resumable requests / 20 PDF page exposures
({page_exposures * PDF_PAGE_TOKENS} page-image tokens по опубликованному правилу). Полный список и
hash-bound legacy refs: `shadow-sample-manifest.json`.

## Cost governor (R16)

- 3 primary calls + не более 1 общего retry;
- hard cap: {INPUT_TOKEN_CAP:,} input и {OUTPUT_TOKEN_CAP:,} output/thinking tokens на call;
- worst case при тарифе ${INPUT_USD_PER_M}/M input и ${OUTPUT_USD_PER_M}/M output = **${max_cost:.6f}**;
- предлагаемый owner ceiling: **USD {PROPOSED_CEILING_USD:.2f}**;
- любое изменение цены/model/schema/sample возвращает работу в PLAN.

Актуальные основания: [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash),
[pricing](https://ai.google.dev/gemini-api/docs/pricing),
[PDF processing](https://ai.google.dev/gemini-api/docs/document-processing),
[structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

## APPLY protocol

1. Повторно проверить официальный тариф и получить явное подтверждение egress
   выбранных source pages и legacy condition candidates.
2. Локально собрать три page-faithful cropped PDF и визуально read-back; решение
   предыдущей задачи не должно попадать в crop.
3. Не читать и не копировать секрет в артефакты: runner получает ключ только в
   process environment; stdout/stderr и JSON redaction запрещают credential fields.
4. Перед каждым запросом проверить request hash и token caps. Сохранить complete
   raw response атомарно до normalization. Resume skips только exact identity hit.
5. Валидировать schema, task IDs, row kinds, Hebrew/niqqud consonant skeleton,
   numerals/formulas/units, diagram counts and source pages детерминированно.
6. Независимый manual source read-back оценивает provider findings. Та же модель
   не может быть единственным генератором и судьёй.

## Decision policy

- `LEGACY_REPAIR`: нет identity/boundary/source-leak critical; не более 1/12
  critical case; major+critical затрагивают <10% audited condition rows; каждый
  repair имеет exact page/row/hash anchor.
- `FULL_RERUN`: identity/boundary failure; solution leakage; одна системная
  категория в >=3 cases; critical defects в >=3/12 cases; либо major+critical
  затрагивают >=20% audited condition rows.
- `EXPAND_SHADOW`: промежуточная зона, расхождение manual/provider или
  недостаточно читаемый источник. Это безопасный третий исход; бинарный verdict
  нельзя выдавливать из неубедительной выборки.

Независимо от verdict, task identity, required diagrams, formulas and units
проверяются на 100% в Build. Shadow не авторизует Build, import, TTS или publish.

## Owner APPLY token

`APPROVE MATERIALS-PB2-SHADOW-APPLY MODEL={MODEL} MODE=STANDARD MAX_USD={PROPOSED_CEILING_USD:.2f}`

Дополнительно владелец должен явно подтвердить, что выбранные страницы исходника
и legacy condition candidates разрешено отправить в Gemini paid tier.
"""
    (out / "SHADOW_PLAN.md").write_text(plan, encoding="utf-8")
    readme = f"""# Materials PB2 shadow packet

Offline PLAN generated by:

`python scripts/premium/plan-materials-science-pb2-shadow.py --stable docs/research/materials-science-problem-corpus/2026-08-30 --base-head {args.base_head}`

Base repository HEAD: `{args.base_head}`. The target research files are local,
uncommitted artifacts. Start review with `SHADOW_PLAN.md`; JSON files are
deterministic plan/schema/sample/cost/resume evidence. `shadow-audit-prompt.md`
is the frozen provider instruction. No file in this directory is a raw provider
response, an approved correction, or scored corpus truth. Actual raw cache, if
later authorized, lives under the gitignored `gemini-cache/` root and is
represented here only by hash receipts.

Prompt SHA-256: `{sha256_text(prompt)}`
Schema SHA-256: `{sha256_text(json.dumps(schema, ensure_ascii=False, sort_keys=True, separators=(',', ':')))}`
"""
    (out / "README.md").write_text(readme, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--base-head", default="UNCOMMITTED_LOCAL_BASE")
    args = parser.parse_args()
    args.output = args.output or args.stable / "shadow"
    build(args)
    print(json.dumps({"status": "PASS_PLAN_ONLY_APPLY_BLOCKED", "output": str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
