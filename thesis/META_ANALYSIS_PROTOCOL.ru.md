# Протокол мета-анализа (MCREMA)

> **Сопровождающий документ к Главе 7 §7.8 диплома и OSF preregistration deviation log §9.3.**
> **Вариант.** V2 — Multi-Cohort Random-Effects Meta-Analysis из roadmap'а премиального стека.
> **Статус на момент защиты диплома (2026-05-22).** Протокол объявлен; K = 1 когорта; **выполнение отложено** до future K ≥ 3.
> **Сопровождающая реализация.** `scripts/research/meta_analysis.R` + `scripts/research/meta_analysis_smoke.R` + `public/js/teacher.js` (`exportMetaAnalysisCsv`).
> **Bilingual workflow.** RU mirror EN-канонического `thesis/META_ANALYSIS_PROTOCOL.md`.

---

## §1. Назначение и locking statement

Этот протокол pre-registers random-effects meta-analytic процедуру, применяемую когда ≥ 3 ulpan-когорт LinguistPro завершили эмпирическое корреляционное исследование, описанное в `thesis/05_methodology.md`. Протокол **зафиксирован** на 2026-05-22: любое последующее изменение estimator'а, отчётности по гетерогенности, minimum-K правила, cumulative-evidence правила, или политики деидентификации составляет нарушение pre-registration и должно быть зафиксировано как documented deviation в OSF deviation log **до** выполнения какого-либо pooled analysis.

Single-cohort диплом (защита 2026) отгружает:

- Этот документ протокола (`thesis/META_ANALYSIS_PROTOCOL.ru.md`).
- Деидентифицированный summary-export функция (`public/js/teacher.js → exportMetaAnalysisCsv`).
- R-pipeline для pooling (`scripts/research/meta_analysis.R`).
- K-curve simulation verification (`scripts/research/meta_analysis_smoke.R`).
- Future-work positioning в диссертации §7.8 и §8.4.

Диплом **не** отгружает pooled meta-analytic result. На момент защиты K = 1; протокол ждёт future cohorts.

## §2. Estimator: REML

Pooled effect вычисляется через **Restricted Maximum Likelihood (REML)**, как реализовано в `metafor::rma(yi, sei, method = "REML")` (Viechtbauer 2010). REML выбран над DerSimonian-Laird по двум причинам:

1. **Bias.** При малом K (3–8 когорт) DerSimonian-Laird недооценивает between-study variance τ²; REML less biased в этом регионе (Veroniki et al. 2016).
2. **Convergence stability.** Likelihood surface REML well-behaved при малом K relative к maximum-likelihood, чей variance estimator может схлопнуться к нулю.

DerSimonian-Laird запускается как **sensitivity check** рядом с REML; если два estimator'а disagree больше чем на ±0,10 в pooled r, разногласие reported как sensitivity finding.

Effect-size measure — Pearson r, transformed в Fisher z через `atanh()`. Pooling происходит в z-space (где within-cohort sampling distribution approximately Normal). Pooled z и его 95% CI back-transformed в r-space через `tanh()` для отчётности.

## §3. Отчётность по гетерогенности

Каждый pooled analysis reports:

- **τ² (tau-squared).** Estimated between-cohort variance true effects. Point estimate + 95% CI (через Q-profile method для K ≥ 4; для K = 3 только point estimate с явным caveat).
- **I² (I-squared).** Процент total variance, относимый к between-cohort heterogeneity, а не к within-cohort sampling error. Интерпретируется по Higgins et al. 2003: 25% низкая, 50% умеренная, 75% высокая.
- **Cochran Q test.** Q-statistic + p-value для null-гипотезы «все true effects идентичны». Reported как descriptive evidence; **не** используется как gating threshold.

Если I² > 75% или Q-test p < 0,10, pooled estimate reported с high-heterogeneity caveat, и per-cohort estimates подчёркиваются в interpretation. Subgroup analyses по cohort-характеристикам (size, L1 composition, ulpan type) **не** pre-registered; это была бы post-hoc exploration.

## §4. Minimum K rule

**Pooled meta-analytic estimate** reported только когда **K ≥ 3 когорт** с `n_linked ≥ 5` per cohort contributed. Ниже этого порога:

- Per-cohort r и Fisher-z estimates reported descriptively.
- Pooled r не вычисляется, pooled CI не вычисляется, τ² не вычисляется, I² не вычисляется.
- Forest plot может быть rendered для визуализации, но labeled «descriptive — слишком мало когорт для pooled inference».

Это minimum-K rule — defensible-floor конвенция; меньший K severely дестабилизирует τ² estimation (Borenstein et al. 2009).

## §5. Cumulative-evidence rule (anti-HARKing)

Для каждого выполненного мета-анализа:

1. **Per-cohort results reported в полном объёме** наряду с pooled result. Нулевое findings в cohort_001 plus positive findings в cohort_002 reported как два отдельных per-cohort effect-size estimates с confidence intervals, а не как single pooled estimate.
2. **Pooled results reported в полном объёме** когда K ≥ 3, включая pooled r, 95% CI, τ², I², Q. Даже null findings reported; даже противоречивые findings reported.
3. **Selective reporting only-pooled или only-per-cohort не разрешается.** Автор commits к reporting обоих слоёв в любой thesis или publication, которая использует MCREMA pipeline.

Это rule binding на protocol-deployer'а и enforced layout'ом `scripts/research/meta_analysis.R`, который producing и per-cohort forest-plot entries, и pooled-row output как single non-separable artifact.

## §6. Протокол деидентификации

Cohort labels в meta-analytic CSV (`meta_analysis_summary_YYYY-MM-DD.csv`) НЕ являются human-readable `cohort_code`. Они — `cohort_001`, `cohort_002`, … assigned **at export time** через сортировку loaded cohort_codes alphabetically и sequential indexing. Mapping:

- **Детерминирован** для данного набора когорт в данной загрузке teacher dashboard.
- **Не-обратим** без доступа к локальному `localStorage.teacherDashCohorts_v2` ordering учителя — meta-analytic CSV сам по себе не может быть linked обратно к specific ulpan classes.
- **Стабилен по re-exports** из того же cohort set на той же машине (cohort_codes сортируются; same input → same labels).

Эта деидентификация предотвращает indirect identification specific ulpan teachers, classes, или schools published meta-analytic CSV даже если cohort labels сами по себе public.

Per-cohort k = 5 anonymity gate уже operates upstream от этого export: cohorts с `n_linked < 5` emit suppression-marker row (`k_anonymity_met = 0`) без any статистики.

## §7. K-curve simulation verification

MCREMA protocol's claim — что random-effects meta-analysis substantively narrows pooled CI при росте K — verified симуляцией в `scripts/research/meta_analysis_smoke.R`. Симуляция:

1. Sets true population ρ = 0,4 (small-to-moderate effect, representative CALL engagement-outcome литературы).
2. Generates K когорт N = 10 каждая, computing per-cohort sample r и Fisher-z SE.
3. Runs `metafor::rma(method = "REML")` и back-transforms к pooled r + 95% CI.
4. Repeats 20 раз per K для estimate median pooled-r и median pooled-CI half-width.

Ожидаемые результаты:

| K | Median pooled-CI half-width | Интерпретация |
|---|---|---|
| 3 | ≈ 0,45 | Маргинально; pooled estimate barely more informative than single cohort |
| 5 | ≈ 0,35 | Substantively narrower |
| 8 | ≈ 0,28 | Informative about literature-anchor regime r ≈ 0,4 |

K-curve — verification artifact MCREMA's claim. Reported в этом protocol document и как §7.8 figure в thesis discussion.

## §8. Статус: K = 1 на момент защиты диплома

На момент защиты диплома (2026), только одна когорта expected to have completed исследование. Consequently:

- MCREMA protocol **объявлен** и **зарегистрирован**, но **не выполнен**.
- Эмпирическая глава диплома (Глава 6) reports single cohort's Pearson r per hypothesis с Fisher-z 95% CI, **не** какой-либо pooled meta-analytic statistic.
- Диссертация §7.8 и §8.4 positions MCREMA как future-work infrastructure: subsequent researchers, running future cohorts LinguistPro исследования, могут pool против этого исследования через `meta_analysis.R` и pre-registered protocol выше.
- Методологический вклад диплома (Глава 4 — privacy-preserving research-mode архитектура) независим от MCREMA execution. Протокол enriches future-work landscape без зависимости от него для защиты.

Full execution MCREMA awaits cohort_002, cohort_003, … в post-diploma future.

---

**Статус-лог.**

- 2026-05-22 — Протокол составлен как часть V2 (MCREMA) реализации в roadmap премиального стека. R-скрипты + teacher.js export-функция shipped рядом. Статус: K = 1, выполнение отложено.
