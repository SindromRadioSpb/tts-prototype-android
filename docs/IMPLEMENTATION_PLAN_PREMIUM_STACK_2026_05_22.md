# План реализации — Премиальный stack {V5 + V3 + V1 + V2}

> **Назначение.** Формализованный план реализации полного 4-вариантного стека из утверждённого design proposal (`C:\Users\lletp\.claude\plans\iterative-whistling-sky.md`, 2026-05-22). Цель — не потерять контекст по каждому элементу при выполнении в одной сессии.
>
> **Объём.** ~13-14 рабочих дней по оценке, выполняется в одной длинной сессии.
>
> **Дата начала.** 2026-05-22.
>
> **Tripwires (общие для всех вариантов):**
> - НЕ изменять primary OSF-locked H1-H4 тесты. Все добавления — supplementary.
> - НЕ изменять `FORBIDDEN_FIELDS` в `research/validate.js`. Только `ALLOWED_METRIC_KEYS` (V3).
> - НЕ бампить `CONSENT_VERSION` (всё в рамках уже согласованного envelope).
> - НЕ запускать R-скрипты (R/RStudio не установлен в окружении; скрипты пишутся как deliverable, проверяются smoke-фикстурами в коде).
> - Atomic dual update EN+RU для thesis-секций per `docs/THESIS_BILINGUAL_WORKFLOW.md`. Для R-скриптов и кодовых правок RU mirror не нужен (это код, не thesis body).
> - GLOSSARY обновляется один раз в конце (батч из ~30 терминов).
> - Closure plan §6 status log обновляется один раз в конце.

---

## Очередность исполнения

V5 (самый малый, нулевые риски) → V3 (умеренные правки кода) → V1 (аналитика, без кода в приложении) → V2 (самый большой, future-work foundation).

После каждого варианта — короткий статус-репорт. Финал — consolidated GLOSSARY + closure plan + memory updates.

---

## Подготовительная фаза (read-only)

Перед стартом V5 — параллельные чтения для определения exact insertion points:

| Файл | Что нужно знать | Использует вариант |
|---|---|---|
| `thesis/OSF_PREREGISTRATION_DRAFT.md` | Структура deviation log (где-то ближе к концу или в footer); section §6 "Other" | V5, V1, V2 |
| `thesis/06_results.md` §§6.3, 6.5, 6.6 | Точки вставки для TOST (§6.3.x), CVP multitrait-multimethod (§6.5), Bayesian (§6.6) | V5, V3, V1 |
| `thesis/07_discussion.md` §§7.4, 7.5, 7.8 | Equivalence-test reframing (§7.4/7.5), MCREMA + WSLR future work (§7.8) | V5, V3, V2 |
| `public/db/local-db.js` строки 1580-1745 | `getActiveMsReal()` структура и pattern для добавления `getAudioExposureMs()`, `getTextExposureMs()` | V3 |
| `research/validate.js` строки 56-110 | `ALLOWED_METRIC_KEYS` Set, `validateMetrics` функция | V3 |
| `public/js/research.js` строки 270-460 | `_aggregateForRange()` daily aggregator — где emit'ить новые поля | V3 |
| `public/js/teacher.js` cross-cohort CSV export area | `LS.cohorts_v2`, cross_cohort_aggregates CSV emit pattern | V2 |
| `thesis/GLOSSARY.md` | header + tail для одного финального append | все |
| `docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md` §6 status log | финальный status entry | все |

---

## V5 — TOST-SESOI (Equivalence Testing)

**Цель.** Переформатировать «no evidence of effect» в «evidence of no large effect (r > 0,5)» через Lakens 2017 TOST. Не дополнительная мощность, а семантический переформат + новая статья в deviation log.

**Pre-registered parameters (lock BEFORE any analysis):**
- SESOI = 0,5 (smallest effect size of interest, large-effect upper bound)
- α = 0,00625 (Bonferroni against 8 = 4 H + 4 TOST tests)
- One-sided equivalence test per Lakens 2017 §3
- Power ≈ 78% at N=10 vs SESOI=0,5

**Файлы-результаты:**

1. **`scripts/research/tost_analysis.R`** (NEW, ~80 LOC)
   - Read frozen analytic CSV path как параметр командной строки
   - Прогон `TOSTER::TOSTr()` для каждой из 4 пар (H1: active_minutes × growth; H2: cards_srs × growth; H3: notes × growth; H4: srs_error × growth)
   - Output: tab-separated table {hypothesis, n, r, lower_90ci, upper_90ci, sesoi_bound, equivalence_pvalue, conclusion}
   - Comment header documenting SESOI choice, Bonferroni rationale, expected power
   - Smoke fixture (inline): simulate r=0.2 at N=10, verify TOSTER call doesn't error

2. **`thesis/OSF_PREREGISTRATION_DRAFT.md`** (EDIT) — добавить deviation-log secция:
   - "## Deviation Log" в конце файла
   - Entry 2026-05-22 — Supplementary TOST-SESOI analysis declared
   - SESOI = 0,5 locked
   - α = 0,00625 locked

3. **`thesis/06_results.md`** (EDIT) — добавить §6.3.5 после §6.3.4:
   - Placeholder для TOST results: `[TODO: fill post-pilot]`
   - Per-hypothesis row: TOST 90% CI, equivalence p, conclusion (equivalent / not-equivalent / inconclusive)

4. **`thesis/06_results.ru.md`** (EDIT, mirror) — same insertion point in RU

5. **`thesis/07_discussion.md` §7.4 / §7.5** (EDIT) — добавить параграф про equivalence-test reframing of null findings

6. **`thesis/07_discussion.ru.md`** (EDIT, mirror)

**Trade-offs:**
- ✅ Cheapest, ноль кода, highest defendability per hour
- ⚠ SESOI = 0,5 сам по себе — большой эффект; не закрывает underpower
- ⚠ Должен быть pre-declared в OSF deviation log до анализа

**Verification (V5):**
- R-script compiles без ошибок (syntactic-only check — не запускаем)
- Заголовок R-скрипта документирует SESOI/α
- Deviation log entry присутствует в OSF prereg draft
- 06_results §6.3.5 + 07_discussion §7.4/7.5 показывают equivalence-test framing

---

## V3 — CVP (Construct-Validity Pluralism)

**Цель.** Закрыть construct gap `active_minutes_real` через multitrait-multimethod отчётность 3-х независимых метрик engagement.

**Решение по 3a vs 3b:** Выбран вариант 3b — НЕ изменяем `v3SessionMarkActivity()` из аудио-воспроизведения (это было бы pre-registration violation мid-study). Эмитируем `audio_exposure_minutes` и `text_exposure_minutes` как отдельные новые метрики.

**Файлы-результаты:**

1. **`public/db/local-db.js`** (EDIT, ~80 LOC)
   - Добавить `getAudioExposureMs()` рядом с `getActiveMsReal()` (~строка 1645):
     - SQL: `SELECT SUM(json_extract(payload_json, '$.duration_ms')) FROM events WHERE event_type = 'play_audio' AND ts >= ?`
     - Возвращает миллисекунды; вызывающая сторона делит на 60000
   - Добавить `getTextExposureMs()`:
     - SQL: для каждой пары `text_open` → `text_close` суммируем `text_close.duration_ms` (carry в payload_json)
     - Handle orphan opens (text_open without text_close) через 5-min default imputation
     - Документировать caveat в JSDoc

2. **`research/validate.js`** (EDIT, ~строки 56-90)
   - В `ALLOWED_METRIC_KEYS`: добавить `'audio_exposure_minutes'`, `'text_exposure_minutes'`
   - В `validateMetrics()` функции — добавить два новых int validation в `intMetrics` list

3. **`public/js/research.js`** (EDIT, daily aggregator)
   - В `_aggregateForRange()` (~строки 270-460): после `audio_play_ms_total` вычислить и emit'ить:
     - `audio_exposure_minutes` = `Math.round(audio_play_ms_total / 60000)` (тривиально, без отдельного query)
     - `text_exposure_minutes` = `Math.round((await ldb.getTextExposureMs({sinceIso})) / 60000)`
   - Добавить в `metrics` payload Layer 2

4. **`thesis/06_results.md`** §6.5 (EDIT) — добавить multitrait-multimethod intercorrelation matrix placeholder

5. **`thesis/06_results.ru.md`** §6.5 (EDIT, mirror)

6. **`thesis/07_discussion.md`** §7.4 (EDIT) — добавить параграф про CVP empirical anchor for construct gap

7. **`thesis/07_discussion.ru.md`** §7.4 (EDIT, mirror)

8. **`thesis/05_methodology.md`** §5.6.1 (EDIT) — добавить parenthetical note о V3 supplementary measures (audio_exposure_minutes, text_exposure_minutes), без изменения primary definition

9. **`thesis/05_methodology.ru.md`** §5.6.1 (EDIT, mirror)

**Trade-offs:**
- ✅ Closes construct gap (b) directly through multitrait-multimethod canonical framework
- ✅ Use already-collected data (audio_play_ms_total existing; text_open/close existing)
- ⚠ Не повышает мощность H1 confirmatory
- ⚠ Три метрики будут highly correlated (r > 0,7)
- ⚠ Per RESEARCH_CONSENT_RULE Q5 — это cosmetic change (новые derived metrics из уже согласованных событий) → no CONSENT_VERSION bump. Документируем decision tree walk в comment

**Verification (V3):**
- `local-db.js` exports two new functions с корректными SQL и JSDoc
- `validate.js` accepts new metric fields
- `research.js` aggregator emit'ит новые поля
- Thesis sections показывают multitrait-multimethod framing

---

## V1 — PBSL (Pre-registered Bayesian Sensitivity Layer)

**Цель.** Добавить prior-sensitivity отчётность под 3 приорами (flat, weak-informative skeptical, literature-anchored) — secondary supplementary analysis после frozen dataset.

**Pre-registered priors (lock BEFORE analysis):**
- **Prior A (flat):** uniform on [-1, 1]
- **Prior B (skeptical):** N(0, 0,3²) — weak-informative centered at zero
- **Prior C (literature-anchored):** N(0,3, 0,2²) — based on Hattie 2009-style time-on-task meta-effects in CALL

**Файлы-результаты:**

1. **`scripts/research/bayes_sensitivity.R`** (NEW, ~120 LOC)
   - Read frozen analytic CSV path
   - Прогон `BayesFactor::correlationBF()` для каждой H1-H4 пары под каждым из 3 приоров
   - Output: table {hypothesis × prior} с {BF_10, posterior_median, posterior_95ci_lower, posterior_95ci_upper, P(rho > 0)}
   - Comment header documenting prior choice + sensitivity-analysis rationale

2. **`scripts/research/bayes_sensitivity_smoke.R`** (NEW, ~50 LOC)
   - Synthetic-data fixture: 50 simulated datasets at true r values {0, 0.3, 0.5, 0.7}
   - Check posterior median tracks truth at N=10 within tolerance
   - Sanity assertion

3. **`thesis/OSF_PREREGISTRATION_DRAFT.md`** (EDIT) — добавить в deviation log:
   - Entry: PBSL supplementary analysis declared
   - Priors A/B/C locked

4. **`thesis/06_results.md`** §6.6 (EDIT) — добавить subsection "Bayesian sensitivity analysis" placeholder

5. **`thesis/06_results.ru.md`** §6.6 (EDIT, mirror)

6. **`thesis/07_discussion.md`** §7.4 (EDIT) — добавить параграф про Bayesian sensitivity result interpretation (placeholder)

7. **`thesis/07_discussion.ru.md`** §7.4 (EDIT, mirror)

**Trade-offs:**
- ✅ Hardens defensibility через prior-sensitivity transparency
- ⚠ Не повышает мощность (credible interval ≈ Fisher-z CI width)
- ⚠ Priors must be locked BEFORE analysis (post-hoc choice = HARKing)

**Verification (V1):**
- R-script syntactic-only check
- Smoke fixture R-script is consistent
- Deviation log entry presents 3 priors with rationale

---

## V2 — MCREMA (Multi-Cohort Random-Effects Meta-Analysis)

**Цель.** Отгрузить инфраструктуру для future random-effects meta-analysis через шаблон CSV + R-протокол + META_ANALYSIS_PROTOCOL.md. На момент защиты диплома K=1 (одна когорта); протокол накапливается с future cohorts.

**Pre-registered meta-analysis parameters:**
- Estimator: REML (Restricted Maximum Likelihood)
- Heterogeneity: τ² with 95% CI, I²
- Min K=3 cohorts для valid pooled estimate
- Effect-size measure: Pearson r converted to Fisher z, pooled via random-effects, back-transformed
- Cumulative-evidence rule: report per-cohort AND pooled; no selective reporting

**Файлы-результаты:**

1. **`public/js/teacher.js`** (EDIT, ~150 LOC, рядом с существующим cross-cohort export)
   - Новый export button "⬇ Meta-Analysis Summary CSV" в multicohort compare view
   - Generate `cohort_<code>_meta_summary.csv` (один файл на cohort) с колонками:
     ```
     cohort_label, hypothesis_id, n_linked, mean_engagement, sd_engagement,
     mean_growth, sd_growth, r, r_fisher_z, r_se_fisher, sample_size_for_pooling
     ```
   - 4 строки на cohort (по одной на H1-H4)
   - **CRITICAL:** cohort_label = deidentified label (`cohort_001`, `cohort_002`...) **NOT** human-readable cohort_code. Generation: deterministic based on cohort_code hash, but labels not directly tied to cohort_code via reversible mapping
   - Skip cohort if `n_linked < k_anonymity_threshold (5)` — output empty row with suppression note

2. **`scripts/research/meta_analysis.R`** (NEW, ~150 LOC)
   - Read N concatenated `cohort_<X>_meta_summary.csv` files
   - For each hypothesis (H1-H4):
     - `metafor::rma(yi=r_fisher_z, sei=r_se_fisher, method="REML", measure="ZCOR")` — random-effects pooled estimate
     - Forest plot: `metafor::forest()` with per-cohort + pooled
     - Funnel plot: `metafor::funnel()` for publication-bias diagnostics (relevant K ≥ 4)
   - Output: table {hypothesis, K, pooled_r, 95ci, tau_sq, i_sq, q_pvalue} + 4 forest plots PNG + 4 funnel plots PNG

3. **`scripts/research/meta_analysis_smoke.R`** (NEW, ~80 LOC)
   - Simulate K=3, 5, 8 cohorts at true r=0.4, N=10 each
   - Run meta-analysis pipeline end-to-end
   - Verify pooled CI half-width narrows monotonically (~0.45 at K=3, ~0.28 at K=8)
   - Sanity: pooled_r within tolerance of true r=0.4 across simulations

4. **`thesis/META_ANALYSIS_PROTOCOL.md`** (NEW, ~3 pages, EN + RU mirror)
   - §1. Purpose and locking statement
   - §2. Estimator: REML rationale
   - §3. Heterogeneity reporting protocol (τ², I², Cochran Q)
   - §4. Minimum K rule (K ≥ 3 for valid pooled estimate; smaller K is descriptive only)
   - §5. Cumulative-evidence rule (per-cohort + pooled both reported; no selective reporting)
   - §6. Deidentification protocol (cohort_label generation)
   - §7. K-curve simulation as verification of detectable-effect convergence
   - §8. Status: at diploma defense K=1; protocol-only contribution

5. **`thesis/META_ANALYSIS_PROTOCOL.ru.md`** (NEW, RU mirror)

6. **`thesis/07_discussion.md`** §7.8 (EDIT) — расширить future-work секцию с MCREMA positioning

7. **`thesis/07_discussion.ru.md`** §7.8 (EDIT, mirror)

8. **`thesis/05_methodology.md`** §5.5.10 (EDIT) — добавить ссылку на META_ANALYSIS_PROTOCOL для future K > 1

9. **`thesis/05_methodology.ru.md`** (EDIT, mirror)

**Trade-offs:**
- ✅ ЕДИНСТВЕННЫЙ вариант, реально устраняющий underpower (a) в долгосрочной перспективе
- ✅ Aligns с replication-package framing диплома
- ⚠ В диплом-окне K=1 — отгружается protocol + infrastructure, не executed analysis
- ⚠ τ² при малом K (3-5) общеизвестно нестабильно — честная отчётность требует wide CI
- ⚠ Deidentification cohort_labels требует deterministic-but-non-reversible generation

**Verification (V2):**
- teacher.js export генерирует корректный CSV format
- R-scripts syntactic check
- Smoke R-script demonstrates K-curve narrowing
- META_ANALYSIS_PROTOCOL.md документирует все 8 секций
- Thesis §7.8 + §5.5.10 referencing protocol

---

## Cross-cutting финал

После всех 4 вариантов:

1. **`thesis/GLOSSARY.md`** (EDIT, ~30 новых билингвальных пар)
   - TOST, SESOI, equivalence test, two one-sided tests
   - Bayes factor, posterior, prior, JZS, BF_10
   - Random-effects, REML, DerSimonian-Laird, τ², I², Cochran Q
   - Forest plot, funnel plot, multitrait-multimethod
   - audio_exposure_minutes, text_exposure_minutes
   - prior-sensitivity, cumulative-evidence rule
   - deidentified cohort label

2. **`docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md`** §6 status log (EDIT)
   - Entry 2026-05-22 — Premium stack {V5+V3+V1+V2} implementation complete

3. **Memory updates:**
   - `project_thesis_writeup_decisions.md` — addendum про premium stack
   - `MEMORY.md` — pointer-line addition

---

## Status tracking

Каждый вариант — отдельная подзадача в TaskCreate. После исполнения каждого варианта — TaskUpdate completed + краткий status report.

---

**Last updated.** 2026-05-22 (initial creation; implementation starts immediately after).
