# LinguistPro Wave 2 — LB2 closure and restart handoff

**Date:** 2026-07-16
**Status:** `OPERATIONALLY_COMPLETE`; `EVIDENCE_DEFERRED`; lesson-quality work is intentionally paused.
**Production:** app `3.11.183`; implementation image `5207ff810b10e92b642c521a681748055679fc1d`.
**Restart condition:** lesson quality becomes a current product constraint and a qualified independent human review can be completed.

## Closure decision

The owner approved pausing the LB2 lesson-quality direction after production activation of the bounded managed Gemini route. This is a prioritization decision, not a quality-promotion decision and not abandonment of the evidence packet.

The current learner-visible contract remains:

- the learner explicitly requests a lesson from selected permitted sources;
- managed composition uses `gemini-3.1-flash-lite` within 300 requests/day and 9 requests/minute, then degrades to the deterministic safe plan;
- the detailed deterministic validator owns structural publication eligibility;
- exactly one code-directed repair is permitted;
- an accepted `premium_draft` is labelled as an AI draft that passed automatic contract checks, not as expert-certified Hebrew pedagogy;
- the shadow critic remains offline, default-off and without edit, selection, grading or publication authority;
- lessons remain ephemeral and do not write grading, `review_log`, FSRS, mastery or durable learner memory.

## Shipped implementation state

LB2-A is complete. It includes stable content-free validation codes, one shared composition contract, provider schema mode where supported, strict post-parse validation, bounded repair, content-free diagnostics, localized degradation disclosure in ru/en/he, log sentinels and schema-1/schema-2 compatibility.

The managed production route was live-verified with a public-domain corpus source:

- HTTP 200;
- `tier=premium_draft`;
- `premium_ready=true`;
- first candidate accepted;
- `repair_used=false`;
- `degraded_reason=null`;
- provider/model `gemini/gemini-3.1-flash-lite`.

Production status confirmed `llm_daily_per_user=300`, `llm_daily_global=300`, `provider_daily=300`, `provider_per_minute=9`, `provider_utilization_percent=60`, `key_source=agent` and kill switch off. No key is stored in git or this handoff.

## Stable artifacts

- Decision and authority boundary: `docs/planning/LINGUISTPRO_WAVE2_LB2_AI_QUALITY_DECISION_2026_07_16.md`.
- Historical implementation prompt: `docs/planning/LINGUISTPRO_WAVE2_LB2_AI_QUALITY_EXECUTION_PROMPT_2026_07_16.md`.
- Lessons learned: `docs/planning/LINGUISTPRO_WAVE2_LB2_LESSONS_LEARNED_2026_07_16.md`.
- Packet guide and frozen rubric: `docs/research/lesson-quality/2026-07-16/README.md` and `rubric.json`.
- Offline run plan and critique: `LB2B_RUN_PLAN.md` and `LB2B_R1_R17_CRITIQUE.md` in the same research directory.
- Flash Lite evidence report: `docs/research/lesson-quality/2026-07-16/LB2B_FLASH_LITE_FREE_EVIDENCE_REPORT.md`.
- Canonical frozen run: `docs/research/lesson-quality/2026-07-16/lb2b-flash-lite-free-run/`.
- Corrected engineering pre-review: `lb2b-flash-lite-free-run/lb2b_review_completed/`.
- Live validator and composition path: `agent/lessonCompositionContract.js`, `agent/lessonBuilder.js`, `agent/llmGate.js`, `agent/llm.js`.
- Independent fixtures and smoke: `scripts/premium/fixtures/lesson-builder-lb1/` and `scripts/premium/lesson-builder-smoke.js`.

## Evidence status at pause

The completed Flash Lite run contains 26 candidate slots over 13 frozen cases and two prompt variants. Operationally it measured 14/14 organic first-pass accepts, 6/8 injected repair recoveries, 20/26 delivered premium drafts, no provider errors and p90 candidate latency of 3.477 seconds.

The corrected pre-review found 8/26 candidates with critical errors. Its weakest mean dimension was pedagogical value at 2.769/5. The strict, balanced and exploratory scenarios accepted 4, 15 and 16 of 26 respectively.

Those scores are engineering evidence only. The reviewer was an AI assessor and the adjudication was a second pass by the same assessor. They do not satisfy the declared qualified human reviewer plus independent adjudicator requirement and approve no threshold.

## Deliberately deferred gates

1. Repeat the frozen run from the then-current implementation commit so post-remediation behavior is not inferred from the older run.
2. Lock a blind worksheet from one qualified Hebrew/pedagogy reviewer.
3. Route critical or uncertain cases to one independent adjudicator.
4. Re-run the analyzer and present measured strict/balanced/exploratory threshold options.
5. Decide whether a future critic remains advisory or receives any bounded blocking authority. No such authority is currently granted.
6. Decide durable lesson retention and background series generation separately; neither is implied by LB2.

## Restart protocol

When the restart condition is met:

1. Read this handoff, the controlling LB2 decision, the lessons-learned journal and the research README completely.
2. Inspect current HEAD, production version, provider route, Terms/data boundary and live quota rather than trusting this dated snapshot.
3. Keep the existing 13-case matrix and rubric frozen for comparability; declare any additional cases separately.
4. Run the current Flash Lite cell without private learner material and preserve raw artifacts only in the declared research packet.
5. Keep blind keys and raw metadata sealed until the human worksheet is locked.
6. Require independent adjudication before presenting a promotion recommendation.
7. Do not weaken deterministic gates, enable learner-visible critic authority, persist raw operational content or change lesson durability as part of the evidence run.

Core commands:

```text
npm run smoke:lesson-builder
powershell -ExecutionPolicy Bypass -File scripts/premium/run-lb2b-with-gemini.ps1
node scripts/premium/lesson-quality-lb2b-analyze.js --run docs/research/lesson-quality/2026-07-16/lb2b-flash-lite-free-run --review-dir docs/research/lesson-quality/2026-07-16/lb2b-flash-lite-free-run/lb2b_review_completed
```

Before running, inspect the scripts' current flags and create a new declared run directory rather than overwriting the preserved evidence packet.

## Current routing

LB2 is no longer the next active implementation session. The next approved planning direction is S0 Scale Envelope, using `docs/planning/LINGUISTPRO_WAVE2_S0_SCALE_ENVELOPE_EXECUTION_PROMPT_2026_07_16.md`. S0 is a documentation and decision slice; it grants no production code, migration or infrastructure authority.
