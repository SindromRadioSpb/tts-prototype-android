# L4.0a / Q4 Hebrew→Russian in-domain gold

Status: **OWNER REFERENCES REQUIRED**. This directory freezes the 200 source
segments for ledger step 3. It is a reusable evaluation asset, not training
data and not a production-provider configuration.

## Composition

- 50 short ASR-style sentences from the pre-existing independent human-gold
  manifest `docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/benchmark_manifest.tsv`;
- 150 literary segments from committed Reading Room canon v4, evenly split
  between article, prose, and poetry;
- Russian references must be written or explicitly approved by the owner.
  Model-generated translations, including existing corpus translations, are
  not human gold and must not be copied into `reference_text` without owner
  correction and approval.

## Owner action

Open `in-domain-owner-gold.tsv` in a UTF-8-safe spreadsheet/editor and fill only
the `reference_text` column for all 200 rows. Do not reorder rows, edit source
text, identifiers, provenance, or hashes. Tabs and line breaks are not allowed
inside a reference cell. Save as UTF-8 TSV, then run:

```powershell
ai-local\.venv\Scripts\python.exe scripts\research\l4_mt_benchmark.py validate-gold `
  --input docs\research\heb-ru-mt-gold\2026-08-04\in-domain-owner-gold.tsv `
  --require-references
```

The selection is reproducible with:

```powershell
ai-local\.venv\Scripts\python.exe scripts\research\l4_mt_benchmark.py prepare-in-domain `
  --asr-manifest docs\research\hermes-education-scaleup\rnd-c1-2026-07-24\benchmark_manifest.tsv `
  --canon-zip public\data\benyehuda\canon-v4.zip `
  --output docs\research\heb-ru-mt-gold\2026-08-04\in-domain-owner-gold.tsv `
  --manifest docs\research\heb-ru-mt-gold\2026-08-04\selection-manifest.json
```

Do not rerun that command after owner references have been entered: it
intentionally regenerates a blank worksheet.

## Rights and provenance

- ASR-style rows are project-authored human-gold sentences already committed
  for evaluation.
- Reading Room rows are excerpted from the committed Project Ben-Yehuda canon;
  each row keeps its exact `text_id` and segment index.
- `selection-manifest.json` pins both upstream artifact hashes and the generated
  worksheet hash. Any change to the source selection requires a new manifest
  version and owner approval under the frozen L4.0 Benchmark Manifest v1.
