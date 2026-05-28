# Meta-Analysis Protocol (MCREMA)

> **Companion document to thesis Chapter 7 §7.8 and OSF preregistration deviation log §9.3.**
> **Variant.** V2 — Multi-Cohort Random-Effects Meta-Analysis of the premium-stack roadmap.
> **Status at diploma defense (2026-05-22).** Protocol declared; K = 1 cohort; **execution deferred** to future K ≥ 3.
> **Companion implementation.** `scripts/research/meta_analysis.R` + `scripts/research/meta_analysis_smoke.R` + `public/js/teacher.js` (`exportMetaAnalysisCsv`).
> **Bilingual workflow.** EN canonical; RU mirror at `thesis/META_ANALYSIS_PROTOCOL.ru.md`.

---

## §1. Purpose and locking statement

This protocol pre-registers the random-effects meta-analytic procedure to be applied when ≥ 3 LinguistPro ulpan cohorts have completed the empirical correlational study described in `thesis/05_methodology.md`. The protocol is **locked** as of 2026-05-22: any subsequent change to the estimator, heterogeneity reporting, minimum-K rule, cumulative-evidence rule, or deidentification policy constitutes a pre-registration violation and must be filed as a documented deviation in the OSF deviation log before any pooled analysis is executed.

The single-cohort diploma (defense 2026) ships:

- This protocol document (`thesis/META_ANALYSIS_PROTOCOL.md`).
- The deidentified-summary export function (`public/js/teacher.js → exportMetaAnalysisCsv`).
- The R pooling pipeline (`scripts/research/meta_analysis.R`).
- The K-curve simulation verification (`scripts/research/meta_analysis_smoke.R`).
- Future-work positioning in thesis §7.8 and §8.4.

The diploma **does not** ship a pooled meta-analytic result. At defense K = 1; the protocol awaits future cohorts.

## §2. Estimator: REML

The pooled effect is computed via **Restricted Maximum Likelihood (REML)** as implemented by `metafor::rma(yi, sei, method = "REML")` (Viechtbauer 2010). REML is chosen over DerSimonian-Laird for two reasons:

1. **Bias.** At small K (3-8 cohorts) DerSimonian-Laird underestimates between-study variance τ²; REML is less biased in this regime (Veroniki et al. 2016).
2. **Convergence stability.** REML's likelihood surface is well-behaved at small K relative to maximum-likelihood, whose variance estimator can collapse to zero.

DerSimonian-Laird is run as a **sensitivity check** alongside REML; if the two estimators disagree by more than ±0.10 in pooled r, the disagreement is reported as a sensitivity finding.

The effect-size measure is Pearson r transformed to Fisher z via `atanh()`. Pooling occurs in z-space (where the within-cohort sampling distribution is approximately Normal). The pooled z and its 95% CI are back-transformed to r-space via `tanh()` for reporting.

## §3. Heterogeneity reporting

Every pooled analysis reports:

- **τ² (tau-squared).** Estimated between-cohort variance of true effects. Point estimate + 95% CI (via Q-profile method for K ≥ 4; for K = 3, point estimate only with explicit caveat).
- **I² (I-squared).** Percentage of total variance attributable to between-cohort heterogeneity rather than within-cohort sampling error. Interpreted per Higgins et al. 2003: 25% low, 50% moderate, 75% high.
- **Cochran Q test.** Q-statistic + p-value for null hypothesis "all true effects are identical". Reported as descriptive evidence; **not** used as a gating threshold.

If I² > 75% or Q-test p < 0.10, the pooled estimate is reported with a high-heterogeneity caveat, and per-cohort estimates are emphasized in interpretation. Subgroup analyses by cohort characteristics (size, L1 composition, ulpan type) are **not** pre-registered; they would constitute post-hoc exploration.

## §4. Minimum K rule

A **pooled meta-analytic estimate** is reported only when **K ≥ 3 cohorts** with `n_linked ≥ 5` per cohort have contributed. Below this threshold:

- The per-cohort r and Fisher-z estimates are reported descriptively.
- No pooled r, no pooled CI, no τ², no I² are computed.
- The forest plot may be rendered for visualization but is labeled "descriptive — too few cohorts for pooled inference".

This minimum-K rule is a defensible-floor convention; smaller K severely destabilizes τ² estimation (Borenstein et al. 2009).

## §5. Cumulative-evidence rule (anti-HARKing)

For every executed meta-analysis:

1. **Per-cohort results are reported in full** alongside the pooled result. A null finding in cohort_001 plus a positive finding in cohort_002 is reported as two separate per-cohort effect-size estimates with confidence intervals, not as a single pooled estimate.
2. **Pooled results are reported in full** when K ≥ 3, including pooled r, 95% CI, τ², I², Q. Even null findings are reported; even contradictory findings are reported.
3. **No selective reporting of pooled-only or per-cohort-only results is permitted.** The author commits to reporting both layers in any thesis or publication that uses the MCREMA pipeline.

This rule is binding on the protocol-deployer and is enforced by the layout of `scripts/research/meta_analysis.R`, which produces both per-cohort forest-plot entries and pooled-row output as a single non-separable artifact.

## §6. Deidentification protocol

Cohort labels in the meta-analytic CSV (`meta_analysis_summary_YYYY-MM-DD.csv`) are NOT the human-readable `cohort_code`. They are `cohort_001`, `cohort_002`, … assigned **at export time** by sorting the loaded cohort_codes alphabetically and indexing sequentially. The mapping is:

- **Deterministic** for a given set of cohorts in a given teacher dashboard load.
- **Non-reversible** without access to the teacher's local `localStorage.teacherDashCohorts_v2` ordering — the meta-analytic CSV alone cannot be linked back to specific ulpan classes.
- **Stable across re-exports** from the same cohort set on the same machine (the cohort_codes are sorted; same input → same labels).

This deidentification prevents a published meta-analytic CSV from indirectly identifying specific ulpan teachers, classes, or schools, even if the cohort labels themselves are public.

The per-cohort k = 5 anonymity gate already operates upstream of this export: cohorts with `n_linked < 5` emit a suppression-marker row (`k_anonymity_met = 0`) without any statistics.

## §7. K-curve simulation verification

The MCREMA protocol's claim — that random-effects meta-analysis substantively narrows the pooled CI as K grows — is verified by simulation in `scripts/research/meta_analysis_smoke.R`. The simulation:

1. Sets true population ρ = 0.4 (a small-to-moderate effect representative of CALL engagement-outcome literature).
2. Generates K cohorts of N = 10 each, computing per-cohort sample r and Fisher-z SE.
3. Runs `metafor::rma(method = "REML")` and back-transforms to pooled r + 95% CI.
4. Repeats 20 times per K to estimate median pooled-r and median pooled-CI half-width.

Expected results:

| K | Median pooled-CI half-width | Interpretation |
|---|---|---|
| 3 | ≈ 0.45 | Marginal; pooled estimate barely more informative than single cohort |
| 5 | ≈ 0.35 | Substantively narrower |
| 8 | ≈ 0.28 | Informative about the literature-anchor regime of r ≈ 0.4 |

The K-curve is the verification artifact of MCREMA's claim. It is reported in this protocol document and as a §7.8 figure in the thesis discussion.

## §8. Status: K = 1 at diploma defense

At the time of diploma defense (2026), only one cohort is expected to have completed the study. Consequently:

- The MCREMA protocol is **declared** and **registered** but **not executed**.
- The diploma's empirical chapter (Chapter 6) reports the single cohort's Pearson r per hypothesis with Fisher-z 95% CI, **not** any pooled meta-analytic statistic.
- Thesis §7.8 and §8.4 position MCREMA as future-work infrastructure: subsequent researchers running future cohorts of the LinguistPro study can pool against this study using `meta_analysis.R` and the pre-registered protocol above.
- The diploma's methodological contribution (Chapter 4 — privacy-preserving research-mode architecture) is independent of MCREMA execution. The protocol enriches the future-work landscape without depending on it for defense.

The full execution of MCREMA awaits cohort_002, cohort_003, … in the post-diploma future.

---

**Status log.**

- 2026-05-22 — Protocol drafted as part of V2 (MCREMA) implementation in the premium-stack roadmap. R scripts + teacher.js export function shipped alongside. Status: K = 1, execution deferred.
