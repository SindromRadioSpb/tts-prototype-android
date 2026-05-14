# Ulpan Diagnostic Quiz v1 — Methodology and Calibration Audit

> Shipped: **v3.3.5** (Direction 13 — Calibrated in-app diagnostic).
> Instrument id: `ulpan_diagnostic_v1`.
> Status: development pre-deployment — AI pre-review complete, domain-expert (ulpan teacher) external sign-off **pending**.

---

## 1. Purpose

A 20-item Hebrew language-knowledge diagnostic, taken once per device, that produces a normalized 0–100 score + a CEFR band (A1..C1) + a Rasch standard error. Designed as a **parallel outcome path** to teacher CSV `post_test_score` — not a replacement.

Why a calibrated instrument instead of "student fills exam-score field":

- **Reliability.** Self-reported scores are subject to memory + ego + scale-confusion. A 20-item Rasch instrument with item-level difficulty parameters produces a measurement-quality SE that we surface alongside the score (teachers can see the precision of the estimate).
- **Comparability.** Different ulpan programs have different exam scales (Mahut, mock-Bagrut, internal rubrics). A standardized in-app instrument calibrated against expert judgement gives one comparable axis.
- **Privacy.** No additional sensitive data — only the aggregate score + SE leaves the device. Per-item responses (`Q01..Q20`, `responses_transient`) are device-local-only.

---

## 2. Methodology

### 2.1 Item bank

- 20 items, 4-option multiple choice (single correct).
- CEFR distribution: A1=4, A2=4, B1=5, B2=4, C1=3 (4/4/5/4/3 — slight B1-heavy reflecting ulpan target population).
- Each item has `difficulty_logit` in [-2.7, +2.7] — monotonic across CEFR bands.
- Trilingual prompts (Hebrew item + Russian + English). Reviewer can localize options per locale.
- All items adult-ulpan neutral (no religious / academic register / niqqud-trick items beyond what real ulpan teaches).
- Item bank format defined in `docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md` §4; canonical JSON at `public/quiz/ulpan_diagnostic_v1.json`; build validator at `scripts/quiz/validate-bank.js` (enforces schema invariants).

### 2.2 Scoring model — Rasch 1PL

For each item `i` with difficulty `beta_i` and respondent with latent ability `theta`:

```
P(correct on item i | theta) = sigmoid(theta - beta_i)
```

Theta is estimated by maximum likelihood via Newton-Raphson:

```
score(theta) = Σ_i (x_i - P_i)         # gradient
info(theta)  = Σ_i P_i (1 - P_i)       # observed information
theta_next   = theta + score / info    # Newton step
```

Converges in 5–10 iterations from `theta = 0` start; pure JS at `public/js/quiz-scoring.js`, no external deps.

**Edge cases:** all-correct → theta capped at `+3.0`; all-incorrect → capped at `-3.0`; near-singular info matrix → also capped.

### 2.3 Standard error

```
SE(theta) = 1 / sqrt(info(theta_hat))
SE(score) = SE(theta) × (100 / 6.0)
```

Exposed as `quiz_se` in the outcome payload + rendered in the teacher dashboard SE column.

### 2.4 Theta → score → CEFR band

Linear projection (v3.3.5 — polynomial / spline fit deferred to v3.4 once empirical data accumulates):

```
theta ∈ [-3.0, +3.0]
  → raw_score = round((theta + 3.0) / 6.0 × 100)  ∈ [0, 100]
  → CEFR band:
       A1 [0, 19]    A2 [20, 39]    B1 [40, 59]    B2 [60, 79]    C1 [80, 100]
```

Reverse mapping for analysis (R/Python/SPSS):

```
theta_estimate = (raw_score / 100 * 6.0) - 3.0
```

### 2.5 Reference validation against `mirt`

`scripts/quiz/__fixtures__/mirt-reference.json` stores 100 synthetic respondents (truth theta uniform in [-3, +3]) with generative Rasch responses and reference ML theta + SE. Smoke `scripts/quiz/scoring-smoke.js` asserts:

- r(theta_hat, ref_theta_ml) > 0.99 (reproducibility / determinism)
- MAD(theta_hat, ref_theta_ml) < 0.05
- r(theta_hat, truth_theta) > 0.85 (Rasch recovery on a 20-item test)

External cross-check available via `scripts/quiz/validate-against-mirt.R` (operator runs on a machine with R + `mirt` installed). Current `ref_theta_ml` values are self-consistency placeholders computed by `quiz-scoring.js`; the R script regenerates them from `mirt::fscores(method="ML")` for promotion to canonical.

---

## 3. Privacy invariants (HARD)

| What | Where pinned |
|---|---|
| Item-level responses (Q01..Q20) MUST never leave the device | `scripts/quiz/privacy-smoke.js` cases 2 + 3; `scripts/quiz/client-submit-smoke.js` case 4 |
| Defensive ITEM_LEVEL_LEAK reject at `submitQuizOutcome` | `public/js/research.js` (regex `^Q\d{2}$` + `responses_transient`); `client-submit-smoke.js` case 8 |
| `quiz_completed_at` ISO day (not sub-day timestamp) | `research/validate.js` (server enforcement); `client-submit-smoke.js` case 7; `quiz-validator-smoke.js` case 5 |
| `quizCompleted_v1` LS marker has ONLY `{version, completed_at, cohort_code}` | `scripts/quiz/privacy-smoke.js` case 4 |
| `quizState_v1` LS state cleared on submit | `scripts/quiz/privacy-smoke.js` case 1 |

---

## 4. Consent posture

Per `docs/RESEARCH_CONSENT_RULE.md` Example E (calibrated-quiz coverage audit, 2026-05-14):

**Conclusion: NO `CONSENT_VERSION` bump required** under four enforced conditions, all of which currently hold:

1. `quiz_completed_at` is ISO day (matches `upload_ts` convention) — enforced by `research/validate.js` regex `^\d{4}-\d{2}-\d{2}$`.
2. `quiz_score_normalized` is on the same 0–100 scale as `post_test_score` — enforced by `research/validate.js` range `[0, 100]`.
3. `quiz_cefr_band` is documented as a **derived presentation** of the score, not a separate datum — documented here in §2.4 and in `docs/RESEARCH_METRICS_SCHEMA.md` §8.
4. The consent template's §3.2 #3 — "Опционально: поделиться вашим итоговым баллом экзамена в конце курса" — receives a cosmetic mention of the calibrated quiz as one of the available paths (already done in `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`).

If any of these four conditions changes, the audit must be re-run before deployment.

---

## 5. Calibration audit log

| Date | Event | Notes |
|---|---|---|
| 2026-05-14 | v0 draft items authored | Expert-judgement difficulty placeholders; CEFR-monotonic |
| 2026-05-15 | AI pre-review pass | Conditional approval (G1–G4 process improvements); item-level annotations |
| 2026-05-15 | Premium-alt rewrite | Cleaner Hebrew + locale parity + Rasch-ready item formulations |
| 2026-05-15 | Premium-alt adopted as canonical | `public/quiz/ulpan_diagnostic_v1.json` shipped; build validator green; reference fixture generated |
| pending | External dispatch to ulpan teacher | Brief at `docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` |
| pending | Domain-expert sign-off | REQUIRED before real-ulpan deployment per phase plan §5 pre-implementation gate |

---

## 6. Recalibration trigger (v3.4+)

When a cohort reaches ≥ 30 students with completed quiz responses AND the dashboard surfaces correlation between `quiz_score_normalized` and teacher `post_test_score`, we'll have enough signal to estimate item difficulties empirically:

1. Researcher exports `cohort_<code>_aggregates.csv` (anonymized).
2. Runs `scripts/quiz/recalibrate-from-data.R` — fits Rasch model to empirical response patterns.
3. Updates `public/quiz/ulpan_diagnostic_v1.json` `items[].difficulty_logit` with empirical estimates.
4. Bumps `instrument_id` to `ulpan_diagnostic_v2`.
5. Documents change in `validity_notes.calibration_source = "empirical_irt_v1"`.
6. Re-runs the consent audit fresh.

Recalibration is a research-mode `CONSENT_VERSION` concern: the *measurement* changes, but the *kind of data* doesn't — likely cosmetic per `RESEARCH_CONSENT_RULE.md`. The v3.4 plan will rerun the audit on real data.

---

## 7. References

- Phase plan: `docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md`
- Schema additions: `docs/RESEARCH_METRICS_SCHEMA.md` §8
- Consent audit: `docs/RESEARCH_CONSENT_RULE.md` Example E
- Item bank (markdown source): `docs/QUIZ_ITEM_BANK_DRAFT.md`
- Item bank (canonical JSON): `public/quiz/ulpan_diagnostic_v1.json`
- AI pre-review notes (historical): `docs/QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md`
- Reviewer brief: `docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md`
- Scoring engine: `public/js/quiz-scoring.js`
- Build validator: `scripts/quiz/validate-bank.js`
- Reference fixture: `scripts/quiz/__fixtures__/mirt-reference.json`
- External R cross-check: `scripts/quiz/validate-against-mirt.R`
- Researcher guide: `docs/RESEARCHER_GUIDE.md` §4.3
