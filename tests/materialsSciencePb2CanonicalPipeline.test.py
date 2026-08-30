import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STABLE = ROOT / "docs" / "research" / "materials-science-problem-corpus" / "2026-08-30"
APPLY = ROOT / "scripts" / "premium" / "apply-materials-science-pb2-canonical-repair.py"
BAKE = ROOT / "scripts" / "premium" / "bake-materials-science-pb2-canonical.py"
SOURCE_PDF_VALUE = os.environ.get("MATERIALS_PB2_SOURCE_PDF", "").strip()
SOURCE_PDF = Path(SOURCE_PDF_VALUE) if SOURCE_PDF_VALUE else None
HEBREW = re.compile(r"[\u05D0-\u05EA]")
LATIN = re.compile(r"[A-Za-z]")
CYRILLIC = re.compile(r"[А-Яа-яЁё]")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_apply_module():
    spec = importlib.util.spec_from_file_location("materials_pb2_apply_e2e", APPLY)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def synthetic_vocalization(plain):
    # Fixture-only text: every Hebrew consonant receives a combining mark so
    # structural niqqud coverage and skeleton gates are exercised. This output
    # lives only in TemporaryDirectory and is never corpus truth.
    return "".join(character + "\u05B0" if HEBREW.fullmatch(character) else character for character in plain)


class MaterialsSciencePb2CanonicalPipelineTest(unittest.TestCase):
    def test_niqqud_projection_allows_only_matres_spelling_drift(self):
        module = load_apply_module()
        plain = "נחושת שייכת לחומרים גבישיים."
        pointed = "נְחֹשֶׁת שַׁיֶּכֶת לַחֳמָרִים גְּבִישִׁיִּים."
        projected = module.project_niqqud_to_plain_skeleton(plain, pointed)
        self.assertIsNotNone(projected)
        self.assertEqual(module.normalized_skeleton(projected), plain)
        self.assertGreater(len(module.NIQQUD.findall(projected)), 0)
        self.assertIsNone(module.project_niqqud_to_plain_skeleton("ברזל", "בַּרְזֵק"))
        self.assertLess(module.semantic_similarity("שאלה 6.", "נתוני ניסוי המתיחה"), 0.72)
        self.assertGreater(module.semantic_similarity("חשב את המאמץ.", "חשב את המאמץ"), 0.72)
        table_plain = "טמפרטורה, °C: +50, −22, −25, −28, −75"
        table_pointed = "טֶמְפֶּרָטוּרָה, °C: 75-, 28-, 25-, 22-, 50+"
        table_projected = module.project_niqqud_words_onto_source_plain(table_plain, table_pointed)
        self.assertEqual(module.normalized_skeleton(table_projected), table_plain)
        self.assertIn("+50, −22", table_projected)

    def test_cached_synthetic_provider_resume_and_deterministic_bake(self):
        if SOURCE_PDF is None or not SOURCE_PDF.is_file():
            self.skipTest("set MATERIALS_PB2_SOURCE_PDF to run the licensed-source deterministic bake")
        module = load_apply_module()
        with tempfile.TemporaryDirectory(prefix="materials-pb2-canonical-e2e-") as temporary:
            temp_root = Path(temporary)
            stable = temp_root / "stable"
            shutil.copytree(STABLE, stable)
            # The synthetic provider fixture intentionally replaces every reviewed
            # row. A real-source before/after correction overlay therefore cannot
            # be applied to this mechanism-only bake.
            (stable / "repair" / "source-condition-corrections.json").unlink(missing_ok=True)
            plan = read_json(stable / "build" / "separate-canonical-repair-execution-plan.json")
            preflight_root = stable / "repair" / "preflight"
            preflight = read_json(preflight_root / "canonical-repair-preflight-manifest.json")
            cache_root = temp_root / "raw-cache"
            calls = []
            for batch in preflight["batches"]:
                batch_id = batch["batch_id"]
                blueprint = read_json(preflight_root / batch["request_blueprint"]["filename"])
                candidate_path = preflight_root / "candidates" / batch["candidate"]["filename"]
                pdf_path = preflight_root / "inputs" / batch["pdf"]["filename"]
                candidates = read_json(candidate_path)
                rows = []
                for candidate in candidates["rows"]:
                    base = str(candidate.get("he_niqqud") or candidate.get("he") or candidate["row_id"])
                    plain = module.NIQQUD.sub("", base).strip()
                    transliteration = str(candidate.get("transliteration") or "").strip()
                    russian = str(candidate.get("ru") or "").strip()
                    if HEBREW.search(str(candidate.get("he") or "")):
                        vocalized = synthetic_vocalization(plain)
                        if not LATIN.search(transliteration):
                            transliteration = "Synthetic fixture row"
                        if not CYRILLIC.search(russian):
                            russian = "Синтетическая проверочная строка"
                    else:
                        vocalized = plain
                        transliteration = transliteration or "Formula fixture"
                        russian = russian or "Формула для проверки"
                    rows.append({
                        "row_id": candidate["row_id"],
                        "he": plain,
                        "he_niqqud": vocalized,
                        "transliteration": transliteration,
                        "ru": russian,
                    })
                payload = {"batch_id": batch_id, "rows": rows}
                response = {
                    "candidates": [{"content": {"parts": [{
                        "text": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                    }]}}],
                    "usageMetadata": {
                        "promptTokenCount": 100,
                        "candidatesTokenCount": 100,
                        "thoughtsTokenCount": 0,
                        "totalTokenCount": 200,
                    },
                }
                body = module.request_body(
                    blueprint, candidate_path.read_bytes(), pdf_path.read_bytes(), None,
                )
                request_sha = module.sha256_bytes(module.canonical_json(body))
                wrapper = {
                    "schema": "linguistpro-materials-pb2-raw-provider-cache-v1",
                    "batch_id": batch_id,
                    "attempt": 1,
                    "request_sha256": request_sha,
                    "model": plan["provider"]["model"],
                    "cached_at": "2026-08-30T00:00:00Z",
                    "usage": {
                        "prompt_tokens": 100,
                        "candidate_tokens": 100,
                        "thinking_tokens": 0,
                        "calculated_usd": 0.00045,
                    },
                    "raw_response": response,
                }
                write_json(cache_root / batch_id / f"{request_sha}.response.json", wrapper)
                calls.append({
                    "batch_id": batch_id,
                    "attempt": 1,
                    "request_sha256": request_sha,
                    "status": "HTTP_200_RAW_CACHED",
                    "usage": wrapper["usage"],
                    "called_at": wrapper["cached_at"],
                    "worst_case_budget_commitment_usd": 0.16038,
                })
            execution = stable / "repair" / "execution"
            write_json(execution / "execution-ledger.json", {
                "schema": "linguistpro-materials-pb2-canonical-repair-execution-v1",
                "status": "IN_PROGRESS_SYNTHETIC_CACHE_FIXTURE",
                "repair_plan_sha256": plan["artifact_sha256"],
                "preflight_sha256": preflight["artifact_sha256"],
                "model": plan["provider"]["model"],
                "mode": plan["provider"]["mode"],
                "hard_max_usd": 2.0,
                "maximum_provider_calls": 12,
                "calls": calls,
                "reviewed_batches": [],
                "secret_persisted": False,
            })
            apply_result = subprocess.run([
                sys.executable, str(APPLY), "--stable", str(stable), "--execute",
                "--approval-token", plan["exact_owner_approval_token"],
                "--credential-file", str(temp_root / "must-not-be-read"),
                "--cache-root", str(cache_root),
            ], cwd=ROOT, capture_output=True, text=True, timeout=120, check=False)
            self.assertEqual(apply_result.returncode, 0, apply_result.stderr)
            apply_output = json.loads(apply_result.stdout.strip().splitlines()[-1])
            self.assertEqual(
                apply_output["status"],
                "PASS_ALL_6_BATCHES_STRICTLY_VALIDATED_READY_FOR_LOCAL_CANONICAL_BAKE",
            )
            final_ledger = read_json(execution / "execution-ledger.json")
            self.assertEqual(final_ledger["reviewed_batches"], ["B01", "B02", "B03", "B04", "B05", "B06"])
            self.assertFalse(final_ledger["secret_accessed"])
            self.assertFalse((temp_root / "must-not-be-read").exists())

            outputs = [temp_root / "materials-pb2-a.zip", temp_root / "materials-pb2-b.zip"]
            for output in outputs:
                bake_result = subprocess.run([
                    sys.executable, str(BAKE), "--stable", str(stable), "--bake",
                    "--source-pdf", str(SOURCE_PDF), "--output", str(output),
                ], cwd=ROOT, capture_output=True, text=True, timeout=180, check=False)
                self.assertEqual(bake_result.returncode, 0, bake_result.stderr)
                bake_output = json.loads(bake_result.stdout.strip().splitlines()[-1])
                self.assertEqual(
                    bake_output["status"],
                    "PASS_LOCAL_CANONICAL_BUNDLE_DETERMINISTIC_READBACK_NOT_IMPORTED_NOT_PUBLISHED",
                )
            self.assertEqual(module.sha256_file(outputs[0]), module.sha256_file(outputs[1]))
            with zipfile.ZipFile(outputs[0], "r") as archive:
                names = archive.namelist()
                manifest = json.loads(archive.read("manifest.json"))
                library = json.loads(archive.read("library/library.json"))
                self.assertEqual(manifest["text_count"], 60)
                self.assertEqual(manifest["row_count"], 693)
                self.assertGreaterEqual(manifest["asset_count"], 60)
                self.assertEqual(len(library["texts"]), 60)
                self.assertEqual(sum(len(text["rows"]) for text in library["texts"]), 693)
                self.assertTrue(any(name.startswith("assets/source/") for name in names))
                self.assertTrue(any(name.startswith("assets/reference/") for name in names))
                q043 = next(text for text in library["texts"] if text["text_key"].endswith("q043"))
                q043_meta = q043["source_meta"]["materials_science_task"]
                self.assertEqual(q043_meta["source_pages"], [53, 71, 72, 73])
                self.assertEqual(
                    [item["source_pages"] for item in q043_meta["external_reference_dependencies"]],
                    [[71, 72, 73]],
                )
                self.assertFalse(any(name.startswith("audio/") for name in names))
                self.assertFalse(any("solution" in name.lower() for name in names))


if __name__ == "__main__":
    unittest.main()
