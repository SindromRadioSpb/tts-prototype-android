# Chapter 7 — Discussion

> **Status.** PARTIAL DRAFT — structure + limitations / threats / future-work sections fully drafted; result-interpretation sections placeholder pending Chapter 6 data.
> **Bilingual workflow.** EN canonical; RU mirror at `thesis/07_discussion.ru.md`. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Sources.** Chapter 5 §5.9 (limitations preview), Chapter 4 §4.5 (threat model), `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md`, OSF pre-registration.
> **Last updated.** 2026-05-22.

---

## 7.1 Overview

This chapter interprets the obtained empirical results reported in Chapter 6 in the context of the related work of Chapter 2 and the methodological commitments of Chapter 5. It also addresses the threats to validity that the design's structural constraints make inevitable, draws implications for CALL pedagogical practice and for privacy-preserving research design more broadly, and proposes directions for future confirmatory studies.

The discussion proceeds in three movements. The first (§7.2–§7.3) interprets the empirical findings against the four pre-registered hypotheses and against the related-work literature, with explicit framing as effect-size estimates with confidence intervals rather than as significance-test verdicts. The second (§7.4–§7.5) addresses threats to validity and methodological limitations made visible by the design's structural constraints. The third (§7.6–§7.8) draws implications for CALL pedagogical practice and for privacy-preserving research design more broadly, and proposes a research agenda for future confirmatory studies and architectural extensions.

## 7.2 Interpretation of Primary Findings

`[TODO: fill post-pilot — pending Chapter 6 results]` This section interprets each of the four primary hypothesis-test outcomes:

- **H1 (`active_minutes_real` ↑ → `growth_delta` ↑).** Outcome from Chapter 6 §6.3.1: `[TODO]`. Interpretation: `[TODO]`.
- **H2 (`cards_added_to_srs` ↑ → `growth_delta` ↑).** Outcome from Chapter 6 §6.3.2: `[TODO]`. Interpretation: `[TODO]`.
- **H3 (`notes_created` ↑ → `growth_delta` ↑).** Outcome from Chapter 6 §6.3.3: `[TODO]`. Interpretation: `[TODO]`.
- **H4 (`srs_error_rate` ↑ → `growth_delta` ↓).** Outcome from Chapter 6 §6.3.4: `[TODO]`. Interpretation: `[TODO]`.

Regardless of the specific outcomes, the interpretation will follow the Chapter 5 §5.5.3 decision-rule categories: a **directionally-supported** outcome is interpreted as "effect-size estimate consistent with literature predictions, with a wide confidence interval that should not be over-claimed"; a **directionally-consistent-but-underpowered** outcome is interpreted as "no inferential verdict; the effect-size estimate is informative as a point estimate"; a **no-evidence-of-large-effect** outcome is interpreted as "no evidence at this sample size, not as confirmation of the null hypothesis". The confirmatory multiple regression (Chapter 6 §6.4) is reported as joint-model evidence supplementary to the bivariate tests, not as a fifth confirmatory test.

## 7.3 Comparison with Related Work

`[TODO: partial fill — comparison with related-work findings depends on Chapter 6 data]` We compare the obtained effect-size estimates against the broader CALL literature on engagement-outcome relationships:

- Time-on-task as predictor of learning outcomes is well-established at large N [TODO: cite Hattie 2009 meta-analysis effect sizes; Cepeda et al. distributed practice]; our small-N estimate for H1 is interpreted against this anchor.
- The metacognitive-engagement framing of active SRS-card creation (as distinct from passive review) appears in the literature [TODO: cite metacognitive-engagement literature]; our H2 estimate contributes a small-N data point.
- Note-taking effect on encoding is documented in Mueller & Oppenheimer 2014 and follow-ups [TODO: cite Mueller & Oppenheimer 2014 longhand vs laptop]; our H3 estimate is interpreted against that anchor.
- SRS error rate as inverse predictor of retention is a less-studied direction in literature; our H4 estimate contributes a novel small-N data point.

A central interpretive frame: our study cannot adjudicate the literature's claims at large N; what it **can** do is report effect-size estimates **from a population (small-cohort adult ulpan) for which the literature provides sparse evidence**. The contribution is contributive evidence in an under-represented population, not confirmation of mainstream large-N CALL claims.

## 7.4 Threats to Validity

The pre-registered threats from Chapter 5 §5.9 are recapped here with their post-data assessment:

**Selection bias (opt-in cohort).** Participants who chose to opt in to research are systematically more app-friendly than non-participants in the same ulpan group. The sensitivity analysis of Chapter 6 §6.6 (linked-vs-opt-in Kolmogorov-Smirnov distribution comparison) `[TODO: cite the specific KS test outcome]` is the empirical check on whether this bias materially distorts conclusions. If the linked subsample is statistically distinguishable from the opt-in cohort on engagement distributions, conclusions are scoped to the linked subsample only.

**Hawthorne effect from transparency-first design.** Participants knew their behavior was measured; the transparency UI made the observation visible at any moment. This is an inherent cost of a privacy-transparent research-mode and is fundamentally not separable from the design's privacy commitment. We do not claim Hawthorne-free measurement [TODO: cite Adair 1984 Hawthorne re-examination]. The transparency-first design accepts this trade-off in exchange for participant trust and consent legibility.

**Construct validity of `active_minutes_real`.** The metric captures interactive engagement (heartbeats during visible-tab + recent-interaction state), not total exposure time. Passive listening — a meaningful study mode for ulpan students — is systematically under-counted. The corresponding effect-size estimates on H1 should be interpreted as "**interactive** engagement × growth", not as "total exposure × growth". Where a stopwatch validation was performed (Chapter 6 §6.8) `[TODO: cite stopwatch result]`, its result bounds the construct claim.

**Construct validity reframed via V3 multitrait-multimethod (V3 supplementary).** Per the pre-registered supplementary analysis declared in OSF deviation log §9.4 (Construct-Validity Pluralism), the construct gap is operationalized as an empirically-testable question rather than an unmeasured caveat. The V3 layer reports two new derived metrics — `audio_exposure_minutes` (passive listening proxy from `play_audio` events) and `text_exposure_minutes` (passive reading proxy from `text_open`/`text_close` events with 5-min imputation for orphan opens) — alongside the OSF-locked primary `active_minutes_real`. The Campbell & Fiske (1959) multitrait-multimethod intercorrelation matrix (Chapter 6 §6.7.1) [TODO: cite Campbell & Fiske 1959] provides an **empirical anchor** for the construct gap: if the three metrics intercorrelate at r > 0.85, the gap is narrow and H1 conclusions extend to total exposure as well; if r < 0.5, the gap is wide and H1 conclusions remain scoped to *interactive* engagement only. The V3 alternative specifications (growth ~ audio_exposure_minutes, growth ~ text_exposure_minutes, growth ~ z-composite) are reported as exploratory parallel regressions in §6.7.1; they do **NOT** replace the OSF-locked H1 primary test. Critically, the `active_minutes_real` operational definition is unchanged from the pre-registration — no mid-study construct drift, no pre-registration violation.

**SRS metrics as proxy for retention.** `srs_error_rate` measures the secondary in-app stub Trainer, not the primary Anki review path. The proxy framing is documented in Chapter 5 §5.6.2 and Chapter 3 §3.4.6; a fuller retention-validation study is deferred to a future v3.4+ Anki Connect sync (`docs/PRODUCT_COHESION_PLAN_v3_4.md`).

**Sample size underpower.** Discussed in Chapter 5 §5.5.6. The Bonferroni-corrected detectable effect at our expected linked subsample is r ≥ 0.78 — large effects only. Medium effects are not statistically detectable at this scale. We accept this as a structural feature of diploma-scale single-cohort research and report effect-size estimates with explicit confidence intervals rather than significance verdicts.

**Underpower reframed via TOST equivalence (V5 supplementary).** Per the pre-registered supplementary confirmatory analysis declared in the OSF deviation log §9.1, each primary hypothesis is additionally tested for equivalence against a Smallest Effect Size Of Interest (SESOI_r = 0.5) using Lakens 2017 TOST [TODO: cite Lakens 2017]. The reframing is honest about its scope: SESOI = 0.5 is the maximum bound testable at N = 10 with strict Bonferroni α = 0.00625. A null primary finding paired with an equivalent TOST outcome (90% CI on r entirely within ±0.5) is reported as a positive bounded-effect statement — "the data rule out effects larger than r = 0.5" — rather than as a vacuous "no evidence" verdict. A null primary finding paired with a *not-equivalent* TOST outcome remains the honest acknowledgement that the data are simultaneously consistent with large effects and with zero, exactly as Wasserstein and Lazar (2016) recommend ("absence of evidence is not evidence of absence"). Smaller SESOIs (r = 0.3, r = 0.2) are explicitly deferred to the V2 MCREMA multi-cohort framework where pooled N can support them.

**Bayesian prior sensitivity (V1 supplementary).** The pre-registered Bayesian sensitivity layer declared in OSF deviation log §9.2 reports posterior summaries under three locked priors — flat JZS, weak-informative skeptical N(0, 0.3²), and literature-anchored N(0.3, 0.2²). At N ≈ 10 the credible intervals are similar in width to Fisher-z confidence intervals; the value of the layer is **prior-sensitivity transparency**: any conclusion that survives all three priors is robust to prior choice, whereas any conclusion that depends on a single prior is appropriately weakened in the discussion. **No Bayes factor or posterior probability is promoted to a confirmatory decision rule**; this is descriptive supplementary evidence only.

**Multiple-comparisons inflation.** Mitigated by pre-registration: only four hypotheses are confirmatory; all other findings are explicitly framed as exploratory descriptive evidence without significance claims (Chapter 5 §5.5.4). The HARKing prohibition is binding throughout the analysis.

**Confounding variables.** Motivation, prior Hebrew exposure, hours-per-week available for study, family support, and age were not captured server-side per the privacy architecture's data-minimization principle. If the teacher administered a pre-cohort survey, partial regression with covariates is reported in Chapter 6 §6.4; otherwise, the corresponding interpretive caveat is invoked throughout.

**Single-cohort generalizability.** Chapter 5 §5.7 scopes generalization claims to the linked subsample of one teacher's cohort, predominantly Russian-L1 speakers at A2–B2 CEFR levels. Generalization beyond this scope is not claimed; future replication studies in different L1 populations and ulpan settings are proposed in §7.8.

**Insider threat from researcher.** Chapter 4 §4.5.3 acknowledges that an insider threat from the researcher themselves is not technically defended — only mitigated by open-source code and the open replication package that make collusion auditable in principle. The single-researcher diploma context (researcher = data analyst) magnifies this risk; we accept it as a structural constraint of the diploma-scale setting.

## 7.5 Methodological Limitations Made Visible

A key methodological commitment of this thesis is **honest acknowledgement of unaddressed threats**. We have not papered over the limitations of (a) the underpowered statistical design, (b) the construct restrictions of `active_minutes_real` and `srs_error_rate`, (c) the selection bias of opt-in linking, or (d) the absence of formal IRB oversight. These limitations are not failures of the design; they are explicit boundaries of its scope of applicability, documented up-front in the pre-registration and the methodology chapter.

A thesis that overclaims the strength of its evidence damages future researchers who attempt replication on the basis of mis-stated effect sizes. We prefer the discomfort of explicit underpower acknowledgement over the false comfort of significance-test verdicts that the data does not support. The methodological contribution of Chapter 4 is unaffected by — and indeed strengthened by — the honest acknowledgement of these empirical limitations.

## 7.6 Implications for CALL Pedagogical Practice

`[TODO: partial fill — depends on Chapter 6 findings]` Subject to the caveats of §7.4, our findings have the following potential implications for CALL pedagogical practice:

- If **H1** (active engagement → growth) is directionally supported, this contributes a small-cohort data point to a well-established large-N literature; the contribution is replication-grade evidence in an under-represented population (adult ulpan students at A2–B2 CEFR).
- If **H2** (SRS-card-creation → growth) is directionally supported, this is consistent with the metacognitive-engagement framing of the literature; the implication for teachers is that prompting students toward active card creation (rather than passive review) may matter pedagogically.
- If **H3** (notes → growth) is directionally supported, this is consistent with Mueller & Oppenheimer 2014 effects in a CALL context — that effortful note-taking activities support encoding.
- If **H4** (SRS error rate → growth) is directionally negative (lower errors → better growth), this supports the standard retention-practice interpretation; if **not** directionally negative, it raises questions about the in-app stub Trainer's calibration that warrant follow-up investigation.

We emphasize that any of these implications is contingent on the specific effect-size estimates and their confidence intervals; the wide CIs at small N mean that no single result will be the "deciding answer" — the study contributes evidence, not verdicts.

## 7.7 Implications for Privacy-Preserving Research Design

The methodological contribution of the thesis (Chapter 4) has several implications for future researchers designing privacy-preserving research-modes in educational technology:

**The two-key split-knowledge architecture is practical at small cohort sizes.** Our cohort size makes the linking-subsample bias visible, but the architecture itself — researcher knows UUID + metrics; teacher knows name + score; participant initiates the linking — is implementable with manageable engineering investment (~2,000 lines of code total). It does not require federated infrastructure or differential-privacy noise calibration.

**Schema-strict server-side validation is a practical lower-bound enforcement mechanism.** The recursive `FORBIDDEN_FIELDS` allow-list approach (Chapter 4 §4.4.1) is a thin layer of code that catches the most common privacy-leak vectors at the trust boundary, complementary to (not a replacement for) higher-formal techniques like differential privacy or federated learning.

**Transparency UIs operationalize the consent contract at runtime.** The preview-as-separate-section pattern (Chapter 4 §4.4.4) makes the consent contract visible to participants throughout the study, not just at the consent-screen moment. We hypothesize this contributes to trust and to retention of opted-in participants, though we have not measured this empirically in the present study; §7.8 proposes this as future research.

**Pre-registration at small N is still valuable.** Even at expected linked-subsample N = 5–12, pre-registration protects against HARKing and multiple-comparisons inflation, both of which are non-trivial risks regardless of statistical power. The OSF artifact (DOI 10.17605/OSF.IO/ZDV9J) is itself a contribution to the literature of pre-registration-at-small-N as a defensible methodological choice [TODO: cite small-N pre-registration literature if it exists].

**Open-source release amplifies the methodological contribution.** A privacy-preserving research-mode behind closed source would be unverifiable by independent researchers; the open-source codebase makes the design contribution falsifiable in the sense that any privacy claim has a corresponding code artifact that can be examined directly. Future researchers can fork, modify, criticize, or supersede the architecture without depending on our self-report of its properties.

## 7.8 Future Work

Several directions follow from this thesis:

**Multi-cohort random-effects meta-analysis — MCREMA (V2 supplementary; protocol-only at defense).** Per the pre-registered V2 protocol declared in OSF deviation log §9.3 and detailed in `thesis/META_ANALYSIS_PROTOCOL.md`, the empirically substantive path to closing the (a) underpower limitation of §7.5 is random-effects meta-analysis across K ≥ 3 future LinguistPro ulpan cohorts. The pre-registered estimator is REML via `metafor::rma()`; the pre-registered cumulative-evidence rule prohibits selective reporting of pooled-only or per-cohort-only results; the pre-registered deidentification policy (cohort_001/002/... labels) prevents indirect ulpan-class identification from the published meta-analytic CSV. At diploma defense K = 1, so this is **protocol contribution**, not executed analysis. The supporting infrastructure ships in v3.3.2 (cross-cohort CSV) plus this diploma's additions (`exportMetaAnalysisCsv()` in `public/js/teacher.js`, `scripts/research/meta_analysis.R`, simulation-verification `scripts/research/meta_analysis_smoke.R`). The K-curve simulation in the smoke fixture verifies that pooled 95% CI half-width narrows from ≈ 0.45 (K=3) to ≈ 0.28 (K=8) at true ρ = 0.4 — that curve **is** the MCREMA contribution. Subsequent researchers running cohort_002, cohort_003, ... can pool against this diploma's cohort_001 directly via the pre-registered protocol; the diploma's primary H1-H4 results enter the meta-analysis as the K = 1 anchor without any selective re-analysis.

**Anki Connect bidirectional sync (v3.4+).** Closing the in-app retention measurement gap that motivates the proxy framing of Chapter 5 §5.6.2 requires bidirectional sync with Anki; this is on the deferred v3.4 roadmap (`docs/PRODUCT_COHESION_PLAN_v3_4.md`).

**Empirical IRT recalibration of the diagnostic quiz.** The `ulpan_diagnostic_v1` instrument uses expert-judgement difficulty parameters at the time of writing. Once ≥ 30 cohort responses accumulate, an empirical Rasch recalibration can replace the expert-judgement parameters (`docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §6`).

**External ulpan-teacher review of the item bank.** A pre-launch checklist item (§7 of `docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md`) is the external review of the calibrated quiz items by a native Hebrew-speaking ulpan teacher. This is the gating constraint for full production-readiness of the quiz outcome.

**Transparency-UI retention study.** A controlled study comparing opt-in retention rates between a transparency-UI condition and a minimal-disclosure condition would empirically test the hypothesized trust-contribution of the preview-as-separate-section pattern. This is a researchable question on its own merits.

**Replication across L1 populations and ulpan types.** The current cohort is predominantly Russian-L1; replication in Arabic-L1, English-L1, Spanish-L1 cohorts would test the generalizability claims of §5.7.

**Cryptographic-hash-chain audit logging.** The `deletions.log` currently relies on hosting-infrastructure trust (`docs/THESIS_VALIDITY_AUDIT_2026_05_21.md §8.2 D6.6`). A Merkle-tree-style audit chain would harden this against compromised-admin tampering; this is PhD-tier work, deferred as future research.

**Federated multi-platform research infrastructure (Stage 5).** A public research platform vision — any researcher can run an opt-in study against the same opt-in architecture, with cross-platform federation enabling shared anonymized datasets without compromising per-cohort privacy invariants — is sketched in `ULPAN_RESEARCH_PLAN §5`. This is open-ended future work.

## 7.9 Concluding Statement

This chapter has interpreted the empirical findings of Chapter 6 against the literature of Chapter 2, addressed the threats to validity that the design's structural constraints make inevitable, drawn implications for CALL pedagogical practice and for privacy-preserving research design, and proposed an agenda for future research. The empirical contribution is contributive — a small-N data point in an under-represented population — and the methodological contribution is open-sourced infrastructure for future researchers at the intersection of privacy-preserving design and small-cohort educational research. Chapter 8 synthesizes the two contributions and projects them forward.

---

**End of Chapter 7.**
