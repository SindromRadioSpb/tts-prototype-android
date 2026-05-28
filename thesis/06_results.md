# Chapter 6 — Results

> **Status.** STUB — to be filled post-pilot. The cohort has not been recruited at the time of writing. This chapter exists as a structured placeholder so that the methodological commitments of Chapter 5 are visibly threaded through to where they will be reported. Each section below carries an explicit `[TODO: fill from cohort data]` marker.
> **Bilingual workflow.** EN canonical; RU mirror at `thesis/06_results.ru.md`. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Last updated.** 2026-05-22 (stub created).

---

## 6.1 Cohort Attrition

`[TODO: fill post-pilot]` Report total enrolled cohort N (from teacher), opt-in N (research-mode consent count), linked subsample N (those who shared UUID with teacher AND have non-null outcome), withdrawal N (those who issued DELETE during the cohort term). Compare against the Chapter 5 §5.2.3 expected ranges (target N = 8–15; expected linked subsample N = 5–12).

## 6.2 Cohort Descriptive Statistics

`[TODO: fill post-pilot]` For each layer of the engagement taxonomy (Chapter 5 §5.3.1), report mean, SD, median, IQR, range across the opted-in cohort. Include time-of-day distribution patterns and audio replay distributions (Chapter 5 §5.5.10 exploratory).

## 6.3 Primary Hypothesis Test Results (H1–H4)

`[TODO: fill post-pilot]` For each pre-registered primary hypothesis, report Pearson r + 95% CI (Fisher z-transformation) on the linked subsample. Apply the decision rule of Chapter 5 §5.5.3 (Directionally supported / Directionally consistent but underpowered / No evidence of large effect). Bonferroni-corrected α = 0.0125, one-tailed.

### 6.3.1 H1: `active_minutes_real` × `growth_delta`

`[TODO: fill post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.2 H2: `cards_added_to_srs` × `growth_delta`

`[TODO: fill post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.3 H3: `notes_created` × `growth_delta`

`[TODO: fill post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.4 H4: `srs_error_rate` × `growth_delta`

`[TODO: fill post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.5 TOST Equivalence Tests (Supplementary Confirmatory, V5)

Per the pre-registered supplementary analysis declared in OSF deviation log §9.1 (V5 — TOST-SESOI), each of the four primary hypotheses is also tested for **equivalence** against a pre-registered Smallest Effect Size Of Interest (SESOI_r = 0.5) at α = 0.00625 (strict Bonferroni against 8 = 4 primary + 4 TOST tests). The toolkit is `TOSTER::TOSTr()` (Lakens 2017); implementation in `scripts/research/tost_analysis.R`. Decision rule: 90% CI on r entirely within [−0.5, +0.5] **and** max(TOST p) < 0.00625 → "equivalent at SESOI = 0.5" (effects larger than r = 0.5 are ruled out). Otherwise → "not equivalent — cannot rule out large effect."

| Hypothesis | r (observed) | 90% CI | TOST p (max) | Conclusion |
|---|---|---|---|---|
| H1 active_minutes × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H2 cards_added_to_srs × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H3 notes_created × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H4 srs_error_rate × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |

`[TODO: fill post-pilot]` Interpretation: any "equivalent at SESOI = 0.5" outcome reframes the corresponding primary-test null finding as a positive bounded-effect statement — "the data rule out effects larger than r = 0.5 in either direction." Any "not equivalent" outcome means the data are simultaneously consistent with effects exceeding ±0.5 AND with effects near zero (an honest acknowledgement of the underpowered design). Power at N = 10, α = 0.00625, SESOI = 0.5 is ≈ 78% — at the boundary of conventional adequacy.

### 6.3.6 Bayesian Sensitivity Analysis (Supplementary Exploratory, V1)

Per the pre-registered supplementary analysis declared in OSF deviation log §9.2 (V1 — PBSL), each of the four primary hypotheses is also analyzed via Bayesian posterior under three pre-registered priors. Toolkit: `BayesFactor::correlationBF()` for the default JZS Cauchy prior; `brms` / Stan for the two informative priors. Implementation in `scripts/research/bayes_sensitivity.R`.

**Locked priors** (per OSF §9.2):
- **Prior A (Flat/JZS).** Default `correlationBF` Cauchy prior.
- **Prior B (Skeptical).** ρ ~ N(0, 0.3²).
- **Prior C (Literature-anchored).** ρ ~ N(0.3, 0.2²).

| Hypothesis | Prior | Posterior median | 95% CrI | BF₁₀ vs ρ = 0 | P(ρ > 0 | data, prior) |
|---|---|---|---|---|---|
| H1 active_minutes × growth | A | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H1 active_minutes × growth | B | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H1 active_minutes × growth | C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H2 cards_added_to_srs × growth | A/B/C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H3 notes_created × growth | A/B/C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H4 srs_error_rate × growth | A/B/C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |

`[TODO: fill post-pilot]` Interpretation: the table is the **prior-sensitivity artifact**. If posterior median / direction probabilities agree across the three priors, the conclusion is prior-robust. If they disagree, the disagreement itself is informative — it bounds the inferential strength of any single-prior posterior. **No Bayes factor or posterior probability is promoted to a confirmatory decision threshold**; this is supplementary exploratory analysis only.

## 6.4 Confirmatory Multiple Regression

`[TODO: fill post-pilot]` Report the joint OLS model `growth_delta ~ active_minutes_real + cards_added_to_srs + notes_created + srs_error_rate + [covariates if collected]`. Standardized β coefficients with 95% CIs, omnibus R², adjusted R² (small-N penalized), VIF diagnostics for collinearity.

## 6.5 Tests of Model Assumptions

`[TODO: fill post-pilot]` Per Chapter 5 §5.5.5: Shapiro-Wilk on residuals, Breusch-Pagan on homoscedasticity, Cook's distance for high-influence observations, VIF for collinearity. Report each as descriptive evidence (not as inferential gate). Note which assumption tests if any triggered the §5.5.5 decision criteria (Spearman ρ alongside Pearson r, HC3 standard errors, with/without flagged observation analysis, hypothesis downgrade from confirmatory to exploratory).

## 6.6 Sensitivity Analyses

`[TODO: fill post-pilot]` Per Chapter 5 §5.5.9:

- **Linked-vs-opt-in distribution comparison** (Kolmogorov-Smirnov). If the linked subsample differs systematically from the opt-in cohort, conclusions are scoped to the linked subsample only.
- **Multi-device linking sensitivity**. Primary results both with and without manual UUID linking applied.
- **Drift between last app use and exam**. Median days; commentary on potential forgetting-curve attenuation.
- **Spearman ρ alongside Pearson r** for each primary test.

## 6.7 Exploratory Findings

### 6.7.1 Multitrait-Multimethod Engagement Construct (V3 CVP)

Per the pre-registered supplementary analysis declared in OSF deviation log §9.4 (V3 — Construct-Validity Pluralism), engagement is operationalized through **three independent metrics** with distinct measurement gates, and their intercorrelation matrix is reported as the construct-validity anchor for the §7.4 discussion of `active_minutes_real` construct restrictions. The Campbell & Fiske (1959) multitrait-multimethod framework is applied at the level of a single trait ("engagement") with three methods ("interactive", "audio exposure", "text exposure").

| Metric | Source events | Captures | Operational definition |
|---|---|---|---|
| `active_minutes_real` | 30s heartbeat + keyboard/click/pointerdown/scroll/touchstart | **Interactive engagement** (primary, OSF-locked) | `getActiveMsReal()` — sum of heartbeats with 5-min idle gate, 60-min session cap |
| `audio_exposure_minutes` | `play_audio` events with `duration_ms` | **Passive listening exposure** | `getAudioExposureMs()` — sum of audio_play_ms_total / 60000 |
| `text_exposure_minutes` | `text_open`/`text_close` pairs with `duration_ms` | **Passive reading exposure** | `getTextExposureMs()` — sum of close dwell + 5-min imputation for orphan opens |

**Intercorrelation matrix (linked subsample).**

| | active_minutes | audio_exposure | text_exposure |
|---|---|---|---|
| active_minutes | 1.00 | `[TODO]` | `[TODO]` |
| audio_exposure | `[TODO]` | 1.00 | `[TODO]` |
| text_exposure | `[TODO]` | `[TODO]` | 1.00 |

`[TODO: fill post-pilot]` Pearson r per pair with 95% CI; Cronbach's α for the unit-weighted z-composite; cross-metric consistency assertion (`active_minutes_real ≤ text_exposure_minutes`).

**Exploratory parallel regressions** (NOT replacements for OSF-locked H1):

| Specification | r vs growth_delta | 95% CI | Notes |
|---|---|---|---|
| growth ~ active_minutes_real (OSF H1, primary) | `[TODO]` | `[TODO]` | Locked; reported in §6.3.1 |
| growth ~ audio_exposure_minutes | `[TODO]` | `[TODO]` | Exploratory only |
| growth ~ text_exposure_minutes | `[TODO]` | `[TODO]` | Exploratory only |
| growth ~ z-composite(all three) | `[TODO]` | `[TODO]` | Exploratory only |

`[TODO: fill post-pilot]` Interpretation: if `active_minutes_real` correlates r > 0.85 with the other two metrics, the construct gap of §7.4 is empirically narrow. If r < 0.5, the gap is wide and H1 conclusions are genuinely scoped to "**interactive** engagement × growth" — not to total exposure × growth. The OSF-locked H1 result is reported exactly as pre-registered; the V3 alternative specifications are descriptive context, never significance-tested.

### 6.7.2 Other Exploratory Findings

`[TODO: fill post-pilot]` All ≈ 20 secondary metrics: per-metric × `growth_delta` scatter + Pearson r with 95% CI (descriptive only, no significance testing). Composite `engagement_score`, `cards_creation_to_export_ratio` (mastery proxy), time-of-day distributions, per-day engagement trajectory patterns, audio replay distributions. Compelling findings are labeled "exploratory, not confirmatory" and proposed as hypotheses for future studies (HARKing prohibition binding).

## 6.8 Stopwatch Validation of `active_minutes_real` (if performed)

`[TODO: fill if performed pre-pilot]` Per the audit recommendation in Chapter 5 §5.6.1, three manual stopwatch test sessions (~10 minutes each) compared against `getActiveMsReal()` output. Reported as descriptive validity check; deviation within ±10–15% is considered acceptable.

## 6.9 Deviations from Pre-Registration

`[TODO: fill post-pilot]` Any deviation from the OSF pre-registered analysis plan ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)) flagged here with full justification. If no deviations, note "None — analyses proceeded as pre-registered".

## 6.10 Post-Freeze Events

`[TODO: fill post-pilot]` Any late uploads, late withdrawals, or late outcome submissions occurring after the data freeze documented here. These do not modify the frozen analytic dataset (Chapter 5 §5.4.5) but are reported for transparency.

## 6.11 Summary

`[TODO: fill post-pilot]` Brief restatement of the per-hypothesis decision-rule outcomes and the cohort's descriptive engagement portrait. Transition to Chapter 7 Discussion.

---

**End of Chapter 6 (stub).** Awaiting cohort data.
