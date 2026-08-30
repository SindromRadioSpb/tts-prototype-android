#!/usr/bin/env python3
"""Build source-bound Materials Science PB2 candidates locally.

This program is deliberately offline. It never reads credentials, calls a provider,
authors solutions, imports data, synthesizes audio, or publishes. The first authorized
run implements B01/pass 1 only; later batches reuse the same finite 6x10 ledger.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any


SOURCE_PDF = "Задачник 2.pdf"
LEGACY_JSON = "Материаловедение_library_export_20260119.json"
SOURCE_PDF_SHA256 = "3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435"
LEGACY_JSON_SHA256 = "2a2f3191dd73a5e5bc99b096cda704a54172b33ebd3416c969d2f03299e2cb21"
SOURCE_EDITION = "problem-book-2-pdf-sha256-3d87b9f5"
BUILD_SCHEMA = "linguistpro-materials-pb2-local-build-v1"
MAX_PASSES = 2
BATCH_SIZE = 10


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def git_head(repo: Path) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=repo, text=True, encoding="utf-8"
    ).strip()


def hebrew_skeleton(value: str | None) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    return "".join(ch for ch in normalized if "\u05d0" <= ch <= "\u05ea")


def has_niqqud(value: str | None) -> bool:
    return any("\u0591" <= ch <= "\u05c7" and unicodedata.category(ch) == "Mn" for ch in (value or ""))


def q(number: int) -> str:
    return f"materials-science-y1-pb2-q{number:03d}"


EXERCISE = "materials-science-y1-pb2-exercise-p005-allotropy"


# Exact pass-1 condition boundaries established by visual readback of the prepared
# source pages. Rows outside these lists remain untouched legacy evidence.
LEGACY_SELECTIONS: dict[str, dict[str, Any]] = {
    q(1): {"title": "Задачник 2. Страница 3", "rows": [
        (1, "task_heading"), (2, "condition"),
    ]},
    EXERCISE: {"title": "Задачник 2. Страница 5", "rows": [
        (1, "task_heading"), (2, "subpart"), (3, "subpart"),
        (4, "subpart"), (5, "subpart"), (6, "diagram_reference"),
        (7, "subpart"), (8, "subpart"),
    ]},
    q(3): {"title": "Задачник 2. Страница 6.1", "rows": [
        (1, "task_heading"), (2, "source_note"), (3, "source_note"),
        (4, "source_note"), (5, "source_note"), (6, "subpart"),
        (7, "subpart"), (8, "subpart"),
    ]},
    q(4): {"title": "Задачник 2. Страница 6.2", "rows": [
        (1, "task_heading"), (2, "condition"), (3, "subpart"),
        (4, "subpart"), (5, "subpart"), (6, "subpart"),
    ]},
    q(5): {"title": "Задачник 2. Страница 6.3", "rows": [
        (2, "task_heading"), (3, "subpart"), (4, "subpart"),
        (5, "subpart"), (6, "subpart"),
    ]},
    q(6): {"title": "Задачник 2. Страница 7", "duplicate_title": "Задачник 2. Страница 7_", "rows": [
        (1, "task_heading"), (2, "condition"), (3, "source_note"),
        (4, "table_data"), (5, "subpart"), (6, "subpart"),
        (7, "subpart"), (8, "subpart"), (9, "subpart"),
    ]},
    q(7): {"title": "Задачник 2. Страница 8", "rows": [
        (1, "task_heading"), (2, "condition"), (3, "condition"),
        (4, "source_note"), (5, "table_data"), (6, "table_data"),
        (7, "table_data"), (8, "table_data"), (9, "table_data"),
        (10, "subpart"), (11, "subpart"), (12, "subpart"),
        (13, "subpart"), (14, "subpart"), (15, "subpart"),
    ]},
    q(8): {"title": "Задачник 2. Страница 9", "rows": [
        (1, "task_heading"), (2, "condition"), (3, "subpart"),
        (4, "subpart"), (5, "subpart"), (6, "subpart"),
        (7, "subpart"), (8, "subpart"), (9, "subpart"),
        (10, "subpart"), (11, "subpart"), (12, "subpart"),
    ]},
    q(9): {"title": "Задачник 2. Страница 12", "rows": [
        (1, "task_heading"), (2, "condition"), (3, "condition"),
        (4, "table_data"), (5, "subpart"), (6, "subpart"),
        (7, "subpart"), (8, "subpart"),
    ]},
}


MANUAL_SOURCE_ROWS: dict[str, list[dict[str, Any]]] = {
    q(2): [
        {"kind": "task_heading", "source_page": 4, "he": "שאלה 2."},
        {"kind": "condition", "source_page": 4,
         "he": "לגבי כל משפט סמן \"נכון\" או \"לא נכון\" ונמק את קביעתך."},
        {"kind": "subpart", "source_page": 4, "he": "א. נחושת שייכת לחומרים גבישיים. נמק."},
        {"kind": "subpart", "source_page": 4,
         "he": "ב. סריג גבישי הוא מבנה של אטומים בחומר מוצק ובנוזל. נמק."},
        {"kind": "subpart", "source_page": 4,
         "he": "ג. ברזל במצב מוצק מסוגל לשנות את הסריג הגבישי שלו. נמק."},
        {"kind": "subpart", "source_page": 4,
         "he": "ד. גרעין בחומר רב גבישי הוא אזור בעל סדר מושלם של אטומים. נמק."},
        {"kind": "subpart", "source_page": 4,
         "he": "ה. יכולת החומר להתחמצן תלויה במבנה של האטום. נמק."},
        {"kind": "subpart", "source_page": 5,
         "he": "ו. בין יונים של ברזל קיים קשר יוני. נמק."},
    ],
    q(8): [
        {"kind": "table_data", "source_page": 9, "insert_at": 2,
         "he": "נתוני הטבלה F(N) / L(mm): 0 / 50.000; 19,000 / 50.048; 41,800 / 50.106; "
               "52,250 / 53.000; 56,525 / 57.500; 48,450 / 64.100. "
               "שורת הדוגמה: σ=200 MPa ו-ε=0.096% עבור F=19,000 N ו-L=50.048 mm."},
    ],
}


# B02/pass 1 boundaries were established by full-page visual readback of source
# pages 14-18, 20-23 and 25. Legacy rows after the listed ranges are worked
# solutions and are intentionally excluded.
B02_LEGACY_SELECTIONS: dict[str, dict[str, Any]] = {
    q(10): {"title": "Задачник 2. Страница 13", "rows": [
        *((index, "diagram_reference" if index == 1 else "condition") for index in range(1, 10)),
        *((index, "subpart") for index in range(10, 14)),
    ]},
    q(11): {"title": "Задачник 2. Страница 15", "rows": [
        (1, "task_heading"), (2, "condition"), (3, "table_reference"),
        *((index, "table_data") for index in range(4, 12)),
        *((index, "subpart") for index in range(12, 16)),
    ]},
    q(12): {"title": "Задачник 2. Страница 16", "rows": [
        (1, "diagram_reference"), (2, "condition"),
        *((index, "subpart") for index in range(3, 12)),
    ]},
    q(13): {"title": "Задачник 2. Страница 17", "rows": [
        *((index, "condition") for index in range(3, 9)),
        *((index, "subpart") for index in range(9, 16)),
    ]},
    q(14): {"title": "Задачник 2. Страница 18", "rows": [
        (1, "task_heading"), (2, "subpart"), (3, "diagram_reference"),
        *((index, "condition") for index in range(4, 9)),
        (9, "subpart"), (10, "subpart"),
    ]},
    q(15): {"title": "Задачник 2. Страница 20", "rows": [
        *((index, "condition") for index in range(2, 7)),
        *((index, "table_data") for index in range(7, 11)),
        *((index, "subpart") for index in range(11, 15)),
    ]},
    q(16): {
        "title": "Задачник 2. Страница 21",
        "legacy_card_key_sha256": "d6ac4bc9488ae1276fe09e4db76e3ca438e483fe8bfb964fe1a6af08319250dd",
        "rejected_legacy_card_key_sha256": "55b3ac0149498ee336f681d696f2cc88044b0463c073155801d8be1a6c3ea121",
        "raw_required_text": "Ø50 mm",
        "raw_rejected_text": "Ø35 mm",
        "rows": [
            *((index, "condition") for index in range(0, 12)),
            *((index, "table_data") for index in range(12, 22)),
            *((index, "subpart") for index in range(22, 25)),
        ],
    },
    q(17): {"title": "Задачник 2. Страница 22", "rows": [
        *((index, "condition") for index in range(1, 6)),
        *((index, "subpart") for index in range(6, 17)),
    ]},
    q(18): {"title": "Задачник 2. Страница 23", "rows": [
        (1, "condition"), (2, "table_reference"),
        *((index, "subpart") for index in range(3, 12)),
    ]},
    q(19): {"title": "Задачник 2. Страница 25", "rows": [
        (3, "task_heading"),
        *((index, "subpart") for index in range(4, 10)),
        *((index, "table_data") for index in range(10, 14)),
        *((index, "subpart") for index in range(14, 19)),
        *((index, "table_data") for index in range(19, 25)),
        (25, "subpart"),
    ]},
}


B02_MANUAL_SOURCE_ROWS: dict[str, list[dict[str, Any]]] = {
    task_id: [{
        "kind": "task_heading",
        "source_page": source_page,
        "insert_at": 0,
        "he": f"שאלה {number}.",
    }]
    for number, source_page, task_id in (
        (10, 14, q(10)),
        (12, 16, q(12)),
        (13, 17, q(13)),
        (15, 20, q(15)),
        (16, 21, q(16)),
        (17, 22, q(17)),
        (18, 23, q(18)),
    )
}


B02_PASS2_TEXT_CORRECTIONS: dict[str, dict[str, Any]] = {
    f"{q(number)}-r001": {
        "source_page": source_page,
        "reason": "SOURCE_TASK_HEADING_VISUALLY_CONFIRMED_WITH_FINAL_PERIOD",
        "new": {
            "he": f"שאלה {number}.",
            "he_niqqud": f"שְׁאֵלָה {number}.",
            "transliteration": f"She'ela {number}.",
            "ru": f"Вопрос {number}.",
        },
    }
    for number, source_page in (
        (10, 14), (11, 15), (12, 16), (13, 17), (15, 20),
        (16, 21), (17, 22), (18, 23), (19, 25),
    )
}


B03_LEGACY_SELECTIONS: dict[str, dict[str, Any]] = {
    q(20): {"title": "Задачник 2. Страница 26", "rows": [
        *((index, "subpart") for index in range(0, 5)),
        *((index, "source_note") for index in range(5, 10)),
        (10, "subpart"), (11, "condition"), (12, "subpart"),
    ]},
    q(21): {"title": "Задачник 2. Страница 27", "rows": [
        (1, "task_heading"),
        *((index, "condition") for index in range(2, 7)),
        *((index, "table_data") for index in range(7, 18)),
        *((index, "subpart") for index in range(18, 24)),
    ]},
    q(22): {"title": "Задачник 2. Страница 28", "rows": [
        (1, "task_heading"), (2, "table_reference"),
        (3, "table_data"), (4, "table_data"),
        *((index, "subpart") for index in range(5, 10)),
    ]},
    q(23): {"title": "Задачник 2. Страница 29", "rows": [
        (1, "task_heading"), (2, "diagram_reference"), (3, "condition"),
        *((index, "subpart") for index in range(4, 19)),
    ]},
    q(24): {"title": "Задачник 2. Страница 30 ВАЖНО!", "rows": [
        (1, "source_note"), (2, "task_heading"),
        *((index, "subpart") for index in range(3, 11)),
    ]},
    q(25): {"title": "Задачник 2. Страница 31", "rows": [
        (2, "diagram_reference"),
        *((index, "subpart") for index in range(3, 6)),
    ]},
    q(26): {"title": "Задачник 2. Страница 33", "rows": [
        (2, "diagram_reference"),
        *((index, "subpart") for index in range(3, 9)),
    ]},
    q(27): {"title": "Задачник 2. Страница 35-36", "rows": [
        (1, "task_heading"),
        *((index, "subpart") for index in range(2, 8)),
        *((index, "diagram_label") for index in range(8, 13)),
        *((index, "subpart") for index in range(13, 18)),
    ]},
    q(28): {"title": "Задачник 2. Страница 36", "rows": [
        (1, "task_heading"), (2, "diagram_reference"),
        *((index, "subpart") for index in range(3, 8)),
    ]},
    q(29): {"title": "Задачник 2. Страница 37", "rows": [
        (1, "task_heading"), (2, "diagram_reference"),
        (3, "subpart"), (4, "subpart"),
    ]},
}


B03_MANUAL_SOURCE_ROWS: dict[str, list[dict[str, Any]]] = {
    task_id: [{
        "kind": "task_heading",
        "source_page": source_page,
        "insert_at": 0,
        "he": f"שאלה {number}.",
    }]
    for number, source_page, task_id in (
        (20, 26, q(20)), (25, 31, q(25)), (26, 33, q(26)),
    )
}


B03_SOURCE_ANCHOR_OVERRIDES: dict[str, list[dict[str, Any]]] = {
    q(27): [
        {"source_page": 35, "normalized_bbox": [0.0, 0.0, 1.0, 1.0], "role": "condition"},
        {"source_page": 36, "normalized_bbox": [0.0, 0.0, 1.0, 0.34], "role": "condition_continuation"},
    ],
}


B04_TASK_IDS = [
    q(30), q(31), q(32), q(33), q(34), q(35), q(36), q(37),
    "materials-science-y1-pb2-p045-q038",
    "materials-science-y1-pb2-p047-q038",
]


# Question 30 is one printed task whose condition was split across two legacy
# cards. The two source-matching condition segments are concatenated in source
# order; solution rows from both cards remain excluded.
B04_LEGACY_SELECTIONS: dict[str, list[dict[str, Any]]] = {
    q(30): [
        {"title": "Задачник 2. Страница 38.1", "rows": [
            *((index, "subpart") for index in range(1, 7)),
        ]},
        {"title": "Задачник 2. Страница 38.2", "rows": [
            *((index, "subpart") for index in range(1, 11)),
        ]},
    ],
    q(31): [{"title": "Задачник 2. Страница 39.1", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 7)),
    ]}],
    q(32): [],
    q(33): [{"title": "Задачник 2. Страница 40", "rows": [
        (1, "task_heading"), (2, "condition"),
        *((index, "subpart") for index in range(3, 9)), (9, "table_data"),
    ]}],
    q(34): [{"title": "Задачник 2. Страница 41 (Закалка. Нужна схема Гроссман, Джемини)", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 17)),
    ]}],
    q(35): [{"title": "Задачник 2. Страница 42 (Распечатать задачу к решению!)", "rows": [
        *((index, "condition") for index in range(2, 7)),
        *((index, "table_data") for index in range(7, 30)),
        *((index, "condition") for index in range(30, 33)),
        *((index, "subpart") for index in range(33, 37)),
    ]}],
    q(36): [{"title": "Задачник 2. Страница 43", "rows": [
        (1, "task_heading"), *((index, "condition") for index in range(2, 7)),
        *((index, "table_data") for index in range(7, 20)),
        *((index, "subpart") for index in range(20, 27)),
    ]}],
    q(37): [{"title": "Задачник 2. Страница 44", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 14)),
    ]}],
    "materials-science-y1-pb2-p045-q038": [{"title": "Задачник 2. Страница 45-46", "rows": [
        *((index, "condition") for index in range(1, 3)),
        *((index, "subpart") for index in range(3, 8)),
    ]}],
    "materials-science-y1-pb2-p047-q038": [{"title": "Задачник 2. Страница 47", "rows": [
        (1, "source_note"), (2, "task_heading"),
        *((index, "condition") for index in range(3, 10)),
        *((index, "subpart") for index in range(10, 13)),
    ]}],
}


B04_MANUAL_SOURCE_ROWS: dict[str, list[dict[str, Any]]] = {
    q(30): [{"kind": "task_heading", "source_page": 38, "insert_at": 0, "he": "שאלה 30."}],
    q(32): [
        {"kind": "task_heading", "source_page": 39, "he": "שאלה 32."},
        {"kind": "condition", "source_page": 39, "he": "שלוש פלדות (מסומנות לפי התקן SAE) נבדקו במכונת מתיחה לאחר טיפול תרמי:"},
        {"kind": "condition", "source_page": 39, "he": "חיסום ולאחר מכן הרפיה בטמפרטורה 500°C במשך שעה אחת."},
        {"kind": "diagram_reference", "source_page": 39, "he": "דיאגרמות המתיחה של הפלדות הללו מוצגות באיור לשאלה 7."},
        {"kind": "source_note", "source_page": 39, "he": "שימוש בדיאגרמות וענה:"},
        {"kind": "subpart", "source_page": 39, "he": "א. מהי הפלדה בעלת החוזק הגבוה ביותר? נמקו את תשובתכם."},
        {"kind": "subpart", "source_page": 39, "he": "ב. מדוע הפלדה שקבעתם בסעיף א' היא בעלת חוזק גבוה יותר מאשר שתי הפלדות האחרות?"},
        {"kind": "subpart", "source_page": 39, "he": "ג. האם מודול האלסטיות של הפלדות הללו שונה? נמקו את תשובתכם."},
        {"kind": "subpart", "source_page": 39, "he": "ד. מהו המבנה המתקבל בפלדות הללו לאחר שעברו טיפול תרמי?"},
        {"kind": "subpart", "source_page": 39, "he": "ה. האם צורת הדיאגרמות משתנה עם עליית טמפרטורת ההרפיה עד 500°C (זמן ההרפיה לא משתנה)? אם כן, עליך להסביר מהו השינוי. אם לא, עליך להסביר מהי הסיבה לכך."},
    ],
    q(35): [{"kind": "task_heading", "source_page": 42, "insert_at": 0, "he": "שאלה 35."}],
    "materials-science-y1-pb2-p045-q038": [
        {"kind": "task_heading", "source_page": 45, "insert_at": 0, "he": "שאלה 38."},
    ],
}


B04_SOURCE_ANCHOR_OVERRIDES: dict[str, list[dict[str, Any]]] = {
    "materials-science-y1-pb2-p045-q038": [
        {"source_page": 45, "normalized_bbox": [0.0, 0.0, 1.0, 1.0], "role": "condition"},
        {"source_page": 46, "normalized_bbox": [0.0, 0.0, 1.0, 0.52], "role": "condition_continuation"},
    ],
}


B04_HEADING_LABELS = {
    q(30): "30", q(31): "31", q(32): "32", q(33): "33", q(34): "34",
    q(35): "35", q(36): "36", q(37): "37",
    "materials-science-y1-pb2-p045-q038": "38",
    "materials-science-y1-pb2-p047-q038": "38",
}


B04_INITIAL_DISCREPANCIES = [
    {"discrepancy_id": "B04-D01-Q030-SPLIT-LEGACY", "task_id": q(30), "severity": "INFO",
     "class": "ONE_SOURCE_TASK_SPLIT_ACROSS_TWO_LEGACY_CARDS",
     "disposition": "SOURCE_ORDERED_CONDITION_SEGMENTS_CONCATENATED_NO_SOLUTION_ROWS"},
    {"discrepancy_id": "B04-D02-Q030-NO-HEADING", "task_id": q(30), "severity": "MAJOR",
     "class": "SOURCE_TASK_HEADING_ABSENT_FROM_LEGACY_CONDITION",
     "disposition": "SOURCE_HEBREW_HEADING_TRANSCRIBED_DERIVED_COLUMNS_PENDING_PASS2"},
    {"discrepancy_id": "B04-D03-Q032-NO-LEGACY", "task_id": q(32), "severity": "MAJOR",
     "class": "NO_LEGACY_ROWS",
     "disposition": "SOURCE_HEBREW_CONDITION_TRANSCRIBED_DERIVED_COLUMNS_PENDING_PASS2"},
    {"discrepancy_id": "B04-D04-Q035-WRONG-LEGACY-HEADING", "task_id": q(35), "severity": "MAJOR",
     "class": "LEGACY_HEADING_HAS_WRONG_TASK_NUMBER",
     "disposition": "SOURCE_Q035_HEADING_TRANSCRIBED_LEGACY_Q034_HEADING_EXCLUDED"},
    {"discrepancy_id": "B04-D05-Q038A-MISSING-CONTINUATION", "task_id": "materials-science-y1-pb2-p045-q038", "severity": "CRITICAL",
     "class": "PREPARED_SOURCE_ANCHOR_OMITS_CONDITION_CONTINUATION_PAGE_46",
     "disposition": "PASS1_SOURCE_ANCHOR_EXTENDED_PREPARED_ASSET_REBUILD_REQUIRED"},
    {"discrepancy_id": "B04-D06-DUPLICATE-PRINTED-Q038", "task_id": "materials-science-y1-pb2-p047-q038", "severity": "INFO",
     "class": "DUPLICATE_PRINTED_TASK_NUMBER_DISTINCT_SOURCE_TASKS",
     "disposition": "PRESERVE_DISTINCT_IDS_WITH_DISPLAY_ALIASES_38_A_AND_38_B"},
    *[
        {"discrepancy_id": f"B04-REF-{task_id}", "task_id": task_id, "severity": "MAJOR",
         "class": "EXTERNAL_APPENDIX_REQUIRED_FOR_TASK_COMPLETION",
         "disposition": "APPENDIX_DEPENDENCY_PRESERVED_NO_ANSWER_INFERENCE"}
        for task_id in (q(30), q(33), q(36), "materials-science-y1-pb2-p047-q038")
    ],
]


B05_TASK_IDS = [q(number) for number in range(39, 49)]


B05_LEGACY_SELECTIONS: dict[str, list[dict[str, Any]]] = {
    q(39): [{"title": "Задачник 2. Страница 48-49", "rows": [
        (1, "task_heading"), *((index, "condition") for index in range(2, 9)),
        *((index, "subpart") for index in range(9, 15)),
    ]}],
    q(40): [{"title": "Задачник 2. Страница 48-49", "rows": [
        (38, "task_heading"), *((index, "subpart") for index in range(39, 52)),
    ]}],
    q(41): [{"title": "Задачник 2. Страница 51", "rows": [
        (1, "task_heading"), (2, "diagram_reference"), (3, "source_note"),
        *((index, "table_data") for index in range(4, 10)),
        *((index, "subpart") for index in range(10, 16)),
    ]}],
    q(42): [{"title": "Задачник 2. Страница 52", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 6)),
    ]}],
    q(43): [{"title": "Задачник 2. Страница 53", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 17)),
    ]}],
    q(44): [{"title": "Задачник 2. Страница 54", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 8)),
    ]}],
    q(45): [{"title": "Задачник 2. Страница 55", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 12)),
    ]}],
    q(46): [{"title": "Задачник 2. Страница 56", "rows": [
        (1, "source_note"), (2, "source_note"), (3, "task_heading"),
        (4, "diagram_reference"), *((index, "subpart") for index in range(5, 9)),
    ]}],
    q(47): [{"title": "Задачник 2. Страница 57", "rows": [
        (1, "task_heading"), (2, "diagram_reference"),
        *((index, "subpart") for index in range(3, 10)),
    ]}],
    q(48): [{"title": "Задачник 2. Страница 58", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 8)),
    ]}],
}


B05_MANUAL_SOURCE_ROWS: dict[str, list[dict[str, Any]]] = {
    q(41): [{"kind": "source_note", "source_page": 51, "insert_at": 0, "he": "סגסוגות אלומיניום"}],
}


B05_SOURCE_ANCHOR_OVERRIDES: dict[str, list[dict[str, Any]]] = {
    q(39): [
        {"source_page": 48, "normalized_bbox": [0.0, 0.0, 1.0, 0.5], "role": "condition",
         "prepared_asset_status": "CROP_REBUILD_REQUIRED_BEFORE_CANONICAL_PACKAGE"},
    ],
}


B05_HEADING_LABELS = {q(number): str(number) for number in range(39, 49)}


B05_INITIAL_DISCREPANCIES = [
    {"discrepancy_id": "B05-D01-Q039-CROP", "task_id": q(39), "severity": "CRITICAL",
     "class": "PREPARED_SOURCE_ANCHOR_TRUNCATES_CONDITION_PAGE_48",
     "disposition": "PASS1_SOURCE_ANCHOR_EXTENDED_PREPARED_ASSET_REBUILD_REQUIRED"},
    {"discrepancy_id": "B05-D02-Q041-COMBINED-HEADING", "task_id": q(41), "severity": "MINOR",
     "class": "LEGACY_HEADING_COMBINES_SOURCE_SECTION_TITLE_AND_TASK_NUMBER",
     "disposition": "SECTION_TITLE_PRESERVED_SEPARATELY_TASK_HEADING_REVIEWED_IN_PASS2"},
    *[
        {"discrepancy_id": f"B05-REF-{task_id}", "task_id": task_id, "severity": "MAJOR",
         "class": "EXTERNAL_APPENDIX_REQUIRED_FOR_TASK_COMPLETION",
         "disposition": "APPENDIX_DEPENDENCY_PRESERVED_NO_ANSWER_INFERENCE"}
        for task_id in (q(39), q(40), q(44), q(47))
    ],
]


B06_TASK_IDS = [q(number) for number in range(49, 59)]


B06_LEGACY_SELECTIONS: dict[str, list[dict[str, Any]]] = {
    q(49): [{"title": "Задачник 2. Страница 59", "rows": [
        (1, "task_heading"), *((index, "condition") for index in range(2, 7)),
        *((index, "subpart") for index in range(8, 12)),
    ]}],
    q(50): [{"title": "Задачник 2. Страница 60", "rows": [
        (1, "task_heading"), *((index, "condition") for index in range(2, 6)),
        *((index, "subpart") for index in range(6, 9)),
    ]}],
    q(51): [{"title": "Задачник 2. Страница 61", "rows": [
        (1, "task_heading"), (2, "diagram_reference"),
        *((index, "subpart") for index in range(3, 12)),
    ]}],
    q(52): [{"title": "Задачник 2. Страница 62", "rows": [
        (1, "task_heading"), *((index, "subpart") for index in range(2, 9)),
    ]}],
    q(53): [{"title": "Задачник 2. Страница 63 (1,2 и 3)", "rows": [
        (2, "task_heading"), *((index, "subpart") for index in range(3, 9)),
    ]}],
    q(54): [{"title": "Задачник 2. Страница 63 (1,2 и 3)", "rows": [
        (29, "source_note"), (30, "task_heading"),
        *((index, "subpart") for index in range(31, 37)),
    ]}],
    q(55): [{"title": "Задачник 2. Страница 63 (1,2 и 3)", "rows": [
        (49, "task_heading"), *((index, "subpart") for index in range(50, 53)),
    ]}],
    q(56): [{"title": "Задачник 2. Страница 64 (1 и 2), 65", "rows": [
        (2, "task_heading"), *((index, "subpart") for index in range(3, 10)),
    ]}],
    q(57): [{"title": "Задачник 2. Страница 64 (1 и 2), 65", "rows": [
        (31, "task_heading"), (32, "diagram_reference"),
        *((index, "condition") for index in range(33, 35)),
        *((index, "subpart") for index in range(35, 37)),
    ]}],
    q(58): [{"title": "Задачник 2. Страница 64 (1 и 2), 65", "rows": [
        (51, "task_heading"), (52, "diagram_reference"),
        *((index, "subpart") for index in range(53, 56)),
    ]}],
}


B06_MANUAL_SOURCE_ROWS: dict[str, list[dict[str, Any]]] = {
    q(49): [
        {"kind": "source_note", "source_page": 59, "insert_at": 0, "he": "פלדות בלתי מחלידות."},
        {"kind": "condition", "source_page": 59, "insert_at": 7,
         "he": "פלדת Duplex (שילוב פריט 50% + אוסטניט 50%) מסוגסגת ע\"י כרום (Cr), מוליבדן (Mo), ונדיום (V) ועוד."},
    ],
    q(52): [{"kind": "source_note", "source_page": 62, "insert_at": 0, "he": "פולימרים."}],
    q(56): [{"kind": "source_note", "source_page": 64, "insert_at": 0, "he": "חומרים מרוכבים"}],
}


B06_SOURCE_ANCHOR_OVERRIDES: dict[str, list[dict[str, Any]]] = {}
B06_HEADING_LABELS = {q(number): str(number) for number in range(49, 59)}


B06_INITIAL_DISCREPANCIES = [
    *[
        {"discrepancy_id": f"B06-SECTION-{task_id}", "task_id": task_id, "severity": "MINOR",
         "class": "LEGACY_HEADING_COMBINES_SOURCE_SECTION_TITLE_AND_TASK_NUMBER",
         "disposition": "SECTION_TITLE_PRESERVED_SEPARATELY_TASK_HEADING_REVIEWED_IN_PASS2"}
        for task_id in (q(49), q(52), q(56))
    ],
    {"discrepancy_id": "B06-D04-Q049-DUPLEX-DESCRIPTION", "task_id": q(49), "severity": "CRITICAL",
     "class": "LEGACY_CONDITION_CONFLICTS_WITH_SOURCE_DUPLEX_PHASE_DESCRIPTION",
     "disposition": "SOURCE_AUSTENITE_TEXT_TRANSCRIBED_LEGACY_MARTENSITE_ROW_EXCLUDED"},
    {"discrepancy_id": "B06-D05-Q057-Q058-SHARED-LEGACY", "task_id": q(58), "severity": "INFO",
     "class": "MULTIPLE_SOURCE_TASKS_SHARE_ONE_LEGACY_CARD",
     "disposition": "EXACT_SOURCE_ORDERED_SEGMENTS_SELECTED_NO_CROSS_TASK_MERGE"},
]


# Pass 2 is deliberately a terminal classification pass, not a second generation
# attempt. Only two text changes are safe from direct visual source evidence. The
# remaining legacy learning columns are preserved as evidence and fail closed.
PASS2_TEXT_CORRECTIONS: dict[str, dict[str, Any]] = {
    f"{q(1)}-r001": {
        "source_page": 3,
        "reason": "SOURCE_HEADING_INCLUDES_FINAL_PERIOD",
        "new": {
            "he": "שאלה 1.",
            "he_niqqud": "שְׁאֵלָה 1.",
            "transliteration": "She'ela 1.",
            "ru": "Вопрос 1.",
        },
    },
    f"{q(7)}-r001": {
        "source_page": 8,
        "reason": "SOURCE_HEADING_IS_QUESTION_7_AND_2017_IS_A_SEPARATE_YEAR_LABEL",
        "new": {
            "he": "שאלה 7.",
            "he_niqqud": "שְׁאֵלָה 7.",
            "transliteration": "She'ela 7.",
            "ru": "Вопрос 7.",
        },
    },
}


# Visual readback of full source pages 6-7 proved that the Prepare crops were
# overlapping and, for q003/q005, incomplete. These source-PDF coordinates replace
# the candidate anchors without rewriting the historical Prepare manifest.
PASS2_ANCHOR_CORRECTIONS: dict[str, list[dict[str, Any]]] = {
    q(3): [
        {"source_page": 6, "normalized_bbox": [0.0, 0.0, 1.0, 0.52], "role": "condition"},
    ],
    q(4): [
        {"source_page": 6, "normalized_bbox": [0.0, 0.49, 1.0, 0.77], "role": "condition"},
    ],
    q(5): [
        {"source_page": 6, "normalized_bbox": [0.0, 0.76, 1.0, 1.0], "role": "condition"},
        {"source_page": 7, "normalized_bbox": [0.0, 0.0, 1.0, 0.19], "role": "condition_continuation"},
    ],
    q(6): [
        {"source_page": 7, "normalized_bbox": [0.0, 0.18, 1.0, 1.0], "role": "condition"},
    ],
}


def read_inputs(stable: Path, source_dir: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    source_pdf = source_dir / SOURCE_PDF
    legacy_path = source_dir / LEGACY_JSON
    if sha256_file(source_pdf) != SOURCE_PDF_SHA256:
        raise RuntimeError("source PDF hash drift")
    if sha256_file(legacy_path) != LEGACY_JSON_SHA256:
        raise RuntimeError("legacy JSON hash drift")
    task_manifest = json.loads((stable / "prepare" / "task-manifest.json").read_text(encoding="utf-8"))
    mapping = json.loads((stable / "prepare" / "reviewed-legacy-row-mapping.json").read_text(encoding="utf-8"))
    diagrams = json.loads((stable / "prepare" / "diagram-manifest.json").read_text(encoding="utf-8"))
    prepared = json.loads((stable / "prepare" / "prepared-input-manifest.json").read_text(encoding="utf-8"))
    raw = json.loads(legacy_path.read_text(encoding="utf-8"))
    cards = [item for item in raw.get("texts", []) if str(item.get("text", {}).get("title", "")).startswith("Задачник 2. Страница")]
    return task_manifest, mapping, diagrams, prepared, cards


def make_plan(tasks: list[dict[str, Any]], base_head: str) -> dict[str, Any]:
    batches = []
    for index in range(0, len(tasks), BATCH_SIZE):
        current = tasks[index:index + BATCH_SIZE]
        batches.append({
            "batch_id": f"B{index // BATCH_SIZE + 1:02d}",
            "task_ids": [task["task_id"] for task in current],
            "task_count": len(current),
            "maximum_passes": MAX_PASSES,
            "state": "PLANNED",
        })
    return {
        "schema": f"{BUILD_SCHEMA}.plan",
        "status": "OWNER_APPROVED_LOCAL_BUILD_STARTED",
        "source_edition": SOURCE_EDITION,
        "base_head": base_head,
        "batch_count": len(batches),
        "batch_size": BATCH_SIZE,
        "expected_task_count": len(tasks),
        "maximum_passes_per_batch": MAX_PASSES,
        "provider_calls_allowed": 0,
        "import_allowed": False,
        "publication_allowed": False,
        "solution_authoring_or_adjudication_allowed": False,
        "audio_allowed": False,
        "terminal_rule": "PASS_2_ENDS_WITH_PASS_OR_EXPLICIT_INCOMPLETE_NO_THIRD_PASS",
        "batches": batches,
    }


def prepared_page_index(prepared: dict[str, Any]) -> dict[tuple[str, int], dict[str, Any]]:
    result = {}
    for batch in prepared["batches"]:
        for page in batch["pages"]:
            result[(page["item_id"], page["source_page"])] = {
                "prepared_filename": batch["filename"],
                "prepared_pdf_sha256": batch["sha256"],
                "prepared_output_page": page["output_page"],
                "source_render_sha256": page["render_sha256"],
            }
    return result


def build_batch_b01(stable: Path, source_dir: Path, base_head: str) -> tuple[
    dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]
]:
    task_manifest, mapping, diagrams, prepared, raw_cards = read_inputs(stable, source_dir)
    tasks = task_manifest["tasks"]
    batch_tasks = tasks[:BATCH_SIZE]
    expected_ids = [q(1), q(2), EXERCISE, q(3), q(4), q(5), q(6), q(7), q(8), q(9)]
    if [item["task_id"] for item in batch_tasks] != expected_ids:
        raise RuntimeError("B01 task order drift")

    card_by_title = {item["text"]["title"]: item for item in raw_cards}
    mapped_by_title = {item["legacy_title"]: item for item in mapping["cards"]}
    diagram_by_task = {item["task_id"]: item for item in diagrams["tasks"]}
    prepared_index = prepared_page_index(prepared)
    records = []
    legacy_row_count = 0
    manual_row_count = 0
    niqqud_count = 0
    skeleton_mismatches = []
    incomplete_tasks = set()

    for task in batch_tasks:
        task_id = task["task_id"]
        rows = []
        selection = LEGACY_SELECTIONS.get(task_id)
        if selection:
            title = selection["title"]
            raw_card = card_by_title[title]
            mapped = mapped_by_title[title]
            mapped_rows = {row["row_index"]: row for row in mapped["rows"]}
            for order_index, (legacy_index, kind) in enumerate(selection["rows"]):
                source = raw_card["sentences"][legacy_index]
                map_row = mapped_rows[legacy_index]
                if map_row["target_id"] != task_id:
                    raise RuntimeError(f"legacy target drift: {task_id} row {legacy_index}")
                aligned = {
                    "he": str(source.get("he_plain", "")),
                    "he_niqqud": str(source.get("he_niqqud", "")),
                    "transliteration": str(source.get("translit", "")),
                    "ru": str(source.get("ru", "")),
                }
                if sha256_json(aligned) != map_row["aligned_row_sha256"]:
                    raise RuntimeError(f"legacy aligned row hash drift: {task_id} row {legacy_index}")
                skeleton_ok = hebrew_skeleton(aligned["he"]) == hebrew_skeleton(aligned["he_niqqud"])
                niqqud_count += int(has_niqqud(aligned["he_niqqud"]))
                row = {
                    "row_id": f"{task_id}-r{order_index + 1:03d}",
                    "order_index": order_index,
                    "semantic_kind": kind,
                    **aligned,
                    "source_binding_status": "PASS1_BOUNDARY_VISUALLY_REVIEWED_TEXT_EXACTNESS_PENDING_PASS2",
                    "learning_columns_status": "LEGACY_CANDIDATE_UNREVIEWED",
                    "hebrew_skeleton_matches_niqqud": skeleton_ok,
                    "legacy_evidence": {
                        "legacy_card_key_sha256": mapped["legacy_card_key_sha256"],
                        "legacy_title": title,
                        "legacy_row_index": legacy_index,
                        "aligned_row_sha256": map_row["aligned_row_sha256"],
                    },
                }
                row["candidate_row_sha256"] = sha256_json(row)
                rows.append(row)
                legacy_row_count += 1

            duplicate_title = selection.get("duplicate_title")
            duplicate_evidence = None
            if duplicate_title:
                primary_projection = next(item for item in json.loads(
                    (stable / "prepare" / "legacy-projection-manifest.json").read_text(encoding="utf-8")
                )["cards"] if item["title"] == title)
                duplicate_projection = next(item for item in json.loads(
                    (stable / "prepare" / "legacy-projection-manifest.json").read_text(encoding="utf-8")
                )["cards"] if item["title"] == duplicate_title)
                if primary_projection["rows_sha256"] != duplicate_projection["rows_sha256"]:
                    raise RuntimeError("duplicate question 6 legacy cards are not byte-equivalent")
                duplicate_evidence = {
                    "duplicate_title": duplicate_title,
                    "rows_sha256": duplicate_projection["rows_sha256"],
                    "comparison": "BYTE_EQUIVALENT_ROWS_PRIMARY_CARD_SELECTED",
                }
        else:
            duplicate_evidence = None

        for manual in MANUAL_SOURCE_ROWS.get(task_id, []):
            row = {
                "semantic_kind": manual["kind"],
                "he": manual["he"],
                "he_niqqud": None,
                "transliteration": None,
                "ru": None,
                "source_binding_status": "PASS1_MANUAL_SOURCE_TRANSCRIPTION_VISUALLY_REVIEWED",
                "learning_columns_status": "DERIVED_COLUMNS_PENDING_PASS2",
                "hebrew_skeleton_matches_niqqud": None,
                "source_page": manual["source_page"],
                "legacy_evidence": None,
            }
            insert_at = manual.get("insert_at")
            if insert_at is None:
                rows.append(row)
            else:
                rows.insert(insert_at, row)
            manual_row_count += 1
            incomplete_tasks.add(task_id)

        for order_index, row in enumerate(rows):
            row["row_id"] = f"{task_id}-r{order_index + 1:03d}"
            row["order_index"] = order_index
            row.pop("candidate_row_sha256", None)
            row["candidate_row_sha256"] = sha256_json(row)
        task_skeleton_mismatches = [
            row["row_id"] for row in rows if row["hebrew_skeleton_matches_niqqud"] is False
        ]
        skeleton_mismatches.extend(task_skeleton_mismatches)
        if task_skeleton_mismatches:
            incomplete_tasks.add(task_id)

        if not rows:
            raise RuntimeError(f"no B01 rows produced for {task_id}")

        anchors = []
        for anchor in task["source_anchors"]:
            page_key = (task_id, anchor["source_page"])
            if page_key not in prepared_index:
                raise RuntimeError(f"prepared source anchor missing: {page_key}")
            anchors.append({**anchor, **prepared_index[page_key]})
        visual = diagram_by_task[task_id]
        status = "PASS1_COMPLETE_PASS2_COLUMN_AND_EXACTNESS_REVIEW_REQUIRED"
        if task_skeleton_mismatches:
            status = "INCOMPLETE_HE_NIQQUD_ALIGNMENT_REQUIRES_SOURCE_BACKED_PASS2"
        elif task_id in incomplete_tasks:
            status = "INCOMPLETE_DERIVED_COLUMNS_PENDING_PASS2"
        record = {
            "task_id": task_id,
            "display_alias": task["display_alias"],
            "source_edition": SOURCE_EDITION,
            "source_pdf_sha256": SOURCE_PDF_SHA256,
            "source_anchors": anchors,
            "rows": rows,
            "visual_requirement": visual["visual_requirement"],
            "semantic_visuals": visual["semantic_visuals"],
            "external_reference_dependencies": visual["external_reference_dependencies"],
            "duplicate_legacy_evidence": duplicate_evidence,
            "hebrew_skeleton_mismatch_row_ids": task_skeleton_mismatches,
            "pass_1_status": status,
            "solution_rows_included": False,
            "provider_output_used": False,
        }
        record["candidate_task_sha256"] = sha256_json(record)
        records.append(record)

    candidates = {
        "schema": f"{BUILD_SCHEMA}.batch-candidates",
        "status": "B01_PASS1_COMPLETE_PASS2_REQUIRED_NOT_CANONICAL_NOT_IMPORTABLE",
        "batch_id": "B01",
        "pass_number": 1,
        "maximum_passes": MAX_PASSES,
        "base_head": base_head,
        "source_edition": SOURCE_EDITION,
        "truth_status": "LOCAL_BUILD_CANDIDATES_ONLY",
        "task_count": len(records),
        "row_count": sum(len(item["rows"]) for item in records),
        "legacy_candidate_row_count": legacy_row_count,
        "manual_source_transcription_row_count": manual_row_count,
        "rows_with_niqqud_marks": niqqud_count,
        "hebrew_skeleton_mismatch_count": len(skeleton_mismatches),
        "hebrew_skeleton_mismatch_row_ids": skeleton_mismatches,
        "provider_calls": 0,
        "secret_access": False,
        "solution_rows_included": False,
        "records": records,
    }
    candidates["artifact_sha256"] = sha256_json(candidates)

    discrepancies = {
        "schema": f"{BUILD_SCHEMA}.discrepancies",
        "status": "OPEN_PASS2_REQUIRED",
        "batch_id": "B01",
        "entries": [
            {
                "discrepancy_id": "B01-D01-Q002-NO-LEGACY",
                "task_id": q(2),
                "severity": "MAJOR",
                "class": "NO_LEGACY_ROWS",
                "disposition": "SOURCE_TRANSCRIBED_HE_DERIVED_COLUMNS_PENDING_PASS2",
            },
            {
                "discrepancy_id": "B01-D02-Q008-TABLE-OMITTED",
                "task_id": q(8),
                "severity": "MAJOR",
                "class": "SOURCE_TABLE_VALUES_ABSENT_FROM_LEGACY_CONDITION_ROWS",
                "disposition": "SOURCE_TABLE_TRANSCRIBED_HE_DERIVED_COLUMNS_PENDING_PASS2",
            },
            {
                "discrepancy_id": "B01-D03-Q006-DUPLICATE-CARDS",
                "task_id": q(6),
                "severity": "INFO",
                "class": "DUPLICATE_LEGACY_CARDS",
                "disposition": "BYTE_EQUIVALENT_PRIMARY_SELECTED_NO_CONTENT_MERGE",
            },
            {
                "discrepancy_id": "B01-D04-Q007-HEADING",
                "task_id": q(7),
                "severity": "MAJOR",
                "class": "LEGACY_HEADING_OMITS_SOURCE_TASK_NUMBER",
                "disposition": "PASS2_SOURCE_BACKED_HEADING_CORRECTION_REQUIRED",
            },
            *[
                {
                    "discrepancy_id": f"B01-D{number:02d}-{task_id.rsplit('-', 1)[-1].upper()}-CROP",
                    "task_id": task_id,
                    "severity": "MINOR",
                    "class": "PREPARED_CROP_OVERLAPS_ADJACENT_TASK_TEXT",
                    "disposition": "PASS2_EXACT_ASSET_CROP_REQUIRED_NO_ROW_BOUNDARY_AMBIGUITY",
                }
                for number, task_id in enumerate((q(4), q(5), q(6)), start=5)
            ],
            *[
                {
                    "discrepancy_id": f"B01-NIQQUD-{task_id}",
                    "task_id": task_id,
                    "severity": "MAJOR",
                    "class": "HE_AND_HE_NIQQUD_CONSONANT_SKELETON_DISAGREE",
                    "affected_row_ids": [
                        row_id for row_id in skeleton_mismatches if row_id.startswith(f"{task_id}-")
                    ],
                    "disposition": "PASS2_SOURCE_BACKED_ALLOWLISTED_REPAIR_OR_EXPLICIT_INCOMPLETE",
                }
                for task_id in sorted({row_id.rsplit("-r", 1)[0] for row_id in skeleton_mismatches})
            ],
        ],
        "provider_calls": 0,
        "solution_adjudication": False,
    }
    discrepancies["severity_counts"] = dict(sorted(Counter(
        item["severity"] for item in discrepancies["entries"]
    ).items()))
    discrepancies["artifact_sha256"] = sha256_json(discrepancies)

    checks = {
        "exactly_10_tasks": len(records) == 10,
        "expected_task_order": [item["task_id"] for item in records] == expected_ids,
        "every_task_has_rows": all(item["rows"] for item in records),
        "every_task_has_source_anchor": all(item["source_anchors"] for item in records),
        "all_visual_dependencies_preserved": all(
            item["visual_requirement"] in {
                "SEMANTIC_VISUALS_PRESENT",
                "TEXT_FORMULAS_OR_USER_DRAWN_OUTPUT_ONLY",
                "NO_SEMANTIC_VISUALS",
            }
            for item in records
        ),
        "solution_rows_zero": not any(item["solution_rows_included"] for item in records),
        "provider_calls_zero": candidates["provider_calls"] == 0,
        "secret_access_false": candidates["secret_access"] is False,
        "pass_cap_two": candidates["maximum_passes"] == 2,
        "only_expected_incomplete_tasks": sorted(incomplete_tasks) == sorted(expected_ids[1:]),
    }
    if not all(checks.values()):
        raise RuntimeError(f"B01 pass1 verification failed: {checks}")
    verification = {
        "schema": f"{BUILD_SCHEMA}.verification",
        "status": "PASS_B01_PASS1_CANDIDATES_NOT_CANONICAL_PASS2_REQUIRED",
        "batch_id": "B01",
        "checks": checks,
        "task_count": len(records),
        "row_count": candidates["row_count"],
        "incomplete_task_ids": sorted(incomplete_tasks),
        "open_discrepancy_count": len(discrepancies["entries"]),
        "provider_calls": 0,
    }

    plan = make_plan(tasks, base_head)
    plan["batches"][0]["state"] = "PASS1_COMPLETE_PASS2_REQUIRED"
    ledger = {
        "schema": f"{BUILD_SCHEMA}.ledger",
        "status": "IN_PROGRESS_B01_PASS1_COMPLETE",
        "source_edition": SOURCE_EDITION,
        "maximum_passes_per_batch": MAX_PASSES,
        "provider_calls_allowed": 0,
        "batches": [
            {
                **batch,
                "passes_completed": 1 if batch["batch_id"] == "B01" else 0,
                "candidate_artifact_sha256": candidates["artifact_sha256"] if batch["batch_id"] == "B01" else None,
                "verification_status": verification["status"] if batch["batch_id"] == "B01" else None,
            }
            for batch in plan["batches"]
        ],
        "next_action": "B01_PASS2_ONLY_NO_THIRD_PASS",
        "provider_calls_made": 0,
        "secret_accessed": False,
        "import_executed": False,
        "publication_executed": False,
        "solution_work_executed": False,
        "audio_work_executed": False,
    }
    return plan, ledger, candidates, discrepancies, verification


def build_batch_b02_pass1(
    stable: Path,
    source_dir: Path,
    base_head: str,
    stored_plan: dict[str, Any],
    stored_ledger: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    task_manifest, mapping, diagrams, prepared, raw_cards = read_inputs(stable, source_dir)
    tasks = task_manifest["tasks"]
    batch_tasks = tasks[BATCH_SIZE:BATCH_SIZE * 2]
    expected_ids = [q(number) for number in range(10, 20)]
    if [item["task_id"] for item in batch_tasks] != expected_ids:
        raise RuntimeError("B02 task order drift")
    if stored_plan["batches"][0]["state"] != "PASS2_CLOSED_1_PASS_9_INCOMPLETE_NO_THIRD_PASS":
        raise RuntimeError("B01 must remain terminally closed before B02 starts")
    if stored_ledger["batches"][0]["passes_completed"] != 2:
        raise RuntimeError("B01 terminal ledger drift")
    if stored_ledger["batches"][1]["passes_completed"] not in {0, 1, 2}:
        raise RuntimeError("B02 ledger pass count is invalid")
    if stored_ledger["batches"][1]["passes_completed"] == 1 and (
        stored_ledger["batches"][1]["state"] != "PASS1_COMPLETE_PASS2_REQUIRED"
        or stored_ledger["next_action"] != "B02_PASS2_ONLY_NO_THIRD_PASS"
    ):
        raise RuntimeError("B02 stored pass-1 state is not safely resumable")
    if stored_ledger["batches"][1]["passes_completed"] == 2 and (
        stored_ledger["batches"][1]["state"] != "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS"
        or stored_ledger["next_action"] != "B03_PASS1_ALREADY_AUTHORIZED_NOT_STARTED"
    ):
        raise RuntimeError("B02 stored terminal state is not safely reproducible")

    projection = json.loads(
        (stable / "prepare" / "legacy-projection-manifest.json").read_text(encoding="utf-8")
    )
    mapped_by_key = {item["legacy_card_key_sha256"]: item for item in mapping["cards"]}
    mapped_by_title: dict[str, list[dict[str, Any]]] = {}
    for item in mapping["cards"]:
        mapped_by_title.setdefault(item["legacy_title"], []).append(item)
    projection_by_key = {
        item["legacy_card_key_sha256"]: item for item in projection["cards"]
    }
    raw_by_title: dict[str, list[dict[str, Any]]] = {}
    for item in raw_cards:
        raw_by_title.setdefault(item["text"]["title"], []).append(item)
    diagram_by_task = {item["task_id"]: item for item in diagrams["tasks"]}
    prepared_index = prepared_page_index(prepared)

    records: list[dict[str, Any]] = []
    legacy_row_count = 0
    manual_row_count = 0
    niqqud_count = 0
    skeleton_mismatches: list[str] = []
    plain_with_niqqud: list[str] = []

    for task in batch_tasks:
        task_id = task["task_id"]
        selection = B02_LEGACY_SELECTIONS[task_id]
        title = selection["title"]
        title_cards = raw_by_title[title]
        selected_key = selection.get("legacy_card_key_sha256")
        if selected_key:
            required_text = selection["raw_required_text"]
            matching_raw = [
                card for card in title_cards
                if any(required_text in str(row.get("he_plain", "")) for row in card["sentences"])
            ]
            if len(matching_raw) != 1:
                raise RuntimeError(f"cannot uniquely select source-matching legacy duplicate: {task_id}")
            raw_card = matching_raw[0]
            mapped = mapped_by_key[selected_key]
        else:
            if len(title_cards) != 1 or len(mapped_by_title[title]) != 1:
                raise RuntimeError(f"unexpected duplicate legacy title: {title}")
            raw_card = title_cards[0]
            mapped = mapped_by_title[title][0]

        mapped_rows = {row["row_index"]: row for row in mapped["rows"]}
        rows: list[dict[str, Any]] = []
        for order_index, (legacy_index, kind) in enumerate(selection["rows"]):
            source = raw_card["sentences"][legacy_index]
            map_row = mapped_rows[legacy_index]
            if map_row["target_id"] != task_id:
                raise RuntimeError(f"legacy target drift: {task_id} row {legacy_index}")
            aligned = {
                "he": str(source.get("he_plain", "")),
                "he_niqqud": str(source.get("he_niqqud", "")),
                "transliteration": str(source.get("translit", "")),
                "ru": str(source.get("ru", "")),
            }
            if sha256_json(aligned) != map_row["aligned_row_sha256"]:
                raise RuntimeError(f"legacy aligned row hash drift: {task_id} row {legacy_index}")
            skeleton_ok = hebrew_skeleton(aligned["he"]) == hebrew_skeleton(aligned["he_niqqud"])
            row = {
                "row_id": f"{task_id}-r{order_index + 1:03d}",
                "order_index": order_index,
                "semantic_kind": kind,
                **aligned,
                "source_binding_status": "PASS1_BOUNDARY_VISUALLY_REVIEWED_TEXT_EXACTNESS_PENDING_PASS2",
                "learning_columns_status": "LEGACY_CANDIDATE_UNREVIEWED",
                "hebrew_skeleton_matches_niqqud": skeleton_ok,
                "legacy_evidence": {
                    "legacy_card_key_sha256": mapped["legacy_card_key_sha256"],
                    "legacy_title": title,
                    "legacy_row_index": legacy_index,
                    "aligned_row_sha256": map_row["aligned_row_sha256"],
                },
            }
            rows.append(row)
            legacy_row_count += 1
            niqqud_count += int(has_niqqud(aligned["he_niqqud"]))

        for manual in B02_MANUAL_SOURCE_ROWS.get(task_id, []):
            row = {
                "semantic_kind": manual["kind"],
                "he": manual["he"],
                "he_niqqud": None,
                "transliteration": None,
                "ru": None,
                "source_binding_status": "PASS1_MANUAL_SOURCE_TRANSCRIPTION_VISUALLY_REVIEWED",
                "learning_columns_status": "DERIVED_COLUMNS_PENDING_PASS2",
                "hebrew_skeleton_matches_niqqud": None,
                "source_page": manual["source_page"],
                "legacy_evidence": None,
            }
            rows.insert(manual.get("insert_at", len(rows)), row)
            manual_row_count += 1

        for order_index, row in enumerate(rows):
            row["row_id"] = f"{task_id}-r{order_index + 1:03d}"
            row["order_index"] = order_index
            row["candidate_row_sha256"] = sha256_json(row)
            if row["hebrew_skeleton_matches_niqqud"] is False:
                skeleton_mismatches.append(row["row_id"])
            if has_niqqud(row["he"]):
                plain_with_niqqud.append(row["row_id"])

        anchors = []
        for anchor in task["source_anchors"]:
            page_key = (task_id, anchor["source_page"])
            if page_key not in prepared_index:
                raise RuntimeError(f"prepared source anchor missing: {page_key}")
            anchors.append({**anchor, **prepared_index[page_key]})

        duplicate_evidence = None
        if selected_key:
            rejected_key = selection["rejected_legacy_card_key_sha256"]
            rejected_raw = [
                card for card in title_cards
                if any(selection["raw_rejected_text"] in str(row.get("he_plain", ""))
                       for row in card["sentences"])
            ]
            if len(rejected_raw) != 1:
                raise RuntimeError("q016 rejected Ø35 duplicate is not uniquely identifiable")
            if projection_by_key[selected_key]["rows_sha256"] == projection_by_key[rejected_key]["rows_sha256"]:
                raise RuntimeError("q016 conflicting duplicate unexpectedly became byte-equivalent")
            duplicate_evidence = {
                "selected_legacy_card_key_sha256": selected_key,
                "selected_source_fact": selection["raw_required_text"],
                "selected_rows_sha256": projection_by_key[selected_key]["rows_sha256"],
                "rejected_legacy_card_key_sha256": rejected_key,
                "rejected_conflicting_fact": selection["raw_rejected_text"],
                "rejected_rows_sha256": projection_by_key[rejected_key]["rows_sha256"],
                "comparison": "CONFLICTING_DUPLICATES_SOURCE_MATCHING_CARD_SELECTED_NO_MERGE",
            }

        visual = diagram_by_task[task_id]
        record = {
            "task_id": task_id,
            "display_alias": task["display_alias"],
            "source_edition": SOURCE_EDITION,
            "source_pdf_sha256": SOURCE_PDF_SHA256,
            "source_anchors": anchors,
            "rows": rows,
            "visual_requirement": visual["visual_requirement"],
            "semantic_visuals": visual["semantic_visuals"],
            "external_reference_dependencies": visual["external_reference_dependencies"],
            "duplicate_legacy_evidence": duplicate_evidence,
            "hebrew_skeleton_mismatch_row_ids": [
                row["row_id"] for row in rows if row["hebrew_skeleton_matches_niqqud"] is False
            ],
            "pass_1_status": "INCOMPLETE_LEGACY_COLUMNS_REQUIRE_INDEPENDENT_PASS2_REVIEW",
            "solution_rows_included": False,
            "provider_output_used": False,
        }
        record["candidate_task_sha256"] = sha256_json(record)
        records.append(record)

    candidates = {
        "schema": f"{BUILD_SCHEMA}.batch-candidates",
        "status": "B02_PASS1_COMPLETE_PASS2_REQUIRED_NOT_CANONICAL_NOT_IMPORTABLE",
        "batch_id": "B02",
        "pass_number": 1,
        "maximum_passes": MAX_PASSES,
        "base_head": base_head,
        "source_edition": SOURCE_EDITION,
        "truth_status": "LOCAL_BUILD_CANDIDATES_ONLY",
        "task_count": len(records),
        "row_count": sum(len(item["rows"]) for item in records),
        "legacy_candidate_row_count": legacy_row_count,
        "manual_source_transcription_row_count": manual_row_count,
        "rows_with_niqqud_marks": niqqud_count,
        "plain_hebrew_rows_with_niqqud_marks": len(plain_with_niqqud),
        "plain_hebrew_rows_with_niqqud_row_ids": plain_with_niqqud,
        "hebrew_skeleton_mismatch_count": len(skeleton_mismatches),
        "hebrew_skeleton_mismatch_row_ids": skeleton_mismatches,
        "provider_calls": 0,
        "secret_access": False,
        "solution_rows_included": False,
        "records": records,
    }
    candidates["artifact_sha256"] = sha256_json(candidates)

    entries: list[dict[str, Any]] = [
        {
            "discrepancy_id": "B02-D01-Q010-LEGACY-PAGE-OFFSET",
            "task_id": q(10), "severity": "MAJOR",
            "class": "LEGACY_TITLE_PAGE_NUMBER_DIFFERS_FROM_SOURCE_PAGE",
            "disposition": "SOURCE_PAGE_14_IS_CANONICAL_LEGACY_PAGE_13_USED_ONLY_AS_MATCHED_CANDIDATE",
        },
        {
            "discrepancy_id": "B02-D02-Q013-LEGACY-HEADING",
            "task_id": q(13), "severity": "MAJOR",
            "class": "LEGACY_HEADING_CONFUSES_TASK_NUMBER_WITH_YEAR",
            "disposition": "SOURCE_HEADING_TRANSCRIBED_DERIVED_COLUMNS_PENDING_PASS2",
        },
        {
            "discrepancy_id": "B02-D03-Q015-LEGACY-HEADING",
            "task_id": q(15), "severity": "MAJOR",
            "class": "LEGACY_HEADING_HAS_WRONG_TASK_NUMBER",
            "disposition": "SOURCE_Q015_HEADING_TRANSCRIBED_LEGACY_Q019_HEADING_EXCLUDED",
        },
        {
            "discrepancy_id": "B02-D04-Q016-CONFLICTING-DUPLICATE",
            "task_id": q(16), "severity": "CRITICAL",
            "class": "DUPLICATE_LEGACY_CARDS_CONFLICT_ON_SOURCE_DIAMETER",
            "disposition": "SOURCE_MATCHING_50MM_CARD_SELECTED_35MM_CARD_REJECTED_NO_MERGE",
        },
        {
            "discrepancy_id": "B02-D05-Q018-EXTERNAL-APPENDIX",
            "task_id": q(18), "severity": "MAJOR",
            "class": "EXTERNAL_APPENDIX_REQUIRED_FOR_TASK_COMPLETION",
            "disposition": "APPENDIX_PAGES_68_69_DEPENDENCY_PRESERVED_NO_ANSWER_INFERENCE",
        },
        {
            "discrepancy_id": "B02-D06-SOURCE-HEADINGS",
            "task_ids": sorted(B02_MANUAL_SOURCE_ROWS), "severity": "MAJOR",
            "class": "SOURCE_TASK_HEADING_MISSING_OR_UNUSABLE_IN_LEGACY_CONDITION",
            "disposition": "SOURCE_HEBREW_HEADINGS_TRANSCRIBED_DERIVED_COLUMNS_PENDING_PASS2",
        },
    ]
    entries.extend({
        "discrepancy_id": f"B02-PLAIN-NIQQUD-{task_id}",
        "task_id": task_id,
        "severity": "MAJOR",
        "class": "LEGACY_PLAIN_HEBREW_COLUMN_CONTAINS_NIQQUD",
        "affected_row_ids": [row_id for row_id in plain_with_niqqud if row_id.startswith(f"{task_id}-")],
        "disposition": "PASS2_SOURCE_BACKED_PLAIN_COLUMN_REVIEW_REQUIRED",
    } for task_id in sorted({row_id.rsplit("-r", 1)[0] for row_id in plain_with_niqqud}))
    entries.extend({
        "discrepancy_id": f"B02-NIQQUD-{task_id}",
        "task_id": task_id,
        "severity": "MAJOR",
        "class": "HE_AND_HE_NIQQUD_CONSONANT_SKELETON_DISAGREE",
        "affected_row_ids": [row_id for row_id in skeleton_mismatches if row_id.startswith(f"{task_id}-")],
        "disposition": "PASS2_SOURCE_BACKED_ALLOWLISTED_REPAIR_OR_EXPLICIT_INCOMPLETE",
    } for task_id in sorted({row_id.rsplit("-r", 1)[0] for row_id in skeleton_mismatches}))
    discrepancies = {
        "schema": f"{BUILD_SCHEMA}.discrepancies",
        "status": "OPEN_PASS2_REQUIRED",
        "batch_id": "B02",
        "entries": entries,
        "provider_calls": 0,
        "solution_adjudication": False,
    }
    discrepancies["severity_counts"] = dict(sorted(Counter(
        item["severity"] for item in entries
    ).items()))
    discrepancies["artifact_sha256"] = sha256_json(discrepancies)

    checks = {
        "exactly_10_tasks": len(records) == 10,
        "expected_task_order": [item["task_id"] for item in records] == expected_ids,
        "every_task_has_rows": all(item["rows"] for item in records),
        "every_task_has_source_anchor": all(item["source_anchors"] for item in records),
        "all_visual_dependencies_preserved": all(
            item["visual_requirement"] in {
                "SEMANTIC_VISUALS_PRESENT",
                "TEXT_FORMULAS_OR_USER_DRAWN_OUTPUT_ONLY",
                "NO_SEMANTIC_VISUALS",
            } for item in records
        ),
        "q016_source_matching_duplicate_selected": next(
            item for item in records if item["task_id"] == q(16)
        )["duplicate_legacy_evidence"]["selected_source_fact"] == "Ø50 mm",
        "q018_appendix_dependency_preserved": bool(next(
            item for item in records if item["task_id"] == q(18)
        )["external_reference_dependencies"]),
        "all_10_tasks_explicitly_incomplete_after_pass1": all(
            item["pass_1_status"].startswith("INCOMPLETE_") for item in records
        ),
        "solution_rows_zero": not any(item["solution_rows_included"] for item in records),
        "provider_calls_zero": candidates["provider_calls"] == 0,
        "secret_access_false": candidates["secret_access"] is False,
        "pass_cap_two": candidates["maximum_passes"] == 2,
    }
    if not all(checks.values()):
        raise RuntimeError(f"B02 pass1 verification failed: {checks}")
    verification = {
        "schema": f"{BUILD_SCHEMA}.verification",
        "status": "PASS_B02_PASS1_CANDIDATES_NOT_CANONICAL_PASS2_REQUIRED",
        "batch_id": "B02",
        "checks": checks,
        "task_count": len(records),
        "row_count": candidates["row_count"],
        "incomplete_task_ids": expected_ids,
        "open_discrepancy_count": len(entries),
        "provider_calls": 0,
    }

    plan = copy.deepcopy(stored_plan)
    plan["status"] = "OWNER_APPROVED_LOCAL_BUILD_B01_CLOSED_B02_PASS1_COMPLETE"
    plan["batches"][1]["state"] = "PASS1_COMPLETE_PASS2_REQUIRED"
    ledger = copy.deepcopy(stored_ledger)
    ledger["status"] = "IN_PROGRESS_B02_PASS1_COMPLETE"
    ledger["batches"][1].update({
        "state": "PASS1_COMPLETE_PASS2_REQUIRED",
        "passes_completed": 1,
        "candidate_artifact_sha256": candidates["artifact_sha256"],
        "verification_status": verification["status"],
    })
    ledger["next_action"] = "B02_PASS2_ONLY_NO_THIRD_PASS"
    for field, value in (
        ("provider_calls_made", 0), ("secret_accessed", False),
        ("import_executed", False), ("publication_executed", False),
        ("solution_work_executed", False), ("audio_work_executed", False),
    ):
        ledger[field] = value
    return plan, ledger, candidates, discrepancies, verification


def build_batch_b03_pass1(
    stable: Path,
    source_dir: Path,
    base_head: str,
    stored_plan: dict[str, Any],
    stored_ledger: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    task_manifest, mapping, diagrams, prepared, raw_cards = read_inputs(stable, source_dir)
    tasks = task_manifest["tasks"]
    batch_tasks = tasks[BATCH_SIZE * 2:BATCH_SIZE * 3]
    expected_ids = [q(number) for number in range(20, 30)]
    if [item["task_id"] for item in batch_tasks] != expected_ids:
        raise RuntimeError("B03 task order drift")
    terminal_predecessors = {
        "B01": "PASS2_CLOSED_1_PASS_9_INCOMPLETE_NO_THIRD_PASS",
        "B02": "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
    }
    for index, (batch_id, state) in enumerate(terminal_predecessors.items()):
        if stored_ledger["batches"][index]["batch_id"] != batch_id:
            raise RuntimeError(f"{batch_id} ledger order drift")
        if stored_ledger["batches"][index]["passes_completed"] != 2:
            raise RuntimeError(f"{batch_id} must be terminal before B03 starts")
        if stored_ledger["batches"][index]["state"] != state:
            raise RuntimeError(f"{batch_id} terminal state drift")
    b03_stored = stored_ledger["batches"][2]
    if b03_stored["passes_completed"] not in {0, 1, 2}:
        raise RuntimeError("B03 ledger pass count is invalid")
    if b03_stored["passes_completed"] == 1 and (
        b03_stored["state"] != "PASS1_COMPLETE_PASS2_REQUIRED"
        or stored_ledger["next_action"] != "B03_PASS2_ONLY_NO_THIRD_PASS"
    ):
        raise RuntimeError("B03 stored pass-1 state is not safely resumable")
    if b03_stored["passes_completed"] == 2 and (
        b03_stored["state"] != "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS"
        or stored_ledger["next_action"] != "B04_PASS1_ALREADY_AUTHORIZED_NOT_STARTED"
    ):
        raise RuntimeError("B03 stored terminal state is not safely reproducible")

    raw_by_title = {item["text"]["title"]: item for item in raw_cards}
    mapped_by_title = {item["legacy_title"]: item for item in mapping["cards"]}
    diagram_by_task = {item["task_id"]: item for item in diagrams["tasks"]}
    prepared_index = prepared_page_index(prepared)
    records: list[dict[str, Any]] = []
    legacy_row_count = 0
    manual_row_count = 0
    niqqud_count = 0
    skeleton_mismatches: list[str] = []
    plain_with_niqqud: list[str] = []

    for task in batch_tasks:
        task_id = task["task_id"]
        selection = B03_LEGACY_SELECTIONS[task_id]
        title = selection["title"]
        raw_card = raw_by_title[title]
        mapped = mapped_by_title[title]
        mapped_rows = {row["row_index"]: row for row in mapped["rows"]}
        rows: list[dict[str, Any]] = []
        for order_index, (legacy_index, kind) in enumerate(selection["rows"]):
            source = raw_card["sentences"][legacy_index]
            map_row = mapped_rows[legacy_index]
            if map_row["target_id"] != task_id:
                raise RuntimeError(f"legacy target drift: {task_id} row {legacy_index}")
            aligned = {
                "he": str(source.get("he_plain", "")),
                "he_niqqud": str(source.get("he_niqqud", "")),
                "transliteration": str(source.get("translit", "")),
                "ru": str(source.get("ru", "")),
            }
            if sha256_json(aligned) != map_row["aligned_row_sha256"]:
                raise RuntimeError(f"legacy aligned row hash drift: {task_id} row {legacy_index}")
            row = {
                "row_id": f"{task_id}-r{order_index + 1:03d}",
                "order_index": order_index,
                "semantic_kind": kind,
                **aligned,
                "source_binding_status": "PASS1_BOUNDARY_VISUALLY_REVIEWED_TEXT_EXACTNESS_PENDING_PASS2",
                "learning_columns_status": "LEGACY_CANDIDATE_UNREVIEWED",
                "hebrew_skeleton_matches_niqqud": (
                    hebrew_skeleton(aligned["he"]) == hebrew_skeleton(aligned["he_niqqud"])
                ),
                "legacy_evidence": {
                    "legacy_card_key_sha256": mapped["legacy_card_key_sha256"],
                    "legacy_title": title,
                    "legacy_row_index": legacy_index,
                    "aligned_row_sha256": map_row["aligned_row_sha256"],
                },
            }
            rows.append(row)
            legacy_row_count += 1
            niqqud_count += int(has_niqqud(aligned["he_niqqud"]))

        for manual in B03_MANUAL_SOURCE_ROWS.get(task_id, []):
            rows.insert(manual.get("insert_at", len(rows)), {
                "semantic_kind": manual["kind"],
                "he": manual["he"],
                "he_niqqud": None,
                "transliteration": None,
                "ru": None,
                "source_binding_status": "PASS1_MANUAL_SOURCE_TRANSCRIPTION_VISUALLY_REVIEWED",
                "learning_columns_status": "DERIVED_COLUMNS_PENDING_PASS2",
                "hebrew_skeleton_matches_niqqud": None,
                "source_page": manual["source_page"],
                "legacy_evidence": None,
            })
            manual_row_count += 1

        for order_index, row in enumerate(rows):
            row["row_id"] = f"{task_id}-r{order_index + 1:03d}"
            row["order_index"] = order_index
            row["candidate_row_sha256"] = sha256_json(row)
            if row["hebrew_skeleton_matches_niqqud"] is False:
                skeleton_mismatches.append(row["row_id"])
            if has_niqqud(row["he"]):
                plain_with_niqqud.append(row["row_id"])

        anchors = []
        anchor_source = B03_SOURCE_ANCHOR_OVERRIDES.get(task_id, task["source_anchors"])
        for anchor in anchor_source:
            page_key = (task_id, anchor["source_page"])
            if page_key in prepared_index:
                anchors.append({**anchor, **prepared_index[page_key]})
            elif task_id == q(27) and anchor["source_page"] == 36:
                anchors.append({
                    **anchor,
                    "source_pdf_sha256": SOURCE_PDF_SHA256,
                    "anchor_status": "PASS1_FULL_SOURCE_PAGE_VISUALLY_REVIEWED",
                    "prepared_asset_status": "MISSING_CONTINUATION_REBUILD_REQUIRED_BEFORE_CANONICAL_PACKAGE",
                })
            else:
                raise RuntimeError(f"prepared source anchor missing: {page_key}")

        visual = diagram_by_task[task_id]
        record = {
            "task_id": task_id,
            "display_alias": task["display_alias"],
            "source_edition": SOURCE_EDITION,
            "source_pdf_sha256": SOURCE_PDF_SHA256,
            "source_anchors": anchors,
            "rows": rows,
            "visual_requirement": visual["visual_requirement"],
            "semantic_visuals": visual["semantic_visuals"],
            "external_reference_dependencies": visual["external_reference_dependencies"],
            "duplicate_legacy_evidence": None,
            "hebrew_skeleton_mismatch_row_ids": [
                row["row_id"] for row in rows if row["hebrew_skeleton_matches_niqqud"] is False
            ],
            "pass_1_status": "INCOMPLETE_LEGACY_COLUMNS_REQUIRE_INDEPENDENT_PASS2_REVIEW",
            "solution_rows_included": False,
            "provider_output_used": False,
        }
        record["candidate_task_sha256"] = sha256_json(record)
        records.append(record)

    candidates = {
        "schema": f"{BUILD_SCHEMA}.batch-candidates",
        "status": "B03_PASS1_COMPLETE_PASS2_REQUIRED_NOT_CANONICAL_NOT_IMPORTABLE",
        "batch_id": "B03",
        "pass_number": 1,
        "maximum_passes": MAX_PASSES,
        "base_head": base_head,
        "source_edition": SOURCE_EDITION,
        "truth_status": "LOCAL_BUILD_CANDIDATES_ONLY",
        "task_count": len(records),
        "row_count": sum(len(item["rows"]) for item in records),
        "legacy_candidate_row_count": legacy_row_count,
        "manual_source_transcription_row_count": manual_row_count,
        "rows_with_niqqud_marks": niqqud_count,
        "plain_hebrew_rows_with_niqqud_marks": len(plain_with_niqqud),
        "plain_hebrew_rows_with_niqqud_row_ids": plain_with_niqqud,
        "hebrew_skeleton_mismatch_count": len(skeleton_mismatches),
        "hebrew_skeleton_mismatch_row_ids": skeleton_mismatches,
        "provider_calls": 0,
        "secret_access": False,
        "solution_rows_included": False,
        "records": records,
    }
    candidates["artifact_sha256"] = sha256_json(candidates)

    entries: list[dict[str, Any]] = [
        {"discrepancy_id": "B03-D01-Q020-NO-HEADING", "task_id": q(20), "severity": "MAJOR",
         "class": "SOURCE_TASK_HEADING_ABSENT_FROM_LEGACY_CONDITION",
         "disposition": "SOURCE_HEBREW_HEADING_TRANSCRIBED_DERIVED_COLUMNS_PENDING_PASS2"},
        {"discrepancy_id": "B03-D02-Q022-YEAR-IN-HEADING", "task_id": q(22), "severity": "MINOR",
         "class": "LEGACY_HEADING_COMBINES_SEPARATE_SOURCE_YEAR_LABEL",
         "disposition": "PRESERVE_AS_LEGACY_CANDIDATE_SOURCE_LAYOUT_REVIEW_IN_PASS2"},
        {"discrepancy_id": "B03-D03-Q024-STARTS-AT-B", "task_id": q(24), "severity": "INFO",
         "class": "SOURCE_TASK_BEGINS_AT_SUBPART_B_ON_AVAILABLE_PAGE",
         "disposition": "PRESERVED_EXACTLY_NO_MISSING_SUBPART_INFERENCE"},
        {"discrepancy_id": "B03-D04-Q025-WRONG-LEGACY-HEADING", "task_id": q(25), "severity": "MAJOR",
         "class": "LEGACY_HEADING_HAS_WRONG_TASK_NUMBER",
         "disposition": "SOURCE_Q025_HEADING_TRANSCRIBED_LEGACY_Q009_HEADING_EXCLUDED"},
        {"discrepancy_id": "B03-D05-Q026-WRONG-LEGACY-HEADING", "task_id": q(26), "severity": "MAJOR",
         "class": "LEGACY_HEADING_HAS_WRONG_TASK_NUMBER",
         "disposition": "SOURCE_Q026_HEADING_TRANSCRIBED_LEGACY_Q009_HEADING_EXCLUDED"},
        {"discrepancy_id": "B03-D06-Q027-MISSING-CONTINUATION-ANCHOR", "task_id": q(27), "severity": "CRITICAL",
         "class": "PREPARED_SOURCE_ANCHOR_OMITS_CONDITION_CONTINUATION_PAGE_36",
         "disposition": "PASS1_SOURCE_ANCHOR_EXTENDED_PREPARED_ASSET_REBUILD_REQUIRED"},
        {"discrepancy_id": "B03-D07-Q027-APPENDIX", "task_id": q(27), "severity": "MAJOR",
         "class": "EXTERNAL_APPENDIX_REQUIRED_FOR_TASK_COMPLETION",
         "disposition": "APPENDIX_PAGE_70_DEPENDENCY_PRESERVED_NO_ANSWER_INFERENCE"},
        {"discrepancy_id": "B03-D08-Q028-APPENDIX", "task_id": q(28), "severity": "MAJOR",
         "class": "EXTERNAL_APPENDIX_REQUIRED_FOR_TASK_COMPLETION",
         "disposition": "APPENDIX_PAGE_70_DEPENDENCY_PRESERVED_NO_ANSWER_INFERENCE"},
    ]
    entries.extend({
        "discrepancy_id": f"B03-PLAIN-NIQQUD-{task_id}", "task_id": task_id,
        "severity": "MAJOR", "class": "LEGACY_PLAIN_HEBREW_COLUMN_CONTAINS_NIQQUD",
        "affected_row_ids": [row_id for row_id in plain_with_niqqud if row_id.startswith(f"{task_id}-")],
        "disposition": "PASS2_SOURCE_BACKED_PLAIN_COLUMN_REVIEW_REQUIRED",
    } for task_id in sorted({row_id.rsplit("-r", 1)[0] for row_id in plain_with_niqqud}))
    entries.extend({
        "discrepancy_id": f"B03-NIQQUD-{task_id}", "task_id": task_id,
        "severity": "MAJOR", "class": "HE_AND_HE_NIQQUD_CONSONANT_SKELETON_DISAGREE",
        "affected_row_ids": [row_id for row_id in skeleton_mismatches if row_id.startswith(f"{task_id}-")],
        "disposition": "PASS2_SOURCE_BACKED_ALLOWLISTED_REPAIR_OR_EXPLICIT_INCOMPLETE",
    } for task_id in sorted({row_id.rsplit("-r", 1)[0] for row_id in skeleton_mismatches}))
    discrepancies = {
        "schema": f"{BUILD_SCHEMA}.discrepancies", "status": "OPEN_PASS2_REQUIRED",
        "batch_id": "B03", "entries": entries, "provider_calls": 0,
        "solution_adjudication": False,
    }
    discrepancies["severity_counts"] = dict(sorted(Counter(item["severity"] for item in entries).items()))
    discrepancies["artifact_sha256"] = sha256_json(discrepancies)

    q27_record = next(item for item in records if item["task_id"] == q(27))
    checks = {
        "exactly_10_tasks": len(records) == 10,
        "expected_task_order": [item["task_id"] for item in records] == expected_ids,
        "every_task_has_rows": all(item["rows"] for item in records),
        "every_task_has_source_anchor": all(item["source_anchors"] for item in records),
        "q027_continuation_page_36_preserved": [
            item["source_page"] for item in q27_record["source_anchors"]
        ] == [35, 36],
        "q027_q028_appendix_dependencies_preserved": all(next(
            item for item in records if item["task_id"] == task_id
        )["external_reference_dependencies"] for task_id in (q(27), q(28))),
        "all_10_tasks_explicitly_incomplete_after_pass1": all(
            item["pass_1_status"].startswith("INCOMPLETE_") for item in records
        ),
        "solution_rows_zero": not any(item["solution_rows_included"] for item in records),
        "provider_calls_zero": candidates["provider_calls"] == 0,
        "secret_access_false": candidates["secret_access"] is False,
        "pass_cap_two": candidates["maximum_passes"] == 2,
    }
    if not all(checks.values()):
        raise RuntimeError(f"B03 pass1 verification failed: {checks}")
    verification = {
        "schema": f"{BUILD_SCHEMA}.verification",
        "status": "PASS_B03_PASS1_CANDIDATES_NOT_CANONICAL_PASS2_REQUIRED",
        "batch_id": "B03", "checks": checks, "task_count": len(records),
        "row_count": candidates["row_count"], "incomplete_task_ids": expected_ids,
        "open_discrepancy_count": len(entries), "provider_calls": 0,
    }

    plan = copy.deepcopy(stored_plan)
    plan["status"] = "OWNER_APPROVED_LOCAL_BUILD_B01_B02_CLOSED_B03_PASS1_COMPLETE"
    plan["batches"][2]["state"] = "PASS1_COMPLETE_PASS2_REQUIRED"
    ledger = copy.deepcopy(stored_ledger)
    ledger["status"] = "IN_PROGRESS_B03_PASS1_COMPLETE"
    ledger["batches"][2].update({
        "state": "PASS1_COMPLETE_PASS2_REQUIRED", "passes_completed": 1,
        "candidate_artifact_sha256": candidates["artifact_sha256"],
        "verification_status": verification["status"],
    })
    ledger["next_action"] = "B03_PASS2_ONLY_NO_THIRD_PASS"
    for field, value in (
        ("provider_calls_made", 0), ("secret_accessed", False),
        ("import_executed", False), ("publication_executed", False),
        ("solution_work_executed", False), ("audio_work_executed", False),
    ):
        ledger[field] = value
    return plan, ledger, candidates, discrepancies, verification


def build_later_batch_pass1(
    stable: Path,
    source_dir: Path,
    base_head: str,
    stored_plan: dict[str, Any],
    stored_ledger: dict[str, Any],
    *,
    batch_id: str,
    batch_index: int,
    expected_ids: list[str],
    legacy_selections: dict[str, list[dict[str, Any]]],
    manual_source_rows: dict[str, list[dict[str, Any]]],
    source_anchor_overrides: dict[str, list[dict[str, Any]]],
    initial_discrepancies: list[dict[str, Any]],
    expected_terminal_state: str,
    next_batch_id: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    task_manifest, mapping, diagrams, prepared, raw_cards = read_inputs(stable, source_dir)
    tasks = task_manifest["tasks"]
    batch_tasks = tasks[BATCH_SIZE * batch_index:BATCH_SIZE * (batch_index + 1)]
    if [item["task_id"] for item in batch_tasks] != expected_ids:
        raise RuntimeError(f"{batch_id} task order drift")
    for predecessor_index in range(batch_index):
        predecessor = stored_ledger["batches"][predecessor_index]
        if predecessor["passes_completed"] != 2 or "PASS2_CLOSED_" not in predecessor["state"]:
            raise RuntimeError(f"{predecessor['batch_id']} must be terminal before {batch_id} starts")
    stored_batch = stored_ledger["batches"][batch_index]
    if stored_batch["passes_completed"] not in {0, 1, 2}:
        raise RuntimeError(f"{batch_id} ledger pass count is invalid")
    if stored_batch["passes_completed"] == 1 and (
        stored_batch["state"] != "PASS1_COMPLETE_PASS2_REQUIRED"
        or stored_ledger["next_action"] != f"{batch_id}_PASS2_ONLY_NO_THIRD_PASS"
    ):
        raise RuntimeError(f"{batch_id} stored pass-1 state is not safely resumable")
    if stored_batch["passes_completed"] == 2 and (
        stored_batch["state"] != expected_terminal_state
        or stored_ledger["next_action"] != f"{next_batch_id}_PASS1_ALREADY_AUTHORIZED_NOT_STARTED"
    ):
        raise RuntimeError(f"{batch_id} stored terminal state is not safely reproducible")

    raw_by_title = {item["text"]["title"]: item for item in raw_cards}
    mapped_by_title = {item["legacy_title"]: item for item in mapping["cards"]}
    diagram_by_task = {item["task_id"]: item for item in diagrams["tasks"]}
    prepared_index = prepared_page_index(prepared)
    records: list[dict[str, Any]] = []
    legacy_row_count = 0
    manual_row_count = 0
    niqqud_count = 0
    skeleton_mismatches: list[str] = []
    plain_with_niqqud: list[str] = []

    for task in batch_tasks:
        task_id = task["task_id"]
        rows: list[dict[str, Any]] = []
        selected_titles: list[str] = []
        for selection in legacy_selections[task_id]:
            title = selection["title"]
            selected_titles.append(title)
            raw_card = raw_by_title[title]
            mapped = mapped_by_title[title]
            mapped_rows = {row["row_index"]: row for row in mapped["rows"]}
            for legacy_index, kind in selection["rows"]:
                source = raw_card["sentences"][legacy_index]
                map_row = mapped_rows[legacy_index]
                if map_row["target_id"] != task_id:
                    raise RuntimeError(f"legacy target drift: {task_id} {title} row {legacy_index}")
                aligned = {
                    "he": str(source.get("he_plain", "")),
                    "he_niqqud": str(source.get("he_niqqud", "")),
                    "transliteration": str(source.get("translit", "")),
                    "ru": str(source.get("ru", "")),
                }
                if sha256_json(aligned) != map_row["aligned_row_sha256"]:
                    raise RuntimeError(f"legacy aligned row hash drift: {task_id} {title} row {legacy_index}")
                rows.append({
                    "semantic_kind": kind,
                    **aligned,
                    "source_binding_status": "PASS1_BOUNDARY_VISUALLY_REVIEWED_TEXT_EXACTNESS_PENDING_PASS2",
                    "learning_columns_status": "LEGACY_CANDIDATE_UNREVIEWED",
                    "hebrew_skeleton_matches_niqqud": (
                        hebrew_skeleton(aligned["he"]) == hebrew_skeleton(aligned["he_niqqud"])
                    ),
                    "legacy_evidence": {
                        "legacy_card_key_sha256": mapped["legacy_card_key_sha256"],
                        "legacy_title": title,
                        "legacy_row_index": legacy_index,
                        "aligned_row_sha256": map_row["aligned_row_sha256"],
                    },
                })
                legacy_row_count += 1
                niqqud_count += int(has_niqqud(aligned["he_niqqud"]))

        for manual in manual_source_rows.get(task_id, []):
            rows.insert(manual.get("insert_at", len(rows)), {
                "semantic_kind": manual["kind"],
                "he": manual["he"],
                "he_niqqud": None,
                "transliteration": None,
                "ru": None,
                "source_binding_status": "PASS1_MANUAL_SOURCE_TRANSCRIPTION_VISUALLY_REVIEWED",
                "learning_columns_status": "DERIVED_COLUMNS_PENDING_PASS2",
                "hebrew_skeleton_matches_niqqud": None,
                "source_page": manual["source_page"],
                "legacy_evidence": None,
            })
            manual_row_count += 1

        for order_index, row in enumerate(rows):
            row["row_id"] = f"{task_id}-r{order_index + 1:03d}"
            row["order_index"] = order_index
            row["candidate_row_sha256"] = sha256_json(row)
            if row["hebrew_skeleton_matches_niqqud"] is False:
                skeleton_mismatches.append(row["row_id"])
            if has_niqqud(row["he"]):
                plain_with_niqqud.append(row["row_id"])

        anchors = []
        for anchor in source_anchor_overrides.get(task_id, task["source_anchors"]):
            page_key = (task_id, anchor["source_page"])
            if page_key in prepared_index:
                anchors.append({**anchor, **prepared_index[page_key]})
            else:
                anchors.append({
                    **anchor,
                    "source_pdf_sha256": SOURCE_PDF_SHA256,
                    "anchor_status": "PASS1_FULL_SOURCE_PAGE_VISUALLY_REVIEWED",
                    "prepared_asset_status": "MISSING_CONTINUATION_REBUILD_REQUIRED_BEFORE_CANONICAL_PACKAGE",
                })

        visual = diagram_by_task[task_id]
        duplicate_evidence = None
        if len(selected_titles) > 1:
            duplicate_evidence = {
                "selected_legacy_titles": selected_titles,
                "comparison": "DISTINCT_SOURCE_ORDERED_CONDITION_SEGMENTS_CONCATENATED_NO_SOLUTION_ROWS",
            }
        record = {
            "task_id": task_id,
            "display_alias": task["display_alias"],
            "source_edition": SOURCE_EDITION,
            "source_pdf_sha256": SOURCE_PDF_SHA256,
            "source_anchors": anchors,
            "rows": rows,
            "visual_requirement": visual["visual_requirement"],
            "semantic_visuals": visual["semantic_visuals"],
            "external_reference_dependencies": visual["external_reference_dependencies"],
            "duplicate_legacy_evidence": duplicate_evidence,
            "hebrew_skeleton_mismatch_row_ids": [
                row["row_id"] for row in rows if row["hebrew_skeleton_matches_niqqud"] is False
            ],
            "pass_1_status": "INCOMPLETE_LEGACY_OR_MANUAL_COLUMNS_REQUIRE_INDEPENDENT_PASS2_REVIEW",
            "solution_rows_included": False,
            "provider_output_used": False,
        }
        record["candidate_task_sha256"] = sha256_json(record)
        records.append(record)

    candidates = {
        "schema": f"{BUILD_SCHEMA}.batch-candidates",
        "status": f"{batch_id}_PASS1_COMPLETE_PASS2_REQUIRED_NOT_CANONICAL_NOT_IMPORTABLE",
        "batch_id": batch_id,
        "pass_number": 1,
        "maximum_passes": MAX_PASSES,
        "base_head": base_head,
        "source_edition": SOURCE_EDITION,
        "truth_status": "LOCAL_BUILD_CANDIDATES_ONLY",
        "task_count": len(records),
        "row_count": sum(len(item["rows"]) for item in records),
        "legacy_candidate_row_count": legacy_row_count,
        "manual_source_transcription_row_count": manual_row_count,
        "rows_with_niqqud_marks": niqqud_count,
        "plain_hebrew_rows_with_niqqud_marks": len(plain_with_niqqud),
        "plain_hebrew_rows_with_niqqud_row_ids": plain_with_niqqud,
        "hebrew_skeleton_mismatch_count": len(skeleton_mismatches),
        "hebrew_skeleton_mismatch_row_ids": skeleton_mismatches,
        "provider_calls": 0,
        "secret_access": False,
        "solution_rows_included": False,
        "records": records,
    }
    candidates["artifact_sha256"] = sha256_json(candidates)

    entries = copy.deepcopy(initial_discrepancies)
    entries.extend({
        "discrepancy_id": f"{batch_id}-PLAIN-NIQQUD-{task_id}", "task_id": task_id,
        "severity": "MAJOR", "class": "LEGACY_PLAIN_HEBREW_COLUMN_CONTAINS_NIQQUD",
        "affected_row_ids": [row_id for row_id in plain_with_niqqud if row_id.startswith(f"{task_id}-")],
        "disposition": "PASS2_SOURCE_BACKED_PLAIN_COLUMN_REVIEW_REQUIRED",
    } for task_id in sorted({row_id.rsplit("-r", 1)[0] for row_id in plain_with_niqqud}))
    entries.extend({
        "discrepancy_id": f"{batch_id}-NIQQUD-{task_id}", "task_id": task_id,
        "severity": "MAJOR", "class": "HE_AND_HE_NIQQUD_CONSONANT_SKELETON_DISAGREE",
        "affected_row_ids": [row_id for row_id in skeleton_mismatches if row_id.startswith(f"{task_id}-")],
        "disposition": "PASS2_SOURCE_BACKED_ALLOWLISTED_REPAIR_OR_EXPLICIT_INCOMPLETE",
    } for task_id in sorted({row_id.rsplit("-r", 1)[0] for row_id in skeleton_mismatches}))
    discrepancies = {
        "schema": f"{BUILD_SCHEMA}.discrepancies", "status": "OPEN_PASS2_REQUIRED",
        "batch_id": batch_id, "entries": entries, "provider_calls": 0,
        "solution_adjudication": False,
    }
    discrepancies["severity_counts"] = dict(sorted(Counter(item["severity"] for item in entries).items()))
    discrepancies["artifact_sha256"] = sha256_json(discrepancies)

    checks = {
        "exactly_10_tasks": len(records) == 10,
        "expected_task_order": [item["task_id"] for item in records] == expected_ids,
        "every_task_has_rows": all(item["rows"] for item in records),
        "every_task_has_source_anchor": all(item["source_anchors"] for item in records),
        "all_10_tasks_explicitly_incomplete_after_pass1": all(
            item["pass_1_status"].startswith("INCOMPLETE_") for item in records
        ),
        "solution_rows_zero": not any(item["solution_rows_included"] for item in records),
        "provider_calls_zero": candidates["provider_calls"] == 0,
        "secret_access_false": candidates["secret_access"] is False,
        "pass_cap_two": candidates["maximum_passes"] == 2,
    }
    if not all(checks.values()):
        raise RuntimeError(f"{batch_id} pass1 verification failed: {checks}")
    verification = {
        "schema": f"{BUILD_SCHEMA}.verification",
        "status": f"PASS_{batch_id}_PASS1_CANDIDATES_NOT_CANONICAL_PASS2_REQUIRED",
        "batch_id": batch_id, "checks": checks, "task_count": len(records),
        "row_count": candidates["row_count"], "incomplete_task_ids": expected_ids,
        "open_discrepancy_count": len(entries), "provider_calls": 0,
    }

    plan = copy.deepcopy(stored_plan)
    plan["status"] = f"OWNER_APPROVED_LOCAL_BUILD_{batch_id}_PASS1_COMPLETE"
    plan["batches"][batch_index]["state"] = "PASS1_COMPLETE_PASS2_REQUIRED"
    ledger = copy.deepcopy(stored_ledger)
    ledger["status"] = f"IN_PROGRESS_{batch_id}_PASS1_COMPLETE"
    ledger["batches"][batch_index].update({
        "state": "PASS1_COMPLETE_PASS2_REQUIRED", "passes_completed": 1,
        "candidate_artifact_sha256": candidates["artifact_sha256"],
        "verification_status": verification["status"],
    })
    ledger["next_action"] = f"{batch_id}_PASS2_ONLY_NO_THIRD_PASS"
    ledger["provider_calls_made"] = 0
    ledger["secret_accessed"] = False
    ledger["import_executed"] = False
    ledger["publication_executed"] = False
    ledger["solution_work_executed"] = False
    ledger["audio_work_executed"] = False
    return plan, ledger, candidates, discrepancies, verification


def build_terminal_later_batch_pass2(
    batch_id: str,
    batch_index: int,
    plan: dict[str, Any],
    ledger: dict[str, Any],
    pass1_candidates: dict[str, Any],
    pass1_discrepancies: dict[str, Any],
    heading_source_pages: dict[str, int],
    heading_labels: dict[str, str],
    expected_ids: list[str],
    terminal_state: str,
    verification_status: str,
    next_action: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    candidates = copy.deepcopy(pass1_candidates)
    candidates.pop("artifact_sha256", None)
    candidates["schema"] = f"{BUILD_SCHEMA}.batch-final-candidates"
    candidates["status"] = f"{batch_id}_PASS2_TERMINAL_0_PASS_10_INCOMPLETE_NOT_CANONICAL_NOT_IMPORTABLE"
    candidates["pass_number"] = 2
    candidates["truth_status"] = "LOCAL_BUILD_TERMINAL_CLASSIFICATION_NO_PACKAGE"
    candidates["source_pdf_sha256"] = SOURCE_PDF_SHA256
    candidates["provider_calls"] = 0
    candidates["secret_access"] = False
    candidates["solution_rows_included"] = False

    correction_entries: list[dict[str, Any]] = []
    final_incomplete_ids: list[str] = []
    reviewed_row_count = 0
    blocked_row_count = 0

    for record in candidates["records"]:
        task_id = record["task_id"]
        record.pop("candidate_task_sha256", None)
        heading_rows = [row for row in record["rows"] if row["semantic_kind"] == "task_heading"]
        if len(heading_rows) != 1:
            raise RuntimeError(f"{batch_id} expected exactly one task heading for {task_id}")
        heading_row_id = heading_rows[0]["row_id"]
        heading_page = heading_source_pages[task_id]
        display_number = heading_labels[task_id]
        expected_heading = {
            "he": f"שאלה {display_number}.",
            "he_niqqud": f"שְׁאֵלָה {display_number}.",
            "transliteration": f"She'ela {display_number}.",
            "ru": f"Вопрос {display_number}.",
        }
        for row in record["rows"]:
            row_id = row["row_id"]
            if row_id == heading_row_id:
                before = {field: row[field] for field in ("he", "he_niqqud", "transliteration", "ru")}
                if before != expected_heading:
                    row.update(expected_heading)
                    correction_entries.append({
                        "correction_id": f"{batch_id}-P2-TEXT-{len(correction_entries) + 1:02d}",
                        "correction_type": "SOURCE_TEXT_AND_ALIGNED_HEADING",
                        "task_id": task_id,
                        "row_id": row_id,
                        "source_page": heading_page,
                        "source_pdf_sha256": SOURCE_PDF_SHA256,
                        "before": before,
                        "after": expected_heading,
                        "reason": "SOURCE_TASK_HEADING_VISUALLY_CONFIRMED_WITH_FINAL_PERIOD",
                        "reviewer_status": "CODEX_LOCAL_SOURCE_VISUAL_READBACK",
                    })
                row["hebrew_skeleton_matches_niqqud"] = True
                row["source_binding_status"] = "PASS2_SOURCE_VISUALLY_REVIEWED"
                row["learning_columns_status"] = "PASS2_LOCALLY_REVIEWED_HEADING_ONLY"
                row["pass_2_row_status"] = "PASS_SOURCE_AND_FOUR_HEADING_COLUMNS_LOCALLY_REVIEWED"
                reviewed_row_count += 1
            elif row.get("hebrew_skeleton_matches_niqqud") is False:
                row["pass_2_row_status"] = "INCOMPLETE_HE_NIQQUD_ALIGNMENT_UNRESOLVED_NO_THIRD_PASS"
                blocked_row_count += 1
            elif has_niqqud(row.get("he")):
                row["pass_2_row_status"] = "INCOMPLETE_PLAIN_HEBREW_CONTAINS_NIQQUD_NO_THIRD_PASS"
                blocked_row_count += 1
            else:
                row["pass_2_row_status"] = "INCOMPLETE_LEGACY_COLUMNS_NOT_INDEPENDENTLY_REVIEWED_NO_THIRD_PASS"
                blocked_row_count += 1
            row.pop("candidate_row_sha256", None)
            row["candidate_row_sha256"] = sha256_json(row)

        blockers = [
            "SOURCE_TEXT_EXACTNESS_NOT_COMPLETELY_LINE_REVIEWED",
            "LEGACY_LEARNING_COLUMNS_NOT_INDEPENDENTLY_REVIEWED",
        ]
        if any(row.get("hebrew_skeleton_matches_niqqud") is False for row in record["rows"]):
            blockers.append("HE_NIQQUD_CONSONANT_ALIGNMENT_UNRESOLVED")
        if any(has_niqqud(row.get("he")) and row["row_id"] != heading_row_id for row in record["rows"]):
            blockers.append("LEGACY_PLAIN_HEBREW_COLUMN_CONTAINS_NIQQUD")
        if any(anchor.get("prepared_asset_status") for anchor in record["source_anchors"]):
            blockers.append("CORRECTED_SOURCE_ANCHOR_ASSET_NOT_REBUILT")
        if record["external_reference_dependencies"]:
            blockers.append("EXTERNAL_REFERENCE_DEPENDENCY_NOT_MATERIALIZED_IN_CANONICAL_PACKAGE")
        record["pass_2_status"] = "INCOMPLETE_TERMINAL_NO_THIRD_PASS_OWNER_DECISION_REQUIRED_FOR_SEPARATE_REPAIR"
        record["final_disposition"] = "INCOMPLETE"
        record["final_blockers"] = blockers
        record["owner_decision_required_for_future_repair"] = True
        record["candidate_task_sha256"] = sha256_json(record)
        final_incomplete_ids.append(task_id)

    candidates["text_correction_count"] = len(correction_entries)
    candidates["source_anchor_correction_task_count"] = sum(
        any(anchor.get("prepared_asset_status") for anchor in record["source_anchors"])
        for record in candidates["records"]
    )
    candidates["reviewed_row_count"] = reviewed_row_count
    candidates["blocked_row_count"] = blocked_row_count
    candidates["final_pass_task_ids"] = []
    candidates["final_incomplete_task_ids"] = final_incomplete_ids
    candidates["artifact_sha256"] = sha256_json(candidates)

    correction_ledger = {
        "schema": f"{BUILD_SCHEMA}.pass2-corrections",
        "status": "APPLIED_TERMINAL_PASS2_NO_RAW_OR_PASS1_MUTATION",
        "batch_id": batch_id, "pass_number": 2, "source_edition": SOURCE_EDITION,
        "source_pdf_sha256": SOURCE_PDF_SHA256, "entry_count": len(correction_entries),
        "entries": correction_entries, "provider_calls": 0, "solution_adjudication": False,
    }
    correction_ledger["artifact_sha256"] = sha256_json(correction_ledger)

    final_entries = copy.deepcopy(pass1_discrepancies["entries"])
    for entry in final_entries:
        if entry["class"] in {
            "SOURCE_TASK_HEADING_ABSENT_FROM_LEGACY_CONDITION",
            "LEGACY_HEADING_HAS_WRONG_TASK_NUMBER",
            "LEGACY_HEADING_COMBINES_SEPARATE_SOURCE_YEAR_LABEL",
        }:
            entry["pass_2_status"] = "RESOLVED_BY_SOURCE_BACKED_HEADING_CORRECTION"
        elif entry["class"] == "PREPARED_SOURCE_ANCHOR_OMITS_CONDITION_CONTINUATION_PAGE_36":
            entry["pass_2_status"] = "SOURCE_ANCHOR_EXTENDED_PREPARED_ASSET_REBUILD_REQUIRED"
        elif entry["class"] == "SOURCE_TASK_BEGINS_AT_SUBPART_B_ON_AVAILABLE_PAGE":
            entry["pass_2_status"] = "RESOLVED_PRESERVED_SOURCE_AS_IS_NO_INFERENCE"
        else:
            entry["pass_2_status"] = "FINAL_INCOMPLETE_NO_THIRD_PASS"
    for task_id in final_incomplete_ids:
        final_entries.append({
            "discrepancy_id": f"{batch_id}-P2-{task_id.rsplit('-', 1)[-1].upper()}-LEGACY-COLUMNS",
            "task_id": task_id, "severity": "MAJOR",
            "class": "LEGACY_SOURCE_AND_LEARNING_COLUMNS_NOT_FULLY_INDEPENDENTLY_REVIEWED",
            "disposition": "TERMINAL_INCOMPLETE_SEPARATE_OWNER_AUTHORIZED_REPAIR_REQUIRED",
            "pass_2_status": "FINAL_INCOMPLETE_NO_THIRD_PASS",
        })
    final_discrepancies = {
        "schema": f"{BUILD_SCHEMA}.pass2-final-discrepancies",
        "status": f"{batch_id}_PASS2_TERMINAL_CLASSIFICATION", "batch_id": batch_id,
        "entry_count": len(final_entries), "entries": final_entries,
        "final_incomplete_task_ids": final_incomplete_ids,
        "provider_calls": 0, "solution_adjudication": False,
    }
    final_discrepancies["status_counts"] = dict(sorted(Counter(
        item["pass_2_status"] for item in final_entries
    ).items()))
    final_discrepancies["artifact_sha256"] = sha256_json(final_discrepancies)

    checks = {
        "exactly_10_tasks": len(candidates["records"]) == 10,
        "zero_pass_tasks": candidates["final_pass_task_ids"] == [],
        "exactly_10_explicit_incomplete_tasks": final_incomplete_ids == expected_ids,
        "all_tasks_terminally_classified": all(
            item["final_disposition"] == "INCOMPLETE" for item in candidates["records"]
        ),
        "no_third_pass": candidates["maximum_passes"] == 2 and candidates["pass_number"] == 2,
        "all_source_headings_reviewed": reviewed_row_count == 10,
        "reviewed_plus_blocked_rows_complete": reviewed_row_count + blocked_row_count == candidates["row_count"],
        "solution_rows_zero": not any(item["solution_rows_included"] for item in candidates["records"]),
        "provider_calls_zero": candidates["provider_calls"] == 0,
        "secret_access_false": candidates["secret_access"] is False,
        "not_importable": "NOT_IMPORTABLE" in candidates["status"],
    }
    if not all(checks.values()):
        raise RuntimeError(f"{batch_id} pass2 verification failed: {checks}")
    verification = {
        "schema": f"{BUILD_SCHEMA}.pass2-verification", "status": verification_status,
        "batch_id": batch_id, "pass_number": 2, "checks": checks,
        "task_count": len(candidates["records"]), "row_count": candidates["row_count"],
        "reviewed_row_count": reviewed_row_count, "blocked_row_count": blocked_row_count,
        "final_pass_task_ids": [], "final_incomplete_task_ids": final_incomplete_ids,
        "correction_count": len(correction_entries), "provider_calls": 0,
    }

    plan = copy.deepcopy(plan)
    plan["status"] = f"OWNER_APPROVED_LOCAL_BUILD_THROUGH_{batch_id}_TERMINALLY_CLASSIFIED"
    plan["batches"][batch_index]["state"] = terminal_state
    ledger = copy.deepcopy(ledger)
    ledger["status"] = f"IN_PROGRESS_{batch_id}_PASS2_TERMINAL_COMPLETE"
    ledger["batches"][batch_index].update({
        "state": terminal_state, "passes_completed": 2,
        "candidate_artifact_sha256": candidates["artifact_sha256"],
        "verification_status": verification["status"],
        "final_pass_task_count": 0, "final_incomplete_task_count": len(final_incomplete_ids),
    })
    ledger["next_action"] = next_action
    ledger["provider_calls_made"] = 0
    ledger["secret_accessed"] = False
    ledger["import_executed"] = False
    ledger["publication_executed"] = False
    ledger["solution_work_executed"] = False
    ledger["audio_work_executed"] = False
    return plan, ledger, candidates, correction_ledger, final_discrepancies, verification


def build_batch_b01_pass2(
    plan: dict[str, Any],
    ledger: dict[str, Any],
    pass1_candidates: dict[str, Any],
    pass1_discrepancies: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    candidates = copy.deepcopy(pass1_candidates)
    candidates.pop("artifact_sha256", None)
    candidates["schema"] = f"{BUILD_SCHEMA}.batch-final-candidates"
    candidates["status"] = "B01_PASS2_TERMINAL_1_PASS_9_INCOMPLETE_NOT_CANONICAL_NOT_IMPORTABLE"
    candidates["pass_number"] = 2
    candidates["truth_status"] = "LOCAL_BUILD_TERMINAL_CLASSIFICATION_NO_PACKAGE"
    candidates["source_pdf_sha256"] = SOURCE_PDF_SHA256
    candidates["provider_calls"] = 0
    candidates["secret_access"] = False
    candidates["solution_rows_included"] = False
    candidates["text_correction_count"] = 0
    candidates["source_anchor_correction_task_count"] = 0

    correction_entries: list[dict[str, Any]] = []
    final_pass_ids: list[str] = []
    final_incomplete_ids: list[str] = []
    reviewed_row_count = 0
    blocked_row_count = 0

    for record in candidates["records"]:
        task_id = record["task_id"]
        record.pop("candidate_task_sha256", None)
        for row in record["rows"]:
            row_id = row["row_id"]
            correction = PASS2_TEXT_CORRECTIONS.get(row_id)
            if correction:
                before = {field: row[field] for field in ("he", "he_niqqud", "transliteration", "ru")}
                if before == correction["new"]:
                    raise RuntimeError(f"pass2 correction already applied in pass1 artifact: {row_id}")
                row.update(correction["new"])
                row["hebrew_skeleton_matches_niqqud"] = (
                    hebrew_skeleton(row["he"]) == hebrew_skeleton(row["he_niqqud"])
                )
                correction_entries.append({
                    "correction_id": f"B01-P2-TEXT-{len(correction_entries) + 1:02d}",
                    "correction_type": "SOURCE_TEXT_AND_ALIGNED_HEADING",
                    "task_id": task_id,
                    "row_id": row_id,
                    "source_page": correction["source_page"],
                    "source_pdf_sha256": SOURCE_PDF_SHA256,
                    "before": before,
                    "after": correction["new"],
                    "reason": correction["reason"],
                    "reviewer_status": "CODEX_LOCAL_SOURCE_VISUAL_READBACK",
                })

            row.pop("candidate_row_sha256", None)
            if task_id == q(1):
                row["pass_2_row_status"] = "PASS_SOURCE_AND_FOUR_COLUMNS_LOCALLY_REVIEWED"
                row["source_binding_status"] = "PASS2_SOURCE_VISUALLY_REVIEWED"
                row["learning_columns_status"] = "PASS2_LOCALLY_REVIEWED"
                reviewed_row_count += 1
            elif any(row.get(field) is None for field in ("he_niqqud", "transliteration", "ru")):
                row["pass_2_row_status"] = "INCOMPLETE_DERIVED_COLUMNS_NULL_NO_THIRD_PASS"
                blocked_row_count += 1
            elif row.get("hebrew_skeleton_matches_niqqud") is False:
                row["pass_2_row_status"] = "INCOMPLETE_HE_NIQQUD_ALIGNMENT_UNRESOLVED_NO_THIRD_PASS"
                blocked_row_count += 1
            else:
                row["pass_2_row_status"] = "INCOMPLETE_LEGACY_COLUMNS_NOT_INDEPENDENTLY_REVIEWED_NO_THIRD_PASS"
                blocked_row_count += 1
            row["candidate_row_sha256"] = sha256_json(row)

        if task_id in PASS2_ANCHOR_CORRECTIONS:
            before_anchors = copy.deepcopy(record["source_anchors"])
            after_anchors = [
                {
                    **anchor,
                    "source_pdf_sha256": SOURCE_PDF_SHA256,
                    "anchor_status": "PASS2_VISUALLY_REVIEWED_SOURCE_PDF_COORDINATE",
                    "prepared_asset_status": "REBUILD_REQUIRED_BEFORE_CANONICAL_PACKAGE",
                }
                for anchor in PASS2_ANCHOR_CORRECTIONS[task_id]
            ]
            record["source_anchors"] = after_anchors
            correction_entries.append({
                "correction_id": f"B01-P2-ANCHOR-{task_id.rsplit('-', 1)[-1].upper()}",
                "correction_type": "SOURCE_ANCHOR",
                "task_id": task_id,
                "source_pdf_sha256": SOURCE_PDF_SHA256,
                "before": before_anchors,
                "after": after_anchors,
                "reason": "FULL_SOURCE_PAGE_VISUAL_READBACK_PROVED_OVERLAP_OR_MISSING_CONTINUATION",
                "reviewer_status": "CODEX_LOCAL_SOURCE_VISUAL_READBACK",
            })
            candidates["source_anchor_correction_task_count"] += 1

        if task_id == q(1):
            record["pass_2_status"] = "PASS_SOURCE_BOUND_FOUR_COLUMNS_LOCALLY_REVIEWED"
            record["final_disposition"] = "PASS"
            record["final_blockers"] = []
            record["owner_decision_required_for_future_repair"] = False
            final_pass_ids.append(task_id)
        else:
            blockers = []
            if any(
                any(row.get(field) is None for field in ("he_niqqud", "transliteration", "ru"))
                for row in record["rows"]
            ):
                blockers.append("DERIVED_COLUMNS_NULL_NOT_REVIEWED")
            if any(row.get("hebrew_skeleton_matches_niqqud") is False for row in record["rows"]):
                blockers.append("HE_NIQQUD_CONSONANT_ALIGNMENT_UNRESOLVED")
            if any(row.get("legacy_evidence") is not None for row in record["rows"]):
                blockers.append("LEGACY_LEARNING_COLUMNS_NOT_INDEPENDENTLY_REVIEWED")
            if task_id in PASS2_ANCHOR_CORRECTIONS:
                blockers.append("CORRECTED_SOURCE_ANCHOR_ASSET_NOT_REBUILT")
            record["pass_2_status"] = "INCOMPLETE_TERMINAL_NO_THIRD_PASS_OWNER_DECISION_REQUIRED_FOR_SEPARATE_REPAIR"
            record["final_disposition"] = "INCOMPLETE"
            record["final_blockers"] = blockers
            record["owner_decision_required_for_future_repair"] = True
            final_incomplete_ids.append(task_id)
        record["candidate_task_sha256"] = sha256_json(record)

    candidates["text_correction_count"] = sum(
        entry["correction_type"] == "SOURCE_TEXT_AND_ALIGNED_HEADING"
        for entry in correction_entries
    )
    candidates["reviewed_row_count"] = reviewed_row_count
    candidates["blocked_row_count"] = blocked_row_count
    candidates["final_pass_task_ids"] = final_pass_ids
    candidates["final_incomplete_task_ids"] = final_incomplete_ids
    candidates["artifact_sha256"] = sha256_json(candidates)

    correction_ledger = {
        "schema": f"{BUILD_SCHEMA}.pass2-corrections",
        "status": "APPLIED_TERMINAL_PASS2_NO_RAW_OR_PASS1_MUTATION",
        "batch_id": "B01",
        "pass_number": 2,
        "source_edition": SOURCE_EDITION,
        "source_pdf_sha256": SOURCE_PDF_SHA256,
        "entry_count": len(correction_entries),
        "entries": correction_entries,
        "provider_calls": 0,
        "solution_adjudication": False,
    }
    correction_ledger["artifact_sha256"] = sha256_json(correction_ledger)

    final_entries = copy.deepcopy(pass1_discrepancies["entries"])
    for entry in final_entries:
        if entry["class"] == "DUPLICATE_LEGACY_CARDS":
            entry["pass_2_status"] = "RESOLVED_BYTE_EQUIVALENT_PRIMARY_PRESERVED"
        elif entry["class"] == "LEGACY_HEADING_OMITS_SOURCE_TASK_NUMBER":
            entry["pass_2_status"] = "RESOLVED_BY_SOURCE_BACKED_TEXT_CORRECTION"
        elif entry["class"] == "PREPARED_CROP_OVERLAPS_ADJACENT_TASK_TEXT":
            entry["pass_2_status"] = "SOURCE_ANCHOR_CORRECTED_PREPARED_ASSET_REBUILD_REQUIRED"
        else:
            entry["pass_2_status"] = "FINAL_INCOMPLETE_NO_THIRD_PASS"
    final_entries.append({
        "discrepancy_id": "B01-P2-D16-Q003-CROP",
        "task_id": q(3),
        "severity": "MAJOR",
        "class": "PREPARED_CROP_OMITS_REQUIRED_SUBPARTS",
        "disposition": "PASS2_SOURCE_ANCHOR_EXTENDED_PREPARED_ASSET_REBUILD_REQUIRED",
        "pass_2_status": "SOURCE_ANCHOR_CORRECTED_PREPARED_ASSET_REBUILD_REQUIRED",
    })
    final_discrepancies = {
        "schema": f"{BUILD_SCHEMA}.pass2-final-discrepancies",
        "status": "B01_PASS2_TERMINAL_CLASSIFICATION",
        "batch_id": "B01",
        "entry_count": len(final_entries),
        "entries": final_entries,
        "final_incomplete_task_ids": final_incomplete_ids,
        "provider_calls": 0,
        "solution_adjudication": False,
    }
    final_discrepancies["status_counts"] = dict(sorted(Counter(
        item["pass_2_status"] for item in final_entries
    ).items()))
    final_discrepancies["artifact_sha256"] = sha256_json(final_discrepancies)

    checks = {
        "exactly_10_tasks": len(candidates["records"]) == 10,
        "exactly_1_pass_task": final_pass_ids == [q(1)],
        "exactly_9_explicit_incomplete_tasks": len(final_incomplete_ids) == 9,
        "all_tasks_terminally_classified": all(
            item["final_disposition"] in {"PASS", "INCOMPLETE"}
            for item in candidates["records"]
        ),
        "no_third_pass": candidates["maximum_passes"] == 2 and candidates["pass_number"] == 2,
        "two_source_text_corrections": candidates["text_correction_count"] == 2,
        "four_source_anchor_correction_tasks": candidates["source_anchor_correction_task_count"] == 4,
        "reviewed_plus_blocked_rows_complete": reviewed_row_count + blocked_row_count == candidates["row_count"],
        "solution_rows_zero": not any(item["solution_rows_included"] for item in candidates["records"]),
        "provider_calls_zero": candidates["provider_calls"] == 0,
        "secret_access_false": candidates["secret_access"] is False,
        "not_importable": "NOT_IMPORTABLE" in candidates["status"],
    }
    if not all(checks.values()):
        raise RuntimeError(f"B01 pass2 verification failed: {checks}")
    verification = {
        "schema": f"{BUILD_SCHEMA}.pass2-verification",
        "status": "PASS_B01_PASS2_TERMINAL_1_PASS_9_INCOMPLETE_NO_THIRD_PASS",
        "batch_id": "B01",
        "pass_number": 2,
        "checks": checks,
        "task_count": len(candidates["records"]),
        "row_count": candidates["row_count"],
        "reviewed_row_count": reviewed_row_count,
        "blocked_row_count": blocked_row_count,
        "final_pass_task_ids": final_pass_ids,
        "final_incomplete_task_ids": final_incomplete_ids,
        "correction_count": len(correction_entries),
        "provider_calls": 0,
    }

    plan = copy.deepcopy(plan)
    plan["status"] = "OWNER_APPROVED_LOCAL_BUILD_B01_TERMINALLY_CLASSIFIED"
    plan["batches"][0]["state"] = "PASS2_CLOSED_1_PASS_9_INCOMPLETE_NO_THIRD_PASS"
    ledger = copy.deepcopy(ledger)
    ledger["status"] = "IN_PROGRESS_B01_PASS2_TERMINAL_COMPLETE"
    ledger["batches"][0].update({
        "state": "PASS2_CLOSED_1_PASS_9_INCOMPLETE_NO_THIRD_PASS",
        "passes_completed": 2,
        "candidate_artifact_sha256": candidates["artifact_sha256"],
        "verification_status": verification["status"],
        "final_pass_task_count": len(final_pass_ids),
        "final_incomplete_task_count": len(final_incomplete_ids),
    })
    ledger["next_action"] = "B02_PASS1_ALREADY_AUTHORIZED_NOT_STARTED"
    ledger["provider_calls_made"] = 0
    ledger["secret_accessed"] = False
    ledger["import_executed"] = False
    ledger["publication_executed"] = False
    ledger["solution_work_executed"] = False
    ledger["audio_work_executed"] = False
    return plan, ledger, candidates, correction_ledger, final_discrepancies, verification


def build_batch_b02_pass2(
    plan: dict[str, Any],
    ledger: dict[str, Any],
    pass1_candidates: dict[str, Any],
    pass1_discrepancies: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    candidates = copy.deepcopy(pass1_candidates)
    candidates.pop("artifact_sha256", None)
    candidates["schema"] = f"{BUILD_SCHEMA}.batch-final-candidates"
    candidates["status"] = "B02_PASS2_TERMINAL_0_PASS_10_INCOMPLETE_NOT_CANONICAL_NOT_IMPORTABLE"
    candidates["pass_number"] = 2
    candidates["truth_status"] = "LOCAL_BUILD_TERMINAL_CLASSIFICATION_NO_PACKAGE"
    candidates["source_pdf_sha256"] = SOURCE_PDF_SHA256
    candidates["provider_calls"] = 0
    candidates["secret_access"] = False
    candidates["solution_rows_included"] = False

    correction_entries: list[dict[str, Any]] = []
    final_incomplete_ids: list[str] = []
    reviewed_row_count = 0
    blocked_row_count = 0

    for record in candidates["records"]:
        task_id = record["task_id"]
        record.pop("candidate_task_sha256", None)
        for row in record["rows"]:
            row_id = row["row_id"]
            correction = B02_PASS2_TEXT_CORRECTIONS.get(row_id)
            if correction:
                before = {field: row[field] for field in ("he", "he_niqqud", "transliteration", "ru")}
                if before == correction["new"]:
                    raise RuntimeError(f"B02 pass2 correction already applied in pass1 artifact: {row_id}")
                row.update(correction["new"])
                row["hebrew_skeleton_matches_niqqud"] = (
                    hebrew_skeleton(row["he"]) == hebrew_skeleton(row["he_niqqud"])
                )
                row["source_binding_status"] = "PASS2_SOURCE_VISUALLY_REVIEWED"
                row["learning_columns_status"] = "PASS2_LOCALLY_REVIEWED_HEADING_ONLY"
                row["pass_2_row_status"] = "PASS_SOURCE_AND_FOUR_HEADING_COLUMNS_LOCALLY_REVIEWED"
                reviewed_row_count += 1
                correction_entries.append({
                    "correction_id": f"B02-P2-TEXT-{len(correction_entries) + 1:02d}",
                    "correction_type": "SOURCE_TEXT_AND_ALIGNED_HEADING",
                    "task_id": task_id,
                    "row_id": row_id,
                    "source_page": correction["source_page"],
                    "source_pdf_sha256": SOURCE_PDF_SHA256,
                    "before": before,
                    "after": correction["new"],
                    "reason": correction["reason"],
                    "reviewer_status": "CODEX_LOCAL_SOURCE_VISUAL_READBACK",
                })
            elif row.get("hebrew_skeleton_matches_niqqud") is False:
                row["pass_2_row_status"] = "INCOMPLETE_HE_NIQQUD_ALIGNMENT_UNRESOLVED_NO_THIRD_PASS"
                blocked_row_count += 1
            elif has_niqqud(row.get("he")):
                row["pass_2_row_status"] = "INCOMPLETE_PLAIN_HEBREW_CONTAINS_NIQQUD_NO_THIRD_PASS"
                blocked_row_count += 1
            else:
                row["pass_2_row_status"] = "INCOMPLETE_LEGACY_COLUMNS_NOT_INDEPENDENTLY_REVIEWED_NO_THIRD_PASS"
                blocked_row_count += 1
            row.pop("candidate_row_sha256", None)
            row["candidate_row_sha256"] = sha256_json(row)

        blockers = [
            "SOURCE_TEXT_EXACTNESS_NOT_COMPLETELY_LINE_REVIEWED",
            "LEGACY_LEARNING_COLUMNS_NOT_INDEPENDENTLY_REVIEWED",
        ]
        if any(row.get("hebrew_skeleton_matches_niqqud") is False for row in record["rows"]):
            blockers.append("HE_NIQQUD_CONSONANT_ALIGNMENT_UNRESOLVED")
        if any(has_niqqud(row.get("he")) and row["row_id"] not in B02_PASS2_TEXT_CORRECTIONS
               for row in record["rows"]):
            blockers.append("LEGACY_PLAIN_HEBREW_COLUMN_CONTAINS_NIQQUD")
        if task_id == q(14):
            blockers.append("LEGACY_HEADING_COMBINES_SOURCE_CONTEXT_LABELS_NONCANONICALLY")
        if task_id == q(18):
            blockers.append("EXTERNAL_APPENDIX_DEPENDENCY_NOT_MATERIALIZED_IN_CANONICAL_PACKAGE")
        record["pass_2_status"] = "INCOMPLETE_TERMINAL_NO_THIRD_PASS_OWNER_DECISION_REQUIRED_FOR_SEPARATE_REPAIR"
        record["final_disposition"] = "INCOMPLETE"
        record["final_blockers"] = blockers
        record["owner_decision_required_for_future_repair"] = True
        record["candidate_task_sha256"] = sha256_json(record)
        final_incomplete_ids.append(task_id)

    candidates["text_correction_count"] = len(correction_entries)
    candidates["source_anchor_correction_task_count"] = 0
    candidates["reviewed_row_count"] = reviewed_row_count
    candidates["blocked_row_count"] = blocked_row_count
    candidates["final_pass_task_ids"] = []
    candidates["final_incomplete_task_ids"] = final_incomplete_ids
    candidates["artifact_sha256"] = sha256_json(candidates)

    correction_ledger = {
        "schema": f"{BUILD_SCHEMA}.pass2-corrections",
        "status": "APPLIED_TERMINAL_PASS2_NO_RAW_OR_PASS1_MUTATION",
        "batch_id": "B02",
        "pass_number": 2,
        "source_edition": SOURCE_EDITION,
        "source_pdf_sha256": SOURCE_PDF_SHA256,
        "entry_count": len(correction_entries),
        "entries": correction_entries,
        "provider_calls": 0,
        "solution_adjudication": False,
    }
    correction_ledger["artifact_sha256"] = sha256_json(correction_ledger)

    final_entries = copy.deepcopy(pass1_discrepancies["entries"])
    for entry in final_entries:
        if entry["class"] in {
            "SOURCE_TASK_HEADING_MISSING_OR_UNUSABLE_IN_LEGACY_CONDITION",
            "LEGACY_HEADING_CONFUSES_TASK_NUMBER_WITH_YEAR",
            "LEGACY_HEADING_HAS_WRONG_TASK_NUMBER",
        }:
            entry["pass_2_status"] = "RESOLVED_BY_SOURCE_BACKED_HEADING_CORRECTION"
        elif entry["class"] == "DUPLICATE_LEGACY_CARDS_CONFLICT_ON_SOURCE_DIAMETER":
            entry["pass_2_status"] = "RESOLVED_SOURCE_MATCHING_50MM_CARD_PRESERVED_35MM_REJECTED"
        elif entry["class"] == "LEGACY_TITLE_PAGE_NUMBER_DIFFERS_FROM_SOURCE_PAGE":
            entry["pass_2_status"] = "RESOLVED_SOURCE_PAGE_14_CANONICAL_LEGACY_TITLE_EVIDENCE_ONLY"
        else:
            entry["pass_2_status"] = "FINAL_INCOMPLETE_NO_THIRD_PASS"
    for task_id in final_incomplete_ids:
        final_entries.append({
            "discrepancy_id": f"B02-P2-{task_id.rsplit('-', 1)[-1].upper()}-LEGACY-COLUMNS",
            "task_id": task_id,
            "severity": "MAJOR",
            "class": "LEGACY_SOURCE_AND_LEARNING_COLUMNS_NOT_FULLY_INDEPENDENTLY_REVIEWED",
            "disposition": "TERMINAL_INCOMPLETE_SEPARATE_OWNER_AUTHORIZED_REPAIR_REQUIRED",
            "pass_2_status": "FINAL_INCOMPLETE_NO_THIRD_PASS",
        })
    final_discrepancies = {
        "schema": f"{BUILD_SCHEMA}.pass2-final-discrepancies",
        "status": "B02_PASS2_TERMINAL_CLASSIFICATION",
        "batch_id": "B02",
        "entry_count": len(final_entries),
        "entries": final_entries,
        "final_incomplete_task_ids": final_incomplete_ids,
        "provider_calls": 0,
        "solution_adjudication": False,
    }
    final_discrepancies["status_counts"] = dict(sorted(Counter(
        item["pass_2_status"] for item in final_entries
    ).items()))
    final_discrepancies["artifact_sha256"] = sha256_json(final_discrepancies)

    expected_ids = [q(number) for number in range(10, 20)]
    checks = {
        "exactly_10_tasks": len(candidates["records"]) == 10,
        "zero_pass_tasks": candidates["final_pass_task_ids"] == [],
        "exactly_10_explicit_incomplete_tasks": final_incomplete_ids == expected_ids,
        "all_tasks_terminally_classified": all(
            item["final_disposition"] == "INCOMPLETE" for item in candidates["records"]
        ),
        "no_third_pass": candidates["maximum_passes"] == 2 and candidates["pass_number"] == 2,
        "nine_source_heading_corrections": candidates["text_correction_count"] == 9,
        "reviewed_plus_blocked_rows_complete": reviewed_row_count + blocked_row_count == candidates["row_count"],
        "solution_rows_zero": not any(item["solution_rows_included"] for item in candidates["records"]),
        "provider_calls_zero": candidates["provider_calls"] == 0,
        "secret_access_false": candidates["secret_access"] is False,
        "not_importable": "NOT_IMPORTABLE" in candidates["status"],
    }
    if not all(checks.values()):
        raise RuntimeError(f"B02 pass2 verification failed: {checks}")
    verification = {
        "schema": f"{BUILD_SCHEMA}.pass2-verification",
        "status": "PASS_B02_PASS2_TERMINAL_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
        "batch_id": "B02",
        "pass_number": 2,
        "checks": checks,
        "task_count": len(candidates["records"]),
        "row_count": candidates["row_count"],
        "reviewed_row_count": reviewed_row_count,
        "blocked_row_count": blocked_row_count,
        "final_pass_task_ids": [],
        "final_incomplete_task_ids": final_incomplete_ids,
        "correction_count": len(correction_entries),
        "provider_calls": 0,
    }

    plan = copy.deepcopy(plan)
    plan["status"] = "OWNER_APPROVED_LOCAL_BUILD_B01_AND_B02_TERMINALLY_CLASSIFIED"
    plan["batches"][1]["state"] = "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS"
    ledger = copy.deepcopy(ledger)
    ledger["status"] = "IN_PROGRESS_B02_PASS2_TERMINAL_COMPLETE"
    ledger["batches"][1].update({
        "state": "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
        "passes_completed": 2,
        "candidate_artifact_sha256": candidates["artifact_sha256"],
        "verification_status": verification["status"],
        "final_pass_task_count": 0,
        "final_incomplete_task_count": len(final_incomplete_ids),
    })
    ledger["next_action"] = "B03_PASS1_ALREADY_AUTHORIZED_NOT_STARTED"
    ledger["provider_calls_made"] = 0
    ledger["secret_accessed"] = False
    ledger["import_executed"] = False
    ledger["publication_executed"] = False
    ledger["solution_work_executed"] = False
    ledger["audio_work_executed"] = False
    return plan, ledger, candidates, correction_ledger, final_discrepancies, verification


def report(plan: dict[str, Any], ledger: dict[str, Any], candidates: dict[str, Any], discrepancies: dict[str, Any]) -> str:
    return f"""# Local Build start - Materials Science PB2

Status: **B01 PASS 1 COMPLETE / PASS 2 REQUIRED / NOT CANONICAL**.

## Fixed execution envelope

- 60 tasks, six batches of ten;
- maximum two passes per batch;
- provider calls: 0;
- solutions, audio, import and publication: forbidden;
- after pass 2 a task is either `PASS` or explicit `INCOMPLETE`; no third pass.

## B01 pass 1

- tasks: {candidates['task_count']};
- source/learning candidate rows: {candidates['row_count']};
- reused legacy candidate rows: {candidates['legacy_candidate_row_count']};
- manual source transcription rows: {candidates['manual_source_transcription_row_count']};
- rows carrying niqqud marks: {candidates['rows_with_niqqud_marks']};
- consonant-skeleton mismatches: {candidates['hebrew_skeleton_mismatch_count']};
- open discrepancies: {len(discrepancies['entries'])};
- incomplete after pass 1: nine tasks; only question 1 has no structural alignment gap.

Question 2 has no legacy rows. Its Hebrew source was transcribed from pages 4-5;
niqqud, transliteration and Russian remain explicit nulls until pass 2. Question 8's
legacy condition omitted the numeric source table, so a source-bound Hebrew table
transcription was added with the same explicit derived-column gap.

Legacy reuse also exposed {candidates['hebrew_skeleton_mismatch_count']} rows where
plain and vocalized Hebrew do not have the same consonant skeleton. Those rows are
not auto-corrected: pass 2 must resolve each one against the source or leave its task
explicitly incomplete.

No legacy solution rows were copied. Rejected Gemini output was not used. B02-B06
remain planned and have not started.

## Next bounded action

Run B01/pass 2 exactly once: verify every source string, repair the task 7 heading,
complete the derived columns for the two source-only gaps, tighten three overlapping
prepared crops, and close every B01 task as `PASS` or explicit `INCOMPLETE`.
"""


def report_pass2(
    candidates: dict[str, Any],
    corrections: dict[str, Any],
    discrepancies: dict[str, Any],
) -> str:
    return f"""# Local Build B01 pass 2 - terminal classification

Status: **B01 CLOSED / 1 PASS / 9 INCOMPLETE / NO THIRD PASS**.

## Result

- tasks terminally classified: {candidates['task_count']};
- `PASS`: {len(candidates['final_pass_task_ids'])};
- explicit `INCOMPLETE`: {len(candidates['final_incomplete_task_ids'])};
- rows: {candidates['row_count']};
- locally reviewed source/aligned rows: {candidates['reviewed_row_count']};
- blocked rows preserved as evidence: {candidates['blocked_row_count']};
- source-backed text corrections: {candidates['text_correction_count']};
- source-anchor correction tasks: {candidates['source_anchor_correction_task_count']};
- final discrepancy entries: {discrepancies['entry_count']}.

Question 1 is the only passing B01 task. Its heading punctuation, condition,
four learning columns, source anchor, and required atom diagrams were locally
reviewed together.

The other nine tasks are explicitly incomplete. The source PDF has unvocalized
Hebrew only, so it cannot independently validate legacy niqqud, transliteration,
or Russian. Forty-three plain/vocalized Hebrew consonant-skeleton mismatches remain
unresolved, and nine source-only rows still have explicit null derived columns.
Those values were not guessed or mass-normalized.

Full-page visual readback also corrected source coordinates for questions 3-6.
It proved that question 3's old crop omitted its subparts and question 5 continues
at the top of source page 7. These corrections are recorded without rewriting the
historical Prepare manifest.

## Boundary

Pass 2 is terminal. There is no pass 3. Any future improvement to the nine
incomplete tasks is a separately authorized Repair program, not continuation of
B01. No package was produced because B01 is not canonical or importable.

Provider calls, secret access, solutions, audio, import, and publication remained 0.
The applied correction ledger contains {corrections['entry_count']} entries.
"""


def report_b02_pass1(candidates: dict[str, Any], discrepancies: dict[str, Any]) -> str:
    return f"""# Local Build B02 pass 1 - Materials Science PB2

Status: **B02 PASS 1 COMPLETE / 10 INCOMPLETE / PASS 2 REQUIRED**.

## Result

- tasks: {candidates['task_count']};
- candidate rows: {candidates['row_count']};
- reused legacy condition rows: {candidates['legacy_candidate_row_count']};
- source-transcribed heading rows: {candidates['manual_source_transcription_row_count']};
- consonant-skeleton mismatches: {candidates['hebrew_skeleton_mismatch_count']};
- legacy plain-Hebrew rows carrying niqqud: {candidates['plain_hebrew_rows_with_niqqud_marks']};
- open discrepancy entries: {len(discrepancies['entries'])};
- provider calls, secret access, solutions, audio, import and publication: 0.

Full source pages for q010-q019 were visually read back and their condition
boundaries were mapped to legacy rows. No legacy solution row was copied. Every
task remains explicitly incomplete because the reused niqqud, transliteration and
Russian columns have not yet received independent pass-2 review.

For q016, the two same-title legacy cards conflict: one says Ø50 mm and the other
Ø35 mm. The source PDF says Ø50 mm, so only that card was selected; the Ø35 mm card
is retained as rejected discrepancy evidence and was not merged. For q015, the
legacy heading incorrectly says question 19; a source-bound Hebrew q015 heading was
inserted while its derived columns remain null. q018 preserves its external
appendix dependency on source pages 68-69.

## Next bounded action

B02/pass 2 may run exactly once. It must independently review source strings and
all four learning columns, then close every task as `PASS` or explicit `INCOMPLETE`.
There is no B02/pass 3 and no package is importable from pass 1.
"""


def report_b02_pass2(
    candidates: dict[str, Any],
    corrections: dict[str, Any],
    discrepancies: dict[str, Any],
) -> str:
    return f"""# Local Build B02 pass 2 - terminal classification

Status: **B02 CLOSED / 0 PASS / 10 INCOMPLETE / NO THIRD PASS**.

## Result

- tasks terminally classified: {candidates['task_count']};
- `PASS`: {len(candidates['final_pass_task_ids'])};
- explicit `INCOMPLETE`: {len(candidates['final_incomplete_task_ids'])};
- rows: {candidates['row_count']};
- locally reviewed source/aligned heading rows: {candidates['reviewed_row_count']};
- blocked rows preserved as evidence: {candidates['blocked_row_count']};
- source-backed heading corrections: {candidates['text_correction_count']};
- final discrepancy entries: {discrepancies['entry_count']}.

Nine task headings were corrected or completed as four aligned columns after
visual source readback. This narrow allowlist does not make a task canonical:
the remaining 148 rows still depend on legacy source or learning columns that
were not independently reviewed line by line. Thirty-nine consonant-skeleton
mismatches and 22 rows with niqqud already present in the legacy plain-Hebrew
column remain explicit blockers rather than being mass-normalized.

The q016 Ø50 mm source-matching card remains selected and the conflicting Ø35 mm
card remains rejected without merge. q018 still preserves its appendix dependency.
No legacy solution rows were copied and no canonical/import package was produced.

## Boundary

B02/pass 2 is terminal. There is no B02/pass 3. Future improvement of these ten
tasks is a separately authorized Repair program. The next already-authorized
finite-build step is B03/pass 1.

Provider calls, secret access, solutions, audio, import, and publication remained 0.
The correction ledger contains {corrections['entry_count']} source-bound entries.
"""


def report_b03_pass1(candidates: dict[str, Any], discrepancies: dict[str, Any]) -> str:
    return f"""# Local Build B03 pass 1 - Materials Science PB2

Status: **B03 PASS 1 COMPLETE / 10 INCOMPLETE / PASS 2 REQUIRED**.

## Result

- tasks: {candidates['task_count']};
- candidate rows: {candidates['row_count']};
- reused legacy condition rows: {candidates['legacy_candidate_row_count']};
- source-transcribed heading rows: {candidates['manual_source_transcription_row_count']};
- consonant-skeleton mismatches: {candidates['hebrew_skeleton_mismatch_count']};
- legacy plain-Hebrew rows carrying niqqud: {candidates['plain_hebrew_rows_with_niqqud_marks']};
- open discrepancy entries: {len(discrepancies['entries'])};
- provider calls, secret access, solutions, audio, import and publication: 0.

Full source pages for q020-q029 were visually read back and their condition
boundaries were mapped to legacy rows. No legacy solution row was copied. Every
task remains explicitly incomplete because legacy source and learning columns
have not yet received independent pass-2 review.

The visual readback proved that q027 continues from source page 35 onto page 36.
The candidate now carries both anchors; the old prepared asset remains explicitly
incomplete until rebuilt. q027 and q028 preserve their source-page-70 iron-carbon
appendix dependency. q025 and q026 use source-bound task headings because their
legacy cards incorrectly label both as question 9.

## Next bounded action

B03/pass 2 may run exactly once. It must independently review source strings and
all four learning columns, then close every task as `PASS` or explicit `INCOMPLETE`.
There is no B03/pass 3 and no package is importable from pass 1.
"""


def report_later_batch_pass1(
    batch_id: str,
    candidates: dict[str, Any],
    discrepancies: dict[str, Any],
) -> str:
    return f"""# Local Build {batch_id} pass 1 - Materials Science PB2

Status: **{batch_id} PASS 1 COMPLETE / 10 INCOMPLETE / PASS 2 REQUIRED**.

- tasks: {candidates['task_count']};
- condition rows: {candidates['row_count']};
- legacy candidate rows: {candidates['legacy_candidate_row_count']};
- manual source-transcription rows: {candidates['manual_source_transcription_row_count']};
- open discrepancies: {len(discrepancies['entries'])};
- provider calls / secret access / solutions / audio / import / publication: **0 / false / 0 / 0 / 0 / 0**.

Every task remains an explicit non-importable candidate. {batch_id}/pass 2 may run
exactly once and must end in PASS or INCOMPLETE; there is no third pass.
"""


def report_later_batch_pass2(
    batch_id: str,
    candidates: dict[str, Any],
    corrections: dict[str, Any],
    discrepancies: dict[str, Any],
    next_batch_id: str | None,
) -> str:
    next_text = (
        f"The next already-authorized finite-build step is {next_batch_id}/pass 1."
        if next_batch_id else
        "All six finite-build batches are now terminally classified."
    )
    return f"""# Local Build {batch_id} pass 2 - terminal classification

Status: **{batch_id} CLOSED / 0 PASS / 10 INCOMPLETE / NO THIRD PASS**.

## Result

- tasks terminally classified: {candidates['task_count']};
- `PASS`: {len(candidates['final_pass_task_ids'])};
- explicit `INCOMPLETE`: {len(candidates['final_incomplete_task_ids'])};
- rows: {candidates['row_count']};
- locally reviewed source/aligned heading rows: {candidates['reviewed_row_count']};
- blocked rows preserved as evidence: {candidates['blocked_row_count']};
- source-backed heading corrections: {candidates['text_correction_count']};
- final discrepancy entries: {discrepancies['entry_count']}.

All ten task headings were corrected or completed as four aligned columns after
visual source readback. This narrow allowlist does not make a task canonical:
all remaining rows still depend on legacy source or learning columns that were
not independently reviewed line by line. Consonant-skeleton disagreements and
niqqud in legacy plain-Hebrew fields remain explicit blockers rather than being
mass-normalized.

Required visuals, corrected source continuations, and appendix dependencies stay
attached to their task records. No legacy solution rows were copied and no
canonical/import package was produced.

## Boundary

{batch_id}/pass 2 is terminal. There is no {batch_id}/pass 3. Future improvement
of these ten tasks is a separately authorized Repair program. {next_text}

Provider calls, secret access, solutions, audio, import, and publication remained 0.
The correction ledger contains {corrections['entry_count']} source-bound entries.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--batch", default="B01", choices=["B01", "B02", "B03", "B04", "B05", "B06"])
    parser.add_argument("--pass-number", type=int, default=1, choices=[1, 2])
    parser.add_argument("--base-head")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    base_head = args.base_head or git_head(repo)
    build_dir = args.stable / "build"
    approval = json.loads((build_dir / "local-build-approval.json").read_text(encoding="utf-8"))
    interpreted = approval["interpreted_approval"]
    if approval["status"] != "OWNER_APPROVED" or interpreted != {
        "program": "MATERIALS-PB2-LOCAL-BUILD",
        "batches": 6,
        "tasks_per_batch": 10,
        "maximum_passes_per_batch": 2,
        "provider_calls_allowed": 0,
        "import_allowed": False,
        "publication_allowed": False,
        "solution_authoring_or_adjudication_allowed": False,
        "audio_allowed": False,
    }:
        raise RuntimeError("local build owner approval drift")

    if args.batch == "B06":
        stored_plan = json.loads((build_dir / "local-build-plan.json").read_text(encoding="utf-8"))
        stored_ledger = json.loads((build_dir / "local-build-ledger.json").read_text(encoding="utf-8"))
        plan, ledger, candidates, discrepancies, verification = build_later_batch_pass1(
            args.stable, args.source_dir, base_head, stored_plan, stored_ledger,
            batch_id="B06", batch_index=5, expected_ids=B06_TASK_IDS,
            legacy_selections=B06_LEGACY_SELECTIONS,
            manual_source_rows=B06_MANUAL_SOURCE_ROWS,
            source_anchor_overrides=B06_SOURCE_ANCHOR_OVERRIDES,
            initial_discrepancies=B06_INITIAL_DISCREPANCIES,
            expected_terminal_state="PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
            next_batch_id="AGGREGATE_AUDIT",
        )
        batch_dir = build_dir / "batch-B06"
        if args.pass_number == 2:
            stored_pass1 = json.loads((batch_dir / "pass1-canonical-candidates.json").read_text(encoding="utf-8"))
            stored_discrepancies = json.loads((batch_dir / "pass1-discrepancy-ledger.json").read_text(encoding="utf-8"))
            if stored_pass1["artifact_sha256"] != candidates["artifact_sha256"]:
                raise RuntimeError("stored B06 pass1 candidate artifact drift")
            if stored_discrepancies["artifact_sha256"] != discrepancies["artifact_sha256"]:
                raise RuntimeError("stored B06 pass1 discrepancy artifact drift")
            heading_pages = {
                q(49): 59, q(50): 60, q(51): 61, q(52): 62, q(53): 63,
                q(54): 63, q(55): 63, q(56): 64, q(57): 64, q(58): 65,
            }
            plan, ledger, candidates2, corrections2, discrepancies2, verification2 = (
                build_terminal_later_batch_pass2(
                    "B06", 5, plan, ledger, stored_pass1, stored_discrepancies,
                    heading_pages, B06_HEADING_LABELS, B06_TASK_IDS,
                    "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "PASS_B06_PASS2_TERMINAL_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "AGGREGATE_AUDIT_PASS1_ALREADY_AUTHORIZED_NOT_STARTED",
                )
            )
            write_json(build_dir / "local-build-plan.json", plan)
            write_json(build_dir / "local-build-ledger.json", ledger)
            write_json(batch_dir / "pass2-final-candidates.json", candidates2)
            write_json(batch_dir / "pass2-correction-ledger.json", corrections2)
            write_json(batch_dir / "pass2-final-discrepancy-ledger.json", discrepancies2)
            write_json(batch_dir / "pass2-verification.json", verification2)
            write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_later_batch_pass2(
                "B06", candidates2, corrections2, discrepancies2, "AGGREGATE AUDIT"
            ))
            write_text(build_dir / "README.md", """# Materials Science PB2 local Build

Start with `LOCAL_BUILD_REPORT.md`. All six finite batches are terminally closed
with explicit PASS/INCOMPLETE classifications and no third pass. No artifact is
canonical or importable, and none is a solution, audio package, import receipt,
or publication snapshot. The aggregate readiness audit is the next local step.
""")
            print(json.dumps({
                "status": verification2["status"], "tasks": candidates2["task_count"],
                "pass_tasks": candidates2["final_pass_task_ids"],
                "incomplete_tasks": candidates2["final_incomplete_task_ids"],
                "rows": candidates2["row_count"], "corrections": corrections2["entry_count"],
                "provider_calls": 0,
            }, ensure_ascii=False))
            return
        write_json(build_dir / "local-build-plan.json", plan)
        write_json(build_dir / "local-build-ledger.json", ledger)
        write_json(batch_dir / "pass1-canonical-candidates.json", candidates)
        write_json(batch_dir / "pass1-discrepancy-ledger.json", discrepancies)
        write_json(batch_dir / "pass1-verification.json", verification)
        write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_later_batch_pass1(
            "B06", candidates, discrepancies
        ))
        print(json.dumps({
            "status": verification["status"], "tasks": candidates["task_count"],
            "rows": candidates["row_count"], "legacy_rows": candidates["legacy_candidate_row_count"],
            "manual_source_rows": candidates["manual_source_transcription_row_count"],
            "incomplete_tasks": verification["incomplete_task_ids"], "provider_calls": 0,
        }, ensure_ascii=False))
        return

    if args.batch == "B05":
        stored_plan = json.loads((build_dir / "local-build-plan.json").read_text(encoding="utf-8"))
        stored_ledger = json.loads((build_dir / "local-build-ledger.json").read_text(encoding="utf-8"))
        plan, ledger, candidates, discrepancies, verification = build_later_batch_pass1(
            args.stable, args.source_dir, base_head, stored_plan, stored_ledger,
            batch_id="B05", batch_index=4, expected_ids=B05_TASK_IDS,
            legacy_selections=B05_LEGACY_SELECTIONS,
            manual_source_rows=B05_MANUAL_SOURCE_ROWS,
            source_anchor_overrides=B05_SOURCE_ANCHOR_OVERRIDES,
            initial_discrepancies=B05_INITIAL_DISCREPANCIES,
            expected_terminal_state="PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
            next_batch_id="B06",
        )
        batch_dir = build_dir / "batch-B05"
        if args.pass_number == 2:
            stored_pass1 = json.loads((batch_dir / "pass1-canonical-candidates.json").read_text(encoding="utf-8"))
            stored_discrepancies = json.loads((batch_dir / "pass1-discrepancy-ledger.json").read_text(encoding="utf-8"))
            if stored_pass1["artifact_sha256"] != candidates["artifact_sha256"]:
                raise RuntimeError("stored B05 pass1 candidate artifact drift")
            if stored_discrepancies["artifact_sha256"] != discrepancies["artifact_sha256"]:
                raise RuntimeError("stored B05 pass1 discrepancy artifact drift")
            heading_pages = {
                q(39): 48, q(40): 49, q(41): 51, q(42): 52, q(43): 53,
                q(44): 54, q(45): 55, q(46): 56, q(47): 57, q(48): 58,
            }
            plan, ledger, candidates2, corrections2, discrepancies2, verification2 = (
                build_terminal_later_batch_pass2(
                    "B05", 4, plan, ledger, stored_pass1, stored_discrepancies,
                    heading_pages, B05_HEADING_LABELS, B05_TASK_IDS,
                    "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "PASS_B05_PASS2_TERMINAL_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "B06_PASS1_ALREADY_AUTHORIZED_NOT_STARTED",
                )
            )
            write_json(build_dir / "local-build-plan.json", plan)
            write_json(build_dir / "local-build-ledger.json", ledger)
            write_json(batch_dir / "pass2-final-candidates.json", candidates2)
            write_json(batch_dir / "pass2-correction-ledger.json", corrections2)
            write_json(batch_dir / "pass2-final-discrepancy-ledger.json", discrepancies2)
            write_json(batch_dir / "pass2-verification.json", verification2)
            write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_later_batch_pass2(
                "B05", candidates2, corrections2, discrepancies2, "B06"
            ))
            write_text(build_dir / "README.md", """# Materials Science PB2 local Build

Start with `LOCAL_BUILD_REPORT.md`. B01-B05 are terminally closed with explicit
PASS/INCOMPLETE classifications and no third pass. No artifact is canonical or
importable, and none is a solution, audio package, import receipt, or publication snapshot.
""")
            print(json.dumps({
                "status": verification2["status"], "tasks": candidates2["task_count"],
                "pass_tasks": candidates2["final_pass_task_ids"],
                "incomplete_tasks": candidates2["final_incomplete_task_ids"],
                "rows": candidates2["row_count"], "corrections": corrections2["entry_count"],
                "provider_calls": 0,
            }, ensure_ascii=False))
            return
        write_json(build_dir / "local-build-plan.json", plan)
        write_json(build_dir / "local-build-ledger.json", ledger)
        write_json(batch_dir / "pass1-canonical-candidates.json", candidates)
        write_json(batch_dir / "pass1-discrepancy-ledger.json", discrepancies)
        write_json(batch_dir / "pass1-verification.json", verification)
        write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_later_batch_pass1(
            "B05", candidates, discrepancies
        ))
        print(json.dumps({
            "status": verification["status"], "tasks": candidates["task_count"],
            "rows": candidates["row_count"], "legacy_rows": candidates["legacy_candidate_row_count"],
            "manual_source_rows": candidates["manual_source_transcription_row_count"],
            "incomplete_tasks": verification["incomplete_task_ids"], "provider_calls": 0,
        }, ensure_ascii=False))
        return

    if args.batch == "B04":
        stored_plan = json.loads((build_dir / "local-build-plan.json").read_text(encoding="utf-8"))
        stored_ledger = json.loads((build_dir / "local-build-ledger.json").read_text(encoding="utf-8"))
        plan, ledger, candidates, discrepancies, verification = build_later_batch_pass1(
            args.stable, args.source_dir, base_head, stored_plan, stored_ledger,
            batch_id="B04", batch_index=3, expected_ids=B04_TASK_IDS,
            legacy_selections=B04_LEGACY_SELECTIONS,
            manual_source_rows=B04_MANUAL_SOURCE_ROWS,
            source_anchor_overrides=B04_SOURCE_ANCHOR_OVERRIDES,
            initial_discrepancies=B04_INITIAL_DISCREPANCIES,
            expected_terminal_state="PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
            next_batch_id="B05",
        )
        batch_dir = build_dir / "batch-B04"
        if args.pass_number == 2:
            stored_pass1 = json.loads((batch_dir / "pass1-canonical-candidates.json").read_text(encoding="utf-8"))
            stored_discrepancies = json.loads((batch_dir / "pass1-discrepancy-ledger.json").read_text(encoding="utf-8"))
            if stored_pass1["artifact_sha256"] != candidates["artifact_sha256"]:
                raise RuntimeError("stored B04 pass1 candidate artifact drift")
            if stored_discrepancies["artifact_sha256"] != discrepancies["artifact_sha256"]:
                raise RuntimeError("stored B04 pass1 discrepancy artifact drift")
            heading_pages = {
                q(30): 38, q(31): 39, q(32): 39, q(33): 40, q(34): 41,
                q(35): 42, q(36): 43, q(37): 44,
                "materials-science-y1-pb2-p045-q038": 45,
                "materials-science-y1-pb2-p047-q038": 47,
            }
            plan, ledger, candidates2, corrections2, discrepancies2, verification2 = (
                build_terminal_later_batch_pass2(
                    "B04", 3, plan, ledger, stored_pass1, stored_discrepancies,
                    heading_pages, B04_HEADING_LABELS, B04_TASK_IDS,
                    "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "PASS_B04_PASS2_TERMINAL_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "B05_PASS1_ALREADY_AUTHORIZED_NOT_STARTED",
                )
            )
            write_json(build_dir / "local-build-plan.json", plan)
            write_json(build_dir / "local-build-ledger.json", ledger)
            write_json(batch_dir / "pass2-final-candidates.json", candidates2)
            write_json(batch_dir / "pass2-correction-ledger.json", corrections2)
            write_json(batch_dir / "pass2-final-discrepancy-ledger.json", discrepancies2)
            write_json(batch_dir / "pass2-verification.json", verification2)
            write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_later_batch_pass2(
                "B04", candidates2, corrections2, discrepancies2, "B05"
            ))
            write_text(build_dir / "README.md", """# Materials Science PB2 local Build

Start with `LOCAL_BUILD_REPORT.md`. B01-B04 are terminally closed with explicit
PASS/INCOMPLETE classifications and no third pass. No artifact is canonical or
importable, and none is a solution, audio package, import receipt, or publication snapshot.
""")
            print(json.dumps({
                "status": verification2["status"], "tasks": candidates2["task_count"],
                "pass_tasks": candidates2["final_pass_task_ids"],
                "incomplete_tasks": candidates2["final_incomplete_task_ids"],
                "rows": candidates2["row_count"], "corrections": corrections2["entry_count"],
                "provider_calls": 0,
            }, ensure_ascii=False))
            return
        write_json(build_dir / "local-build-plan.json", plan)
        write_json(build_dir / "local-build-ledger.json", ledger)
        write_json(batch_dir / "pass1-canonical-candidates.json", candidates)
        write_json(batch_dir / "pass1-discrepancy-ledger.json", discrepancies)
        write_json(batch_dir / "pass1-verification.json", verification)
        write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_later_batch_pass1(
            "B04", candidates, discrepancies
        ))
        print(json.dumps({
            "status": verification["status"], "tasks": candidates["task_count"],
            "rows": candidates["row_count"], "legacy_rows": candidates["legacy_candidate_row_count"],
            "manual_source_rows": candidates["manual_source_transcription_row_count"],
            "incomplete_tasks": verification["incomplete_task_ids"], "provider_calls": 0,
        }, ensure_ascii=False))
        return

    if args.batch == "B03":
        stored_plan = json.loads((build_dir / "local-build-plan.json").read_text(encoding="utf-8"))
        stored_ledger = json.loads((build_dir / "local-build-ledger.json").read_text(encoding="utf-8"))
        plan, ledger, candidates, discrepancies, verification = build_batch_b03_pass1(
            args.stable, args.source_dir, base_head, stored_plan, stored_ledger
        )
        batch_dir = build_dir / "batch-B03"
        if args.pass_number == 2:
            stored_pass1 = json.loads((batch_dir / "pass1-canonical-candidates.json").read_text(encoding="utf-8"))
            stored_discrepancies = json.loads((batch_dir / "pass1-discrepancy-ledger.json").read_text(encoding="utf-8"))
            if stored_pass1["artifact_sha256"] != candidates["artifact_sha256"]:
                raise RuntimeError("stored B03 pass1 candidate artifact drift")
            if stored_discrepancies["artifact_sha256"] != discrepancies["artifact_sha256"]:
                raise RuntimeError("stored B03 pass1 discrepancy artifact drift")
            heading_pages = {q(number): page for number, page in (
                (20, 26), (21, 27), (22, 28), (23, 29), (24, 30),
                (25, 31), (26, 33), (27, 35), (28, 36), (29, 37),
            )}
            plan, ledger, candidates2, corrections2, discrepancies2, verification2 = (
                build_terminal_later_batch_pass2(
                    "B03", 2, plan, ledger, stored_pass1, stored_discrepancies,
                    heading_pages, {q(number): str(number) for number in range(20, 30)},
                    [q(number) for number in range(20, 30)],
                    "PASS2_CLOSED_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "PASS_B03_PASS2_TERMINAL_0_PASS_10_INCOMPLETE_NO_THIRD_PASS",
                    "B04_PASS1_ALREADY_AUTHORIZED_NOT_STARTED",
                )
            )
            write_json(build_dir / "local-build-plan.json", plan)
            write_json(build_dir / "local-build-ledger.json", ledger)
            write_json(batch_dir / "pass2-final-candidates.json", candidates2)
            write_json(batch_dir / "pass2-correction-ledger.json", corrections2)
            write_json(batch_dir / "pass2-final-discrepancy-ledger.json", discrepancies2)
            write_json(batch_dir / "pass2-verification.json", verification2)
            write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_later_batch_pass2(
                "B03", candidates2, corrections2, discrepancies2, "B04"
            ))
            write_text(build_dir / "README.md", """# Materials Science PB2 local Build

Start with `LOCAL_BUILD_REPORT.md`. B01-B03 are terminally closed with explicit
PASS/INCOMPLETE classifications and no third pass. No artifact in this directory
is canonical or importable, and none is a solution, audio package, import receipt,
or publication snapshot.
""")
            print(json.dumps({
                "status": verification2["status"], "tasks": candidates2["task_count"],
                "pass_tasks": candidates2["final_pass_task_ids"],
                "incomplete_tasks": candidates2["final_incomplete_task_ids"],
                "rows": candidates2["row_count"], "corrections": corrections2["entry_count"],
                "provider_calls": 0,
            }, ensure_ascii=False))
            return
        write_json(build_dir / "local-build-plan.json", plan)
        write_json(build_dir / "local-build-ledger.json", ledger)
        write_json(batch_dir / "pass1-canonical-candidates.json", candidates)
        write_json(batch_dir / "pass1-discrepancy-ledger.json", discrepancies)
        write_json(batch_dir / "pass1-verification.json", verification)
        write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_b03_pass1(candidates, discrepancies))
        write_text(build_dir / "README.md", """# Materials Science PB2 local Build

Start with `LOCAL_BUILD_REPORT.md`. B01 and B02 are terminally closed. B03/pass 1
is complete with ten explicit incomplete candidates awaiting its one allowed pass 2.
No artifact in this directory is canonical or importable. No artifact is a solution,
audio package, import receipt, or publication snapshot.
""")
        print(json.dumps({
            "status": verification["status"], "tasks": candidates["task_count"],
            "rows": candidates["row_count"], "legacy_rows": candidates["legacy_candidate_row_count"],
            "manual_source_rows": candidates["manual_source_transcription_row_count"],
            "incomplete_tasks": verification["incomplete_task_ids"], "provider_calls": 0,
        }, ensure_ascii=False))
        return

    if args.batch == "B02":
        stored_plan = json.loads((build_dir / "local-build-plan.json").read_text(encoding="utf-8"))
        stored_ledger = json.loads((build_dir / "local-build-ledger.json").read_text(encoding="utf-8"))
        plan, ledger, candidates, discrepancies, verification = build_batch_b02_pass1(
            args.stable, args.source_dir, base_head, stored_plan, stored_ledger
        )
        batch_dir = build_dir / "batch-B02"
        if args.pass_number == 2:
            stored_pass1 = json.loads((batch_dir / "pass1-canonical-candidates.json").read_text(encoding="utf-8"))
            stored_discrepancies = json.loads((batch_dir / "pass1-discrepancy-ledger.json").read_text(encoding="utf-8"))
            if stored_pass1["artifact_sha256"] != candidates["artifact_sha256"]:
                raise RuntimeError("stored B02 pass1 candidate artifact drift")
            if stored_discrepancies["artifact_sha256"] != discrepancies["artifact_sha256"]:
                raise RuntimeError("stored B02 pass1 discrepancy artifact drift")
            plan, ledger, candidates2, corrections2, discrepancies2, verification2 = build_batch_b02_pass2(
                plan, ledger, stored_pass1, stored_discrepancies
            )
            write_json(build_dir / "local-build-plan.json", plan)
            write_json(build_dir / "local-build-ledger.json", ledger)
            write_json(batch_dir / "pass2-final-candidates.json", candidates2)
            write_json(batch_dir / "pass2-correction-ledger.json", corrections2)
            write_json(batch_dir / "pass2-final-discrepancy-ledger.json", discrepancies2)
            write_json(batch_dir / "pass2-verification.json", verification2)
            write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_b02_pass2(
                candidates2, corrections2, discrepancies2
            ))
            write_text(build_dir / "README.md", """# Materials Science PB2 local Build

Start with `LOCAL_BUILD_REPORT.md`. B01 is terminally closed with one passing task
and nine explicit incomplete tasks. B02 is terminally closed with zero passing and
ten explicit incomplete tasks. No third pass is allowed for either batch. No
artifact in this directory is canonical or importable, and none is a solution,
audio package, import receipt, or publication snapshot.
""")
            print(json.dumps({
                "status": verification2["status"],
                "tasks": candidates2["task_count"],
                "pass_tasks": candidates2["final_pass_task_ids"],
                "incomplete_tasks": candidates2["final_incomplete_task_ids"],
                "rows": candidates2["row_count"],
                "corrections": corrections2["entry_count"],
                "provider_calls": 0,
            }, ensure_ascii=False))
            return
        write_json(build_dir / "local-build-plan.json", plan)
        write_json(build_dir / "local-build-ledger.json", ledger)
        write_json(batch_dir / "pass1-canonical-candidates.json", candidates)
        write_json(batch_dir / "pass1-discrepancy-ledger.json", discrepancies)
        write_json(batch_dir / "pass1-verification.json", verification)
        write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_b02_pass1(candidates, discrepancies))
        write_text(build_dir / "README.md", """# Materials Science PB2 local Build

Start with `LOCAL_BUILD_REPORT.md`. B01 is terminally closed with one passing task
and nine explicit incomplete tasks. B02/pass 1 is complete with ten explicit
incomplete candidates awaiting its one allowed pass 2. No artifact in this
directory is canonical or importable. No artifact is a solution, audio package,
import receipt, or publication snapshot.
""")
        print(json.dumps({
            "status": verification["status"],
            "tasks": candidates["task_count"],
            "rows": candidates["row_count"],
            "legacy_rows": candidates["legacy_candidate_row_count"],
            "manual_source_rows": candidates["manual_source_transcription_row_count"],
            "incomplete_tasks": verification["incomplete_task_ids"],
            "provider_calls": 0,
        }, ensure_ascii=False))
        return

    plan, ledger, candidates, discrepancies, verification = build_batch_b01(
        args.stable, args.source_dir, base_head
    )
    batch_dir = build_dir / "batch-B01"
    if args.pass_number == 2:
        stored_pass1 = json.loads((batch_dir / "pass1-canonical-candidates.json").read_text(encoding="utf-8"))
        stored_discrepancies = json.loads((batch_dir / "pass1-discrepancy-ledger.json").read_text(encoding="utf-8"))
        if stored_pass1["artifact_sha256"] != candidates["artifact_sha256"]:
            raise RuntimeError("stored B01 pass1 candidate artifact drift")
        if stored_discrepancies["artifact_sha256"] != discrepancies["artifact_sha256"]:
            raise RuntimeError("stored B01 pass1 discrepancy artifact drift")
        plan, ledger, candidates2, corrections2, discrepancies2, verification2 = build_batch_b01_pass2(
            plan, ledger, stored_pass1, stored_discrepancies
        )
        write_json(build_dir / "local-build-plan.json", plan)
        write_json(build_dir / "local-build-ledger.json", ledger)
        write_json(batch_dir / "pass2-final-candidates.json", candidates2)
        write_json(batch_dir / "pass2-correction-ledger.json", corrections2)
        write_json(batch_dir / "pass2-final-discrepancy-ledger.json", discrepancies2)
        write_json(batch_dir / "pass2-verification.json", verification2)
        write_text(build_dir / "LOCAL_BUILD_REPORT.md", report_pass2(candidates2, corrections2, discrepancies2))
        write_text(build_dir / "README.md", """# Materials Science PB2 local Build\n\nStart with `LOCAL_BUILD_REPORT.md`. B01/pass 2 is terminally closed with one\npassing task and nine explicit incomplete tasks. Pass-1 evidence is preserved\nunchanged. No B01 package is canonical or importable, and no third pass is allowed.\nNo artifact in this directory is a solution, audio package, import receipt, or\npublication snapshot.\n""")
        print(json.dumps({
            "status": verification2["status"],
            "tasks": candidates2["task_count"],
            "pass_tasks": candidates2["final_pass_task_ids"],
            "incomplete_tasks": candidates2["final_incomplete_task_ids"],
            "rows": candidates2["row_count"],
            "corrections": corrections2["entry_count"],
            "provider_calls": 0,
        }, ensure_ascii=False))
        return

    write_json(build_dir / "local-build-plan.json", plan)
    write_json(build_dir / "local-build-ledger.json", ledger)
    write_json(batch_dir / "pass1-canonical-candidates.json", candidates)
    write_json(batch_dir / "pass1-discrepancy-ledger.json", discrepancies)
    write_json(batch_dir / "pass1-verification.json", verification)
    write_text(build_dir / "LOCAL_BUILD_REPORT.md", report(plan, ledger, candidates, discrepancies))
    write_text(build_dir / "README.md", """# Materials Science PB2 local Build\n\nStart with `LOCAL_BUILD_REPORT.md`. This directory contains owner-approved,\nsource-bound local Build evidence. `batch-B01/pass1-canonical-candidates.json` is\nnot canonical and not importable until pass 2 closes every task. No artifact in this\ndirectory is a solution, audio package, import receipt, or publication snapshot.\n""")
    print(json.dumps({
        "status": verification["status"],
        "tasks": candidates["task_count"],
        "rows": candidates["row_count"],
        "legacy_rows": candidates["legacy_candidate_row_count"],
        "manual_source_rows": candidates["manual_source_transcription_row_count"],
        "incomplete_tasks": verification["incomplete_task_ids"],
        "provider_calls": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
