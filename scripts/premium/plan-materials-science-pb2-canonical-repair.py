#!/usr/bin/env python3
"""Plan the separate, finite Materials PB2 canonical text repair.

This command is intentionally offline. It reads only committed/local corpus
artifacts, never reads a credential, never calls a provider, and never imports,
publishes, creates audio, or touches solution material.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any


SCHEMA = "linguistpro-materials-pb2-canonical-repair-plan-v1"
EXPECTED_AUDIT_STATUS = "PASS_LOCAL_BUILD_ALL_60_TERMINALLY_CLASSIFIED_CANONICAL_PACKAGE_BLOCKED"
EXPECTED_GATE_STATUS = "OWNER_DECISION_REQUIRED_NOT_APPROVED_NOT_EXECUTABLE"
MODEL = "gemini-3.7-flash"
MODE = "STANDARD"
THINKING_LEVEL = "medium"
INPUT_RATE = 0.75
OUTPUT_RATE = 3.75
INPUT_CAP = 50_000
OUTPUT_CAP = 32_768
PDF_PAGE_TOKENS = 258
PRIMARY_CALLS = 6
MAX_FAILED_ROW_REPAIR_CALLS = 6
HARD_MAX_USD = 2.0


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_json(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def essential_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "row_id": row["row_id"],
        "semantic_kind": row["semantic_kind"],
        "he": row.get("he"),
        "he_niqqud": row.get("he_niqqud"),
        "transliteration": row.get("transliteration"),
        "ru": row.get("ru"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    args = parser.parse_args()
    stable = args.stable.resolve()
    build = stable / "build"

    audit = read_json(build / "aggregate-terminal-audit.json")
    gate = read_json(build / "separate-canonical-repair-gate.json")
    if audit["status"] != EXPECTED_AUDIT_STATUS:
        raise RuntimeError("aggregate audit is not at the expected fail-closed boundary")
    if gate["status"] != EXPECTED_GATE_STATUS:
        raise RuntimeError("repair gate is not awaiting a fresh owner decision")

    batches: list[dict[str, Any]] = []
    total_estimated_input = 0
    total_estimated_output = 0
    all_blocked_ids: list[str] = []
    for batch_number in range(1, 7):
        batch_id = f"B{batch_number:02d}"
        candidate = read_json(build / f"batch-{batch_id}" / "pass2-final-candidates.json")
        repair_records = [
            record for record in candidate["records"]
            if any(not row["pass_2_row_status"].startswith("PASS_") for row in record["rows"])
        ]
        blocked = [
            essential_row(row)
            for record in repair_records
            for row in record["rows"]
            if not row["pass_2_row_status"].startswith("PASS_")
        ]
        blocked_ids = [row["row_id"] for row in blocked]
        all_blocked_ids.extend(blocked_ids)
        pages = sorted(
            {anchor["source_page"] for record in repair_records for anchor in record["source_anchors"]}
            | {
                page
                for record in repair_records
                for dependency in record["external_reference_dependencies"]
                for page in dependency["source_pages"]
            }
        )
        serialized_chars = len(json.dumps(blocked, ensure_ascii=False, separators=(",", ":")))
        candidate_token_ceiling = math.ceil(serialized_chars / 2.5)
        estimated_input = candidate_token_ceiling + len(pages) * PDF_PAGE_TOKENS + 1_500
        estimated_output = min(OUTPUT_CAP, candidate_token_ceiling + 2_000)
        if estimated_input > INPUT_CAP or estimated_output > OUTPUT_CAP:
            raise RuntimeError(f"{batch_id} exceeds a request cap and must be split before approval")
        total_estimated_input += estimated_input
        total_estimated_output += estimated_output
        batches.append(
            {
                "batch_id": batch_id,
                "task_count": len(repair_records),
                "task_ids": [record["task_id"] for record in repair_records],
                "blocked_row_count": len(blocked),
                "blocked_row_ids": blocked_ids,
                "source_pages": pages,
                "candidate_serialized_chars": serialized_chars,
                "candidate_token_ceiling": candidate_token_ceiling,
                "estimated_primary_input_tokens": estimated_input,
                "estimated_primary_output_tokens": estimated_output,
                "primary_call_limit": 1,
                "failed_row_repair_call_limit": 1,
            }
        )

    if len(all_blocked_ids) != audit["totals"]["blocked_row_count"] or len(set(all_blocked_ids)) != len(all_blocked_ids):
        raise RuntimeError("blocked-row inventory does not match the terminal aggregate audit")

    max_calls = PRIMARY_CALLS + MAX_FAILED_ROW_REPAIR_CALLS
    worst_case_usd = max_calls * ((INPUT_CAP * INPUT_RATE) + (OUTPUT_CAP * OUTPUT_RATE)) / 1_000_000
    estimated_primary_usd = (
        total_estimated_input * INPUT_RATE + total_estimated_output * OUTPUT_RATE
    ) / 1_000_000
    if worst_case_usd > HARD_MAX_USD:
        raise RuntimeError("the proposed hard ceiling does not cover the declared worst-case envelope")

    approval_token = (
        "APPROVE MATERIALS-PB2-SEPARATE-CANONICAL-REPAIR "
        f"MODEL={MODEL} MODE={MODE} MAX_USD={HARD_MAX_USD:.2f} "
        "MAX_CALLS=12 EGRESS=SOURCE_PAGES_AND_LEGACY_CONDITION_CANDIDATES "
        "CREDENTIAL=OWNER_APPROVED_LOCAL_READ_ONLY_NO_PERSIST"
    )
    plan: dict[str, Any] = {
        "schema": SCHEMA,
        "status": "PLANNED_NOT_APPROVED_NO_PROVIDER_CALLS",
        "planned_on": "2026-08-30",
        "basis_audit_sha256": audit["artifact_sha256"],
        "basis_repair_gate_sha256": gate["artifact_sha256"],
        "provider": {
            "model": MODEL,
            "mode": MODE,
            "thinking_level": THINKING_LEVEL,
            "grounding_or_tools": False,
            "pricing_checked_on": "2026-08-30",
            "pricing_usd_per_1m_tokens": {
                "input": INPUT_RATE,
                "output_including_thinking": OUTPUT_RATE,
            },
        },
        "finite_execution": {
            "primary_generation_passes": 1,
            "failed_row_repair_passes": 1,
            "primary_call_count": PRIMARY_CALLS,
            "maximum_failed_row_repair_calls": MAX_FAILED_ROW_REPAIR_CALLS,
            "maximum_provider_calls": max_calls,
            "input_token_cap_per_call": INPUT_CAP,
            "output_token_cap_per_call_including_thinking": OUTPUT_CAP,
            "no_third_pass": True,
            "no_open_ended_iterations": True,
        },
        "cost": {
            "estimated_primary_input_tokens": total_estimated_input,
            "estimated_primary_output_tokens": total_estimated_output,
            "estimated_primary_usd": round(estimated_primary_usd, 6),
            "calculated_all_calls_at_caps_usd": round(worst_case_usd, 6),
            "hard_max_usd": HARD_MAX_USD,
            "stop_before_call_if_next_call_can_exceed_hard_max": True,
        },
        "egress_allowlist": {
            "source_pages": sorted({page for batch in batches for page in batch["source_pages"]}),
            "legacy_candidate_fields": ["row_id", "semantic_kind", "he", "he_niqqud", "transliteration", "ru"],
            "solutions": False,
            "answer_tables": False,
            "credentials": False,
            "unrelated_library_rows": False,
        },
        "output_contract": {
            "provider_returns_only": ["row_id", "he", "he_niqqud", "transliteration", "ru"],
            "provider_must_not_return_status_or_severity_enums": True,
            "local_validator_owns_all_statuses_and_dispositions": True,
            "each_input_row_id_exactly_once": True,
            "plain_hebrew_must_not_contain_niqqud": True,
            "hebrew_skeleton_must_match_vocalized_hebrew": True,
            "empty_or_extra_rows_fail_closed": True,
        },
        "batches": batches,
        "stop_conditions": [
            "HARD_MAX_USD_WOULD_BE_EXCEEDED",
            "MODEL_OR_PRICE_DRIFT",
            "INPUT_OR_OUTPUT_CAP_WOULD_BE_EXCEEDED",
            "SOURCE_PAGE_OR_ROW_INVENTORY_HASH_DRIFT",
            "BATCH_STILL_INVALID_AFTER_ITS_SINGLE_FAILED_ROW_REPAIR_CALL",
        ],
        "post_provider_boundary": {
            "required_before_canonical_package": [
                "strict local schema and row-identity validation",
                "source-string and Hebrew-skeleton validation",
                "diagram and appendix materialization read-back",
                "all 60 task dispositions PASS",
                "deterministic package read-back",
            ],
            "still_requires_separate_owner_approval": ["audio_apply", "import", "publication"],
            "solution_work_out_of_scope": True,
        },
        "exact_owner_approval_token": approval_token,
        "provider_calls_made": 0,
        "secret_accessed": False,
    }
    plan["artifact_sha256"] = sha256_json(plan)
    write_json(build / "separate-canonical-repair-execution-plan.json", plan)

    markdown = f"""# Materials PB2 — separate canonical repair execution plan

Status: `PLANNED_NOT_APPROVED_NO_PROVIDER_CALLS`

- Scope: {audit['totals']['final_incomplete_task_count']} incomplete tasks / {audit['totals']['blocked_row_count']} blocked rows.
- Primary execution: exactly 6 batch calls, one per B01–B06.
- Repair allowance: at most one failed-row call per batch; 12 calls total maximum; no third pass.
- Estimated primary cost: `${estimated_primary_usd:.6f}`.
- Worst case with every call at both token caps: `${worst_case_usd:.6f}`.
- Hard stop: `$2.00` before any call that could exceed it.
- Provider output is text-only (`row_id` plus four learning columns); all enums and dispositions are local.
- Solutions, answer tables, audio, import, and publication remain excluded.

## Exact owner approval token

`{approval_token}`

Until that exact decision (or an equally explicit equivalent), no credential may be read and no provider call may run.
"""
    (build / "SEPARATE_CANONICAL_REPAIR_EXECUTION_PLAN.md").write_text(markdown, encoding="utf-8")

    print(
        json.dumps(
            {
                "status": plan["status"],
                "tasks": audit["totals"]["final_incomplete_task_count"],
                "rows": len(all_blocked_ids),
                "primary_calls": PRIMARY_CALLS,
                "maximum_calls": max_calls,
                "estimated_primary_usd": round(estimated_primary_usd, 6),
                "hard_max_usd": HARD_MAX_USD,
                "provider_calls": 0,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
