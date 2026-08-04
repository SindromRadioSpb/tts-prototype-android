# L4.0a / Q4 Hebrew→Russian in-domain gold

Status: **OWNER-ACCEPTED AI REFERENCES COMPLETE / NOT HUMAN GOLD**. This
directory freezes the 200 source segments for ledger step 3. It is a reusable
evaluation asset, not training data and not a production-provider configuration.

## Composition

- 50 short ASR-style sentences from the pre-existing independent human-gold
  manifest `docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/benchmark_manifest.tsv`;
- 150 literary segments from committed Reading Room canon v4, evenly split
  between article, prose, and poetry;
- `in-domain-owner-gold.filled-machine-draft.tsv` contains 200 Russian references
  generated with GPT-5.6 Sol high according to the owner's attestation and
  explicitly accepted by the owner on 2026-08-04 for comparison and metrics.
- These references are **AI-reference/silver, not human gold**. Owner acceptance
  does not convert their provenance into human translation, and benchmark claims
  must retain that limitation.

## Validation

The blank worksheet remains immutable source-selection evidence. Validate the
owner-accepted AI-reference without rewriting the source selection:

```powershell
ai-local\.venv\Scripts\python.exe scripts\research\l4_mt_benchmark.py validate-gold `
  --input docs\research\heb-ru-mt-gold\2026-08-04\in-domain-owner-gold.filled-machine-draft.tsv `
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
- `selection-manifest.json` pins both upstream artifact hashes and the blank
  worksheet hash. The filled AI-reference SHA-256 is
  `ecea4af90ff696d548c58a6623502e2f7af2be0e36a04e7fa51797c63fa95814`.
- Any change to source selection or reference authority requires a new manifest
  version and owner approval. Execution closed under L4.0 Benchmark Manifest v3.
