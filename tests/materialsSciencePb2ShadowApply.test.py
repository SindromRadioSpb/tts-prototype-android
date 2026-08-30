import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "premium" / "apply-materials-science-pb2-shadow.py"
PLAN = ROOT / "docs" / "research" / "materials-science-problem-corpus" / "2026-08-30" / "shadow" / "shadow-request-plan.json"
SHADOW = PLAN.parent

spec = importlib.util.spec_from_file_location("materials_pb2_shadow_apply", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)


class ShadowApplyContractTest(unittest.TestCase):
    def setUp(self):
        self.request = json.loads(PLAN.read_text(encoding="utf-8"))["requests"][0]
        self.request["allowed_legacy_hashes"] = []

    def valid_wire(self):
        source_page = self.request["allowed_source_pages"][0]
        return {
            "schema_id": module.SCHEMA_ID,
            "batch_id": self.request["batch_id"],
            "case_tasks": [
                {"case_id": case_id, "task_ids": task_ids}
                for case_id, task_ids in self.request["case_task_ids"].items()
            ],
            "task_boundaries": [
                {"task_id": task_id, "boundary_status": "exact"}
                for task_id in self.request["task_ids"]
            ],
            "source_rows": [
                {
                    "task_id": task_id,
                    "row_kind": "condition",
                    "he": "טקסט",
                    "he_niqqud": "טֶקְסְט",
                    "transliteration": "tekst",
                    "ru": "текст",
                    "source_page": source_page,
                    "confidence": "high",
                }
                for task_id in self.request["task_ids"]
            ],
            "visuals": [],
            "legacy_findings": [],
            "unknowns": [],
            "case_summaries": [
                {"case_id": case_id, "critical_count": 0, "major_count": 0,
                 "minor_count": 0, "solution_content_generated": False}
                for case_id in self.request["case_ids"]
            ],
            "batch_summary": {"critical_count": 0, "major_count": 0,
                              "minor_count": 0, "solution_content_generated": False},
        }

    def test_flat_wire_normalizes_and_passes_full_validator(self):
        normalized = module.normalize_wire_output(self.valid_wire(), self.request)
        result = module.validate_output(normalized, self.request)
        self.assertEqual(result["case_count"], 4)
        self.assertEqual(result["task_count"], len(self.request["task_ids"]))
        self.assertFalse(result["solution_content_generated"])

    def test_empty_case_envelope_is_rejected(self):
        invalid = self.valid_wire()
        invalid["case_tasks"] = [{}, {}, {}, {}]
        with self.assertRaisesRegex(ValueError, "case/task map mismatch"):
            module.normalize_wire_output(invalid, self.request)

    def test_terminal_failure_closes_provider_loop_without_accepting_output(self):
        decision = json.loads((SHADOW / "shadow-terminal-decision.json").read_text(encoding="utf-8"))
        failures = json.loads((SHADOW / "shadow-provider-failures.json").read_text(encoding="utf-8"))
        self.assertEqual(decision["status"], "NO_MORE_GEMINI_REQUESTS")
        self.assertEqual(decision["batches_not_sent"], ["B02", "B03"])
        self.assertEqual(decision["provider"]["semantically_valid_outputs"], 0)
        self.assertFalse(decision["future_provider_recovery_allowed"])
        self.assertEqual(failures["total_provider_request_attempts"], 4)
        self.assertEqual(failures["remaining_provider_calls_authorized"], 0)
        self.assertTrue(all(
            item.get("provider_output_truth_status") != "CORPUS_TRUTH"
            for item in failures["failures"]
        ))


if __name__ == "__main__":
    unittest.main()
