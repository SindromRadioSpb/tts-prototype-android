# LB2-B offline evidence report

**Status:** `HUMAN_REVIEW_PENDING`; `NO_DECISION`; no production change.
**Run source commit:** `fddc3a2efba81e4c1918b451ce73ba9e50e4c912`.
**Run window:** 2026-07-16T01:15:11.778Z–2026-07-16T01:23:37.290Z.
**Stable run directory:** `docs/research/lesson-quality/2026-07-16/lb2b-run/`.

## Evidence status

The declared 2-model × 2-prompt × 13-case matrix completed all 52 candidate slots after three provider/schema canaries passed. All sources are synthetic or public domain. All 52 delivered premium drafts or deterministic basic plans independently pass the shipped detailed composition validator. The reviewer, pairwise and adjudicator worksheets remain entirely `UNSCORED`; therefore no pedagogical, linguistic, model-promotion or shadow-promotion conclusion is available.

The earlier Gemini 2.5 attempt produced no model candidates and is excluded. Its content-free failure aggregate is preserved in `LB2B_RUN_PLAN.md`; its generated fallback packet was removed rather than mixed with this run.

## Structural and operational results

| Measure | Result |
|---|---:|
| Candidate slots completed | 52/52 |
| First-pass accepts | 13 |
| First-pass deterministic rejects | 18 |
| Repair attempts | 18 |
| Repair recoveries | 6 |
| Delivered premium drafts | 19 |
| Delivered basic plans | 33 |
| Provider calls including canaries and shadow | 78 |
| Latency p50 / p90 / p95 / max | 2.011s / 9.181s / 11.314s / 17.694s |
| Observed non-thinking token cost estimate | USD 0.121336 |
| Conservative cost upper bound | USD 0.802389 |
| Approved budget | USD 5.00 |

The cost values are not provider-billed truth. The upper bound prices the full requested output limit and a conservative input ceiling so unexposed thinking tokens cannot silently defeat the run guard.

### By composer

| Composer | Premium | Basic | First accept | First reject | First provider error | Repair recovery |
|---|---:|---:|---:|---:|---:|---:|
| `gemini-3-flash-preview` | 0/26 | 26/26 | 0 | 10 | 12 × `429` | 0/10 |
| `gemini-3.1-flash-lite` | 19/26 | 7/26 | 13 | 8 | 1 × `429` | 6/8 |

This is not a clean pedagogical comparison. Flash Preview mixed provider throttling with 19 `INVALID_JSON` rejections across first and repair attempts. Those rejected outputs were usually 39–45 reported output tokens and were not near the 1,400-token ceiling. The existing legacy provider route therefore has a measured Gemini 3 Flash Preview structured-output compatibility or response-shaping limitation. LB2-B does not change that production route.

Flash-Lite supplied every premium draft in this run. Its six repair recoveries are the injected foreign-anchor, missing-answer and generic-instruction controls under both prompt variants. The two double-reject controls remained basic plans as intended. Across the 28 organic slots, 13 passed first attempt, eight were rejected, zero were repaired, and 15 delivered basic plans. Code-directed repair is therefore demonstrated for known local control failures, not yet for organic model failures.

### Prompt comparison

| Prompt | Premium | Basic | First provider errors | Repair recovery |
|---|---:|---:|---:|---:|
| `lb2a_contract_v1` | 10/26 | 16/26 | 2 | 3/13 |
| `instruction_engineered_v1` | 9/26 | 17/26 | 11 | 3/5 |

Provider errors are badly imbalanced across prompt cells, so these counts do not establish that either prompt is better. Human pairwise judgments remain required.

### Shadow critic

The offline `gemini-3.5-flash` critic was selected for 13 candidates: 10 `SCORED_ADVISORY`, two `TIMEOUT`, and one `INVALID_SHADOW_OUTPUT`. Coverage is 76.9%. It is the same provider/model family as the composers and cannot establish independent certification. With zero human-scored candidates, shadow-human agreement, critical-error recall, false-rejection rate and incremental detection are all `NOT_AVAILABLE`. Shadow authority remains ineligible.

## Non-binding threshold options for owner review

These are decision options, not approved gates, and they cannot be evaluated until the single reviewer and adjudicator lock their worksheets.

| Option | Human-quality gate | Shadow evidence gate | Operational gate |
|---|---|---|---|
| Strict | No critical error; every dimension ≥4; mean ≥4.5 | ≥95% evaluable coverage; critical-error recall ≥90%; false-positive rate ≤5%; dimension MAE ≤0.5 | Provider success ≥99%; p95 ≤12s; conservative cost ≤USD 1/run |
| Balanced | No critical error; every dimension ≥3; mean ≥4.0 | ≥90% coverage; recall ≥80%; false-positive rate ≤10%; MAE ≤0.75 | Provider success ≥95%; p95 ≤15s; conservative cost ≤USD 2/run |
| Exploratory | No critical error; every dimension ≥3; mean ≥3.7 | ≥80% coverage; recall ≥70%; false-positive rate ≤15%; MAE ≤1.0 | Provider success ≥90%; p95 ≤20s; conservative cost ≤USD 3/run |

Even if an option passes, the current single-reviewer pilot cannot justify learner-visible critic authority. A later owner decision would still have to specify additional independent review, model/provider independence, and production durability/cost policy. Hard deterministic gates are unchanged under every option.

## Required human continuation

1. Give the qualified reviewer only `blind/*.json`, `reviewer_worksheet.tsv`, `pairwise_worksheet.tsv` and the frozen rubric; keep `blind-key.json`, raw metadata and shadow scores sealed.
2. Lock the reviewer files before identity unsealing.
3. Route declared critical errors, uncertainty and disputed scores to the one adjudicator without overwriting original judgments.
4. Re-run `node scripts/premium/lesson-quality-lb2b-analyze.js --run docs/research/lesson-quality/2026-07-16/lb2b-run`.
5. Present evaluated threshold results to the owner. Do not promote automatically.

## Integrity and limitations

- 112/112 artifacts declared by `artifact-hashes.json` matched their SHA-256 hashes after generation.
- 52/52 delivered lessons passed an independent detailed-validator replay.
- Credential-pattern scan covered 115 files and found zero hits; raw provider error bodies were never persisted.
- The three worksheets were mechanically normalized after generation so their final notes field is explicit `UNSCORED` instead of an empty trailing TSV field; no judgment or identity mapping changed, and the affected hashes were refreshed.
- `analysis.json` and this report are reproducible derived artifacts created after the runner sealed its hash manifest and are not falsely claimed as members of that original 112-file hash set.
- One human reviewer and one adjudicator provide pilot evidence only; no inter-rater reliability statistic is possible.
- The run does not test production traffic, learner content, durable storage, grading, FSRS, `review_log`, publication authority or a provider-independent critic.
