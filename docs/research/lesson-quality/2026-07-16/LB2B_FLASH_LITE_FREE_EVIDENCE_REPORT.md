# LB2-B Gemini 3.1 Flash Lite free-tier evidence report

**Status:** `ENGINEERING_PRE_REVIEW_COMPLETE`; `NO_DECISION`; no production promotion decision.
**Run source commit:** `411b6e472985be4ae9b54f9cc957d9bd2976ccf2`.
**Run window:** 2026-07-16T01:52:44.487Z–2026-07-16T01:55:23.166Z.
**Stable run directory:** `docs/research/lesson-quality/2026-07-16/lb2b-flash-lite-free-run/`.

## Scope

This follow-up isolates `gemini-3.1-flash-lite` on the owner-approved offline synthetic/public-domain packet. It runs 13 frozen cases under the LB2-A contract prompt and the instruction-engineered prompt, for 26 candidate slots. Calls are sequential, spaced by 5.2 seconds and capped at 60. The shadow critic is disabled because the sole composer model must not review its own output. The canonical packet now has 26 completed AI pre-review rows and a same-assessor second pass. These are engineering evidence, not the declared independent human reviewer and adjudicator.

## Structural and operational results

| Measure | Result |
|---|---:|
| Candidate slots completed | 26/26 |
| Organic first-pass accepts | 14/14 |
| Injected first-pass rejects | 8/8 attempted controls |
| Repair recoveries | 6/8 |
| Delivered premium drafts | 20/26 |
| Delivered deterministic basic plans | 6/26 |
| Provider errors / `429` | 0 / 0 |
| Calls including schema canary | 31 |
| Latency p50 / p90 / p95 / max | 1.928s / 3.477s / 3.520s / 3.828s |
| Observed non-thinking paid-rate equivalent | USD 0.048921 |
| Conservative paid-rate upper bound | USD 0.132846 |

The monetary figures are comparison estimates using declared paid rates, not a claim of Free-tier billing. The run remained within the owner USD 5 guard and the explicit 60-call guard.

The six successful repairs cover the injected foreign-anchor, missing-answer and generic-instruction failures under both prompt variants. The two deliberate double-reject cases remain safe basic plans. The remaining four basic plans are the two prompt variants of the provider-absent and double-reject controls. No organic case required repair or fallback.

Both prompt variants delivered 10 premium drafts and three basic plans. Corrected pre-review found 8/26 candidates with critical errors and 18/26 without one. Non-binding scenarios accept 4/26 strict, 15/26 balanced and 16/26 exploratory. The weakest mean dimension is pedagogical value at 2.769/5. This structural tie is not pedagogical equivalence; blinded independent human review remains necessary.

## Integrity and limitations

- All 60 artifacts declared by `artifact-hashes.json` match their SHA-256 hashes.
- All 26 delivered lessons pass an independent detailed-validator replay.
- Credential-pattern scan found zero key-like values in the run packet.
- Raw candidates contain synthetic or public-domain material only.
- Passing deterministic structure does not certify Hebrew correctness, naturalness, level fit or pedagogical value.
- One model, one stochastic sample per cell and Free-tier capacity cannot establish production reliability.
- The critic is disabled; no shadow-human agreement or critic threshold can be measured from this follow-up.
- Production lesson generation, promotion, learner state, durability, grading, FSRS and `review_log` are unchanged.
- The original pre-review evaluated a duplicated `LB2B-001` payload as `LB2B-002`. The corrected worksheet re-opened canonical hashed `LB2B-002`; it has no critical error. The analyzer now checks exact blind-ID coverage and cannot label same-assessor AI work as completed human evidence.

## Required continuation

Give the reviewer only `blind/*.json`, `reviewer_worksheet.tsv`, `pairwise_worksheet.tsv` and the frozen rubric. Keep `blind-key.json` and raw metadata sealed until the worksheet is locked. Route critical errors and uncertainty to the declared adjudicator, then run:

```text
node scripts/premium/lesson-quality-lb2b-analyze.js --run docs/research/lesson-quality/2026-07-16/lb2b-flash-lite-free-run --review-dir docs/research/lesson-quality/2026-07-16/lb2b-flash-lite-free-run/lb2b_review_completed
```

Threshold options remain non-binding until those human judgments are recorded. No option changes a deterministic LB1/LB2-A hard gate.
