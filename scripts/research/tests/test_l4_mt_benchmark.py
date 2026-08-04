import importlib.util
import json
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

    def test_flores_stage_a_selects_complete_pairs_deterministically(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "flores.tsv"
            first = root / "first.tsv"
            second = root / "second.tsv"
            rows = []
            for index in range(10):
                provenance = f"flores#shared-{index:02d}"
                for source_lang, target_lang in (("he", "ru"), ("ru", "he")):
                    row = {field: "" for field in MODULE.TSV_FIELDS}
                    text = f"source-{source_lang}-{index}"
                    row.update(
                        {
                            "id": f"F-{source_lang}-{target_lang}-{index}",
                            "domain": "flores-plus-v4.6-devtest",
                            "subdomain": "evaluation",
                            "source_lang": source_lang,
                            "target_lang": target_lang,
                            "source_text": text,
                            "reference_text": f"reference-{target_lang}-{index}",
                            "provenance_id": provenance,
                            "source_sha256": MODULE.sha256_text(text),
                            "stress_kind": "none",
                            "parent_id": f"FLORES-shared-{index:04d}",
                        }
                    )
                    rows.append(row)
            MODULE.write_tsv(source, rows, MODULE.TSV_FIELDS)
            manifest_first = MODULE.sample_flores_stage_a(source, first, 4, "seed")
            manifest_second = MODULE.sample_flores_stage_a(source, second, 4, "seed")
            selected = MODULE.read_tsv(first)
            self.assertEqual(manifest_first["selected_shared_ids"], 4)
            self.assertEqual(manifest_first["selected_rows"], 8)
            self.assertEqual(manifest_first["directions"], {"he-ru": 4, "ru-he": 4})
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(
                manifest_first["selected_id_set_sha256"],
                manifest_second["selected_id_set_sha256"],
            )
            counts = {}
            for row in selected:
                counts[row["parent_id"]] = counts.get(row["parent_id"], 0) + 1
            self.assertEqual(set(counts.values()), {2})

    def test_adaptive_gate_fires_for_close_top_local_candidates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            metrics_path = root / "metrics.json"
            destination = root / "gate.json"

            def groups(chrf_he_ru, chrf_ru_he, bleu_he_ru, bleu_ru_he):
                values = {}
                for direction, chrf, bleu in (
                    ("he-ru", chrf_he_ru, bleu_he_ru),
                    ("ru-he", chrf_ru_he, bleu_ru_he),
                ):
                    values[f"flores-plus-v4.6-devtest/{direction}"] = {
                        "chrf_plus_plus": chrf,
                        "spbleu": bleu,
                        "bootstrap_95": {
                            "chrf_plus_plus": {"low": chrf - 0.5, "high": chrf + 0.5},
                            "spbleu": {"low": bleu - 0.5, "high": bleu + 0.5},
                        },
                        "empty_hypotheses": 0,
                        "truncated": 0,
                    }
                return values

            payload = {
                "systems": {
                    "local-a": {"groups": groups(42.0, 40.0, 25.0, 24.0)},
                    "local-b": {"groups": groups(41.0, 39.0, 24.0, 23.0)},
                    "local-c": {"groups": groups(30.0, 29.0, 15.0, 14.0)},
                }
            }
            metrics_path.write_text(json.dumps(payload), encoding="utf-8")
            report = MODULE.evaluate_adaptive_gates(
                metrics_path,
                destination,
                ["local-a", "local-b", "local-c"],
                "cloud",
            )
            self.assertTrue(report["triggers"]["top_local_delta_chrf_below_2"])
            self.assertTrue(report["triggers"]["bootstrap_95_overlap"])
            self.assertTrue(report["expand_to_full_devtest"])
            self.assertEqual(report["stage_b_systems"], ["cloud", "local-a", "local-b"])
            self.assertTrue(destination.is_file())

    def test_resume_validation_allows_subset_and_rejects_source_drift(self):
        source = {"id": "X1", "source_sha256": "abc"}
        completed = {"id": "X1", "source_sha256": "abc", "system": "candidate"}
        self.assertEqual(
            MODULE.validate_resume_rows([source], [completed], "candidate"),
            {"X1"},
        )
        completed["source_sha256"] = "drift"
        with self.assertRaisesRegex(ValueError, "Resume source drift"):
            MODULE.validate_resume_rows([source], [completed], "candidate")


if __name__ == "__main__":
    unittest.main()
