# Chapter 5 — Empirical Methodology

> **Status.** DRAFT COMPLETE (sequential drafting per user-approved cadence 2026-05-22).
> **Target length.** ~12 pages (drafted longer for thoroughness per user request «основательно»; editing pass deferred).
> **Bilingual workflow.** EN canonical for thesis submission; RU mirror at `thesis/05_methodology.ru.md` for author comprehension. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Glossary.** `thesis/GLOSSARY.md` — canonical RU↔EN mappings of key terms.
> **Sources.** `docs/ULPAN_RESEARCH_PLAN_v3_2.md §3` + §8, `docs/RESEARCH_METRICS_SCHEMA.md`, `docs/RESEARCHER_GUIDE.md §3-§6`, `docs/SRS_STRATEGY_v3_2.md`, `docs/QUIZ_ITEM_BANK_DRAFT.md`, `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md`, `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md §3-§6`, `thesis/04_privacy_contribution.md §4.3-§4.4`, OSF pre-registration `osf.io/zdv9j` (DOI 10.17605/OSF.IO/ZDV9J).
> **OSF pre-registration alignment.** This chapter is the narrative expansion of the pre-registered analysis plan. The four primary hypotheses, the Bonferroni-corrected α, the effect-size-with-CI inference framing, the data exclusion criteria, and the missing-data policy are locked in `osf.io/zdv9j` and reproduced here in full prose. Any deviation from the locked plan in Chapter 6 will be explicitly flagged as a deviation from pre-registration with full justification.
> **Stylistic conventions.** Academic "we"; APA 7 citations; `[TODO: cite X]` markers.
> **Last updated.** 2026-05-22 (draft complete).

---

## 5.1 Research Design Overview

This chapter operationalizes the architectural commitments of Chapter 4 into a concrete empirical research design: a single-cohort correlational study of digital learning activity and learning outcomes in a Hebrew ulpan course, pre-registered on the Open Science Framework ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)) before any participant data is collected.

The design is **exploratory by construction**. As §5.5 makes explicit, the natural cohort size of a single ulpan group (N ≈ 8–15 enrolled students, with an expected effective linked subsample of N ≈ 5–12) is below the conventional power threshold for detecting medium-effect correlations. The study therefore reports effect-size estimates with explicit 95% confidence intervals rather than p-value-centric inference, and frames null findings as "absence of evidence at this sample size" rather than as "evidence of absence" of the underlying relationships. This framing is locked in the pre-registration and is consistent with the Open Science turn toward effect-size estimation over significance-test ritual [TODO: cite Wasserstein & Lazar 2016 ASA statement on p-values; Lakens 2018 equivalence-test pedagogy].

The empirical study is a **secondary** contribution of the diploma. Its primary purpose is to demonstrate that the privacy-preserving research-mode architecture of Chapter 4 can be deployed on a real cohort and produce interpretable output even at small N. The methodological contribution defended in Chapter 4 is independent of any specific empirical outcome. This asymmetric weighting is reaffirmed here because it shapes every methodological choice that follows: where statistical power is constrained by the cohort, we choose precise effect-size estimation over speculative power-targeted recruitment; where construct validity is constrained by the offline-first architecture, we choose honest operational definitions over claims to comprehensive engagement measurement.

## 5.2 Participants

### 5.2.1 Target Population

The target population is adult Hebrew-language learners (ages 18+) enrolled in an ulpan course, predominantly Russian-L1 speakers at CEFR levels A2–B2. The cohort under study consists of all enrolled students of a single ulpan teacher's group, recruited through indirect referral by that teacher. The principal investigator does not contact participants directly during recruitment — a deliberate procedural choice that preserves the two-key split-knowledge architecture of §4.3.5 (researcher knows anonymous UUIDs and metrics; teacher knows names and exam scores; linking is participant-initiated).

### 5.2.2 Inclusion and Exclusion Criteria

**Inclusion criteria**, applied at study start:

- Enrolled in the recruiting ulpan cohort.
- Age 18 or older (self-attested in the consent screen, not documentary).
- Has access to a device capable of running a modern web browser with `localStorage` and IndexedDB (effectively any device less than ~5 years old).
- Provides explicit informed consent inside the LinguistPro application — five mandatory checkboxes covering voluntary participation, right to withdraw, aggregated-only collection, no PII, and agreement to participate.

**Exclusion criteria**, pre-specified in the OSF pre-registration before any data inspection:

- **E1.** Did not opt in to research mode (no consent click → no data collected → not a participant).
- **E2.** Opted in but produced no data upload during the cohort term (no signal — excluded from analysis).
- **E3.** Withdrew mid-course via the in-app one-click withdrawal flow (data fully deleted server-side; counted in attrition but not included in final analysis).
- **E4.** Principal investigator's own dogfood UUID, identified by exact UUID match recorded in the analysis notebook before the cohort dataset is exported.
- **E5.** Missing outcome score after the 14-day settling window (no valid `post_test_score` from any of the three paths: teacher CSV, student self-report, in-app calibrated quiz) — excluded from primary correlation analyses but retained in cohort descriptive statistics where engagement-only metrics permit.

### 5.2.3 Sample Size and Power

The study uses **opportunistic sampling**: the sample equals whatever participants the natural cohort happens to contain, with no recruitment beyond that. Target enrollment is N ≈ 8–15. Of those, the effective sample for primary hypothesis tests (the **linked subsample**) is N ≈ 5–12 — restricted to participants who both opted in to research mode and voluntarily shared their UUID with the teacher to enable outcome linkage.

We acknowledge that this sample size is **underpowered** for medium-effect correlation detection. With Bonferroni-corrected α = 0.0125 (one-tailed) and conventional 80% power, the detectable effect at N = 10 is approximately r ≥ 0.78 — large effects only. Medium effects (0.3 ≤ r < 0.5) are statistically undetectable at this sample size. The full power discussion, including the implications for null findings and the rationale for pre-registering at this sample size despite acknowledged underpower, is locked in the OSF pre-registration and reproduced in §5.5.6.

## 5.3 Instruments

### 5.3.1 LinguistPro as Engagement Instrument

The engagement metrics are collected automatically by LinguistPro — an open-source web application for Hebrew language learning that participants use as one of their study tools during the ulpan course. The application's research-mode emits a daily aggregated summary of participant activity, structured as a **six-layer engagement taxonomy** adapted from learning-analytics literature [TODO: cite Siemens 2013 learning-analytics foundational or equivalent]:

- **Layer 1: Engagement** — session count, active minutes (heartbeat-derived; see §5.6.1), active days, time-of-day distribution.
- **Layer 2: Volume** — texts opened (distinct and total), sentences read, audio playback duration, words encountered, SRS cards created and exported, notes created and edited, search queries (count only — never the query strings themselves).
- **Layer 3: Quality** — SRS error rate, cards-due completion ratio, smart-tag overrides.
- **Layer 4: Hebrew-specific** — transliteration toggles, audio replay distribution, niqqud-marked time ratio (if collected), binyan coverage and root-encounter diversity (if morphology Tier 3+ is active).
- **Layer 5: Outcome** — populated separately (see §5.3.2–§5.3.4).
- **Layer 6: Cohort-level** — distributions, clusters, and time-to-mastery patterns derived at analysis time, not stored server-side.

The full schema is defined in `docs/RESEARCH_METRICS_SCHEMA.md` and enforced at the server boundary by the schema-strict validator described in §4.4.1. Only daily aggregates leave the participant's device; the participant's raw events remain local in the browser's OPFS-resident SQLite database, never uploaded.

### 5.3.2 Teacher CSV as Primary Outcome Instrument

The **primary outcome variable** is `growth_delta = post_test_score − pre_test_score`, where both scores are reported by the ulpan teacher via CSV upload at course end. The expected scale is 0–100 (configurable per cohort via `cohort_meta.outcome_scale`). The teacher uploads via the teacher dashboard's outcomes-CSV interface; the format is `student_id, pre_test_score, post_test_score, exam_date, uploaded_by`, where `student_id` is the participant's anonymous UUID disclosed by the participant to the teacher (per the two-key linking design of §4.3.5).

If the teacher does not administer or report `pre_test_score`, the secondary outcome `post_test_score` (absolute, not differenced) is used in its place; the corresponding tests are reported as secondary with explicit acknowledgement that causal direction cannot be inferred from absolute outcome alone.

### 5.3.3 Calibrated Rasch 1PL Diagnostic Quiz (Tertiary Outcome)

The application offers an in-app **calibrated diagnostic quiz** (`ulpan_diagnostic_v1`) as a parallel outcome path. The quiz consists of 20 items balanced across CEFR levels A1–C1 (4/4/5/4/3) and is scored by a one-parameter logistic (Rasch) model implemented in pure JavaScript at `public/js/quiz-scoring.js` [TODO: cite Rasch 1960/1980 foundational; Bond & Fox 2007 applied Rasch measurement]. The output is `quiz_score_normalized` (a 0–100 transformation of the latent ability θ ∈ [−3, +3]), `quiz_cefr_band` (a deterministic linear bucket of the score, not a separately measured datum), and `quiz_se` (the standard error of the θ estimate, indicating measurement precision).

The quiz item bank carries a `calibration_method: "expert_judgement_v1"` flag at the time of writing; difficulty parameters are placeholders derived from expert judgement and AI pre-review, awaiting empirical IRT recalibration once ≥ 30 cohort responses accumulate (deferred to v3.4+ per `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §6`). External ulpan-teacher review of the item bank is pending. Accordingly, the quiz outcome is treated as **secondary** to the teacher CSV; quiz scores are reported alongside teacher-CSV scores in the dashboard, but the four primary hypotheses are tested against `growth_delta` derived from teacher CSV when available, falling back to `post_test_score` absolute (from any path) when growth is unavailable.

### 5.3.4 Self-Report as Tertiary Fallback

Participants can submit their own end-of-course exam score through the application's self-report path (Research panel → 🎓 Сдать экзамен). This path is treated as the lowest-authority outcome source: it is used only when both teacher CSV and calibrated quiz outcomes are unavailable for the participant. Self-report is known unreliable for academic-performance recall [TODO: cite Kuncel et al. 2005 self-report academic accuracy meta-analysis or equivalent], and this is acknowledged in §5.9 Limitations.

## 5.4 Procedure

### 5.4.1 Cohort Provisioning (Pre-Recruitment)

Before participant recruitment, the principal investigator provisions the cohort on the research server. The provisioning step creates a `cohort_meta.json` containing the cohort code, k-anonymity threshold (default 5), retention date (2 years post-cohort-end), researcher token hash, and minimum consent version. Provisioning is performed via the CLI `scripts/research/create_cohort.js` or via the in-UI admin form at `/teacher.html`. The cohort code is a non-secret group identifier (regex `[A-Z0-9-]{4,16}`).

### 5.4.2 Recruitment and Consent

The ulpan teacher distributes the cohort code to the enrolled students through a channel of her choice (WhatsApp, Telegram, printed handout, email), along with a brief explaining the study (RU primary; EN translation available). The principal investigator does not contact participants directly during recruitment — the indirect referral preserves the two-key separation.

A participant navigates to the LinguistPro web application, opens the Research panel, and is presented with the informed-consent screen (`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`). The participant reads the full template, checks five mandatory consent checkboxes (voluntary participation, right to withdraw, aggregated-only collection, no PII, agreement to participate), enters the cohort code, and confirms. Upon confirmation, the application generates an anonymous UUID v4 client-side via `crypto.randomUUID()`, stores it in `localStorage.researchStudentId_v1`, and enables the daily aggregator.

### 5.4.3 Daily-Use Phase

For the duration of the ulpan course (typically 6–12 weeks), participants use LinguistPro as one of their Hebrew study tools. The application emits events into a local OPFS-resident SQLite `events` table; a once-per-day aggregator builds the daily aggregate payload from those events, posts it to `/api/research/v1/metrics`, and logs the result locally (visible to the participant via the transparency modal of §4.4.4).

Participants are free to use the application as much or as little as they wish. There is no minimum-usage requirement, no engagement target, and no participation reminder from the researcher. The opt-in is fully reversible at any time via the one-click withdrawal flow of §4.3.6.

### 5.4.4 Outcome Capture

At course end, three independent paths capture outcome:

1. **Teacher CSV upload** (authoritative primary). The teacher uploads a CSV mapping `student_id` (UUID) to `pre_test_score`, `post_test_score`, and exam date.
2. **In-app calibrated quiz** (secondary). Participants take the 20-item 1PL Rasch diagnostic; the score, CEFR band, and standard error are uploaded.
3. **Self-report** (tertiary fallback). Participants enter their own score through the Research panel.

Linking the UUID to a real-world identity requires the participant to voluntarily disclose their UUID to the teacher — typically by writing it on the exam paper. This step is the **participant-initiated** opt-in to outcome linking that the two-key architecture requires. Participants who opt in to research but decline to disclose their UUID remain in the cohort engagement dataset, but their exam scores cannot be linked to their engagement record; their data contributes to descriptive statistics but not to the correlation tests of §5.5.

### 5.4.5 Settling Window and Data Freeze

At the end of the cohort term, a **14-day settling window** allows the teacher to complete the CSV outcome upload and participants to submit any last-minute self-reports. The principal investigator does not inspect the engagement-vs-outcome relationship during this window — the teacher dashboard's correlation view is available throughout the cohort but the PI commits not to use it for inference decisions until the dataset is frozen.

At the end of the settling window, the analytic dataset is exported via the teacher dashboard's CSV interface as three files: `cohort_<code>_aggregates.csv` (per-student totals + outcomes), `cohort_<code>_timeseries.csv` (per-student per-day), and `cohort_<code>_derived.csv` (composite indices). This CSV bundle is the **frozen** analytic dataset; any subsequent server-side change (a late upload, a late withdrawal) is documented in a "post-freeze events" section of the thesis (Chapter 6) but does not modify the frozen dataset.

## 5.5 Analysis Plan

This section reproduces the OSF pre-registered analysis plan ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)) in narrative form. Any deviation from this plan in Chapter 6 will be explicitly flagged as a deviation from pre-registration, with full justification.

### 5.5.1 Primary Hypotheses

Four primary hypotheses are tested, with directional one-tailed predictions based on prior CALL literature on engagement and learning outcomes:

- **H1.** `total_active_minutes_real` correlates **positively** with `growth_delta`. *Rationale:* time-on-task is a robust predictor of learning gain in CALL literature [TODO: cite Hattie 2009 *Visible Learning*; Ericsson & Pool 2016 deliberate practice].
- **H2.** `total_cards_added_to_srs` correlates **positively** with `growth_delta`. *Rationale:* active card creation indicates the learner is processing and curating new material — a metacognitive engagement signal beyond raw exposure time.
- **H3.** `total_notes_created` correlates **positively** with `growth_delta`. *Rationale:* note-taking is an effortful retrieval-and-elaboration activity associated with deeper encoding [TODO: cite Mueller & Oppenheimer 2014 longhand vs laptop note-taking].
- **H4.** `srs_error_rate` correlates **negatively** with `growth_delta`. *Rationale:* higher error rate during practice indicates weaker recall; we expect an inverse relationship with overall learning gain.

All other ≈ 20 collected metrics are **exploratory**, not pre-registered for confirmatory testing.

### 5.5.2 Statistical Models

**Primary tests (bivariate Pearson correlation).** For each of H1–H4, we compute the Pearson product-moment correlation coefficient *r* between the engagement predictor and `growth_delta`, with a 95% confidence interval derived via the Fisher *z*-transformation (z′ = 0.5 × ln((1+r)/(1−r)); CI computed in *z*-space, then back-transformed to *r*-space).

**Confirmatory multiple linear regression (supplementary).** A single OLS regression jointly estimates the four predictors:

```
growth_delta ~ active_minutes_real + cards_added_to_srs + notes_created + srs_error_rate
              + [covariates if collected: pre_test_score, motivation, hours_per_week]
```

Reported outputs: standardized β coefficients with 95% CIs; omnibus R²; adjusted R² (small-N penalized); variance-inflation factors (VIF) for collinearity diagnosis. Interaction terms are **not** included — the sample size does not support interaction power.

### 5.5.3 Inference Criteria

All four primary hypotheses use **one-tailed tests** at Bonferroni-corrected α = 0.05 / 4 = 0.0125 per hypothesis. The decision rule:

- **"Directionally supported"** if (a) *r* is in the predicted direction, AND (b) the 95% CI excludes zero, AND (c) *p* < 0.0125.
- **"Directionally consistent but underpowered"** if *r* is in the predicted direction and the 95% CI overlaps zero (regardless of *p*-value). At the expected sample size, this is the most likely outcome for moderate effects.
- **"No evidence of large effect"** if *r* is small (|r| < 0.3) or in the wrong direction.

The 95% CI on *r* — not the *p*-value — is the **primary inferential statistic**. At N ≈ 10, a sample *r* = 0.5 yields a 95% CI of approximately [−0.10, 0.83]; this is descriptively informative about uncertainty in a way that a single *p*-value is not.

A null result on the four primary hypotheses is interpreted as **"no evidence of a large effect at this sample size"**, *not* as confirmation of the null hypothesis. We acknowledge "absence of evidence is not evidence of absence" explicitly throughout the results and discussion.

### 5.5.4 Multiple-Comparisons Control

Across the four primary hypotheses, Bonferroni correction sets α at 0.0125 per test. The choice of Bonferroni over false-discovery-rate methods (Benjamini-Hochberg) is justified by the small number of pre-registered tests (4) with strong directional prior predictions; Bonferroni's conservativeness is appropriate in this confirmatory regime. False-discovery control becomes more useful for high-dimensional screening, which is not the regime of the primary analysis.

The ≈ 20 exploratory metrics are **not** corrected for multiple comparisons because they are **not significance-tested at all** — they are reported with descriptive statistics and 95% CIs as effect-size estimates only. Any exploratory finding that looks compelling is reported as a **hypothesis for future confirmatory study**, never elevated retroactively to confirmatory status (the HARKing prohibition).

### 5.5.5 Tests of Model Assumptions

For each primary test and for the confirmatory regression, we report post-fit diagnostics as descriptive evidence, not as inferential gates:

- **Normality of residuals.** Shapiro-Wilk test + visual Q-Q plot.
- **Linearity.** Residuals-vs-fitted scatter with loess smoothing.
- **Homoscedasticity.** Breusch-Pagan test.
- **High-influence observations.** Cook's distance for each observation; values d > 4 / N flagged.
- **Multicollinearity** (regression only). VIF for each predictor; values > 5 flagged as concern.

Decision criteria contingent on diagnostic outcomes:

- If Shapiro-Wilk indicates non-normal residuals at small N, we additionally report Spearman ρ as a robust alternative alongside Pearson *r* (sensitivity check, not replacement).
- If Breusch-Pagan indicates heteroscedasticity, we additionally report Huber-White heteroscedasticity-consistent (HC3) standard errors for regression coefficients.
- If Cook's distance flags more than one high-influence observation in a sample of N = 10, we report the analysis both with and without the flagged observation(s) — never silently excluded.
- If all three of {normality, homoscedasticity, linearity} fail catastrophically AND robust methods diverge from primary in magnitude or direction, the affected hypothesis is downgraded from confirmatory to exploratory in the thesis, with the disagreement reported transparently. This downgrade is decided **before** seeing any of the primary effect sizes, based only on the assumption-test outcomes.

### 5.5.6 Statistical Power: Underpower as Design Constraint

At Bonferroni-corrected one-tailed α = 0.0125 and 80% conventional power [TODO: cite Cohen 1988 *Statistical Power Analysis for the Behavioral Sciences*]:

- N = 28 is required to detect r = 0.5 (medium effect).
- N = 14 is required to detect r = 0.7 (large effect).
- At expected N ≈ 10 (linked subsample), the study has 80% power only for r ≥ 0.78.

This underpower is not a bug; it is a **structural constraint** of single-ulpan-cohort diploma-scale research. We pre-register and conduct the empirical study at this sample size because:

1. The methodological contribution defended in Chapter 4 is independent of empirical outcome; the empirical study's role is demonstration that the architecture can be deployed and produce interpretable output, not statistical confirmation of CALL-engagement hypotheses.
2. Pre-registration at small N still protects against HARKing and multiple-comparison inflation, which are non-trivial risks regardless of power. The pre-registered analysis is auditable post-hoc against deviation.
3. Effect-size estimation with CI is informative even at small N — a wide CI is itself the right scientific report when the data does not support tight conclusions [TODO: cite Cumming 2014 *new statistics* on estimation framing].

We acknowledge that confirmatory inference at this size is fragile. Null findings are reported as "no evidence of large effect"; positive findings are reported with wide CIs that should be interpreted as effect-size estimates with substantial uncertainty, not as proven correlations. This framing is the central methodological commitment of the empirical chapter.

### 5.5.7 Data Inclusion and Exclusion

Inclusion: all participants who opted in to research mode, were enrolled in the recruiting cohort at study start, and produced ≥ 1 data upload during the cohort term. Age ≥ 18.

Exclusion criteria E1–E5 are defined in §5.2.2 and pre-registered before any data inspection. Outlier handling at the observation level:

- Per-metric values beyond ±3 SD from the cohort mean are reported separately but **not** excluded from primary analysis. At small N, outlier exclusion is too aggressive — a single exclusion can flip a correlation's sign or magnitude.
- Outlier impact is assessed via Spearman ρ (rank-based, outlier-resistant) reported alongside Pearson *r*.
- Cook's distance flags in regression are reported with sensitivity analyses both with and without the flagged observation.

Any post-hoc exclusion not covered by E1–E5 is explicitly flagged in the thesis as a deviation from pre-registration with full justification.

### 5.5.8 Missing Data Handling

- `pre_test_score` missing → `growth_delta` is null; fall back to `post_test_score` absolute as secondary outcome with explicit causal-direction caveat.
- `post_test_score` missing from all three paths (teacher CSV, self-report, calibrated quiz) → participant excluded from primary correlation per E4.
- Calibrated quiz score missing → tertiary outcome null for that participant; primary analyses on `growth_delta` proceed; quiz-specific validity checks drop that participant via pairwise listwise deletion.
- Engagement metrics cannot be missing for opted-in participants who uploaded ≥ 1 day. Zero values are kept as zero (zero engagement is a meaningful signal, not a missing-data event).
- Covariate missing → listwise-deleted from regression. If covariate missingness exceeds 30 %, the regression is rerun without covariates; this decision rule is committed before inspecting the magnitude of any covariate's effect.

**No imputation is applied**, by deliberate choice: at small N, imputation methods (mean substitution, regression imputation, multiple imputation via `mice`) introduce more uncertainty than they resolve. Honest reporting of N-with-data is preferred. Missingness rate is reported alongside primary analyses. If overall missingness rate on the primary outcome exceeds 30 %, the primary analyses are explicitly downgraded to "exploratory only" status in the thesis.

We acknowledge the Missing-Not-At-Random (MNAR) risk: participants who disengage from the app mid-course are also more likely to skip the exam or withdraw, which creates a selection bias on the linked subsample. The sensitivity analysis of §5.5.9 (linked-vs-opt-in distribution comparison) directly addresses this risk.

### 5.5.9 Sensitivity Analyses

- **Linked-vs-opt-in distribution comparison.** Per-metric engagement distributions are compared between the linked subsample (those who shared UUID with teacher) and the full opted-in cohort (without outcome data) via Kolmogorov-Smirnov test, reported descriptively. If the linked subsample is systematically more engaged, claims are scoped to the linked subsample only in the Discussion (Chapter 7).
- **Multi-device fragmentation.** Where manual UUID linking via `scripts/research/link_student_ids.js` is applied (only at participant request), primary results are reported both with and without manual linking applied.
- **Drift between last app use and exam.** Median days between `last_upload_date` and `exam_date` reported as descriptive context; longer drift may attenuate engagement-outcome correlation via forgetting-curve effects.
- **Spearman ρ alongside Pearson r.** Reported for each primary test as an outlier-resistant robustness check.

### 5.5.10 Exploratory Analyses

All ≈ 20 metrics not among the four primary hypotheses are exploratory, reported descriptively with effect size + 95% CI **without** significance testing. The full exploratory list is documented in the OSF pre-registration; key analyses include per-secondary-metric × `growth_delta` scatter plots, composite `engagement_score` × `growth_delta` (vs raw active minutes), `cards_added_to_srs / cards_exported_to_anki` ratio as mastery proxy, time-of-day distribution patterns, and per-day engagement trajectory patterns.

Compelling exploratory findings are explicitly labeled "exploratory, not confirmatory" in the thesis Discussion and proposed as hypotheses for future confirmatory studies. The HARKing prohibition is binding throughout.

## 5.6 Operationalization

This section provides operational definitions for the constructs measured by the study. Each definition is honest about what is and is not captured by the corresponding metric.

### 5.6.1 active_minutes_real

`active_minutes_real` is **operationally defined** as the sum of 30-second heartbeats emitted by the application while the browser tab is visible **AND** a user interaction (`keydown`, `click`, `pointerdown`, `scroll`, or `touchstart`) occurred within the preceding 5 minutes. Heartbeats fire on a 30-second interval; if no interaction has occurred for ≥ 5 minutes the heartbeat counter pauses (idle gate); if the tab is hidden (`visibilitychange`), heartbeats are suppressed; a single session is capped at 60 minutes maximum to prevent runaway counters.

This definition captures **interactive engagement**, not total exposure time. Specifically, **audio-only sessions without interaction are not counted** — a participant listening to a 10-minute Hebrew audio passage without scrolling, clicking, or typing will not accumulate `active_minutes_real`. This is a known under-counting for passive listening and is acknowledged here and in §5.9 Limitations.

The implementation lives in `public/index.html` lines 14430–14627 (`v3SessionStart` / `v3SessionHeartbeat` / `v3SessionEnd`) and `public/db/local-db.js` `getActiveMsReal()`. A manual stopwatch validation of this metric against three test sessions (≈ 10 minutes each) is recommended pre-pilot as part of the construct-validity check (audit Recommendation D5.3); the result, if performed, is reported in Chapter 6 alongside the cohort data.

### 5.6.2 SRS Metrics: Proxy Framing

`srs_error_rate = cards_again / cards_reviewed` measures the participant's review accuracy **in the in-app stub Trainer only**. Per `docs/SRS_STRATEGY_v3_2.md` (approved 2026-05-12), LinguistPro is the **creation and linkage** layer for SRS cards; Anki is the **recommended review** layer. Most participants who use SRS seriously will export their cards to Anki and review there, where their grades are not visible to the research server.

The diploma therefore reports `srs_error_rate` as a **proxy** for SRS engagement, with the explicit caveat that it captures only the secondary in-app review path. The complementary metric `cards_exported_to_anki / cards_added_to_srs` (mastery proxy) is reported as an exploratory secondary indicator of the participant's commitment to retaining material in a real review pipeline. Full retention validation is deferred to a future v3.4+ Anki Connect bidirectional sync.

### 5.6.3 growth_delta Formula and Null Handling

`growth_delta = post_test_score − pre_test_score`, computed deterministically from teacher-reported numerical scores. The expected scale is 0–100 (configurable per cohort via `cohort_meta.outcome_scale`).

Null handling:

- If `pre_test_score` is null → `growth_delta` is null → participant uses `post_test_score` absolute as secondary outcome (with explicit causal-direction caveat in the analyses).
- If `post_test_score` is null from all three paths → participant excluded per E4.
- If both are present but the scores are equal (zero growth) → `growth_delta = 0` is kept; this is a meaningful signal, not missingness.

The derived metric is computed at analysis time in the R notebook, not stored server-side, ensuring a single canonical formula. The OSF pre-registration locks this formula.

### 5.6.4 Multi-Device UUID Treatment

By design (decision §4.3.2), each device generates its own UUID. A participant using LinguistPro on a phone and a laptop appears in the dataset as **two participants** by default. This is a deliberate consequence of the per-device privacy architecture: no server-side identity mapping exists.

Participants who wish to be analyzed as a single observation can request manual linking out-of-band; the researcher then executes `scripts/research/link_student_ids.js` (see `docs/RESEARCHER_GUIDE.md §2.1.2`), which rewrites the cohort `.jsonl` files and `outcomes.csv` to map the secondary UUID to the primary, audited in `deletions.log`. Each manual linking decision is documented in the analysis notebook with date, reason, and verification method. Primary results are reported **both with and without** manual linking applied as a sensitivity check (§5.5.9).

### 5.6.5 Timezone Handling

All timestamps in the schema (`upload_ts`, `since_ts`, `events.ts`) are recorded in **UTC**, with day-level granularity for upload-level timestamps. The `time_of_day_histogram` uses UTC hours. For participants in IL (UTC+2/+3 depending on daylight savings), evening sessions may cross the UTC midnight boundary and be attributed to the following calendar day in the histogram and the daily-aggregate windows; this is an acknowledged minor distortion that does not affect cumulative metrics but does affect per-day breakdowns at the day boundary. Cohort-level patterns reported in the time-of-day analysis are interpreted with this caveat in mind.

## 5.7 Scope of Generalization

The study's findings are scoped to the population of which the cohort is a sample. Concretely:

- **Sampling unit**: students enrolled in a single ulpan teacher's group at study start; recruitment is opportunistic within that natural cohort.
- **Geographic scope**: wherever the teacher's students reside (the cohort may be in-person at a physical ulpan facility or online/remote depending on the teacher's instructional mode). No geographic data is captured per the privacy architecture, so the geographic scope is documented at the cohort level via teacher-supplied context, not via per-student capture.
- **L1 composition**: predominantly Russian-L1 speakers; HE-primary cohort deployment is gated on HE consent native review (`docs/HE_CONSENT_REVIEW_BRIEF.md`), which was pending at the time of writing.
- **CEFR level**: A2–B2 typical of adult ulpan groups.
- **App familiarity**: opted-in participants are systematically more app-friendly than the full ulpan group; the linked subsample is doubly so (opted in AND chose to share UUID with teacher). Generalization beyond the linked subsample is therefore restricted.
- **Outcome scale**: cohort-specific (`cohort_meta.outcome_scale`); the teacher's grading style influences the comparability of cross-cohort exam scores. Comparative claims across teachers are not supported by this design.

We do not claim generalization to (a) Hebrew learners in general, (b) ulpan students at other institutions, (c) participants without app affinity, or (d) different L1 populations. These restrictions are documented honestly because over-claiming generalization would be the dishonest path; the contribution of the study to broader CALL knowledge is via the methodological framework (Chapter 4), reusable for future studies, not via empirical generalization from this single cohort.

## 5.8 Ethics Operationalization

The ethical framework declared in §4.7 — Helsinki Declaration §22–32, GDPR Article 6(1)(a), and de-facto ethics oversight by the diploma supervisor `[имя руководителя]` — is operationalized in the procedure as follows:

- **Informed consent** is administered via the five-checkbox consent screen at first opt-in. Participants read the full template (`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`), check all five mandatory checkboxes, enter the cohort code, and confirm. The `acceptConsent(version)` call writes the consent timestamp and version to `localStorage.researchConsentVersion_v1`.
- **Voluntariness** is preserved by the opt-in default: participants who do not click consent are not enrolled, and the application functions identically for them. Withdrawal is one-click and complete.
- **Data minimization** (GDPR Art. 5(1)(c)) is operationalized by the schema validator's `FORBIDDEN_FIELDS` allow-list and the recursive deep-check (§4.4.1).
- **Right to erasure** (GDPR Art. 17) is operationalized by `deleteStudentFromCohort()` cascading delete (§4.4.2). Withdrawal removes all server-side records and clears local state unconditionally.
- **Supervisor oversight** is exercised throughout the cohort term; the supervisor `[имя руководителя]` reviews progress and is acknowledged in the thesis acknowledgements.
- **Auditable artifacts**: the consent template version per participant is logged with each upload; the OSF pre-registration timestamps the analysis plan; the `deletions.log` audits every withdrawal; the open-source codebase is available for external scrutiny.

A fuller IRB-style framework discussion appears in §4.7 and in the supporting `thesis/IRB_FRAMEWORK_DRAFT.md`.

## 5.9 Limitations of the Methodology

A full Discussion of threats to validity appears in Chapter 7. Here we preview the methodological limitations the design is known to carry:

**Statistical limitations.** Sample size N ≈ 8–15 (linked subsample N ≈ 5–12) is below conventional power thresholds for medium-effect detection. Pre-registered Bonferroni correction at α = 0.0125 further raises the effective detection floor. Confirmatory inference is fragile; effect-size estimation with wide CIs is the most informative reporting mode.

**Construct limitations.** `active_minutes_real` captures interactive engagement, not passive listening (§5.6.1). `srs_error_rate` measures the secondary in-app stub Trainer, not the primary Anki review path (§5.6.2). `growth_delta` requires teacher-reported `pre_test_score`; in cohorts without administered pre-tests, the fallback `post_test_score` absolute cannot support causal direction interpretation (§5.6.3).

**Selection bias.** Opt-in to research is voluntary, so the opt-in cohort is systematically more app-friendly than the full ulpan group. The linked subsample (those who additionally shared UUID with teacher) is doubly selected and may differ further from the opt-in cohort on conscientiousness and engagement dispositions. The sensitivity analysis of §5.5.9 directly addresses this bias.

**Hawthorne effect.** Participants know their behavior is measured (the transparency UI of §4.4.4 makes this visible); the very transparency creates observer-effects on behavior. This is an inherent cost of privacy-transparent design [TODO: cite Adair 1984 Hawthorne re-examination]. We accept it as a structural limitation of opt-in transparency-first research-mode.

**Confounding variables.** Motivation, prior Hebrew exposure, family support, age, and hours-per-week available for study are not measured server-side. The pre-registered regression can include covariates if a brief teacher-administered pre-cohort survey collects them, but teacher cooperation is not guaranteed.

**Single-cohort generalizability.** §5.7 documents the scope. The findings are not claimed to generalize beyond the linked subsample of this single cohort.

**Calibration of quiz instrument.** The Rasch 1PL diagnostic uses expert-judgement difficulty parameters at the time of writing; external ulpan-teacher review is pending. The quiz is therefore treated as a secondary outcome, not primary.

These limitations are documented honestly in the OSF pre-registration and the methodology because over-claiming the strength of the methods would be intellectually dishonest. Chapter 7 (Discussion) interprets them in the context of the obtained results.

## 5.10 Summary and Transition to Results

This chapter has operationalized the architectural commitments of Chapter 4 into a concrete empirical design: a single-cohort correlational study with four pre-registered primary hypotheses, Bonferroni-corrected α = 0.0125, effect-size-with-CI inference, and explicit acknowledgement of underpower as structural to the diploma-scale single-cohort setting. The procedure preserves the two-key split-knowledge architecture by indirect teacher-mediated recruitment and participant-initiated outcome linking. Operationalization is honest about what the metrics capture and do not capture. Ethics are framed within Helsinki + GDPR + supervisor-oversight and operationalized through code-level mechanisms (consent versioning, cascading deletion, schema-strict validation). Limitations are documented up-front rather than relegated to the Discussion alone.

Chapter 6 reports the obtained results — both confirmatory (the four primary hypotheses with effect sizes + CIs) and exploratory (the wider descriptive picture of engagement patterns and their relationships to outcome). The reader is invited to read Chapter 6's findings through the methodological lens established here: as effect-size estimates with uncertainty made visible by 95% confidence intervals, not as significance-test verdicts.

---

**End of Chapter 5.**
