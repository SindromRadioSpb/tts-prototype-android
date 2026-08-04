import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "l4_mt_benchmark.py"
SPEC = importlib.util.spec_from_file_location("l4_mt_benchmark", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class L4MtBenchmarkTest(unittest.TestCase):
    def test_split_literary_segments_filters_headers_and_short_fragments(self):
        text = "כותרת\nזהו משפט ספרותי שלם וברור שיש בו די מילים.\n1\nקצר מדי."
        self.assertEqual(
            MODULE.split_literary_segments(text),
            ["זהו משפט ספרותי שלם וברור שיש בו די מילים."],
        )

    def test_validate_gold_rejects_missing_reference_and_hash_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "gold.tsv"
            row = {field: "" for field in MODULE.TSV_FIELDS}
            row.update(
                {
                    "id": "X1",
                    "domain": "test",
                    "subdomain": "test",
                    "source_lang": "he",
                    "target_lang": "ru",
                    "source_text": "משפט בדיקה ארוך מספיק.",
                    "source_sha256": "wrong",
                    "stress_kind": "none",
                }
            )
            MODULE.write_tsv(path, [row], MODULE.TSV_FIELDS)
            result = MODULE.validate_gold(path, require_references=True)
            self.assertFalse(result["ok"])
            self.assertTrue(any("hash mismatch" in error for error in result["errors"]))
            self.assertTrue(any("reference missing" in error for error in result["errors"]))

    def test_blind_selection_is_deterministic_and_stratified(self):
        rows = []
        for direction in ("he-ru", "ru-he"):
            source, target = direction.split("-")
            for index in range(25):
                rows.append(
                    {
                        "id": f"F-{direction}-{index}",
                        "domain": "flores-plus-v4.6-devtest",
                        "source_lang": source,
                        "target_lang": target,
                    }
                )
        for index in range(25):
            rows.append(
                {
                    "id": f"I-{index}",
                    "domain": "in-domain",
                    "source_lang": "he",
                    "target_lang": "ru",
                }
            )
        first = MODULE.select_blind_ids(rows, per_stratum=20, seed=42)
        second = MODULE.select_blind_ids(rows, per_stratum=20, seed=42)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 60)
        self.assertEqual(len(set(first)), 60)

    def test_attach_references_rejects_source_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            gold = {field: "" for field in MODULE.TSV_FIELDS}
            gold.update(
                {
                    "id": "X1",
                    "domain": "test",
                    "subdomain": "test",
                    "source_lang": "he",
                    "target_lang": "ru",
                    "source_text": "משפט בדיקה.",
                    "reference_text": "Тестовое предложение.",
                    "source_sha256": MODULE.sha256_text("משפט בדיקה."),
                    "stress_kind": "none",
                }
            )
            output = {field: "" for field in MODULE.OUTPUT_FIELDS}
            output.update(gold)
            output["source_sha256"] = "drift"
            output["system"] = "test-system"
            output["hypothesis"] = "Тест."
            gold_path = root / "gold.tsv"
            output_path = root / "output.tsv"
            MODULE.write_tsv(gold_path, [gold], MODULE.TSV_FIELDS)
            MODULE.write_tsv(output_path, [output], MODULE.OUTPUT_FIELDS)
            with self.assertRaisesRegex(ValueError, "Source drift"):
                MODULE.attach_references([gold_path], [output_path], root / "joined")


if __name__ == "__main__":
    unittest.main()
