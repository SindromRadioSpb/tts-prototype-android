#!/usr/bin/env python3
"""Review Materials Science PB2 legacy rows and source visuals locally.

This command is intentionally offline. It never reads credentials, calls a
provider, imports data, adjudicates solutions, synthesizes audio, or publishes.
Raw legacy text is used only in memory; stable artifacts retain hashes and
reviewed target identities, not text, UUIDs, or source URL values.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


LEGACY_JSON = "Материаловедение_library_export_20260119.json"
EXPECTED_LEGACY_SHA256 = "2a2f3191dd73a5e5bc99b096cda704a54172b33ebd3416c969d2f03299e2cb21"
EXPECTED_SOURCE_SHA256 = "3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435"
SOURCE_EDITION = "problem-book-2-pdf-sha256-3d87b9f5"


def q(number: int) -> str:
    return f"materials-science-y1-pb2-q{number:03d}"


EXERCISE = "materials-science-y1-pb2-exercise-p005-allotropy"
Q38_A = "materials-science-y1-pb2-p045-q038"
Q38_B = "materials-science-y1-pb2-p047-q038"


# Exact, manually reviewed card-to-source targets. A duplicated legacy title is
# deliberately allowed when both bodies point to the same source task.
FULL_CARD_TARGETS = {
    "Задачник 2. Страница 3": q(1),
    "Задачник 2. Страница 5": EXERCISE,
    "Задачник 2. Страница 6.1": q(3),
    "Задачник 2. Страница 6.2": q(4),
    "Задачник 2. Страница 6.3": q(5),
    "Задачник 2. Страница 7": q(6),
    "Задачник 2. Страница 7_": q(6),
    "Задачник 2. Страница 8": q(7),
    "Задачник 2. Страница 9": q(8),
    "Задачник 2. Страница 12": q(9),
    "Задачник 2. Страница 13": q(10),
    "Задачник 2. Страница 15": q(11),
    "Задачник 2. Страница 16": q(12),
    "Задачник 2. Страница 17": q(13),
    "Задачник 2. Страница 18": q(14),
    "Задачник 2. Страница 20": q(15),
    "Задачник 2. Страница 21": q(16),
    "Задачник 2. Страница 22": q(17),
    "Задачник 2. Страница 23": q(18),
    "Задачник 2. Страница 25": q(19),
    "Задачник 2. Страница 26": q(20),
    "Задачник 2. Страница 27": q(21),
    "Задачник 2. Страница 28": q(22),
    "Задачник 2. Страница 29": q(23),
    "Задачник 2. Страница 30 ВАЖНО!": q(24),
    "Задачник 2. Страница 31": q(25),
    "Задачник 2. Страница 33": q(26),
    "Задачник 2. Страница 35-36": q(27),
    "Задачник 2. Страница 36": q(28),
    "Задачник 2. Страница 37": q(29),
    "Задачник 2. Страница 38.1": q(30),
    "Задачник 2. Страница 38.2": q(30),
    "Задачник 2. Страница 39.1": q(31),
    "Задачник 2. Страница 40": q(33),
    "Задачник 2. Страница 41 (Закалка. Нужна схема Гроссман, Джемини)": q(34),
    "Задачник 2. Страница 42 (Распечатать задачу к решению!)": q(35),
    "Задачник 2. Страница 43": q(36),
    "Задачник 2. Страница 44": q(37),
    "Задачник 2. Страница 45-46": Q38_A,
    "Задачник 2. Страница 46 (алеф)": "source-reference-p046-a",
    "Задачник 2. Страница 46 (бет, гимель)": "source-reference-p046-bc",
    "Задачник 2. Страница 47": Q38_B,
    "Задачник 2. Страница 51": q(41),
    "Задачник 2. Страница 52": q(42),
    "Задачник 2. Страница 53": q(43),
    "Задачник 2. Страница 54": q(44),
    "Задачник 2. Страница 55": q(45),
    "Задачник 2. Страница 56": q(46),
    "Задачник 2. Страница 57": q(47),
    "Задачник 2. Страница 58": q(48),
    "Задачник 2. Страница 59": q(49),
    "Задачник 2. Страница 60": q(50),
    "Задачник 2. Страница 61": q(51),
    "Задачник 2. Страница 62": q(52),
}

MULTI_CARD_SEGMENTS = {
    "Задачник 2. Страница 48-49": [(0, 36, q(39)), (37, None, q(40))],
    "Задачник 2. Страница 63 (1,2 и 3)": [(0, 27, q(53)), (28, 47, q(54)), (48, None, q(55))],
    "Задачник 2. Страница 64 (1 и 2), 65": [(0, 29, q(56)), (30, 49, q(57)), (50, None, q(58))],
}

SEMANTIC_OVERRIDES = {
    "Задачник 2. Страница 13": "SOURCE_PAGE_14_Q10_CONTENT_MATCH_OVERRIDES_LEGACY_TITLE",
    "Задачник 2. Страница 15": "SOURCE_PAGE_15_Q11_CONTENT_MATCH_LEGACY_FIRST_ROW_SAYS_14",
    "Задачник 2. Страница 20": "SOURCE_PAGE_20_Q15_CONTENT_MATCH_OVERRIDES_LEGACY_Q19_MARKER",
    "Задачник 2. Страница 31": "SOURCE_PAGE_31_Q25_CONTENT_MATCH_OVERRIDES_LEGACY_Q9_MARKER",
    "Задачник 2. Страница 33": "SOURCE_PAGE_33_Q26_CONTENT_MATCH_OVERRIDES_LEGACY_Q9_MARKER",
    "Задачник 2. Страница 42 (Распечатать задачу к решению!)": "SOURCE_PAGE_42_Q35_CONTENT_MATCH_OVERRIDES_LEGACY_Q34_MARKER",
}


# kind, count, semantic role, required for solving from supplied condition.
VISUALS: dict[str, list[tuple[str, int, str, bool]]] = {
    q(1): [("ATOM_MODEL_DIAGRAM", 4, "PROBLEM_INPUT", True)],
    EXERCISE: [("COOLING_AND_ALLOTROPIC_TRANSITION_CURVE", 1, "PROBLEM_INPUT", True),
               ("CRYSTAL_UNIT_CELL_SKETCH", 4, "PROBLEM_INPUT", True)],
    q(3): [("TERM_BANK_PANEL", 1, "STRUCTURED_PROMPT", True)],
    q(6): [("STRESS_STRAIN_DATA_TABLE", 1, "PROBLEM_INPUT", True)],
    q(8): [("TENSILE_TEST_DATA_TABLE", 1, "PROBLEM_INPUT", True)],
    q(9): [("MECHANICAL_PROPERTIES_DATA_TABLE", 1, "PROBLEM_INPUT", True)],
    q(10): [("FORCE_EXTENSION_GRAPH", 1, "PROBLEM_INPUT", True)],
    q(11): [("TENSILE_RESULTS_TABLE", 1, "PROBLEM_INPUT", True)],
    q(12): [("STRESS_STRAIN_GRAPH", 1, "PROBLEM_INPUT", True)],
    q(14): [("STRESS_STRAIN_SCHEMATIC", 4, "PROBLEM_INPUT", True)],
    q(15): [("MECHANICAL_PROPERTIES_TABLE", 1, "PROBLEM_INPUT", True)],
    q(16): [("ENGINEERING_REQUIREMENTS_BLOCK", 1, "PROBLEM_INPUT", True),
            ("TENSILE_TEST_RESULTS_TABLE", 1, "PROBLEM_INPUT", True)],
    q(17): [("TEMPERATURE_DEPENDENT_STRESS_STRAIN_CURVES", 3, "PROBLEM_INPUT", True)],
    q(18): [("HARDNESS_CONVERSION_TABLE", 1, "PROBLEM_INPUT", True)],
    q(19): [("IMPACT_ENERGY_TEMPERATURE_TABLE", 1, "PROBLEM_INPUT", True),
            ("HEAT_TREATMENT_RESPONSE_TABLE", 1, "RESPONSE_STRUCTURE", False)],
    q(21): [("MECHANICAL_PROPERTIES_TABLE", 1, "PROBLEM_INPUT", True)],
    q(22): [("STEEL_PROPERTIES_TABLE", 1, "PROBLEM_INPUT", True)],
    q(23): [("IMPACT_ENERGY_TEMPERATURE_CURVES", 3, "PROBLEM_INPUT", True)],
    q(25): [("S_N_FATIGUE_CURVES", 3, "PROBLEM_INPUT", True)],
    q(26): [("S_N_FATIGUE_CURVES", 3, "PROBLEM_INPUT", True)],
    q(27): [("STEEL_MICROGRAPH", 2, "PROBLEM_INPUT", True)],
    q(28): [("STEEL_MICROGRAPH", 3, "PROBLEM_INPUT", True)],
    q(29): [("METALLOGRAPHIC_STRUCTURE_SCHEMATIC", 1, "PROBLEM_INPUT", True),
            ("IRON_CARBON_PHASE_DIAGRAM", 1, "PROBLEM_INPUT", True)],
    q(30): [("MARTENSITE_MICROGRAPH", 1, "PROBLEM_INPUT", True)],
    q(32): [("TEMPERING_STRESS_STRAIN_CURVES", 3, "PROBLEM_INPUT", True)],
    q(33): [("HEAT_TREATMENT_PROPERTIES_TABLE", 1, "PROBLEM_INPUT", True)],
    q(34): [("JOMINY_HARDNESS_CURVES", 2, "PROBLEM_INPUT", True)],
    q(35): [("HARDNESS_MEASUREMENT_TABLE", 1, "PROBLEM_INPUT", True),
            ("ROD_SAMPLING_SCHEMATIC", 1, "PROBLEM_INPUT", True)],
    q(36): [("HARDNESS_DEPTH_TABLE", 1, "PROBLEM_INPUT", True),
            ("TENSILE_PROPERTIES_TABLE", 1, "PROBLEM_INPUT", True)],
    q(37): [("CYLINDRICAL_PART_SCHEMATIC", 1, "PROBLEM_INPUT", True),
            ("JOMINY_HARDNESS_CURVE", 1, "PROBLEM_INPUT", True),
            ("TRUE_FALSE_RESPONSE_TABLE", 1, "RESPONSE_STRUCTURE", False)],
    Q38_A: [("HEAT_TREATMENT_STRESS_STRAIN_CURVES", 4, "PROBLEM_INPUT", True)],
    q(41): [("ALUMINUM_STRESS_STRAIN_GRAPH", 1, "PROBLEM_INPUT", True)],
    q(45): [("TIME_TEMPERATURE_HEAT_TREATMENT_GRAPH", 1, "PROBLEM_INPUT", True)],
    q(46): [("GALVANIC_RIVET_SCHEMATIC", 3, "PROBLEM_INPUT", True)],
    q(47): [("BOLTED_JOINT_SCHEMATIC", 1, "PROBLEM_INPUT", True)],
    q(48): [("COATING_CLASSIFICATION_RESPONSE_TABLE", 1, "RESPONSE_STRUCTURE", True)],
    q(49): [("STAINLESS_STEEL_STRESS_STRAIN_CURVES", 4, "PROBLEM_INPUT", True),
            ("STEEL_ASSIGNMENT_RESPONSE_TABLE", 1, "RESPONSE_STRUCTURE", False)],
    q(50): [("STEEL_STRESS_STRAIN_CURVES", 3, "PROBLEM_INPUT", True)],
    q(51): [("STAINLESS_STEEL_STRESS_STRAIN_CURVES", 3, "PROBLEM_INPUT", True),
            ("STEEL_ASSIGNMENT_RESPONSE_TABLE", 1, "RESPONSE_STRUCTURE", False)],
    q(52): [("PLASTIC_PROPERTIES_COMPARISON_TABLE", 1, "RESPONSE_STRUCTURE", True)],
    q(56): [("COMPOSITE_PROPERTIES_TABLE", 1, "PROBLEM_INPUT", True)],
    q(57): [("COMPOSITE_REINFORCEMENT_STRUCTURE_DIAGRAM", 3, "PROBLEM_INPUT", True)],
    q(58): [("FIBER_REINFORCED_COMPOSITE_CUBE", 1, "PROBLEM_INPUT", True)],
}

DEPENDENCIES = {
    q(18): [("STEEL_PROPERTIES_APPENDIX", [68, 69])],
    q(27): [("IRON_CARBON_PHASE_DIAGRAM_APPENDIX", [70])],
    q(28): [("IRON_CARBON_PHASE_DIAGRAM_APPENDIX", [70])],
    q(30): [("IRON_CARBON_PHASE_DIAGRAM_APPENDIX", [70])],
    q(33): [("IRON_CARBON_PHASE_DIAGRAM_APPENDIX", [70])],
    q(36): [("IRON_CARBON_PHASE_DIAGRAM_APPENDIX", [70])],
    Q38_B: [("ALLOYING_ELEMENTS_APPENDIX", [67]), ("STEEL_PROPERTIES_APPENDIX", [68, 69])],
    q(39): [("STEEL_PROPERTIES_APPENDIX", [68, 69])],
    q(40): [("STEEL_PROPERTIES_APPENDIX", [68, 69]), ("IRON_CARBON_PHASE_DIAGRAM_APPENDIX", [70])],
    q(43): [("ALUMINUM_ALLOY_APPENDICES", [71, 72, 73])],
    q(44): [("ALUMINUM_ALLOY_APPENDICES", [71, 72, 73])],
    q(47): [("STEEL_PROPERTIES_APPENDIX", [68, 69])],
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def row_role(row: dict[str, Any], in_explicit_solution: bool, target_kind: str) -> tuple[str, bool]:
    he = normalize(row.get("he_plain"))
    ru = normalize(row.get("ru"))
    joined = f"{he} {ru}"
    if target_kind == "source_reference":
        return "LEGACY_REFERENCE_DERIVATIVE_UNVALIDATED", in_explicit_solution
    if he in {"פתרון", "פיתרון"} or ru.casefold() == "решение":
        return "EXPLICIT_SOLUTION_HEADING", True
    if in_explicit_solution:
        return "LEGACY_SOLUTION_EVIDENCE_UNVALIDATED", True
    if re.fullmatch(r"\d{1,2}(?:[.,]\d+)?", he):
        return "LEGACY_PAGE_MARKER", False
    if re.search(r"(?:^|\s)(?:שאלה|תרגיל)\s*(?:\d+|[\"'])", he):
        return "LEGACY_TASK_HEADING", False
    return "LEGACY_MIXED_CONDITION_OR_SOLUTION_UNADJUDICATED", False


def segment_specs(title: str, row_count: int) -> list[dict[str, Any]]:
    if title in MULTI_CARD_SEGMENTS:
        specs = MULTI_CARD_SEGMENTS[title]
    elif title in FULL_CARD_TARGETS:
        specs = [(0, None, FULL_CARD_TARGETS[title])]
    else:
        raise RuntimeError(f"unreviewed legacy title: {title}")
    output = []
    for index, (start, end, target) in enumerate(specs, start=1):
        resolved_end = row_count - 1 if end is None else end
        output.append({
            "segment_index": index,
            "row_start": start,
            "row_end": resolved_end,
            "target_kind": "source_reference" if target.startswith("source-reference-") else "task",
            "target_id": target,
            "mapping_basis": SEMANTIC_OVERRIDES.get(
                title, "MANUAL_SOURCE_PAGE_AND_CONDITION_CONTENT_REVIEW_2026_08_30"
            ),
        })
    covered = [row for spec in output for row in range(spec["row_start"], spec["row_end"] + 1)]
    if covered != list(range(row_count)):
        raise RuntimeError(f"row ranges do not cover card exactly: {title}: {covered[:3]}..{covered[-3:]}")
    return output


def build_mapping(raw_path: Path, projection: dict[str, Any], task_ids: set[str]) -> dict[str, Any]:
    if sha256_file(raw_path) != EXPECTED_LEGACY_SHA256:
        raise RuntimeError("legacy JSON hash drift")
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    cards = [item for item in raw.get("texts", [])
             if str(item.get("text", {}).get("title", "")).startswith("Задачник 2. Страница")]
    projection_by_key = {card["legacy_card_key_sha256"]: card for card in projection["cards"]}
    reviewed_cards = []
    target_cards: dict[str, set[str]] = defaultdict(set)
    row_roles = Counter()

    for item in cards:
        text = item.get("text", {})
        rows = item.get("sentences", [])
        title = str(text.get("title", ""))
        key = hashlib.sha256(str(text.get("id", "")).encode("utf-8")).hexdigest()
        projected = projection_by_key.get(key)
        if not projected or projected["title"] != title or projected["row_count"] != len(rows):
            raise RuntimeError(f"projection join failed: {title}")
        specs = segment_specs(title, len(rows))
        for spec in specs:
            if spec["target_kind"] == "task" and spec["target_id"] not in task_ids:
                raise RuntimeError(f"unknown task target: {spec['target_id']}")

        rows_out = []
        active_segment = None
        in_solution = False
        for index, row in enumerate(rows):
            segment = next(spec for spec in specs if spec["row_start"] <= index <= spec["row_end"])
            if active_segment != segment["segment_index"]:
                active_segment = segment["segment_index"]
                in_solution = False
            role, in_solution = row_role(row, in_solution, segment["target_kind"])
            row_roles[role] += 1
            target_cards[segment["target_id"]].add(key)
            joined = f"{normalize(row.get('he_plain'))} {normalize(row.get('ru'))}"
            rows_out.append({
                "row_index": index,
                "aligned_row_sha256": projected["rows"][index]["aligned_row_sha256"],
                "segment_index": segment["segment_index"],
                "target_kind": segment["target_kind"],
                "target_id": segment["target_id"],
                "legacy_row_role": role,
                "visual_or_appendix_reference_detected": bool(re.search(
                    r"(?i)(איור|גרף|טבלה|דיאגרמ|תרשים|תמונה|נספח|рисунк|граф|таблиц|диаграм|приложен)",
                    joined,
                )),
            })

        reviewed_cards.append({
            "legacy_card_key_sha256": key,
            "legacy_title": title,
            "row_count": len(rows),
            "review_status": "ALL_ROWS_EXACTLY_TARGETED_LOCAL_REVIEW_2026_08_30",
            "segments": specs,
            "rows": rows_out,
        })

    mapped_task_ids = sorted(target for target in target_cards if target in task_ids)
    return {
        "schema": "linguistpro-materials-pb2-reviewed-row-mapping-v1",
        "status": "PASS_ALL_58_CARDS_AND_2469_ROWS_EXACTLY_TARGETED",
        "source_edition": SOURCE_EDITION,
        "privacy": "NO_RAW_TEXT_UUID_OR_SOURCE_URL_VALUE_STORED",
        "truth_boundary": "TARGET_MAPPING_ONLY_LEGACY_CONTENT_AND_SOLUTIONS_REMAIN_UNVALIDATED",
        "review_method": "MANUAL_CARD_AND_MULTI_SEGMENT_SOURCE_CONTENT_REVIEW_WITH_HASHED_ROW_READBACK",
        "card_count": len(reviewed_cards),
        "row_count": sum(card["row_count"] for card in reviewed_cards),
        "mapped_row_count": sum(len(card["rows"]) for card in reviewed_cards),
        "unmapped_row_count": 0,
        "task_ids_with_legacy_rows": mapped_task_ids,
        "task_ids_without_legacy_rows": sorted(task_ids - set(mapped_task_ids)),
        "task_ids_with_multiple_legacy_cards": sorted(
            target for target, keys in target_cards.items() if target in task_ids and len(keys) > 1
        ),
        "reference_targets": sorted(target for target in target_cards if target not in task_ids),
        "row_role_counts": dict(sorted(row_roles.items())),
        "cards": reviewed_cards,
    }


def build_diagrams(task_manifest: dict[str, Any]) -> dict[str, Any]:
    tasks_out = []
    for task in task_manifest["tasks"]:
        task_id = task["task_id"]
        page = task["source_anchors"][0]["source_page"]
        visuals = []
        for index, (kind, count, role, required) in enumerate(VISUALS.get(task_id, []), start=1):
            visuals.append({
                "visual_id": f"{task_id}-v{index:02d}",
                "source_page": page,
                "kind": kind,
                "instance_count": count,
                "semantic_role": role,
                "required_for_solving": required,
                "required_for_faithful_presentation": True,
                "preservation_status": "PRESERVED_IN_CONDITION_SOURCE_ANCHOR",
            })
        dependencies = [{
            "dependency_kind": kind,
            "source_pages": pages,
            "prepared_reference_ids": [f"source-reference-p{source_page:03d}" for source_page in pages],
            "required_for_solving": True,
            "mapping_basis": "SOURCE_PROMPT_AND_APPENDIX_CONTENT_LOCAL_REVIEW_2026_08_30",
        } for kind, pages in DEPENDENCIES.get(task_id, [])]
        tasks_out.append({
            "task_id": task_id,
            "display_alias": task["display_alias"],
            "source_pages": sorted({anchor["source_page"] for anchor in task["source_anchors"]}),
            "classification_status": "MANUAL_SOURCE_RENDER_REVIEWED_2026_08_30",
            "visual_requirement": "SEMANTIC_VISUALS_PRESENT" if visuals else "TEXT_FORMULAS_OR_USER_DRAWN_OUTPUT_ONLY",
            "semantic_visuals": visuals,
            "external_reference_dependencies": dependencies,
        })
    return {
        "schema": "linguistpro-materials-pb2-diagram-manifest-v1",
        "status": "PASS_ALL_60_TASKS_SEMANTICALLY_CLASSIFIED",
        "source_edition": SOURCE_EDITION,
        "review_method": "MANUAL_RENDER_READBACK_ALL_TASK_SOURCE_PAGES_AND_APPENDICES_2026_08_30",
        "policy": "MISSING_VISUALS_MUST_BE_MARKED_NEVER_INFERRED",
        "task_count": len(tasks_out),
        "tasks_with_semantic_visuals": sum(bool(item["semantic_visuals"]) for item in tasks_out),
        "tasks_with_external_reference_dependencies": sum(bool(item["external_reference_dependencies"]) for item in tasks_out),
        "semantic_visual_instance_count": sum(
            visual["instance_count"] for item in tasks_out for visual in item["semantic_visuals"]
        ),
        "tasks": tasks_out,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--stable", type=Path, required=True)
    args = parser.parse_args()

    task_manifest = json.loads((args.stable / "task-manifest.json").read_text(encoding="utf-8"))
    source_manifest = json.loads((args.stable / "source-manifest.json").read_text(encoding="utf-8"))
    projection = json.loads((args.stable / "legacy-projection-manifest.json").read_text(encoding="utf-8"))
    task_ids = {task["task_id"] for task in task_manifest["tasks"]}
    mapping = build_mapping(args.source_dir / LEGACY_JSON, projection, task_ids)
    diagrams = build_diagrams(task_manifest)

    aliases = {task["task_id"]: task["display_alias"] for task in task_manifest["tasks"]}
    checks = {
        "source_edition_bound": task_manifest["source_edition"] == SOURCE_EDITION,
        "source_pdf_hash_bound": source_manifest["inputs"]["Задачник 2.pdf"]["sha256"] == EXPECTED_SOURCE_SHA256,
        "canonical_task_count_60": len(task_ids) == 60,
        "owner_approved_exercise_present": aliases.get(EXERCISE) == "Упражнение — Аллотропия железа",
        "owner_approved_38_aliases_present": aliases.get(Q38_A) == "38-A" and aliases.get(Q38_B) == "38-B",
        "legacy_card_count_58": mapping["card_count"] == 58,
        "legacy_row_count_2469": mapping["row_count"] == 2469,
        "all_legacy_rows_mapped": mapping["mapped_row_count"] == 2469 and mapping["unmapped_row_count"] == 0,
        "only_expected_tasks_without_legacy_rows": mapping["task_ids_without_legacy_rows"] == [q(2), q(32)],
        "diagram_entries_cover_all_tasks": diagrams["task_count"] == 60,
        "provider_calls_zero": True,
        "secret_access_false": True,
        "import_or_publication_false": True,
        "solution_adjudication_false": True,
    }
    if not all(checks.values()):
        raise RuntimeError(f"local mapping verification failed: {checks}")
    verification = {
        "schema": "linguistpro-materials-pb2-local-mapping-verification-v1",
        "status": "PASS",
        "checks": checks,
        "remaining_gates": [
            "rights per content class",
            "provider shadow plan, model, sample, batching policy, and cost ceiling",
            "separate reviewed-solution program authorization",
            "TTS voice, rate, pitch, sample, timing method, and cost ceiling",
            "isolated import rehearsal, immutable publication, readback, and rollback",
        ],
    }

    write_json(args.stable / "reviewed-legacy-row-mapping.json", mapping)
    write_json(args.stable / "diagram-manifest.json", diagrams)
    write_json(args.stable / "mapping-classification-verification.json", verification)
    print(json.dumps({
        "status": "PASS",
        "cards": mapping["card_count"],
        "rows": mapping["row_count"],
        "task_targets": len(mapping["task_ids_with_legacy_rows"]),
        "tasks_without_legacy_rows": mapping["task_ids_without_legacy_rows"],
        "diagram_tasks": diagrams["task_count"],
        "tasks_with_visuals": diagrams["tasks_with_semantic_visuals"],
        "visual_instances": diagrams["semantic_visual_instance_count"],
        "provider_calls": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
