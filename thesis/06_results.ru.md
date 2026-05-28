# Глава 6 — Результаты

> **Статус.** СТАБ — для заполнения post-pilot. Когорта не была recruited на момент написания. Эта глава существует как structured placeholder, так чтобы методологические обязательства Главы 5 были visibly threaded через к тому, где они будут reported. Каждая секция ниже carries явный маркер `[TODO: заполнить из cohort data]`.
> **Bilingual workflow.** RU mirror EN-канонического `thesis/06_results.md`. Sync invariant по `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Последнее обновление.** 2026-05-22 (stub создан).

---

## 6.1 Cohort attrition

`[TODO: заполнить post-pilot]` Reportировать total enrolled cohort N (от учителя), opt-in N (research-mode consent count), linked subsample N (те, кто шарил UUID с учителем И имеют non-null outcome), withdrawal N (те, кто issued DELETE в течение cohort term). Сравнить с Главы 5 §5.2.3 expected диапазонами (target N = 8–15; expected linked subsample N = 5–12).

## 6.2 Descriptive statistics когорты

`[TODO: заполнить post-pilot]` Для каждого слоя engagement-таксономии (Глава 5 §5.3.1) reportировать mean, SD, median, IQR, range по opted-in когорте. Включить time-of-day distribution patterns и audio replay distributions (Глава 5 §5.5.10 exploratory).

## 6.3 Результаты primary hypothesis tests (H1–H4)

`[TODO: заполнить post-pilot]` Для каждой pre-registered primary гипотезы reportировать Pearson r + 95% CI (Fisher z-transformation) на linked subsample. Применить decision rule из Главы 5 §5.5.3 (Directionally supported / Directionally consistent but underpowered / No evidence of large effect). Bonferroni-corrected α = 0.0125, one-tailed.

### 6.3.1 H1: `active_minutes_real` × `growth_delta`

`[TODO: заполнить post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.2 H2: `cards_added_to_srs` × `growth_delta`

`[TODO: заполнить post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.3 H3: `notes_created` × `growth_delta`

`[TODO: заполнить post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.4 H4: `srs_error_rate` × `growth_delta`

`[TODO: заполнить post-pilot]` r = ?; 95% CI = [?, ?]; p = ?. Decision rule outcome: ?

### 6.3.5 TOST equivalence tests (supplementary confirmatory, V5)

В соответствии с pre-registered supplementary analysis, объявленным в OSF deviation log §9.1 (V5 — TOST-SESOI), каждая из четырёх primary гипотез дополнительно проверяется на **эквивалентность** против pre-registered Smallest Effect Size Of Interest (SESOI_r = 0,5) при α = 0,00625 (строгий Bonferroni против 8 = 4 primary + 4 TOST тестов). Инструмент: `TOSTER::TOSTr()` (Lakens 2017); реализация в `scripts/research/tost_analysis.R`. Decision rule: 90% CI на r целиком в [−0,5, +0,5] **И** max(TOST p) < 0,00625 → «equivalent at SESOI = 0,5» (эффекты больше r = 0,5 исключены). Иначе → «not equivalent — нельзя исключить крупный эффект».

| Гипотеза | r (наблюдаемое) | 90% CI | TOST p (max) | Заключение |
|---|---|---|---|---|
| H1 active_minutes × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H2 cards_added_to_srs × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H3 notes_created × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H4 srs_error_rate × growth | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |

`[TODO: заполнить post-pilot]` Интерпретация: любое заключение «equivalent at SESOI = 0,5» переформулирует соответствующий нулевой primary-result в позитивное bounded-effect утверждение — «данные исключают эффекты больше r = 0,5 в обоих направлениях». Любое «not equivalent» означает, что данные одновременно совместимы и с эффектами больше ±0,5, и с эффектами близкими к нулю (честное признание underpowered дизайна). Мощность при N = 10, α = 0,00625, SESOI = 0,5 ≈ 78% — на границе конвенциональной достаточности.

### 6.3.6 Bayesian sensitivity analysis (supplementary exploratory, V1)

В соответствии с pre-registered supplementary analysis, объявленным в OSF deviation log §9.2 (V1 — PBSL), каждая из четырёх primary гипотез дополнительно анализируется через Bayesian posterior под тремя pre-registered приорами. Инструменты: `BayesFactor::correlationBF()` для default JZS Cauchy prior; `brms` / Stan для двух informative приоров. Реализация в `scripts/research/bayes_sensitivity.R`.

**Зафиксированные приоры** (по OSF §9.2):
- **Prior A (Flat/JZS).** Default `correlationBF` Cauchy prior.
- **Prior B (Skeptical).** ρ ~ N(0, 0,3²).
- **Prior C (Literature-anchored).** ρ ~ N(0,3, 0,2²).

| Гипотеза | Prior | Posterior median | 95% CrI | BF₁₀ vs ρ = 0 | P(ρ > 0 | data, prior) |
|---|---|---|---|---|---|
| H1 active_minutes × growth | A | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H1 active_minutes × growth | B | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H1 active_minutes × growth | C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H2 cards_added_to_srs × growth | A/B/C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H3 notes_created × growth | A/B/C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |
| H4 srs_error_rate × growth | A/B/C | `[TODO]` | `[TODO]` | `[TODO]` | `[TODO]` |

`[TODO: заполнить post-pilot]` Интерпретация: таблица — **артефакт prior-sensitivity**. Если posterior median / direction probabilities согласуются между тремя приорами, заключение prior-robust. Если расходятся — само расхождение информативно: оно bounds inferential strength любого single-prior posterior. **Никакой Bayes factor или posterior probability не promoted в confirmatory decision threshold**; это только supplementary exploratory analysis.

## 6.4 Confirmatory multiple regression

`[TODO: заполнить post-pilot]` Reportировать joint OLS-модель `growth_delta ~ active_minutes_real + cards_added_to_srs + notes_created + srs_error_rate + [covariates если собраны]`. Standardized β коэффициенты с 95% CI, omnibus R², adjusted R² (small-N penalized), VIF diagnostics для collinearity.

## 6.5 Тесты предположений модели

`[TODO: заполнить post-pilot]` По Главе 5 §5.5.5: Shapiro-Wilk на residuals, Breusch-Pagan на homoscedasticity, Cook's distance для high-influence observations, VIF для collinearity. Reportировать каждое как descriptive evidence (не как inferential gate). Note, какие assumption tests если какие-либо триггерили §5.5.5 decision criteria (Spearman ρ наряду с Pearson r, HC3 standard errors, with/without flagged observation analysis, понижение гипотезы с confirmatory до exploratory).

## 6.6 Sensitivity analyses

`[TODO: заполнить post-pilot]` По Главе 5 §5.5.9:

- **Linked-vs-opt-in distribution comparison** (Kolmogorov-Smirnov). Если linked subsample differs систематически от opt-in cohort, заключения scoped к linked subsample only.
- **Multi-device linking sensitivity**. Primary results и с, и без manual UUID linking applied.
- **Drift между last app use и exam**. Median days; commentary на potential forgetting-curve attenuation.
- **Spearman ρ наряду с Pearson r** для каждого primary test.

## 6.7 Exploratory findings

### 6.7.1 Multitrait-Multimethod конструкт вовлечения (V3 CVP)

В соответствии с pre-registered supplementary analysis, объявленным в OSF deviation log §9.4 (V3 — Construct-Validity Pluralism), вовлечение операционализируется через **три независимые метрики** с разными gates измерения, и их intercorrelation matrix reported как construct-validity anchor для §7.4 discussion ограничений конструкта `active_minutes_real`. Campbell & Fiske (1959) multitrait-multimethod framework применён на уровне одного trait («engagement») с тремя методами («interactive», «audio exposure», «text exposure»).

| Метрика | Источник событий | Что измеряет | Operational definition |
|---|---|---|---|
| `active_minutes_real` | 30s heartbeat + keyboard/click/pointerdown/scroll/touchstart | **Interactive engagement** (primary, OSF-locked) | `getActiveMsReal()` — сумма heartbeats с 5-min idle gate, 60-min session cap |
| `audio_exposure_minutes` | `play_audio` events с `duration_ms` | **Passive listening exposure** | `getAudioExposureMs()` — сумма audio_play_ms_total / 60000 |
| `text_exposure_minutes` | `text_open`/`text_close` пары с `duration_ms` | **Passive reading exposure** | `getTextExposureMs()` — сумма close dwell + 5-min imputation для orphan opens |

**Intercorrelation matrix (linked subsample).**

| | active_minutes | audio_exposure | text_exposure |
|---|---|---|---|
| active_minutes | 1.00 | `[TODO]` | `[TODO]` |
| audio_exposure | `[TODO]` | 1.00 | `[TODO]` |
| text_exposure | `[TODO]` | `[TODO]` | 1.00 |

`[TODO: заполнить post-pilot]` Pearson r per pair с 95% CI; Cronbach's α для unit-weighted z-composite; cross-metric consistency assertion (`active_minutes_real ≤ text_exposure_minutes`).

**Exploratory parallel regressions** (НЕ замена OSF-locked H1):

| Спецификация | r vs growth_delta | 95% CI | Notes |
|---|---|---|---|
| growth ~ active_minutes_real (OSF H1, primary) | `[TODO]` | `[TODO]` | Locked; reported в §6.3.1 |
| growth ~ audio_exposure_minutes | `[TODO]` | `[TODO]` | Exploratory only |
| growth ~ text_exposure_minutes | `[TODO]` | `[TODO]` | Exploratory only |
| growth ~ z-composite(all three) | `[TODO]` | `[TODO]` | Exploratory only |

`[TODO: заполнить post-pilot]` Интерпретация: если `active_minutes_real` коррелирует r > 0,85 с другими двумя метриками, construct gap §7.4 эмпирически узок. Если r < 0,5, gap широк, и H1 conclusions genuinely scoped к «**interactive** engagement × growth» — не к total exposure × growth. OSF-locked H1 result reported точно как pre-registered; V3 alternative specifications — descriptive context, никогда не significance-tested.

### 6.7.2 Другие exploratory findings

`[TODO: заполнить post-pilot]` Все ≈ 20 secondary метрик: per-metric × `growth_delta` scatter + Pearson r с 95% CI (descriptive only, no significance testing). Composite `engagement_score`, `cards_creation_to_export_ratio` (mastery proxy), time-of-day distributions, per-day engagement trajectory patterns, audio replay distributions. Compelling findings labeled «exploratory, not confirmatory» и proposed как гипотезы для future studies (HARKing prohibition binding).

## 6.8 Stopwatch validation `active_minutes_real` (если performed)

`[TODO: заполнить если performed pre-pilot]` По audit recommendation Главы 5 §5.6.1 три manual stopwatch test sessions (~10 минут каждая) compared против `getActiveMsReal()` output. Reportировать как descriptive validity check; отклонение в пределах ±10–15% considered acceptable.

## 6.9 Deviations от Pre-Registration

`[TODO: заполнить post-pilot]` Любое отклонение от OSF pre-registered analysis plan ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)) flagged здесь с полным justification'ом. Если deviations нет, note «None — analyses proceeded as pre-registered».

## 6.10 Post-Freeze Events

`[TODO: заполнить post-pilot]` Любые late uploads, late withdrawals, или late outcome submissions, occurring после data freeze, документируются здесь. Они не модифицируют frozen analytic dataset (Глава 5 §5.4.5), но reported для прозрачности.

## 6.11 Резюме

`[TODO: заполнить post-pilot]` Краткое restatement per-hypothesis decision-rule outcomes и descriptive engagement portrait когорты. Переход к Главе 7 Discussion.

---

**Конец Главы 6 (stub).** Ожидание cohort data.
