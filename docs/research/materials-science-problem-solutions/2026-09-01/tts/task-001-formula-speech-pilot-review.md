# Task 1 — formula speech pilot review

Status: `OWNER_REVIEW_REQUIRED`
Source ledger: `formula-speech-review.json`

These four rows block the Task 1 TTS pilot. The display formula is never used as
speech automatically. The suggestions below are review aids only; they are not
accepted speech and are not consumed by the bake.

| Row | Display | Suggested spoken Hebrew | Decision |
|---|---|---|---|
| `materials-science-y1-pb2-q001-sol-r011` | `Z=6` | `זֶד שָׁוֶה שֵׁשׁ` | pending |
| `materials-science-y1-pb2-q001-sol-r016` | `Z=26` | `זֶד שָׁוֶה עֶשְׂרִים וְשֵׁשׁ` | pending |
| `materials-science-y1-pb2-q001-sol-r021` | `Z=3` | `זֶד שָׁוֶה שָׁלוֹשׁ` | pending |
| `materials-science-y1-pb2-q001-sol-r028` | `Z=4` | `זֶד שָׁוֶה אַרְבַּע` | pending |

Owner acceptance must be explicit. After acceptance, copy the exact accepted
form into `spoken_he_niqqud`, set `status=REVIEWED_PASS`, and fill
`reviewed_by`/`reviewed_at` for these four ledger entries. Do not mark the other
271 formula rows by analogy.
