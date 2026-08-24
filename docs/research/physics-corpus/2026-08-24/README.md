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

## Review and editing boundary

These PDFs are verified OCR inputs, not OCR results and not reviewed corpus cards. Do not edit the PDFs. If a page mapping is wrong, correct the batch definition in `scripts/premium/build-physics-ocr-pdfs.py` and regenerate the whole packet. OCR/table outputs, legacy comparisons, 74 task cards and review statuses will be added as separate artifacts so raw source evidence is never overwritten.

The supplied scans have illustrations removed. Any task that refers to a diagram, graph or figure remains `incomplete_missing_diagram` until a user-selected replacement is attached and SHA-verified; no missing geometry may be inferred from surrounding prose.
