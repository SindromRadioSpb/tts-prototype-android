# Physics Year 1 corpus — OCR batch packet

## What this is

Three page-faithful PDF inputs for the approved Gemini OCR/table pass of the textbook task collection. Each PDF stays below the Studio 6 MiB upload limit, never splits a textbook problem by an arbitrary row boundary, and keeps a 1:1 mapping between PDF pages and the original PNG scans.

The split follows chapter boundaries and balances the prior table workload:

| Batch | Chapters | Textbook pages | Prior rows | PDF bytes | PDF SHA-256 |
|---|---|---:|---:|---:|---|
| 01 | 1–3 | 05–18 | 235 | 2,184,616 | `c774255385b861310c4d097f420b4dc0eea9aae7ad27b8a98e3c87e13a83ff76` |
| 02 | 4–6 | 19–29 | 298 | 1,761,222 | `19279e8d24eb3c5ebb0daa372b6ede5f9e9056c33e4a7e5daedecd49fcb91afe` |
| 03 | 7–9 | 30–43 | 285 | 2,200,543 | `613b79834bbd65c4b9fa35b0885ee3dfb8b802c8a0d651585a71f10b3d959d77` |

## Generation and verification

Source commit: `bedbcee7a9ea31e209d17d50dfe1ccb450416736`.

Generation command:

```powershell
python scripts/premium/build-physics-ocr-pdfs.py --source "G:\Andasa\📘 Учебная. 1 год\Физика\1" --output "output\pdf" --stable "docs\research\physics-corpus\2026-08-24" --quality 86
```

Verification command:

```powershell
python scripts/premium/verify-physics-ocr-pdfs.py --stable "docs\research\physics-corpus\2026-08-24" --output "output\pdf" --render-dir ".tmp\physics-pdf-render"
```

All 39 PDF pages were rendered back to raster and checked for exact count/order, non-blank content, output/stable-copy hash parity, and source-raster fidelity. Minimum measured PSNR is 38.75 dB; see `pdf-verification.json`. The rendered page images and contact sheets under `.tmp/physics-pdf-render/` are scratch QA and should not be edited or preserved.

`source-manifest.json` is the canonical source ledger. It records every original filename, textbook page, dimensions, byte size and SHA-256 plus the final PDF hashes. `page-manifest-batch-01.json` through `-03.json` are the request-local page provenance payloads accepted by `/api/ingest/extract-file`; they are deliberately kept outside the shared server cache.

## Current Gemini tables

All three batches were processed with the current `gemini-3.7-flash` table scenario. The saved provider caches are the canonical current-model outputs; rendered tables are deterministic derivatives used by the corpus builder.

| Batch | Tasks | Provider rows | Rendered content rows | Current artifacts |
|---|---:|---:|---:|---|
| 01 | 28 | 138 | 106 | `batch-01-table-provider-cache.json`, `batch-01-rendered-table.json` |
| 02 | 22 | 68 | 47 | `batch-02-table-provider-cache.json`, `batch-02-rendered-table.json` |
| 03 | 24 | 107 | 104 | `batch-03-table-provider-cache.json`, `batch-03-rendered-table.json` |

Batch 03 originally failed the strict niqqud guard because two Gemini rows changed Hebrew consonants while adding niqqud. The complete 107-row provider response is preserved in `batch-03-table-provider-raw-cache-retry-03.json`. `batch-03-approved-corrections.json` records the only two repairs, both verified against the original scans: page 39 `1 מי לשנייה` → `1 מ' לשנייה`, and page 40 `שהוא עובד בנקודה B` → `שהוא עובר בנקודה B`. `repair-physics-gemini-table-cache.js` applies only that allowlist, canonicalizes niqqud locally, and fails closed if the corrected source or task sequence differs. No legacy row was substituted for a current Gemini row.

The comparison reports retain the old rich tables as review evidence:

- batch 01: 26 of 28 tasks compared; legacy has no 1.6 or 4.6;
- batch 02: 20 of 22 tasks compared; legacy has no 4.8 or 6.5;
- batch 03: all 24 tasks compared.

## Corpus result and acceptance

`physics-year1-corpus-records.json` is the canonical 74-task record set. `physics-year1-corpus-bundle-manifest.json` describes the final LinguistPro bundle:

- 9 chapters and exactly 74 task cards;
- 425 semantic rows, with conditions, subparts and notes separated;
- required provenance on every card: chapter, task number, source page and filename, source image SHA-256, OCR provider, translator and verification status;
- 70 cards compared with legacy data; the four missing legacy tasks are retained from the current Gemini tables;
- 45 cards are `incomplete_missing_diagram`, because the supplied scans have their illustrations removed; the remaining 29 are `generated_unreviewed`;
- one shelf named `Физика — задачник, 1 год` and no generated audio.

Final owner bundle:

`G:\Andasa\📘 Учебная. 1 год\Физика\Корпус\Физика — задачник, 1 год-learning.zip`

SHA-256: `0030a95f20be1be5511020632f2188979bc45148a49eee71547669d17cf77327`.

The bundle passed the corpus-specific verifier and the strict Android v2 import-schema validator. Production import into LinguistPro 3.11.431 added exactly 74 Library texts (224 → 298). Boundary cards 1.1 and 9.11 were reopened from the imported Library without a Gemini call; their live row counts and first/last Hebrew and Russian cells match the canonical records. The Reading Room currently exposes these cards through `Мои тексты`; it does not render the imported private shelf as a separate corpus tile.

Relevant verification commands:

```powershell
node --test tests/physicsCorpusPipeline.test.js
node --test tests/tableRows.test.js tests/geminiTableRawCache.test.js tests/geminiTableProfileContract.test.js
python scripts/premium/physics-corpus-pipeline.py verify-corpus-bundle --bundle "G:\Andasa\📘 Учебная. 1 год\Физика\Корпус\Физика — задачник, 1 год-learning.zip" --records "docs\research\physics-corpus\2026-08-24\physics-year1-corpus-records.json"
```

## Review and editing boundary

These PDFs are verified OCR inputs, not OCR results and not reviewed corpus cards. Do not edit the PDFs. If a page mapping is wrong, correct the batch definition in `scripts/premium/build-physics-ocr-pdfs.py` and regenerate the whole packet. OCR/table outputs, legacy comparisons, task records and review statuses remain separate artifacts so raw source evidence is never overwritten.

The supplied scans have illustrations removed. Any task that refers to a diagram, graph or figure remains `incomplete_missing_diagram` until a user-selected replacement is attached and SHA-verified; no missing geometry may be inferred from surrounding prose.
