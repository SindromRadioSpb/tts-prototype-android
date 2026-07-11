# 09 — Evaluation and experiments

**Status:** PROPOSAL · **Date:** 2026-07-11

## Confirmed contextual transfer contract

Unit: unique `(user, knowledge_unit_version, source_context, target_context, modality, probe_family_version)` within a predeclared window. Eligibility and random assignment occur before exposure. Confirmation requires a novel/non-contaminated target, primary delay 7–14 days (report ≥24h and 30d separately), unassisted first attempt, independent deterministic/blinded-human rubric, correct construct/sense/evidence scope and no previous confirmation in the window.

NSM: rolling unique learners with ≥1 confirmed transfer, always accompanied by eligible opportunities, offer/attempt/missing rates and cost/CCT. Primary estimand is ITT `P(CCT | eligible assignment)`. Missing opportunities remain in the denominator; nonresponse is not a grade.

Required envelope: assignment/arm/eligibility snapshot; unit/source/target/modality; schedule/offer/attempt/outcome; grader/rubric; hints/contamination/abstention/annul; model/prompt/policy versions; privacy class.

## Evaluation platform

- Immutable gold registry with provenance/licence/privacy/construct strata, train/dev/locked test, contamination families and supersession.
- Two blinded reviewers plus adjudicator for unsupported/high-risk cases; generator identity hidden.
- Recommendation replay snapshots eligibility, candidates, policy/model/prompt/tools/seeds; distinct from projection replay.
- Shadow logs an unserved candidate while control is served; it measures availability/quality/cost, not causal treatment effect.
- Calibration records ex-ante probability/abstention and independent outcome; report Brier/log loss, reliability, intercept/slope and strata.
- A/A, sample-ratio-mismatch, assignment/exposure, ITT, missingness sensitivity and preregistered stop rules precede claims.

## Experiment matrix

| Hypothesis | Control | Treatment / population | Primary metric / guardrail | Duration/sample assumption | Pass / fail / next |
|---|---|---|---|---|---|
| Planner improves transfer | FSRS due + weakest channel | bounded rerank; eligible returning users | 7–14d CCT; due debt/cost/cold-start | ≥4 weeks; power from baseline+SESOI | lower CI >0 and SESOI; else deterministic |
| Grounded explanation helps application | fixed approved generic/local facts | cited personal sentence + provenance | novel-context CCT; false assertion/reading return | locked gold then pilot | ≥99% fact pass + CCT lift; any morphology assertion blocks |
| Adaptive scaffold improves independence | fixed/manual ladder | previewable evidence-based recommendation | no-hint delayed CCT; hints/abandonment | stratified by level/aid | CCT lift without hint inflation; otherwise manual |
| AI modality selection helps | manual picker/default | explainable recommendation, override | ITT CCT; override/a11y/missingness | multi-week | effect survives override strata; else picker |
| Next-text ranking helps | editorial/existing rail | personalized from same approved set | cross-text CCT + meaningful fragments; diversity | ≥4 weeks | both learning/reading pass; else curated |
| Specialists beat single workflow | same model/tools/budget single controller | typed specialist | independent quality/CCT; cost/p95 | ~200 stratified offline tasks then pilot | ≥5pp quality/SESOI; else plain function |
| Router is noninferior | premium always | small-first escalation | critical error, grounded pass; ≥30% cost cut | paired locked gold | within fixed margin; subgroup breach stops |
| AI content candidates are efficient | curated baseline | human-approved AI candidates | 14/30d CCT, reviewer minutes/errors | matched approved units | noninferior + ≥30% time/cost reduction; no auto-publish |

Common provisional SESOI for owner decision: +5 percentage points CCT or ≥20% relative, whichever larger. Inconclusive is not pass. Immediate stop: privacy/tenant leak, sample-ratio mismatch, unsafe false-positive beyond ceiling, >2× cost/latency, >5pp hint-dependency rise or reading/probe-response drop.

Scientific anchors: novel delayed inference transfer requires a separate target test ([Butler 2010](https://pubmed.ncbi.nlm.nih.gov/20804289/)); missingness assumptions must be explicit ([Rubin](https://dash.harvard.edu/entities/publication/73120378-8764-6bd4-e053-0100007fdf3b)); probability calibration needs held-out evaluation ([Guo et al.](https://proceedings.mlr.press/v70/guo17a.html)).
