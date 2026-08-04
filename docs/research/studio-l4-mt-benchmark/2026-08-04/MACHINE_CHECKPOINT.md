# L4.0a machine checkpoint — 2026-08-04

Status: **COMPLETE UNDER MANIFEST v3 / LIMITED EVIDENCE / NO BILINGUAL HUMAN
VALIDATION**.

This checkpoint closes ledger step 3 under owner decisions D-HNR-7 and D-HNR-8.
It records an equal deterministic FLORES+ Stage A comparison (506 shared IDs ×
two directions = 1012 rows per system), the owner-accepted 200-row AI-reference
in-domain set, automatic metrics, model-assisted failure inspection and operating
cost. It is not production enablement authority.

The detailed verdict and tables are in `RESULTS.md`; machine-readable evidence is
in `machine-checkpoint.json`. Exact candidates and evaluation assets are pinned in
`candidate-manifest.json`, `flores-stage-a-manifest.json` and
`cometkiwi-manifest.json`.

## Completion summary

- OPUS, NLLB, Hy-MT2, MADLAD and Gemini each translated the same 1012 Stage A
  rows; all five artifacts passed row/ID validation.
- chrF++, spBLEU and deterministic 1000-sample 95% bootstrap intervals were
  computed in both directions.
- CometKiwi was computed as a supplementary signal. Its local ordering conflicts
  with reference metrics and therefore cannot decide the winner.
- The 200 in-domain Hebrew→Russian rows were scored against GPT-5.6 Sol high
  references explicitly accepted by the owner as AI-reference/silver, not human
  gold. Gemini has only 13/200 old in-domain rows and is excluded from that table.
- Bilingual blind review was explicitly waived by the owner. Automated diagnostics
  plus targeted model-assisted inspection were performed, but do not masquerade
  as human validation.
- All four v2 adaptive triggers fired. The owner then approved Manifest v3 and
  deferred full-devtest expansion. Gemini's stopped 1118/2024 partial (106 rows
  beyond Stage A) is retained only for provenance/cost and excluded from ranking;
  no top-2 local expansion was started.

## Decision

Gemini 3.6 Flash is the measured cloud ceiling. MADLAD remains the best local
candidate on both FLORES reference metrics and the in-domain AI-reference set.
The benchmark does not justify replacing MADLAD with OPUS, NLLB or Hy-MT2.

Translation must remain an explicitly editable draft with provenance and failure
handling. Gemini may only be considered later as explicit BYOK/cloud functionality,
not an automatic fallback. No provider default, production ASR model, learner
state, production service or closed P2/P3/P4/L1 canon changed.

## Next ledger action

Proceed to step 4: L4.0c alignment benchmark with separate word-level gold.
L4 design work remains step 6, after L4.0c and L4.0b evidence exist.
