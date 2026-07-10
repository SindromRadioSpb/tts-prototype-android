# §2.3 builder-probe — anchor coverage + modality eligibility (PROD owner profile)

**Date:** 2026-07-10 · **Source:** read-only probe inside the prod container (same builder
primitives as `selectEligible`: `clozeFormsForItemKey`/cloze-scan logic of `agentClozeRepo`,
`dictateFormForItemKey`+`hasAsset`, `glossForItemKey.strictSafe`). Full scan — probe caps
raised vs serving caps (81/81 artifacts, 3568 sentences, no budget hit, 17.3 s).
Aggregates only — no item_key/word/sentence content left the container.
Probe script: hand-authored this session (scratchpad), replicates `db/agentClozeRepo.js`
scan with per-item attribution instead of first-match return.

## Numbers (n_due = 50 at probe time)

| Metric | n | % |
|---|---|---|
| **anchor_any — due item's unambiguous form occurs in own texts** | **32** | **64%** |
| cloze_unique_ok (single-blank cloze possible) | 32 | 64% |
| dictate_safe (homophone-safe written form) | 31 | 62% |
| dictate_ready (safe + baked audio asset) | 31 | 62% |
| reverse_strict (strictly-unambiguous gloss) | 7 | 14% |
| **any production modality (cloze∪dictate∪reverse)** | **42** | **84%** |
| modality AND anchor | 32 | 64% |
| **neither modality nor anchor** | **8** | **16%** |
| dictate-only / cloze-only / reverse-only | 9 / 8 / 1 | 18/16/2% |
| items with ≥1 unambiguous voc form | 47 | 94% |

Serving-path view (MAX_DUE_FORMS=40 cap in `agentClozeRepo`): anchor 28, cloze 28 —
**the cap loses 4 anchored items at the current pool (50 > 40)**; P8.3 orchestrator note.

## Interpretation → fork-4 resolution (recommendation: C, mixed by modality)

- **Strict fork-4A (no anchor → skip/open Зал) would over-exclude:** 10/50 (20%) due items
  are trainable ONLY through honest lexeme modalities (9 dictate-only + 1 reverse-only) —
  dictation (audio→writing) needs no sentence to be honest.
- **Fork-4B (lexeme fallback everywhere) under-uses context:** 64% have real anchors.
- **Fork-4C matches the measurement and the canon** ("challenge несёт server-attested
  anchor, ЕСЛИ он существует; не фабриковать; не писать „из твоего текста“ без якоря"):
  - **cloze** — anchor-required *by construction* (32 items eligible);
  - **dictate/reverse** — honest lexeme modalities; the source sentence is ATTACHED when
    it exists (context-first display), omitted honestly when not;
  - **8 items (16%) with neither** → honest routing to reading (Зал) / receptive.
- Cross-check vs live selector behaviour: bot review history (dictate 6 / cloze 4 /
  reverse 0-completed) is consistent with these eligibility proportions.

## What this unlocks
P8.3 (review-session orchestrator + context-first rendering) may start: the context-first
claim is honest for 64% of due, the mixed policy covers 84% with a production modality,
and the 16% remainder has an explicit honest route. Fork-4 = **C** (owner to confirm).
