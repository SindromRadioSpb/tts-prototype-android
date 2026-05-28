# OSF Pre-Registration — Draft for Submission

> **Status.** DRAFT — ready for submission to osf.io.
> **Action required.** User logs in to OSF, creates new preregistration
> using "OSF Standard Pre-Data Collection Registration" template, pastes
> sections below. After submission, capture **registration DOI / URL**
> here for citation in thesis Methodology §«Pre-registration».
>
> **Registration URL:** https://osf.io/zdv9j/
> **Registration DOI:** 10.17605/OSF.IO/ZDV9J (per OSF's standard DOI format `10.17605/OSF.IO/<5char>`)
> **Submission date:** 2026-05-22
> **Status:** REGISTERED. Public-immediately (not embargoed).
> **Cite as:** Kolosei, P. (2026). *Correlation analysis of digital learning activity and outcomes in a Hebrew ulpan course: a single-cohort exploratory study with a privacy-preserving opt-in research-mode* [Pre-registration]. OSF. https://doi.org/10.17605/OSF.IO/ZDV9J
>
> **Authorship.** Drafted 2026-05-21 as part of pre-pilot validity
> hardening (gap closure per `docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md §1
> Tier 1`).

---

## Title

Correlation analysis of digital learning activity and outcomes in a Hebrew
ulpan course: a single-cohort exploratory study with a privacy-preserving
opt-in research-mode

## Authors

- Principal investigator: [your name + affiliation], email:
  `sindromradiospb@gmail.com`
- (If supervisor approves co-authorship of pre-registration — add here.)

## Description (abstract for OSF)

This pre-registration locks the analysis plan for an exploratory
single-cohort correlational study examining the relationship between
digital learning activity (six-layer metric taxonomy collected via
LinguistPro, an open-source language-learning application) and learning
outcomes (growth from pre-test to post-test) in a Hebrew ulpan course.
The study has **two contributions**: (1) a **methodological** contribution
— the design of a privacy-preserving opt-in research-mode (k-anonymity,
two-key split-knowledge, schema-strict server-side validation, one-click
withdrawal) — which is publishable and defensible **independent of
empirical findings**; and (2) an **empirical** correlation analysis,
explicitly framed as exploratory given expected sample size (single
ulpan cohort, N ≈ 8-15). The empirical part is **underpowered** for
medium effect sizes (r = 0.5 requires N ≈ 28 at α=0.05, β=0.20). Any
positive findings are reported with 95% confidence intervals and
explicit acknowledgement of the sample-size bounds. Code, schema, data
dictionary, and an anonymized replication package will be open-sourced.

---

## 1. Have any data been collected for this study already?

**No.** Development-phase dogfood data exists on the research server
from internal testing by the principal investigator, but it will not
be analyzed as part of this study (the relevant cohort has not yet been
recruited). The first real pilot cohort opt-in is expected ~2 weeks
after the registration date.

If, by oversight, any dogfood data from the PI's own device exists in
the cohort being analyzed, those records will be identified by the PI's
known `student_id` UUID and excluded prior to analysis.

## 2. Hypotheses

The study tests **four primary hypotheses** (Bonferroni-corrected
α = 0.05 / 4 = 0.0125, one-tailed predictions based on prior CALL
literature on engagement → learning outcomes):

- **H1.** `total_active_minutes_real` correlates **positively** with
  `growth_delta` (Pearson r > 0).
  *Rationale:* time-on-task is a robust predictor of learning gain in
  the CALL literature (Hattie 2009; Ericsson & Pool 2016 deliberate
  practice framework).

- **H2.** `total_cards_added_to_srs` correlates **positively** with
  `growth_delta`.
  *Rationale:* active card creation indicates the learner is processing
  + curating new material — a metacognitive engagement signal beyond
  raw exposure time.

- **H3.** `total_notes_created` correlates **positively** with
  `growth_delta`.
  *Rationale:* note-taking is an effortful retrieval / elaboration
  activity associated with deeper encoding (Mueller & Oppenheimer 2014).

- **H4.** `srs_error_rate` correlates **negatively** with
  `growth_delta`.
  *Rationale:* higher error rate during practice indicates weaker
  recall; we expect inverse relationship with overall learning gain.

**All other 20+ collected metrics** (`total_audio_ms`,
`total_sentences_read_distinct`, `total_texts_opened_distinct`,
`audio_replay_avg_per_row`, `total_search_queries`,
`smart_tag_overrides_count`, `translit_toggles_count`,
`active_days_count`, `streak_max`, `engagement_score` (derived),
`quality_score` (derived), `efficiency_ratio` (derived), per-day
timeseries fields, time-of-day distributions, audio replay distributions,
etc.) are **exploratory**. They will be reported with descriptive
statistics + 95% CI **without statistical significance testing**.

## 3. Dependent variables (outcomes)

**Primary outcome:** `growth_delta = post_test_score − pre_test_score`

- Source: teacher CSV upload (`outcomes.csv`); scale defined in
  `cohort_meta.outcome_scale` (default `0-100`).
- Authoritative path per `RESEARCHER_GUIDE.md §4.2`.

**Secondary outcome (if `pre_test_score` is unavailable):**
`post_test_score` (absolute).

- Acknowledged limitation: cannot differentiate "engagement caused
  learning" vs "strong learners engaged more". Causal direction is
  not claimed.

**Tertiary outcome:** `quiz_score_normalized` from the in-app
calibrated 1PL Rasch diagnostic (`ulpan_diagnostic_v1`), reported
alongside its standard error `quiz_se`.

- Acknowledged limitation: item difficulty parameters are
  expert-judgement based (`calibration_method: expert_judgement_v1`);
  external ulpan-teacher review **pending**; `production_ready:
  development_and_dogfood_only` per
  `docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md §7`. Empirical IRT
  recalibration deferred to v3.4+ once ≥ 30 quiz responses accumulate.

## 4. Conditions / groups

**No assignment.** Single-cohort correlational design. All participants
are voluntary opt-in students from one ulpan group recruited by their
teacher. Study is **explicitly not** a randomized controlled trial; no
control / experimental group split. Sample size considerations make RCT
infeasible at the diploma scale; this is noted as a methodological
limitation (`docs/ULPAN_RESEARCH_PLAN_v3_2.md §13`).

## 5. Analyses

**For each of the 4 primary hypotheses:**

- Compute Pearson correlation coefficient *r* with 95% confidence
  interval (Fisher z-transformation method).
- Compare against Bonferroni-corrected α = 0.0125 (one-tailed).
- Report effect size (r) prominently; p-value reported but **not the
  primary inferential statistic** (rationale: with expected N ≈ 5-12 for
  the linked subsample, p-value-based inference is unreliable; effect
  size + CI is more honest).

**Multiple linear regression** (single confirmatory model):

```
growth_delta ~ active_minutes_real
             + cards_added_to_srs
             + notes_created
             + srs_error_rate
             + (covariates if collected)
```

Reported: standardized β coefficients, 95% CIs, R², adjusted R² (penalized
for small N).

**Sensitivity analyses** (not significance-tested; reported as
descriptive evidence for/against generalization):

- *Linked vs. opt-in distribution.* Compare per-metric distributions of
  the linked subsample (those who shared `student_id` UUID with teacher)
  vs the full opt-in cohort (without outcome data). If distributions
  match within reasonable bounds, generalization to opt-in cohort is
  defensible; if linked subsample is systematically more engaged,
  claims are scoped to linked subsample only.
- *Multi-device fragmentation.* Where manual UUID linking is applied
  via `scripts/research/link_student_ids.js`, document each link and
  report results both with and without linking applied.
- *Drift between last use and exam.* Report median days between
  `last_upload_date` and `exam_date`; discuss potential forgetting-
  curve attenuation.

**Exploratory descriptive analyses** (all secondary metrics):

- Per-metric: mean, SD, median, IQR, range, with 95% CI on the mean.
- Per-metric × growth_delta: scatter plot + Pearson r with 95% CI,
  reported as effect size estimate **without significance testing**.

## 6. Outliers and exclusion criteria

**Participant-level exclusions:**

- Opted in but never uploaded data → excluded (no signal).
- Withdrew mid-course (DELETE issued) → excluded from final correlation;
  withdrawal counts reported in cohort attrition analysis.
- Identified PI dogfood UUID (if any) → excluded.

**Observation-level outliers:**

- Per-metric values beyond ±3 SD from cohort mean are **reported
  separately but NOT excluded** from primary analysis. Rationale: at
  small N (5-12), outlier exclusion is too aggressive — a single
  exclusion can flip a correlation sign. Outlier impact is instead
  assessed via robust correlation (Spearman ρ) as a sensitivity check.

**Multi-device:** per-device UUIDs are treated as separate observations
unless manually linked. Manual linking decisions are documented in the
analysis notebook with date, reason, and verification method (per
`scripts/research/link_student_ids.js` audit log).

## 7. Sample size

**Target:** the full single ulpan cohort (estimated N = 8-15 students)
recruited by one ulpan teacher.

**Effective N for primary analysis:** the linked subsample (students
who shared their `student_id` UUID with the teacher AND have non-null
outcome data). Expected effective N = 5-12.

**No interim analysis.** Data freeze occurs at the end of the cohort
course. Sample size is **opportunistic** (single cohort, no
recruitment for power); we do not stop early or recruit to power.

**Power calculation (acknowledgement of underpower):**

- With α=0.0125 (Bonferroni-corrected one-tailed) and 80% power, the
  detectable effect at N=10 is approximately r ≥ 0.78 (large effect).
- Medium effects (0.3 ≤ r < 0.5) are **statistically undetectable** at
  this sample size.
- This is **explicitly acknowledged** as an exploratory study.
  Null findings on the 4 primary hypotheses are interpreted as "no
  evidence of large effect at this sample size" — they **do not rule
  out smaller effects**.

**Why we still pre-register at this sample size:**

The diploma's primary contribution is the **methodological** design of
a privacy-preserving research-mode (`ULPAN_RESEARCH_PLAN_v3_2.md §1 D1`),
which is independent of empirical findings. The empirical correlation
analysis is a **secondary** demonstration that the methodological
framework can be deployed on a real cohort and produce interpretable
output, even at small N. Pre-registration protects the empirical
analysis against HARKing and multiple-comparison creep, and provides
a citable artifact for the open-source methodological release.

## 8. Anything else to pre-register

**Open materials:**

- Code: github.com/SindromRadioSpb/tts-prototype-android (open-source,
  GitHub).
- Schema: `docs/RESEARCH_METRICS_SCHEMA.md` (formal wire contract).
- Consent template: `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` (RU / EN
  complete; HE machine-translated, native review recommended before
  HE-primary deployment).
- Consent material-change decision tree: `docs/RESEARCH_CONSENT_RULE.md`.
- Threat model + comparison-with-alternatives table: thesis Chapter 4
  (drafting in progress).
- Replication package (post-pilot): an `analysis/` directory with
  R-notebook reproducing all primary + sensitivity analyses from an
  anonymized cohort export.

**Ethical framework:**

- Helsinki Declaration §22-32 (informed consent for human research).
- GDPR Regulation EU 2016/679 Art. 6(1)(a) (voluntary informed consent
  as legal basis for data processing); EU-hosted server (Railway, EU
  region).
- Supervisor exercises de-facto ethics oversight for the diploma project.
- Study classified as non-clinical, low-risk, voluntary educational
  research.

**Privacy invariants (architecturally enforced):**

- Default OFF; opt-in only.
- Anonymous `student_id` (UUID v4, client-side generated, no PII).
- Aggregates only; raw text / notes / search strings / audio never leave
  device (server-side schema-strict validator with explicit FORBIDDEN
  fields list).
- k-anonymity threshold = 5 (cohort < 5 → individual breakdown hidden).
- Two-key split-knowledge: researcher knows `UUID + metrics`; teacher
  knows `name + exam score`; linking is participant-initiated.
- One-click withdrawal → server-side DELETE of all `.jsonl` rows +
  outcomes.csv rows + audit log entry; local cleanup unconditional.
- 2-year retention post-cohort-end.

**Things that will NOT be done:**

- No real-time per-student monitoring dashboard (anti-pedagogical
  surveillance; explicit non-goal per `ULPAN_RESEARCH_PLAN §13`).
- No raw text / note bodies / search strings collected.
- No third-party data sharing or commercial use.
- No causal claims from correlation findings.
- No HARKing — only the 4 primary hypotheses above are confirmatory;
  all other findings are framed as exploratory regardless of effect
  size.

**Acknowledged limitations** (will be discussed in thesis Chapter 7
Discussion):

- Hawthorne effect: participants know their behavior is measured.
- Opt-in selection bias: even within the cohort, only app-friendly
  students participate.
- Double selection bias on linking subsample.
- No pre-test baseline if teacher does not administer (treat as
  acknowledged limitation; rely on `post_test_score` absolute).
- Confounding variables not measured (motivation, prior exposure,
  hours/week, family support, age).
- Single-cohort generalization scope.
- L1 bias (Russian-speakers predominant).
- Construct validity of `active_minutes_real` (captures interactive
  engagement, not passive listening; documented operational definition
  in Methodology).
- `cards_reviewed` measures in-app stub Trainer only (Anki reviews are
  the primary practice path per `SRS_STRATEGY_v3_2.md`; framed as
  proxy in thesis).
- Calibrated quiz uses expert-judgement difficulty parameters; external
  ulpan-teacher review pending.

---

## 9. Deviation Log

This section records supplementary analyses declared **after** the
initial registration (2026-05-22) but **before** any cohort data are
collected. Every entry below is pre-registered in the same OSF artifact
via OSF's registration-update mechanism and is timestamped accordingly.
The four primary confirmatory tests H1–H4 above remain unchanged; the
entries below add **secondary supplementary** analyses with their own
locked parameters. No HARKing: priors / SESOI / protocols are committed
before any frozen-dataset access.

### 9.1 Supplementary confirmatory: TOST equivalence testing (V5, 2026-05-22)

**Status.** Declared 2026-05-22, before any cohort data collection.

**Rationale.** The thesis acknowledges in Chapter 5 §5.5.6 that the
expected linked subsample (N ≈ 5–12) is underpowered for medium-effect
detection. Lakens (2017) equivalence testing (TOST — two one-sided
tests) reframes "no evidence of effect" as "evidence of no large
effect" by formally testing the data against a pre-registered Smallest
Effect Size Of Interest (SESOI). This is a *secondary supplementary
confirmatory* analysis that complements but does NOT replace the
primary H1–H4 Pearson r tests.

**Locked parameters** (changes to any of these post-hoc would
constitute a pre-registration violation):

- **SESOI_r = 0.5.** The smallest effect size of interest, equal to
  Cohen's (1988) conventional medium-effect threshold and equal to the
  upper bound of the diploma's "directionally consistent" decision
  category. Smaller SESOIs (0.3, 0.2) are explicitly deferred to the
  v4.0 MCREMA multi-cohort framework where pooled N can support them.
- **α_TOST = 0.05 / 8 = 0.00625.** Strict Bonferroni correction
  against the joint family of 8 tests (4 primary Pearson r + 4
  equivalence). The choice of strict over partition-by-test-type is
  itself locked per the diploma's conservative principle.
- **One-sided form.** Two one-sided tests per Lakens (2017) §3, with
  equivalence bounds [−SESOI, +SESOI].
- **Toolkit.** R package `TOSTER::TOSTr()` (Lakens & Caldwell 2021).
  Implementation in `scripts/research/tost_analysis.R`.

**Power.** At N = 10, α = 0.00625, SESOI_r = 0.5: TOST has
approximately 78% power — at the boundary of conventional adequacy.
This is acknowledged as the maximum feasible SESOI at the diploma
sample size.

**Decision rule** (per Lakens 2017 §3):

- **"Equivalent at SESOI = 0.5"** if the 90% CI on r lies entirely
  within [−0.5, +0.5] **and** the larger of the two TOST p-values is
  less than α_TOST = 0.00625. Interpretation: evidence rules out
  effects larger than r = 0.5 in either direction.
- **"Not equivalent — cannot rule out large effect"** otherwise.

**Reporting.** TOST results are reported per hypothesis in thesis §6.3.5
(Results) and interpreted in §7.4 (Discussion) alongside the primary
Pearson r results. Null findings on primary tests with an equivalent
TOST outcome become **defensible bounded-effect statements**: "we can
rule out a true effect larger than r = 0.5."

### 9.2 Supplementary exploratory: Pre-registered Bayesian Sensitivity (V1, 2026-05-22)

**Status.** Declared 2026-05-22, before any cohort data collection.

**Rationale.** Frequentist 95% CIs at N ≈ 10 are wide and depend on
assumptions about sampling distribution. A complementary Bayesian
posterior on the population correlation ρ, computed under multiple
priors, reveals the prior-sensitivity of any conclusions and provides
posterior probabilities of direction `P(ρ > 0 | data, prior)` that are
more interpretable at small N than p-values. This is a *secondary
supplementary exploratory* analysis (NOT confirmatory) that
complements the primary H1–H4 results.

**Locked priors** (changes post-hoc would constitute HARKing):

- **Prior A — Flat / Default JZS.** Uniform prior on ρ ∈ [−1, +1], i.e.
  the default Jeffreys–Zellner–Siow (JZS) Cauchy prior on the effect
  size implemented by `BayesFactor::correlationBF()`. Represents the
  reference "no prior information" position.
- **Prior B — Weak-Informative Skeptical.** ρ ~ N(0, 0.3²). Centers
  the prior at zero ("skeptical of any effect") with moderate scale.
  Operationalized via `brms` with a `prior(normal(0, 0.3), class = "b")`
  or equivalent Stan specification.
- **Prior C — Literature-Anchored.** ρ ~ N(0.3, 0.2²). Centered at the
  small-to-medium positive effect that CALL time-on-task literature
  (Hattie 2009; Ericsson & Pool 2016) would predict for engagement →
  outcome relationships. Operationalized similarly.

**Reporting.** Three-prior posterior table per hypothesis (H1–H4) in
thesis §6.6. Reports posterior median, 95% credible interval, Bayes
factor BF₁₀ against ρ = 0, and `P(ρ > 0 | data, prior)`.
Implementation in `scripts/research/bayes_sensitivity.R`.

**No confirmatory threshold.** Bayesian results are descriptive only;
no decision rule promotes a Bayes factor to a "supported" claim. The
prior-sensitivity table is the artifact of interest.

### 9.3 Future-work protocol: MCREMA Multi-Cohort Meta-Analysis (V2, 2026-05-22)

**Status.** Protocol declared 2026-05-22; **execution deferred** to
future cohorts (K ≥ 3).

**Rationale.** Single-cohort N ≈ 10 cannot detect medium effects;
random-effects meta-analysis across K future cohorts can. The diploma
ships the protocol + the infrastructure (deidentified meta-summary CSV
export from teacher dashboard) but does NOT execute pooled analysis at
defense time (K = 1).

**Locked parameters:**

- **Estimator.** Restricted Maximum Likelihood (REML), implemented via
  `metafor::rma()`. DerSimonian-Laird available as sensitivity check.
- **Effect-size measure.** Pearson r per primary hypothesis, converted
  to Fisher z (via `metafor::escalc(measure = "ZCOR")`), pooled in
  z-space, back-transformed to r-space for reporting.
- **Heterogeneity reporting.** τ² (variance of true effects across
  cohorts), I² (% of variance due to heterogeneity), Cochran Q test.
- **Minimum K for valid pooled estimate.** K ≥ 3 cohorts with N_linked
  ≥ 5 per cohort. Below this threshold, results are descriptive only
  (no pooled inference).
- **Cumulative-evidence rule.** Per-cohort AND pooled both reported;
  no selective reporting. Cohort_001 null + Cohort_002 positive ≠
  "we found a pooled effect"; both are reported faithfully.
- **Deidentification.** Cohort labels in meta-analytic CSV are
  `cohort_001`, `cohort_002`, … (not human-readable cohort_code).
  Generated by deterministic non-reversible hash. Prevents teacher
  identity inference.

**Full protocol:** `thesis/META_ANALYSIS_PROTOCOL.md` (to be created
in parallel with the meta-analytic R script `scripts/research/meta_analysis.R`).

**Reporting at diploma defense.** Future-work positioning in thesis
§7.8 + §8.4 (Conclusion). Empty per-cohort export available as
infrastructure demonstration.

### 9.4 Supplementary exploratory: Construct-Validity Pluralism (V3, 2026-05-22)

**Status.** Declared 2026-05-22, before any cohort data collection.

**Rationale.** The pre-registered H1 primary test uses
`active_minutes_real` as the operational definition of "engagement",
which captures interactive engagement only (heartbeat + 1Hz-throttled
input events) and not total exposure (audio listening, passive
reading). Rather than retrofitting the H1 definition (which would
constitute a pre-registration violation), V3 adds **two derived
supplementary metrics** with distinct measurement gates, enabling a
multitrait-multimethod (Campbell & Fiske 1959) intercorrelation
report and four parallel exploratory regression specifications. The
OSF-locked H1 primary remains exactly as pre-registered.

**Locked derived metrics:**

- **`audio_exposure_minutes`** = `audio_play_ms_total` / 60 000,
  rounded. Captures passive listening exposure from already-collected
  `play_audio` events.
- **`text_exposure_minutes`** = sum of `text_open` → `text_close`
  dwell time (with 5-minute imputation for orphan opens), rounded to
  minutes. Captures passive reading exposure from already-collected
  text-open/close events.

**Implementation:**

- `public/db/local-db.js` — `getAudioExposureMs()` and
  `getTextExposureMs()` (V3 functions, added 2026-05-22).
- `research/validate.js` — `ALLOWED_METRIC_KEYS` extended (Layer 2);
  `intMetrics` list extended.
- `public/js/research.js` — daily aggregator emits both new fields.
- Thesis §6.7.1 — multitrait-multimethod table + exploratory parallel
  regressions.
- Thesis §7.4 — construct-validity discussion uses V3 results as the
  empirical anchor.

**Privacy.** Both metrics are derived from already-consented event
types (`play_audio`, `text_open`, `text_close`). No new collection;
no new FORBIDDEN_FIELDS check; no `CONSENT_VERSION` bump per
`RESEARCH_CONSENT_RULE.md §3` (cosmetic-change matrix Example E).

**No confirmatory threshold.** V3 metrics are descriptive supplementary
evidence only. Their parallel regression specifications are NOT
significance-tested and do NOT inform any decision rule. The H1
primary test (`active_minutes_real`) is the sole confirmatory test
for the engagement-vs-growth relationship.

---

## Submission instructions (for the user)

1. Open https://osf.io and log in.
2. Navigate to Registries → Add a new registration → choose **"OSF
   Standard Pre-Data Collection Registration"** template.
3. Paste each numbered section above into corresponding fields. OSF's
   own field labels may differ slightly; map by topic (e.g., "Hypotheses"
   → §2 here; "Sampling Plan" → §7 here; "Variables" → §3 here).
4. Add this project's GitHub URL as a related resource.
5. Submit. **Capture the resulting Registration URL + DOI** and return
   them — they go into:
   - the header of this file
   - `docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md §6 Status log`
   - thesis Methodology §«Pre-registration» as the citable reference
6. (Optional) Add the OSF DOI to the consent template as supplementary
   info — this is **not** required and would trigger a CONSENT_VERSION
   bump per `RESEARCH_CONSENT_RULE.md` (new informational section adding
   protections = minor bump 1.0 → 1.0.1). Recommend deferring this until
   the consent template gets its **next** material change anyway, so the
   bump is bundled.

**Security note.** Do **not** paste OSF credentials into any chat or
shared transcript. The pre-registration draft above is independent of
account credentials — only your submission action requires the login.
