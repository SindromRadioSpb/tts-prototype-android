#!/usr/bin/env python3
"""Aggregate the finite offline Materials Science PB2 Build.

This audit never calls providers, reads credentials, authors solutions, creates
audio, imports, or publishes. It proves the exact terminal local state and emits
the smallest separate repair gate needed before a canonical package can exist.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


SCHEMA = "linguistpro-materials-pb2-local-aggregate-v1"
SOURCE_EDITION = "problem-book-2-pdf-sha256-3d87b9f5"
TERMINAL_STATES = {
    "PASS2_CLOSED_1_PASS_9_INCOMPLETE_NO_THIRD_PASS",
    "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_json(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    args = parser.parse_args()
    stable = args.stable
    build = stable / "build"
    ledger = read_json(build / "local-build-ledger.json")
    plan = read_json(build / "local-build-plan.json")
    diagrams = read_json(stable / "prepare" / "diagram-manifest.json")

    if len(ledger["batches"]) != 6:
        raise RuntimeError("expected exactly six batches")
    if any(item["passes_completed"] != 2 or item["state"] not in TERMINAL_STATES for item in ledger["batches"]):
        raise RuntimeError("all six batches must be terminal before aggregate audit")

    task_index: list[dict[str, Any]] = []
    batch_summaries: list[dict[str, Any]] = []
    all_task_ids: list[str] = []
    all_blockers: Counter[str] = Counter()
    totals: Counter[str] = Counter()

    for number in range(1, 7):
        batch_id = f"B{number:02d}"
        batch_dir = build / f"batch-{batch_id}"
        pass1 = read_json(batch_dir / "pass1-canonical-candidates.json")
        final = read_json(batch_dir / "pass2-final-candidates.json")
        corrections = read_json(batch_dir / "pass2-correction-ledger.json")
        discrepancies = read_json(batch_dir / "pass2-final-discrepancy-ledger.json")
        verification = read_json(batch_dir / "pass2-verification.json")
        if not all(verification["checks"].values()):
            raise RuntimeError(f"{batch_id} terminal verification drift")
        if final["task_count"] != 10 or len(final["records"]) != 10:
            raise RuntimeError(f"{batch_id} task count drift")

        summary = {
            "batch_id": batch_id,
            "task_count": final["task_count"],
            "row_count": final["row_count"],
            "legacy_candidate_row_count": pass1["legacy_candidate_row_count"],
            "manual_source_transcription_row_count": pass1["manual_source_transcription_row_count"],
            "reviewed_row_count": final["reviewed_row_count"],
            "blocked_row_count": final["blocked_row_count"],
            "final_pass_task_count": len(final["final_pass_task_ids"]),
            "final_incomplete_task_count": len(final["final_incomplete_task_ids"]),
            "source_backed_correction_count": corrections["entry_count"],
            "source_anchor_correction_task_count": final["source_anchor_correction_task_count"],
            "final_discrepancy_count": discrepancies["entry_count"],
            "verification_status": verification["status"],
        }
        batch_summaries.append(summary)
        for field in (
            "task_count", "row_count", "legacy_candidate_row_count",
            "manual_source_transcription_row_count", "reviewed_row_count",
            "blocked_row_count", "final_pass_task_count",
            "final_incomplete_task_count", "source_backed_correction_count",
            "source_anchor_correction_task_count", "final_discrepancy_count",
        ):
            totals[field] += summary[field]

        for record in final["records"]:
            task_id = record["task_id"]
            all_task_ids.append(task_id)
            all_blockers.update(record.get("final_blockers", []))
            task_index.append({
                "task_id": task_id,
                "display_alias": record["display_alias"],
                "batch_id": batch_id,
                "final_disposition": record["final_disposition"],
                "row_count": len(record["rows"]),
                "reviewed_row_count": sum(
                    row.get("pass_2_row_status", "").startswith("PASS_") for row in record["rows"]
                ),
                "source_pages": [anchor["source_page"] for anchor in record["source_anchors"]],
                "source_anchor_rebuild_required": any(
                    anchor.get("prepared_asset_status") for anchor in record["source_anchors"]
                ),
                "semantic_visual_count": len(record["semantic_visuals"]),
                "external_reference_dependency_count": len(record["external_reference_dependencies"]),
                "final_blockers": record.get("final_blockers", []),
                "candidate_task_sha256": record["candidate_task_sha256"],
            })

    if len(all_task_ids) != 60 or len(set(all_task_ids)) != 60:
        raise RuntimeError("aggregate task identity drift")
    if [item["task_id"] for item in task_index] != [
        task_id for batch in plan["batches"] for task_id in batch["task_ids"]
    ]:
        raise RuntimeError("aggregate task order drift")

    final_pass = [item["task_id"] for item in task_index if item["final_disposition"] == "PASS"]
    final_incomplete = [item["task_id"] for item in task_index if item["final_disposition"] == "INCOMPLETE"]
    package_ready = not final_incomplete
    checks = {
        "six_terminal_batches": len(batch_summaries) == 6,
        "sixty_unique_tasks": len(all_task_ids) == len(set(all_task_ids)) == 60,
        "all_rows_accounted_for": totals["reviewed_row_count"] + totals["blocked_row_count"] == totals["row_count"],
        "one_pass_fifty_nine_incomplete": len(final_pass) == 1 and len(final_incomplete) == 59,
        "all_visuals_classified": diagrams["task_count"] == 60 and diagrams["status"].startswith("PASS_"),
        "no_provider_secret_solution_audio_import_publication": all(not ledger[field] for field in (
            "secret_accessed", "import_executed", "publication_executed",
            "solution_work_executed", "audio_work_executed",
        )) and ledger["provider_calls_made"] == 0,
        "canonical_package_fail_closed": package_ready is False,
    }
    if not all(checks.values()):
        raise RuntimeError(f"aggregate verification failed: {checks}")

    index = {
        "schema": f"{SCHEMA}.task-index",
        "status": "TERMINAL_LOCAL_CANDIDATE_INDEX_NOT_CANONICAL_NOT_IMPORTABLE",
        "source_edition": SOURCE_EDITION,
        "task_count": len(task_index),
        "records": task_index,
    }
    index["artifact_sha256"] = sha256_json(index)

    audit = {
        "schema": f"{SCHEMA}.audit",
        "status": "PASS_LOCAL_BUILD_ALL_60_TERMINALLY_CLASSIFIED_CANONICAL_PACKAGE_BLOCKED",
        "audited_on": "2026-08-30",
        "source_edition": SOURCE_EDITION,
        "checks": checks,
        "batch_summaries": batch_summaries,
        "totals": {
            "batch_count": 6,
            "task_count": 60,
            "row_count": totals["row_count"],
            "legacy_candidate_row_count": totals["legacy_candidate_row_count"],
            "manual_source_transcription_row_count": totals["manual_source_transcription_row_count"],
            "reviewed_row_count": totals["reviewed_row_count"],
            "blocked_row_count": totals["blocked_row_count"],
            "final_pass_task_count": len(final_pass),
            "final_incomplete_task_count": len(final_incomplete),
            "source_backed_correction_count": totals["source_backed_correction_count"],
            "source_anchor_correction_task_count": totals["source_anchor_correction_task_count"],
            "final_discrepancy_count": totals["final_discrepancy_count"],
            "tasks_with_semantic_visuals": diagrams["tasks_with_semantic_visuals"],
            "semantic_visual_instance_count": diagrams["semantic_visual_instance_count"],
            "tasks_with_external_reference_dependencies": diagrams["tasks_with_external_reference_dependencies"],
        },
        "final_pass_task_ids": final_pass,
        "final_incomplete_task_ids": final_incomplete,
        "blocker_counts": dict(sorted(all_blockers.items())),
        "canonical_package": {
            "ready": False,
            "emitted": False,
            "reason": "59_OF_60_TASKS_TERMINAL_INCOMPLETE_AND_642_OF_693_ROWS_BLOCKED",
        },
        "physics_parity_reference": {
            "corpus_title": "Физика — задачник, 1 год",
            "task_count": 74,
            "row_count": 425,
            "learning_columns": ["he_plain", "he_niqqud", "translit", "ru"],
            "audio_assets": 394,
            "required_materials_delta": [
                "independently_review_all_source_and_four_learning_columns",
                "materialize_corrected_source_anchors_and_all required visuals",
                "bake_and_verify_learning_bundle",
                "separately approve and generate row audio plus word timing sidecars",
            ],
        },
        "provider_calls": 0,
        "secret_access": False,
        "solution_work": False,
        "audio_work": False,
        "import_executed": False,
        "publication_executed": False,
        "task_index_sha256": index["artifact_sha256"],
    }
    audit["artifact_sha256"] = sha256_json(audit)

    repair_gate = {
        "schema": f"{SCHEMA}.repair-gate",
        "status": "OWNER_DECISION_REQUIRED_NOT_APPROVED_NOT_EXECUTABLE",
        "program": "MATERIALS-PB2-SEPARATE-CANONICAL-REPAIR",
        "why_separate": "THE_APPROVED_TWO_PASS_BUILD_IS_TERMINAL; THIS_IS_NOT_A_THIRD_PASS",
        "finite_scope": {
            "task_ids": final_incomplete,
            "task_count": len(final_incomplete),
            "blocked_row_count": totals["blocked_row_count"],
            "source_anchor_rebuild_task_ids": [
                item["task_id"] for item in task_index if item["source_anchor_rebuild_required"]
            ],
            "maximum_provider_generation_passes": 1,
            "maximum_failed_row_repair_passes": 1,
            "no_open_ended_iterations": True,
        },
        "recommended_mode": "SOURCE_FIRST_REPAIR_REUSING_LEGACY_COLUMNS_AS_COMPARISON_ONLY",
        "required_owner_parameters": [
            "provider_and_model",
            "hard_max_usd",
            "approved_source_page_egress",
            "approved_legacy_condition_candidate_egress",
        ],
        "still_not_authorized": [
            "credential_access", "provider_calls", "solution_work", "audio_apply",
            "import", "publication",
        ],
        "terminal_acceptance": {
            "all_60_tasks_pass": True,
            "all_source_strings_independently_reviewed": True,
            "all_four_learning_columns_nonempty_and_validated": True,
            "all_required_visuals_and_appendices_materialized": True,
            "zero_critical_or_major_unresolved_discrepancies": True,
            "deterministic_bundle_readback": True,
        },
    }
    repair_gate["artifact_sha256"] = sha256_json(repair_gate)

    ledger2 = copy.deepcopy(ledger)
    ledger2["status"] = "LOCAL_BUILD_ALL_6_BATCHES_TERMINAL_AGGREGATE_AUDITED"
    ledger2["next_action"] = "SEPARATE_CANONICAL_REPAIR_OWNER_DECISION_REQUIRED"
    ledger2["aggregate_audit_sha256"] = audit["artifact_sha256"]
    ledger2["provider_calls_made"] = 0
    ledger2["secret_accessed"] = False
    ledger2["import_executed"] = False
    ledger2["publication_executed"] = False
    ledger2["solution_work_executed"] = False
    ledger2["audio_work_executed"] = False
    plan2 = copy.deepcopy(plan)
    plan2["status"] = "OWNER_APPROVED_LOCAL_BUILD_ALL_6_BATCHES_TERMINAL_AGGREGATE_AUDITED"

    report = f"""# Materials Science PB2 - aggregate local Build audit

Status: **ALL 60 TASKS TERMINALLY CLASSIFIED / CANONICAL PACKAGE BLOCKED**.

- batches: 6 of 6, exactly two passes maximum, no third pass;
- tasks: 60 ({len(final_pass)} PASS, {len(final_incomplete)} INCOMPLETE);
- condition rows: {totals['row_count']} ({totals['reviewed_row_count']} reviewed, {totals['blocked_row_count']} blocked);
- source-backed corrections: {totals['source_backed_correction_count']};
- semantic visuals: {diagrams['semantic_visual_instance_count']} instances across {diagrams['tasks_with_semantic_visuals']} tasks;
- provider calls / secret access / solutions / audio / import / publication: **0 / false / 0 / 0 / 0 / 0**.

No canonical ZIP was emitted. The only next content step is the separately
authorized, finite canonical-repair program described in
`separate-canonical-repair-gate.json`. Audio, solutions, import and publication
remain later independent owner gates.
"""

    write_json(build / "terminal-task-index.json", index)
    write_json(build / "aggregate-terminal-audit.json", audit)
    write_json(build / "separate-canonical-repair-gate.json", repair_gate)
    write_json(build / "local-build-ledger.json", ledger2)
    write_json(build / "local-build-plan.json", plan2)
    (build / "AGGREGATE_TERMINAL_AUDIT.md").write_text(report, encoding="utf-8")
    print(json.dumps({
        "status": audit["status"], "tasks": 60, "pass": len(final_pass),
        "incomplete": len(final_incomplete), "rows": totals["row_count"],
        "reviewed": totals["reviewed_row_count"], "blocked": totals["blocked_row_count"],
        "package_emitted": False, "provider_calls": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
