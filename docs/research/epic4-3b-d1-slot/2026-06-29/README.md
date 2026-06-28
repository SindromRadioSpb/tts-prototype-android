# Epic 4.3b · D1 slot-inflected distractors — coverage audit (2026-06-29)

## What this is
Measure-before/after (R10) for **Phase D1** (full slot-inflection of cloze MC distractors). Quantifies how
often the shipped `ReaderMorph.buildMcSlotOptions` produces clean, slot-matched, morpho-honest distractors,
and that every produced option set is R1-honest (vocalized, distinct, never equal to the answer).

## Files
- `coverage-report.json` — **the result** (generated, not hand-edited). After-state coverage of D1.
- This README — what/how/provenance.

## How generated
- Source command: `npm run smoke:reader-cloze:audit` (`scripts/premium/reader-cloze-audit.js`).
- Boots `public/library.html` in headless Chromium (offline engine, SW blocked, 380×844), deterministically
  samples baked works under `public/data/benyehuda/works/`, and for every MC-eligible cloze answer
  (confident content word) calls the REAL shipped `buildMcSlotOptions`.
- Deterministic (stride sampling, no RNG); re-run reproduces the same sample.

## Headline result (after D1)
- Sample: 400 rows; **1294 MC-eligible answers**.
- **D1 fired (clean slot-matched MC): 1249 = 96.5%** — exceeds the 90–95% target.
- **Bad-form (non-vocalized / duplicate / == answer): 0** — R1/honesty clean.
- byPos: verb 466 · noun 641 · adjective 147 · adverb 37 · conjunction 3.
- Remaining ~3.5% fall back to the prior B1 distractors (no regression, R11 do-no-harm).

## Why this is high (vs the ~24% conservative baseline measured first)
The earlier decomposition (scratchpad harness, same date) found the dominant resolvability loss was
"no cell match" (44.4%), driven by **proclitics** (61% of tokens carry one) — stripping one proclitic
recovers 90% of it. `findSlot` is proclitic-aware + syncretism-accepting + pins the paradigm by the word's
own lemma; `buildMcSlotOptions` draws distractors from the in-memory 9279-paradigm dict (slot-filtered),
so ≥3 same-slot candidates are essentially always available. No re-bake, no new shipped artifact.

## Provenance
Generated artifact (status: scored/measured). Re-generate with the source command above. Plan:
`docs/planning/BRR_EPIC4_3B_D1_SLOT_DISTRACTORS_2026_06_29.md`.
