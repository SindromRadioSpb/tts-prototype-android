# Studio L4.0a MT benchmark — execution record

Ledger authority: step 3 of
`docs/planning/HEBREW_NLP_RESOURCES_OWNER_DECISIONS_2026_08_04.md`.

Current status: **COMPLETE / MANIFEST v3 / LIMITED EVIDENCE / NO BILINGUAL
HUMAN VALIDATION**. The owner-approved evidence contract was executed as follows:

1. deterministic FLORES+ Stage A (506 shared IDs × two directions) for all five systems;
2. owner-accepted GPT-5.6 AI-reference/silver for all 200 in-domain rows;
3. complete Stage A inference, chrF++/spBLEU and 95% bootstrap intervals;
4. supplementary CometKiwi signal;
5. explicit adaptive expand decision from ΔchrF++, CI overlap, metric conflicts
   and critical failure flags;
6. final table and honest `LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION`
   verdict. Human blind review is waived, not silently treated as passed.

Manifest v3 owner override defers the v2 adaptive full-devtest branch after it
triggered. Comparative metrics use exactly the same 1012 Stage A rows for all
five systems. A paid Gemini full-run was stopped at 1118/2024 (106 extra rows,
about $0.8104 incremental); that partial is provenance/cost evidence only and
is excluded from rankings. Top-2 local full runs are not started without a new GO.

No files in this packet change Studio defaults, production ASR, learner data,
or production services. Hy-MT2 uses an isolated dependency overlay; the
production `ai-local` environment remains unchanged.

## Frozen execution choices

- Gemini ceiling: stable `gemini-3.6-flash`, matching the actual model already
  evidenced by the repository on 2026-07-30. A moving `*-latest` alias is not
  used for this benchmark.
- Hy-MT2-1.8B: exact upstream revision, FP16, deterministic greedy decoding for
  evaluation. Hy-MT2-7B is omitted because it would add a second heavyweight
  path and complicate the main run on an 8 GB GPU.
- FLORES+ remains local/gated evaluation data. Raw rows are not committed; only
  hashes, version, revision, license and run metadata may be committed.
- Stage A is selected before outputs using seed
  `l4.0-manifest-v2-stage-a-2026-08-04`; `flores-stage-a-manifest.json` pins the
  full input, selected set, and output hashes.
- NLLB is research/gate-only because its CC-BY-NC-4.0 license is not a
  production enablement decision.

See `RESULTS.md` for the decision and complete tables,
`machine-checkpoint.json` / `stage-a-results.json` for machine-readable closure,
`candidate-manifest.json` for exact candidate revisions, licenses and local
artifact checksums, and `cometkiwi-manifest.json` for the supplementary checkpoint.

## Reproduction record

Raw FLORES rows and system outputs remain local under `.tmp/l4-mt/`; their exact
SHA-256 values are committed in the manifests/checkpoint. The closure commit is
the most recent commit touching this directory (`git log -1 --oneline -- .`).
Core deterministic post-processing was run as follows:

```powershell
ai-local\.venv\Scripts\python.exe scripts\research\l4_mt_benchmark.py validate-gold `
  --input docs\research\heb-ru-mt-gold\2026-08-04\in-domain-owner-gold.filled-machine-draft.tsv `
  --require-references

ai-local\.venv\Scripts\python.exe scripts\research\l4_mt_benchmark.py score `
  --outputs .tmp\l4-mt\runs\flores-stage-a\opus.tsv `
            .tmp\l4-mt\runs\flores-stage-a\nllb.tsv `
            .tmp\l4-mt\runs\flores-stage-a\hymt.tsv `
            .tmp\l4-mt\runs\flores-stage-a\madlad.tsv `
            .tmp\l4-mt\runs\flores-stage-a\gemini.tsv `
  --destination .tmp\l4-mt\runs\flores-stage-a\metrics.json `
  --bootstrap-samples 1000

ai-local\.venv\Scripts\python.exe scripts\research\l4_mt_benchmark.py diagnose `
  --outputs .tmp\l4-mt\runs\flores-stage-a\opus.tsv `
            .tmp\l4-mt\runs\flores-stage-a\nllb.tsv `
            .tmp\l4-mt\runs\flores-stage-a\hymt.tsv `
            .tmp\l4-mt\runs\flores-stage-a\madlad.tsv `
            .tmp\l4-mt\runs\flores-stage-a\gemini.tsv `
  --destination .tmp\l4-mt\runs\flores-stage-a\diagnostics.json
```

CometKiwi used the isolated dependency set in
`scripts/research/requirements-l4-comet.txt` and the checkpoint pinned by
`cometkiwi-manifest.json`. Gemini inference read the API key only from the local
environment; no secret or raw gated dataset is committed.
