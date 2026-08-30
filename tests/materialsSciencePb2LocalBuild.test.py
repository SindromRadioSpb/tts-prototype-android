import ast
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STABLE = ROOT / "docs" / "research" / "materials-science-problem-corpus" / "2026-08-30"
BUILD = STABLE / "build"
SCRIPT = ROOT / "scripts" / "premium" / "build-materials-science-pb2-local.py"
AUDIT_SCRIPT = ROOT / "scripts" / "premium" / "audit-materials-science-pb2-local.py"
REPAIR_PLAN_SCRIPT = ROOT / "scripts" / "premium" / "plan-materials-science-pb2-canonical-repair.py"
REPAIR_PREPARE_SCRIPT = ROOT / "scripts" / "premium" / "prepare-materials-science-pb2-canonical-repair.py"
REPAIR_APPLY_SCRIPT = ROOT / "scripts" / "premium" / "apply-materials-science-pb2-canonical-repair.py"
CANONICAL_BAKE_SCRIPT = ROOT / "scripts" / "premium" / "bake-materials-science-pb2-canonical.py"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class MaterialsSciencePb2LocalBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.approval = read_json(BUILD / "local-build-approval.json")
        cls.plan = read_json(BUILD / "local-build-plan.json")
        cls.ledger = read_json(BUILD / "local-build-ledger.json")
        cls.candidates = read_json(BUILD / "batch-B01" / "pass1-canonical-candidates.json")
        cls.discrepancies = read_json(BUILD / "batch-B01" / "pass1-discrepancy-ledger.json")
        cls.verification = read_json(BUILD / "batch-B01" / "pass1-verification.json")
        cls.final_candidates = read_json(BUILD / "batch-B01" / "pass2-final-candidates.json")
        cls.corrections = read_json(BUILD / "batch-B01" / "pass2-correction-ledger.json")
        cls.final_discrepancies = read_json(BUILD / "batch-B01" / "pass2-final-discrepancy-ledger.json")
        cls.final_verification = read_json(BUILD / "batch-B01" / "pass2-verification.json")
        cls.b02_candidates = read_json(BUILD / "batch-B02" / "pass1-canonical-candidates.json")
        cls.b02_discrepancies = read_json(BUILD / "batch-B02" / "pass1-discrepancy-ledger.json")
        cls.b02_verification = read_json(BUILD / "batch-B02" / "pass1-verification.json")
        cls.b02_final_candidates = read_json(BUILD / "batch-B02" / "pass2-final-candidates.json")
        cls.b02_corrections = read_json(BUILD / "batch-B02" / "pass2-correction-ledger.json")
        cls.b02_final_discrepancies = read_json(BUILD / "batch-B02" / "pass2-final-discrepancy-ledger.json")
        cls.b02_final_verification = read_json(BUILD / "batch-B02" / "pass2-verification.json")
        cls.b03_candidates = read_json(BUILD / "batch-B03" / "pass1-canonical-candidates.json")
        cls.b03_discrepancies = read_json(BUILD / "batch-B03" / "pass1-discrepancy-ledger.json")
        cls.b03_verification = read_json(BUILD / "batch-B03" / "pass1-verification.json")
        cls.b03_final_candidates = read_json(BUILD / "batch-B03" / "pass2-final-candidates.json")
        cls.b03_corrections = read_json(BUILD / "batch-B03" / "pass2-correction-ledger.json")
        cls.b03_final_discrepancies = read_json(BUILD / "batch-B03" / "pass2-final-discrepancy-ledger.json")
        cls.b03_final_verification = read_json(BUILD / "batch-B03" / "pass2-verification.json")
        cls.later_batches = {
            batch_id: {
                "pass1": read_json(BUILD / f"batch-{batch_id}" / "pass1-canonical-candidates.json"),
                "final": read_json(BUILD / f"batch-{batch_id}" / "pass2-final-candidates.json"),
                "corrections": read_json(BUILD / f"batch-{batch_id}" / "pass2-correction-ledger.json"),
                "verification": read_json(BUILD / f"batch-{batch_id}" / "pass2-verification.json"),
            }
            for batch_id in ("B04", "B05", "B06")
        }
        cls.aggregate_audit = read_json(BUILD / "aggregate-terminal-audit.json")
        cls.terminal_index = read_json(BUILD / "terminal-task-index.json")
        cls.repair_gate = read_json(BUILD / "separate-canonical-repair-gate.json")
        cls.repair_plan = read_json(BUILD / "separate-canonical-repair-execution-plan.json")
        cls.repair_preflight_root = STABLE / "repair" / "preflight"
        cls.repair_preflight = read_json(cls.repair_preflight_root / "canonical-repair-preflight-manifest.json")
        cls.repair_anchor_corrections = read_json(cls.repair_preflight_root / "source-anchor-repair-ledger.json")
        cls.repair_preflight_determinism = read_json(cls.repair_preflight_root / "determinism-verification.json")

    def test_owner_approval_is_the_exact_finite_local_envelope(self):
        self.assertEqual(self.approval["status"], "OWNER_APPROVED")
        self.assertEqual(self.approval["interpreted_approval"], {
            "program": "MATERIALS-PB2-LOCAL-BUILD",
            "batches": 6,
            "tasks_per_batch": 10,
            "maximum_passes_per_batch": 2,
            "provider_calls_allowed": 0,
            "import_allowed": False,
            "publication_allowed": False,
            "solution_authoring_or_adjudication_allowed": False,
            "audio_allowed": False,
        })
        self.assertIn("NO_THIRD_PASS", self.approval["terminal_batch_rule"])

    def test_plan_has_six_disjoint_batches_of_ten_and_no_expansive_authority(self):
        self.assertEqual(self.plan["batch_count"], 6)
        self.assertEqual(self.plan["batch_size"], 10)
        self.assertEqual(self.plan["expected_task_count"], 60)
        self.assertEqual(self.plan["maximum_passes_per_batch"], 2)
        self.assertEqual(self.plan["provider_calls_allowed"], 0)
        self.assertFalse(self.plan["import_allowed"])
        self.assertFalse(self.plan["publication_allowed"])
        self.assertFalse(self.plan["solution_authoring_or_adjudication_allowed"])
        self.assertFalse(self.plan["audio_allowed"])
        task_ids = [task_id for batch in self.plan["batches"] for task_id in batch["task_ids"]]
        self.assertEqual(len(task_ids), 60)
        self.assertEqual(len(set(task_ids)), 60)
        self.assertTrue(all(batch["task_count"] == 10 for batch in self.plan["batches"]))
        self.assertTrue(all(batch["maximum_passes"] == 2 for batch in self.plan["batches"]))

    def test_ledger_records_all_six_batches_terminal_with_the_terminal_rule(self):
        batches = self.ledger["batches"]
        self.assertEqual(batches[0]["passes_completed"], 2)
        self.assertEqual(batches[0]["state"], "PASS2_CLOSED_1_PASS_9_INCOMPLETE_NO_THIRD_PASS")
        self.assertEqual(batches[0]["final_pass_task_count"], 1)
        self.assertEqual(batches[0]["final_incomplete_task_count"], 9)
        self.assertEqual(batches[1]["passes_completed"], 2)
        self.assertEqual(batches[1]["state"], "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS")
        self.assertEqual(batches[1]["final_pass_task_count"], 0)
        self.assertEqual(batches[1]["final_incomplete_task_count"], 10)
        self.assertEqual(batches[2]["passes_completed"], 2)
        self.assertEqual(batches[2]["state"], "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS")
        self.assertEqual(batches[2]["final_pass_task_count"], 0)
        self.assertEqual(batches[2]["final_incomplete_task_count"], 10)
        self.assertTrue(all(batch["passes_completed"] == 2 for batch in batches[3:]))
        self.assertTrue(all(
            batch["state"] == "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS"
            for batch in batches[3:]
        ))
        self.assertEqual(self.ledger["next_action"], "SEPARATE_CANONICAL_REPAIR_OWNER_DECISION_REQUIRED")
        self.assertEqual(
            self.ledger["status"],
            "LOCAL_BUILD_ALL_6_BATCHES_TERMINAL_AGGREGATE_AUDITED",
        )
        self.assertEqual(self.ledger["provider_calls_made"], 0)
        for field in (
            "secret_accessed", "import_executed", "publication_executed",
            "solution_work_executed", "audio_work_executed",
        ):
            self.assertFalse(self.ledger[field], field)

    def test_b01_pass1_is_source_bound_but_explicitly_not_canonical(self):
        self.assertEqual(self.candidates["task_count"], 10)
        self.assertEqual(self.candidates["row_count"], 82)
        self.assertEqual(self.candidates["legacy_candidate_row_count"], 73)
        self.assertEqual(self.candidates["manual_source_transcription_row_count"], 9)
        self.assertEqual(self.candidates["rows_with_niqqud_marks"], 72)
        self.assertEqual(self.candidates["hebrew_skeleton_mismatch_count"], 43)
        self.assertEqual(self.candidates["provider_calls"], 0)
        self.assertFalse(self.candidates["secret_access"])
        self.assertFalse(self.candidates["solution_rows_included"])
        self.assertIn("NOT_CANONICAL", self.candidates["status"])
        self.assertTrue(all(record["source_anchors"] for record in self.candidates["records"]))
        self.assertTrue(all(not record["solution_rows_included"] for record in self.candidates["records"]))
        self.assertTrue(all(not record["provider_output_used"] for record in self.candidates["records"]))

    def test_legacy_rows_retain_four_columns_and_hash_evidence(self):
        legacy_rows = [
            row
            for record in self.candidates["records"]
            for row in record["rows"]
            if row["legacy_evidence"] is not None
        ]
        self.assertEqual(len(legacy_rows), 73)
        for row in legacy_rows:
            for field in ("he", "he_niqqud", "transliteration", "ru"):
                self.assertIsInstance(row[field], str)
            self.assertRegex(row["legacy_evidence"]["aligned_row_sha256"], r"^[0-9a-f]{64}$")
            self.assertEqual(row["learning_columns_status"], "LEGACY_CANDIDATE_UNREVIEWED")

    def test_manual_source_rows_remain_null_for_unreviewed_derived_columns(self):
        manual_by_task = {}
        for record in self.candidates["records"]:
            rows = [row for row in record["rows"] if row["legacy_evidence"] is None]
            if rows:
                manual_by_task[record["task_id"]] = rows
        self.assertEqual({key: len(value) for key, value in manual_by_task.items()}, {
            "materials-science-y1-pb2-q002": 8,
            "materials-science-y1-pb2-q008": 1,
        })
        for rows in manual_by_task.values():
            for row in rows:
                self.assertIsNone(row["he_niqqud"])
                self.assertIsNone(row["transliteration"])
                self.assertIsNone(row["ru"])

    def test_discrepancy_and_verification_ledgers_fail_closed(self):
        self.assertEqual(len(self.discrepancies["entries"]), 15)
        self.assertEqual(self.verification["open_discrepancy_count"], 15)
        self.assertEqual(len(self.verification["incomplete_task_ids"]), 9)
        self.assertTrue(all(self.verification["checks"].values()))
        mismatch_rows = {
            row_id
            for entry in self.discrepancies["entries"]
            if entry["class"] == "HE_AND_HE_NIQQUD_CONSONANT_SKELETON_DISAGREE"
            for row_id in entry["affected_row_ids"]
        }
        self.assertEqual(mismatch_rows, set(self.candidates["hebrew_skeleton_mismatch_row_ids"]))

    def test_pass2_terminally_classifies_every_task_without_a_third_pass(self):
        final = self.final_candidates
        self.assertEqual(final["pass_number"], 2)
        self.assertEqual(final["maximum_passes"], 2)
        self.assertEqual(final["task_count"], 10)
        self.assertEqual(final["row_count"], 82)
        self.assertEqual(final["reviewed_row_count"], 2)
        self.assertEqual(final["blocked_row_count"], 80)
        self.assertEqual(final["final_pass_task_ids"], ["materials-science-y1-pb2-q001"])
        self.assertEqual(len(final["final_incomplete_task_ids"]), 9)
        self.assertTrue(all(
            record["final_disposition"] in {"PASS", "INCOMPLETE"}
            for record in final["records"]
        ))
        self.assertTrue(all(self.final_verification["checks"].values()))
        self.assertIn("NO_THIRD_PASS", self.final_verification["status"])

    def test_pass2_corrections_are_allowlisted_and_source_bound(self):
        self.assertEqual(self.corrections["entry_count"], 6)
        self.assertEqual(self.final_candidates["text_correction_count"], 2)
        self.assertEqual(self.final_candidates["source_anchor_correction_task_count"], 4)
        self.assertTrue(all(
            entry["source_pdf_sha256"] == self.final_candidates["source_pdf_sha256"]
            for entry in self.corrections["entries"]
        ))
        heading = next(
            entry for entry in self.corrections["entries"]
            if entry.get("row_id") == "materials-science-y1-pb2-q007-r001"
        )
        self.assertEqual(heading["before"]["he"], "שאלה 2017")
        self.assertEqual(heading["after"]["he"], "שאלה 7.")
        q5_anchor = next(
            entry for entry in self.corrections["entries"]
            if entry["correction_type"] == "SOURCE_ANCHOR"
            and entry["task_id"] == "materials-science-y1-pb2-q005"
        )
        self.assertEqual([item["source_page"] for item in q5_anchor["after"]], [6, 7])

    def test_pass2_preserves_pass1_and_does_not_create_an_import_package(self):
        self.assertEqual(self.candidates["pass_number"], 1)
        self.assertEqual(self.verification["status"], "PASS_B01_PASS1_CANDIDATES_NOT_CANONICAL_PASS2_REQUIRED")
        self.assertIn("NOT_IMPORTABLE", self.final_candidates["status"])
        self.assertEqual(self.final_discrepancies["entry_count"], 16)
        self.assertFalse(any(BUILD.rglob("*.zip")))
        self.assertFalse(any(BUILD.rglob("*.mp3")))

    def test_b02_pass1_is_source_bound_and_explicitly_incomplete(self):
        candidates = self.b02_candidates
        self.assertEqual(candidates["batch_id"], "B02")
        self.assertEqual(candidates["pass_number"], 1)
        self.assertEqual(candidates["task_count"], 10)
        self.assertEqual(candidates["row_count"], 157)
        self.assertEqual(candidates["legacy_candidate_row_count"], 150)
        self.assertEqual(candidates["manual_source_transcription_row_count"], 7)
        self.assertEqual(candidates["hebrew_skeleton_mismatch_count"], 39)
        self.assertEqual(candidates["plain_hebrew_rows_with_niqqud_marks"], 22)
        self.assertIn("NOT_CANONICAL", candidates["status"])
        self.assertIn("NOT_IMPORTABLE", candidates["status"])
        self.assertTrue(all(
            record["pass_1_status"].startswith("INCOMPLETE_")
            for record in candidates["records"]
        ))
        self.assertEqual(len(self.b02_verification["incomplete_task_ids"]), 10)
        self.assertTrue(all(self.b02_verification["checks"].values()))

    def test_b02_q016_selects_source_matching_duplicate_without_merge(self):
        q16 = next(
            record for record in self.b02_candidates["records"]
            if record["task_id"] == "materials-science-y1-pb2-q016"
        )
        evidence = q16["duplicate_legacy_evidence"]
        self.assertEqual(evidence["selected_source_fact"], "Ø50 mm")
        self.assertEqual(evidence["rejected_conflicting_fact"], "Ø35 mm")
        self.assertNotEqual(evidence["selected_rows_sha256"], evidence["rejected_rows_sha256"])
        self.assertEqual(
            evidence["comparison"],
            "CONFLICTING_DUPLICATES_SOURCE_MATCHING_CARD_SELECTED_NO_MERGE",
        )
        selected_keys = {
            row["legacy_evidence"]["legacy_card_key_sha256"]
            for row in q16["rows"] if row["legacy_evidence"] is not None
        }
        self.assertEqual(selected_keys, {evidence["selected_legacy_card_key_sha256"]})
        conflict = next(
            entry for entry in self.b02_discrepancies["entries"]
            if entry["class"] == "DUPLICATE_LEGACY_CARDS_CONFLICT_ON_SOURCE_DIAMETER"
        )
        self.assertEqual(conflict["severity"], "CRITICAL")

    def test_b02_excludes_known_solution_boundaries_and_preserves_appendix(self):
        by_id = {record["task_id"]: record for record in self.b02_candidates["records"]}
        expected_last_legacy_rows = {
            "materials-science-y1-pb2-q010": 13,
            "materials-science-y1-pb2-q011": 15,
            "materials-science-y1-pb2-q012": 11,
            "materials-science-y1-pb2-q013": 15,
            "materials-science-y1-pb2-q014": 10,
            "materials-science-y1-pb2-q015": 14,
            "materials-science-y1-pb2-q016": 24,
            "materials-science-y1-pb2-q017": 16,
            "materials-science-y1-pb2-q018": 11,
            "materials-science-y1-pb2-q019": 25,
        }
        for task_id, expected_index in expected_last_legacy_rows.items():
            legacy_rows = [
                row for row in by_id[task_id]["rows"] if row["legacy_evidence"] is not None
            ]
            self.assertEqual(legacy_rows[-1]["legacy_evidence"]["legacy_row_index"], expected_index)
            self.assertFalse(by_id[task_id]["solution_rows_included"])
        self.assertTrue(by_id["materials-science-y1-pb2-q018"]["external_reference_dependencies"])

    def test_b02_pass2_terminally_classifies_all_tasks_without_a_third_pass(self):
        final = self.b02_final_candidates
        self.assertEqual(final["pass_number"], 2)
        self.assertEqual(final["maximum_passes"], 2)
        self.assertEqual(final["task_count"], 10)
        self.assertEqual(final["row_count"], 157)
        self.assertEqual(final["reviewed_row_count"], 9)
        self.assertEqual(final["blocked_row_count"], 148)
        self.assertEqual(final["final_pass_task_ids"], [])
        self.assertEqual(len(final["final_incomplete_task_ids"]), 10)
        self.assertTrue(all(
            record["final_disposition"] == "INCOMPLETE"
            for record in final["records"]
        ))
        self.assertTrue(all(self.b02_final_verification["checks"].values()))
        self.assertIn("NO_THIRD_PASS", self.b02_final_verification["status"])

    def test_b02_pass2_corrections_are_nine_source_bound_headings_only(self):
        self.assertEqual(self.b02_corrections["entry_count"], 9)
        self.assertEqual(self.b02_final_candidates["text_correction_count"], 9)
        self.assertEqual(self.b02_final_candidates["source_anchor_correction_task_count"], 0)
        self.assertTrue(all(
            entry["correction_type"] == "SOURCE_TEXT_AND_ALIGNED_HEADING"
            for entry in self.b02_corrections["entries"]
        ))
        self.assertTrue(all(
            entry["source_pdf_sha256"] == self.b02_final_candidates["source_pdf_sha256"]
            for entry in self.b02_corrections["entries"]
        ))
        corrected_rows = {
            entry["row_id"] for entry in self.b02_corrections["entries"]
        }
        self.assertEqual(corrected_rows, {
            f"materials-science-y1-pb2-q{number:03d}-r001"
            for number in (10, 11, 12, 13, 15, 16, 17, 18, 19)
        })

    def test_b02_pass2_preserves_pass1_and_produces_no_package(self):
        self.assertEqual(self.b02_candidates["pass_number"], 1)
        self.assertEqual(
            self.b02_verification["status"],
            "PASS_B02_PASS1_CANDIDATES_NOT_CANONICAL_PASS2_REQUIRED",
        )
        self.assertIn("NOT_IMPORTABLE", self.b02_final_candidates["status"])
        self.assertEqual(self.b02_final_discrepancies["entry_count"], 25)
        self.assertFalse(any(BUILD.rglob("*.zip")))
        self.assertFalse(any(BUILD.rglob("*.mp3")))

    def test_b03_pass1_preserves_source_rows_and_reports_all_uncertainty(self):
        candidates = self.b03_candidates
        self.assertEqual(candidates["batch_id"], "B03")
        self.assertEqual(candidates["task_count"], 10)
        self.assertEqual(candidates["row_count"], 115)
        self.assertEqual(candidates["legacy_candidate_row_count"], 112)
        self.assertEqual(candidates["manual_source_transcription_row_count"], 3)
        self.assertEqual(candidates["hebrew_skeleton_mismatch_count"], 37)
        self.assertEqual(candidates["plain_hebrew_rows_with_niqqud_marks"], 7)
        self.assertEqual(len(self.b03_verification["incomplete_task_ids"]), 10)
        self.assertTrue(all(self.b03_verification["checks"].values()))

    def test_b03_q027_includes_source_continuation_and_appendix_dependency(self):
        by_id = {record["task_id"]: record for record in self.b03_candidates["records"]}
        q27 = by_id["materials-science-y1-pb2-q027"]
        self.assertEqual([anchor["source_page"] for anchor in q27["source_anchors"]], [35, 36])
        self.assertEqual(q27["source_anchors"][1]["normalized_bbox"], [0.0, 0.0, 1.0, 0.34])
        self.assertEqual(
            q27["source_anchors"][1]["prepared_asset_status"],
            "MISSING_CONTINUATION_REBUILD_REQUIRED_BEFORE_CANONICAL_PACKAGE",
        )
        self.assertTrue(q27["external_reference_dependencies"])
        self.assertTrue(by_id["materials-science-y1-pb2-q028"]["external_reference_dependencies"])

    def test_b03_pass2_is_terminal_and_source_bound(self):
        final = self.b03_final_candidates
        self.assertEqual(final["pass_number"], 2)
        self.assertEqual(final["task_count"], 10)
        self.assertEqual(final["row_count"], 115)
        self.assertEqual(final["reviewed_row_count"], 10)
        self.assertEqual(final["blocked_row_count"], 105)
        self.assertEqual(final["final_pass_task_ids"], [])
        self.assertEqual(len(final["final_incomplete_task_ids"]), 10)
        self.assertEqual(self.b03_corrections["entry_count"], 10)
        self.assertEqual(self.b03_final_discrepancies["entry_count"], 27)
        self.assertTrue(all(
            entry["source_pdf_sha256"] == final["source_pdf_sha256"]
            for entry in self.b03_corrections["entries"]
        ))
        self.assertTrue(all(self.b03_final_verification["checks"].values()))
        self.assertIn("NO_THIRD_PASS", self.b03_final_verification["status"])
        self.assertFalse(any(BUILD.rglob("*.zip")))
        self.assertFalse(any(BUILD.rglob("*.mp3")))

    def test_b04_through_b06_are_terminal_and_account_for_every_row(self):
        expected = {
            "B04": (153, 140, 13, 10, 143, 9),
            "B05": (107, 106, 1, 10, 97, 10),
            "B06": (79, 75, 4, 10, 69, 10),
        }
        for batch_id, counts in expected.items():
            pass1 = self.later_batches[batch_id]["pass1"]
            final = self.later_batches[batch_id]["final"]
            corrections = self.later_batches[batch_id]["corrections"]
            verification = self.later_batches[batch_id]["verification"]
            self.assertEqual((
                final["row_count"], pass1["legacy_candidate_row_count"],
                pass1["manual_source_transcription_row_count"], final["reviewed_row_count"],
                final["blocked_row_count"], corrections["entry_count"],
            ), counts)
            self.assertEqual(final["final_pass_task_ids"], [])
            self.assertEqual(len(final["final_incomplete_task_ids"]), 10)
            self.assertTrue(all(verification["checks"].values()))
            self.assertIn("NO_THIRD_PASS", verification["status"])

    def test_late_source_findings_are_preserved_without_silent_merge(self):
        b04 = {item["task_id"]: item for item in self.later_batches["B04"]["pass1"]["records"]}
        q38a = b04["materials-science-y1-pb2-p045-q038"]
        self.assertEqual([item["source_page"] for item in q38a["source_anchors"]], [45, 46])
        self.assertEqual(q38a["source_anchors"][1]["role"], "condition_continuation")
        self.assertEqual(
            b04["materials-science-y1-pb2-q030"]["duplicate_legacy_evidence"]["comparison"],
            "DISTINCT_SOURCE_ORDERED_CONDITION_SEGMENTS_CONCATENATED_NO_SOLUTION_ROWS",
        )
        b05 = {item["task_id"]: item for item in self.later_batches["B05"]["pass1"]["records"]}
        self.assertEqual(b05["materials-science-y1-pb2-q039"]["source_anchors"][0]["normalized_bbox"], [0.0, 0.0, 1.0, 0.5])
        b06 = {item["task_id"]: item for item in self.later_batches["B06"]["pass1"]["records"]}
        q49_rows = b06["materials-science-y1-pb2-q049"]["rows"]
        source_duplex = next(row for row in q49_rows if row["legacy_evidence"] is None and "Duplex" in row["he"])
        self.assertIn("אוסטניט", source_duplex["he"])
        self.assertNotIn("מרטנסיט", source_duplex["he"])

    def test_aggregate_audit_fails_closed_before_canonical_package(self):
        audit = self.aggregate_audit
        self.assertTrue(all(audit["checks"].values()))
        self.assertEqual(audit["totals"]["task_count"], 60)
        self.assertEqual(audit["totals"]["row_count"], 693)
        self.assertEqual(audit["totals"]["reviewed_row_count"], 51)
        self.assertEqual(audit["totals"]["blocked_row_count"], 642)
        self.assertEqual(audit["totals"]["final_pass_task_count"], 1)
        self.assertEqual(audit["totals"]["final_incomplete_task_count"], 59)
        self.assertFalse(audit["canonical_package"]["ready"])
        self.assertFalse(audit["canonical_package"]["emitted"])
        self.assertEqual(self.terminal_index["task_count"], 60)
        self.assertEqual(self.repair_gate["status"], "OWNER_DECISION_REQUIRED_NOT_APPROVED_NOT_EXECUTABLE")
        self.assertEqual(self.repair_gate["finite_scope"]["maximum_provider_generation_passes"], 1)
        self.assertEqual(self.repair_gate["finite_scope"]["maximum_failed_row_repair_passes"], 1)

    def test_separate_repair_plan_is_finite_costed_and_still_unapproved(self):
        plan = self.repair_plan
        self.assertEqual(plan["status"], "PLANNED_NOT_APPROVED_NO_PROVIDER_CALLS")
        self.assertEqual(plan["provider_calls_made"], 0)
        self.assertFalse(plan["secret_accessed"])
        self.assertEqual(plan["finite_execution"]["primary_call_count"], 6)
        self.assertEqual(plan["finite_execution"]["maximum_failed_row_repair_calls"], 6)
        self.assertEqual(plan["finite_execution"]["maximum_provider_calls"], 12)
        self.assertTrue(plan["finite_execution"]["no_third_pass"])
        self.assertTrue(plan["finite_execution"]["no_open_ended_iterations"])
        self.assertEqual(plan["cost"]["hard_max_usd"], 2.0)
        self.assertLessEqual(plan["cost"]["calculated_all_calls_at_caps_usd"], 2.0)
        self.assertEqual(len(plan["batches"]), 6)
        self.assertEqual(sum(item["blocked_row_count"] for item in plan["batches"]), 642)
        self.assertTrue(all(item["primary_call_limit"] == 1 for item in plan["batches"]))
        self.assertTrue(all(item["failed_row_repair_call_limit"] == 1 for item in plan["batches"]))
        self.assertFalse(plan["egress_allowlist"]["solutions"])
        self.assertFalse(plan["egress_allowlist"]["credentials"])
        self.assertIn("MAX_CALLS=12", plan["exact_owner_approval_token"])

    def test_repair_preflight_is_source_cropped_read_back_and_makes_no_calls(self):
        preflight = self.repair_preflight
        self.assertEqual(
            preflight["status"],
            "PASS_OFFLINE_PREFLIGHT_AWAITING_OWNER_APPROVAL_NO_PROVIDER_CALLS",
        )
        self.assertEqual(preflight["batch_count"], 6)
        self.assertEqual(preflight["task_count"], 59)
        self.assertEqual(preflight["row_count"], 642)
        self.assertEqual(preflight["pdf_page_exposure_count"], 77)
        self.assertEqual(preflight["post_build_source_anchor_correction_task_count"], 3)
        self.assertEqual(preflight["provider_calls_made"], 0)
        self.assertFalse(preflight["secret_accessed"])
        self.assertTrue(all(
            len(batch["page_manifest"]) == len(batch["readback_pages"])
            for batch in preflight["batches"]
        ))
        self.assertTrue(all(
            (self.repair_preflight_root / "inputs" / batch["pdf"]["filename"]).is_file()
            for batch in preflight["batches"]
        ))
        deterministic = self.repair_preflight_determinism
        self.assertEqual(deterministic["status"], "PASS_TWO_CONSECUTIVE_REBUILDS_BYTE_IDENTICAL")
        self.assertEqual(deterministic["manifest_artifact_sha256"], preflight["artifact_sha256"])
        expected_pdf_hashes = {item["batch_id"]: item["pdf"]["sha256"] for item in preflight["batches"]}
        self.assertEqual(
            {item["batch_id"]: item["pdf_sha256"] for item in deterministic["batches"]},
            expected_pdf_hashes,
        )
        allowed_candidate_fields = {"row_id", "semantic_kind", "he", "he_niqqud", "transliteration", "ru"}
        for batch in preflight["batches"]:
            candidate = read_json(
                self.repair_preflight_root / "candidates" / batch["candidate"]["filename"]
            )
            self.assertTrue(all(set(row) == allowed_candidate_fields for row in candidate["rows"]))
            blueprint = read_json(self.repair_preflight_root / batch["request_blueprint"]["filename"])
            serialized_schema = json.dumps(blueprint["output_schema"], ensure_ascii=False)
            self.assertNotIn('"enum"', serialized_schema)
            self.assertNotIn("status", serialized_schema.lower())
            self.assertNotIn("severity", serialized_schema.lower())

    def test_preflight_additive_anchor_repairs_exclude_neighbor_tasks(self):
        self.assertEqual(self.repair_anchor_corrections["entry_count"], 3)
        by_task = {item["task_id"]: item["after"] for item in self.repair_anchor_corrections["entries"]}
        self.assertEqual([item["source_page"] for item in by_task["materials-science-y1-pb2-q021"]], [27, 28])
        self.assertEqual(by_task["materials-science-y1-pb2-q021"][1]["normalized_bbox"], [0.0, 0.0, 1.0, 0.22])
        self.assertEqual(by_task["materials-science-y1-pb2-q022"][0]["normalized_bbox"], [0.0, 0.18, 1.0, 1.0])
        self.assertEqual(by_task["materials-science-y1-pb2-q028"][0]["normalized_bbox"], [0.0, 0.38, 1.0, 1.0])
        self.assertEqual(self.repair_anchor_corrections["provider_calls_made"], 0)

    def test_repair_apply_dry_run_cannot_require_or_read_a_credential(self):
        result = subprocess.run(
            [sys.executable, str(REPAIR_APPLY_SCRIPT), "--stable", str(STABLE)],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS_DRY_RUN_NO_CREDENTIAL_NO_PROVIDER_CALLS")
        self.assertEqual(payload["rows"], 642)

    def test_repair_apply_rejects_non_exact_approval_before_credential_or_cache_access(self):
        result = subprocess.run(
            [
                sys.executable, str(REPAIR_APPLY_SCRIPT), "--stable", str(STABLE),
                "--execute", "--approval-token", "WRONG",
            ],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exact owner approval token missing or mismatched", result.stderr)

    def test_repair_apply_validator_enforces_plain_and_vocalized_hebrew_identity(self):
        spec = importlib.util.spec_from_file_location("materials_pb2_repair_apply", REPAIR_APPLY_SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        blueprint = {"batch_id": "BXX", "expected_row_ids": ["r1"]}
        candidates = {"rows": [{"row_id": "r1", "he": "שאלה 2."}]}
        valid = {"batch_id": "BXX", "rows": [{
            "row_id": "r1", "he": "שאלה 2.", "he_niqqud": "שְׁאֵלָה 2.",
            "transliteration": "She'ela 2.", "ru": "Вопрос 2.",
        }]}
        self.assertEqual(module.validate_payload(valid, blueprint, candidates)["row_count"], 1)
        invalid = json.loads(json.dumps(valid, ensure_ascii=False))
        invalid["rows"][0]["he"] = "שְׁאֵלָה 2."
        with self.assertRaisesRegex(ValueError, "plain Hebrew contains niqqud"):
            module.validate_payload(invalid, blueprint, candidates)
        missing_niqqud = json.loads(json.dumps(valid, ensure_ascii=False))
        missing_niqqud["rows"][0]["he_niqqud"] = "שאלה 2."
        with self.assertRaisesRegex(ValueError, "insufficient niqqud coverage"):
            module.validate_payload(missing_niqqud, blueprint, candidates)

    def test_canonical_bake_reports_ready_and_missing_ledger_fails_closed(self):
        result = subprocess.run(
            [sys.executable, str(CANONICAL_BAKE_SCRIPT), "--stable", str(STABLE)],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS_CANONICAL_BAKE_DRY_RUN_READY_NO_PACKAGE_WRITTEN")
        self.assertEqual(payload["reviewed_batches"], 6)
        self.assertFalse(payload["package_emitted"])
        self.assertFalse(any((STABLE / "repair").glob("*.zip")))
        with tempfile.TemporaryDirectory(prefix="materials-pb2-no-ledger-") as temporary:
            blocked = subprocess.run(
                [sys.executable, str(CANONICAL_BAKE_SCRIPT), "--stable", temporary],
                cwd=ROOT, capture_output=True, text=True, check=False,
            )
            self.assertEqual(blocked.returncode, 0, blocked.stderr)
            blocked_payload = json.loads(blocked.stdout)
            self.assertEqual(
                blocked_payload["status"],
                "WAITING_FOR_APPROVED_PROVIDER_REPAIR_NO_PACKAGE",
            )
            self.assertFalse(blocked_payload["package_emitted"])

    def test_builder_has_no_network_or_secret_access_capability(self):
        for script in (SCRIPT, AUDIT_SCRIPT, REPAIR_PLAN_SCRIPT, REPAIR_PREPARE_SCRIPT, CANONICAL_BAKE_SCRIPT):
            source = script.read_text(encoding="utf-8")
            tree = ast.parse(source)
            imported_roots = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imported_roots.update(alias.name.split(".", 1)[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    imported_roots.add(node.module.split(".", 1)[0])
            self.assertTrue(imported_roots.isdisjoint({
                "requests", "httpx", "urllib", "socket", "aiohttp", "google", "openai",
            }))
            self.assertNotIn(".key", source)

    def test_build_packet_contains_no_owner_drive_path_or_secret_pattern(self):
        files = [path for path in BUILD.rglob("*") if path.is_file()]
        combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
        self.assertNotIn("G:\\Andasa", combined)
        self.assertNotIn(".key", combined)
        self.assertIsNone(re.search(r"AIza|api[_-]?key", combined, re.IGNORECASE))


if __name__ == "__main__":
    unittest.main()
