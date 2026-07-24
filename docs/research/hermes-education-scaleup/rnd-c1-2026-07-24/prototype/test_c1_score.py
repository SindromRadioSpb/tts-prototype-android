import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("c1_score.py")
SPEC = importlib.util.spec_from_file_location("c1_score_under_test", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class C1ScoreTest(unittest.TestCase):
    def test_ipa_to_mms(self):
        self.assertEqual(MODULE.ipa_to_mms("ʃalˈom"), "shalom")
        self.assertEqual(MODULE.ipa_to_mms("ʔivʁˈit"), "'ivrit")
        self.assertEqual(MODULE.ipa_to_mms("χatunˈa"), "xatuna")

    def test_stress_vowel_index(self):
        self.assertEqual(MODULE.stress_vowel_index("ʃalˈom"), 1)
        self.assertEqual(MODULE.stress_vowel_index("bˈokeʁ"), 0)
        self.assertIsNone(MODULE.stress_vowel_index("shalom"))

    def test_minmax_constant_is_neutral(self):
        self.assertEqual(MODULE.minmax([2.0, 2.0]), [0.5, 0.5])

    def test_manifest_contract(self):
        manifest = MODULE_PATH.parent.parent / "benchmark_manifest.tsv"
        rows = MODULE.read_manifest(manifest)
        self.assertEqual(len(rows), 75)
        self.assertEqual(sum(row["condition"] == "NORMAL" for row in rows), 50)
        self.assertEqual(sum(row["expected_error_type"] == "VOWEL_SUBSTITUTION" for row in rows), 15)
        self.assertEqual(sum(row["expected_error_type"] == "STRESS_SHIFT" for row in rows), 10)


if __name__ == "__main__":
    unittest.main()
