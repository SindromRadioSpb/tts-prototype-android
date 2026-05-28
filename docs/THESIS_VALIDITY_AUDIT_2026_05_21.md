# Thesis Validity Audit — 2026-05-21

> **Цель.** Независимый READ-only аудит соответствия между фактической
> реализацией LinguistPro (код + плановые docs) и требованиями
> defendable дипломного исследования (D1 thesis theme,
> `ULPAN_RESEARCH_PLAN_v3_2.md §1`). Идентификация gap'ов, классификация,
> конкретные планы закрытия в pre-pilot окне.
>
> **Роль.** Role 4 из `WRITE_UP_BRIEF.md §9` — Research Validity Auditor.
> READ-only, никаких изменений в коде / схеме / consent template.
>
> **Авторство.** Аудит проведён ассистентом по запросу автора диплома
> 2026-05-21, до запуска write-up серии. Отчёт сам по себе становится
> сырьём для главы Discussion (Limitations & Threats to Validity) —
> see §13 ниже.
>
> **Опорный коммит.** `8513f80` (HEAD на момент аудита).

---

## 1. Executive summary

Конструкт «privacy-preserving research-grade EdTech-platform для
ulpan-исследования» **архитектурно силён** и **эмпирически уязвим**.

- **Методологический вклад (D1 thesis)** — defendable. Privacy-preserving
  дизайн зрел: schema-strict server-side validator, k=5, two-key,
  one-click withdrawal с полным сервер-side delete (jsonl + outcomes.csv),
  consent versioning с формализованным material-change rule. Это — главный
  defendable вклад диплома.
- **Эмпирическая часть (correlation engagement × outcome)** — имеет ряд
  серьёзных threats to validity, **которые не могут быть закрыты только
  кодом**. Главные — sample size underpower (N=8-15 vs N=28 нужен для
  r=0.5), отсутствие pre-test baseline, Hawthorne effect от прозрачности
  сбора, multiple comparisons inflation, и calibration квиза по
  expert-judgement без empirical validation.
- **Pre-pilot окно** позволяет закрыть 3 MUST-уровня gap'а малыми
  изменениями (`§14` ниже). Остальные threats становятся материалом для
  главы Discussion — это нормально для diploma-уровня correlational
  study, но **должно быть честно заявлено в тексте**, не закопано.

**Главная рекомендация:** диплом должен явно различать **«strong»
методологический вклад** (Глава 4) и **«exploratory, underpowered»
эмпирическую часть** (Главы 5-6). Двойная позиционировка — единственный
честный путь защититься при N=15 единственной когорты.

---

## 2. Severity legend

| Метка | Что значит | Реакция |
|---|---|---|
| 🔴 **MUST** | Без закрытия диплом нельзя защитить честно | Закрыть до пилота либо явно ограничить scope claim'ов |
| 🟡 **HIGH** | Заметно усилит defendability; threat to validity | Закрыть до пилота если cost ≤ 1 день; иначе → Limitations |
| 🟢 **NICE** | Повысит качество если время позволит | По остатку времени; не блокер |
| ⚪ **PARK** | За scope диплома; future work | Future Work секция; ничего не делать сейчас |

Дополнительная метка **🟦 FROZEN** — pre-pilot freeze zone
(`PARALLEL_WORK_PLAN_DURING_PILOT.md §1.1`), любой gap здесь автоматически
становится PARK до окончания пилота.

---

## 3. D1 — Construct validity

> **Вопрос:** действительно ли метрики измеряют то, что заявлено?

### 3.1 Strong points

- `active_minutes_real` — реально heartbeat-derived, не `plays × 4000`
  (см. `index.html:14449-14627` + `local-db.js:1580-1645`). Heartbeat
  каждые 30 c, idle gate 5 мин, visibility gate, max-session 60 мин.
- `play_audio.duration_ms` — реальная длительность playback'а, не
  оценочная.
- 12+ event types фактически эмитятся (Phase 11.0 закрыл существовавший
  CONTRACTS_ANALYTICS drift).
- `cards_added_to_srs` + `cards_exported_to_anki` — proxy mastery
  (creation → export ratio), осознанно выбранные как retention proxy в
  отсутствие Anki Connect sync (`SRS_STRATEGY_v3_2.md`).

### 3.2 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D1.1 | `active_minutes_real` overcounts passive reading | 🟡 HIGH | 2-3 ч | См. §14 (Top-3 #1) — audio-as-activity hook + idle gate 2 min |
| D1.2 | Audio listening не trigger'ит heartbeat activity | 🟡 HIGH | 1 ч | Часть §14 (Top-3 #1) |
| D1.3 | `cards_reviewed` измеряет stub Trainer, не Anki reviews | 🟡 HIGH | 0 ч кода | Раскрыть в Discussion как **acknowledged limitation** + использовать `cards_exported_to_anki` как primary mastery proxy |
| D1.4 | `sentence_id` distinct count cross-text inflated (нет composite (text_id, sentence_id) key) | 🟡 HIGH | 1 ч | `_aggregateForRange` SQL: `COUNT(DISTINCT text_id \|\| ':' \|\| sentence_id)`. 🟦 FROZEN если делаем до пилота — затрагивает client research.js |
| D1.5 | `words_unique_estimate`, `niqqud_marked_time_ratio`, `binyan_coverage`, `root_encounter_diversity` есть в validator, но не emit'ятся клиентом | 🟢 NICE | 0 ч | Удалить из METRICS_SCHEMA примеров либо оставить с пометкой "v3.4+" — иначе reviewer спросит «где данные» |
| D1.6 | `engagement_score` композит существует только в docs, не вычисляется в dashboard | 🟢 NICE | 1-2 ч | Можно считать в R/Python после export — нет блокера. Указать формулу в Methodology §«operationalization». |
| D1.7 | Multi-device per-device UUID без auto-link | 🟡 HIGH | 0 ч кода | Указать в Methodology что N считается по device, не по student; A3 CLI link существует но manual |

### 3.3 Construct-validity claim для диплома

Чтобы выдержать защиту, формулировка `active_minutes_real` в Methodology
должна быть **operational**, не теоретическая:

> «`active_minutes_real` operationally defined as: sum of 30-second
> heartbeats fired while the tab was visible AND at least one user
> interaction (keydown / click / pointerdown / scroll / touchstart)
> occurred within the preceding 5 minutes. Audio playback alone does
> not refresh the interaction timer. The metric therefore captures
> **interactive engagement**, not total exposure time, and systematically
> under-counts passive listening.»

Это честная формулировка. Без неё reviewer вправе спросить «что именно
вы измеряете», и ответ «время в приложении» — ложный.

---

## 4. D2 — Internal validity

> **Вопрос:** confounds, instrumentation effects, selection bias.

### 4.1 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D2.1 | **Отсутствие pre-test baseline.** `pre_test_score` опционален; без него любая корреляция engagement × post_test_score не различает «engagement caused progress» vs «strong students engaged more» | 🔴 MUST | 0 ч кода + organizational | См. §14 (Top-3 #2). До запуска пилота — teacher должен собрать pre-test и upload CSV с `pre_test_score`. Опираясь на `growth_delta = post − pre` как primary outcome вместо raw `post_test_score`. |
| D2.2 | **Hawthorne effect.** Студенты знают что их измеряют (consent + transparency UI), это влияет на поведение. Метрика становится observer-affected. | 🟡 HIGH | 0 ч кода | Limitation в Discussion. Цитировать seminal Adair (1984) и обсуждать что privacy-transparent дизайн делает Hawthorne хуже (видимость → reactivity), но это inherent цена privacy. |
| D2.3 | **Selection bias на opt-in внутри cohort.** Из 8-15 ulpan-студентов opt-in делают только app-friendly. Cohort opt-in ≠ ulpan population. | 🟡 HIGH | 0 ч кода | Limitation. Сравнить демографию opt-in vs ulpan group total (даже без app-данных — teacher может сообщить N total). |
| D2.4 | **Double selection bias** на linking. Студенты которые делятся UUID с teacher = более conscientious = ALSO more engaged. Конструкт «outcome correlation» доступен только для self-selected subsample. | 🟡 HIGH | 0 ч кода | Limitation + sensitivity analysis: сравнить engagement distribution opted-in-всех vs linked-subsample. Если linked-subsample заметно engaged-er — claim о correlation ограничен. |
| D2.5 | **Confounding variables** не captured: motivation, prior Hebrew exposure, family support, age, hours/week available. Любой r не имеет causal interpretation. | 🟡 HIGH | 1-2 ч | Pre-test survey (5 вопросов: возраст, lvl при start, hours/week study, prior Hebrew exposure, motivation Likert). Teacher distributes. Add column to outcomes CSV: «covariates». Partial-out via regression. |
| D2.6 | **Instrumentation effect**: calibrated quiz opt-in мид-cohort. Те кто take quiz могут отличаться. | 🟢 NICE | 0 ч кода | Limitation. Reportировать N(quiz takers) / N(cohort opted-in). |
| D2.7 | **Drift между конецом active app use и экзаменом.** Если экзамен через 2-3 недели после последней сессии, корреляция engagement × score ослабляется forgetting-кривой. | 🟢 NICE | 0 ч | Reportировать timestamps lap'а от last_upload_date до exam_date в Methodology. |

### 4.2 D2.1 — почему MUST

Без pre-test, нулевая или слабая корреляция engagement × post_test_score
**не интерпретируется**:

- Вариант (a): «engagement не влияет на learning» — strong null
- Вариант (b): «engaged students starting from low baseline догоняют
  средних» — engagement помогает, но скрыто
- Вариант (c): «strong students already at ceiling, не engagement-bound»
- Вариант (d): all сmешано, можно сказать что угодно

С pre-test и growth_delta:

- r(engagement, growth_delta) очищает (a)/(c) — мы измеряем дельту, не
  абсолют. Strong students с high pre_test имеют меньший delta-potential,
  низшие — больший. Это становится testable hypothesis.

**Действие:** уговорить teacher провести pre-test на стартовой неделе
пилота (диагностический тест на ~20 мин — может совпадать с calibrated
quiz). Teacher CSV upload — обычный path, никаких code-изменений.
**Это organizational gap, не engineering gap**, и закрывается за 0 часов
кода и 1 разговор с teacher.

---

## 5. D3 — External validity / generalizability

> **Вопрос:** на какие группы результат НЕ переносится?

### 5.1 Strong points

- Plan §13 явно scopes single-group correlational, не RCT. Не претендуем
  на causal claim — это правильно для diploma scale.
- Architecture multi-cohort-ready (`cohort_code` в schema) — будущее
  расширение не требует rewrite.

### 5.2 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D3.1 | Generalizability жёстко ограничена: 1 cohort × 1 teacher × 1 institution × 1 L1 (RU) × app-friendly self-selected. | 🟡 HIGH | 0 ч кода | Methodology §«Scope of generalization»: 4-5 строк прямого текста о том, к какой population результат переносится — буквально «students of <teacher> in <institution> in <term>, opted-in to app, native RU speakers, A2-B2 ulpan-level». Не PhD-generalization. Reviewer ценит честность. |
| D3.2 | L1 bias не documented. LinguistPro UX bilingual RU/HE; HE-native learners почти отсутствуют (HE consent review pending). | 🟢 NICE | 0 ч | Reportировать L1 distribution в Methodology. |
| D3.3 | Ulpan teacher's grading style влияет на outcome scale (`outcome_scale` configurable per cohort). Cross-teacher comparison не возможен. | 🟢 NICE | 0 ч | Document `outcome_scale` value в Methodology. Для diploma single-cohort это не критично. |

---

## 6. D4 — Statistical conclusion validity

> **Вопрос:** sample size, multiple comparisons, effect-size vs p-value.

### 6.1 Sample-size analysis

**Power calculation** для primary hypothesis (Pearson r):

| Заявленный effect size | Power 80% | α=0.05 two-tailed | Required N |
|---|---|---|---|
| r = 0.3 (small) | 0.80 | 0.05 | **~84** |
| r = 0.5 (medium) | 0.80 | 0.05 | **~28** |
| r = 0.7 (strong) | 0.80 | 0.05 | **~14** |

Ulpan group typical N: 8-15. Linked subset (с outcome): вероятно 50-80%
из opt-in = **~5-12 effective N**.

**Вывод:** только r ≥ 0.7 будут statistically detectable. Slabye signal
(r = 0.3-0.5) — invisible.

### 6.2 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D4.1 | **Underpower на N=5-12.** Detection floor r=0.7; всё меньшее — пропущено. | 🔴 MUST | 0 ч кода | Methodology §«Statistical power»: явно reportировать power calculation, признавать что study **exploratory, not confirmatory**. Фокус — pattern + effect size с 95% CI, не p-values. ALL обнаруженные r — interpretировать как «effect size estimate с wide CI», не «proof of correlation». |
| D4.2 | **Multiple comparisons inflation.** 6 layers × ~5 metrics = ~30 candidate variables × outcome. По α=0.05 expected ~1.5 spurious significant. | 🔴 MUST | 0 ч кода | Methodology §«Multiple comparisons»: либо (a) формализовать **pre-specified primary hypotheses** (3-4 вместо 30) и applyить Bonferroni там, либо (b) reportировать **all** correlations как exploratory с FDR (Benjamini-Hochberg) correction. Лучше (a) — выбрать заранее: `active_minutes_real`, `cards_added_to_srs`, `notes_created`, `srs_error_rate` как 4 primary; остальные — exploratory. |
| D4.3 | **Wide CIs not reported**. Plan §3 говорит «threshold \|r\|>0.5 = strong» — но при N=10 95% CI на r=0.5 ≈ [-0.10, 0.83]. Threshold misleading. | 🔴 MUST | 0 ч кода | Methodology + dashboard: всегда reportировать 95% CI вместе с r. Reviewer-test: «при N=10 наша оценка r=0.5 совместима с диапазоном включая 'no correlation'». Будь радикально честным. |
| D4.4 | **No pre-registration** (OSF/AsPredicted). | 🟡 HIGH | 1-2 ч | См. §14 (Top-3 #3) — light-weight pre-registration на OSF за 1-2 часа. Сейчас, до пилота. Locks primary hypothesis + analysis plan; защищает от post-hoc HARKing. |
| D4.5 | Quiz `quiz_se` экспонируется, но не используется в weighting analysis | 🟢 NICE | 0 ч | Если outcome = quiz_score_normalized, веса по 1/SE^2 при regression. Optional sophistication. |

### 6.3 D4.1-D4.3 — почему все MUST

Без правильного framing статистики, любой reviewer моментально пробивает
защиту:

- Если показать «we found r = 0.6, p < 0.05» при N=10 без CI — fatal.
- Если показать «we tested 30 vars and 3 came up significant» без
  correction — fatal.
- Если заявить «strong correlation» при wide CI — fatal.

Эти три gap'а **закрываются текстом**, не кодом. Они становятся:
- §«Statistical power» в Methodology (один параграф)
- §«Multiple comparisons» в Methodology (один параграф)
- Везде где упоминается r — добавляется CI

Это **~2 часа письменной работы**. Без них empirical часть диплома не
защитима.

---

## 7. D5 — Reliability

> **Вопрос:** test-retest, inter-rater, instrument calibration.

### 7.1 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D5.1 | **Calibrated quiz = expert_judgement_v1 + AI pre-review.** External ulpan-teacher review pending. `production_ready: "development_and_dogfood_only"`. | 🟡 HIGH | 0 ч own time + ожидание native reviewer | Если до пилота приходит response от teacher — apply per `V3_3_5_PREDEPLOYMENT_GATE_STATUS.md §3`. Если нет — quiz score должен использоваться **как secondary outcome**, teacher CSV `post_test_score` — primary. В Methodology явно: «calibration is expert-judgement based; empirical IRT recalibration deferred to v3.4». |
| D5.2 | **Нет inter-rater reliability** для teacher exam grading. One grader, day-to-day variance. | 🟢 NICE | 0 ч | Limitation. Не критично для diploma. Можно попросить teacher оценить 5 random papers второй раз через неделю — reportировать test-retest r как proxy. |
| D5.3 | **`active_minutes_real` accuracy не validated против stopwatch.** Plan §11.1 acceptance говорит «±10%», но я не нашёл такого smoke. | 🟡 HIGH | 1-2 ч | Manual validation: 3 sessions × 10 минут активного использования с stopwatch → compare с `getActiveMsReal({sinceIso})`. Если ±10% — OK; если хуже — Limitation в Methodology. |
| D5.4 | **Self-reported scores** (D3 outcome path в plan, §11.6) — known unreliable. | 🟢 NICE | 0 ч | В дипломе использовать teacher CSV authoritatively, self-report — fallback. Methodology явно. |
| D5.5 | Quiz test-retest не возможен (admin reset CLI существует, но это не designed multi-attempt). | ⚪ PARK | — | Design choice; не диплом-defendable как issue. |

---

## 8. D6 — Privacy / ethics formalization

> **Вопрос:** threat model, withdrawal completeness, comparative analysis.
>
> **Это самая сильная dimension. Главный defendable вклад диплома.**

### 8.1 Strong points (detailed для Главы 4)

| Component | Evidence | Pinning |
|---|---|---|
| **Schema-strict validation** | `research/validate.js` — explicit FORBIDDEN_FIELDS list (text_content, note_body, search_query, audio_bytes, username, email, ip, geolocation, user_agent, device_id, ...). `recurseForbidden()` deep-checks every nested object. | `scripts/research/smoke.js` |
| **Payload size cap** | 64 KB max (`MAX_PAYLOAD_BYTES`). Prevents data exfil via large blobs. | validator |
| **k-anonymity enforcement** | `storage.aggregateCohort()` — `students: []` when `cohort_size < k_anonymity_threshold`. Default k=5. Cohort-wide aggregates всегда visible. | server unit |
| **Two-key split-knowledge** | Anonymous UUID generated client-side via `crypto.randomUUID()`. Teacher knows name+score. Researcher знает UUID+metrics. Connection requires student-initiated UUID disclosure. | `research.js` + plan §4 |
| **One-click withdrawal** | DELETE rewrites all `.jsonl` files (atomic .tmp + rename), strips matching student_id rows. ALSO purges `outcomes.csv`. ALSO audit-logs в `deletions.log`. ALSO clears localStorage. | `storage.deleteStudentFromCohort()` |
| **Withdrawal survives network failure** | DELETE queued for retry on next online (research.js withdraw → queue.push). Local cleanup happens regardless. | research.js:189-222 |
| **Multi-cohort withdrawal** | `findCohortsForStudent()` scans all cohorts globally — student can withdraw without knowing cohort code. | storage.js |
| **Transparency UI** | «👁 Что собрано» modal — separate preview-section (амбер) vs upload log (sent rows). preview-as-separate-section pattern (feedback memory). | research-ui.js + research-client-test.html |
| **previewToday() purity** | Pinned — no fetch, no state mutation, no log entry. | research-client-test.html test «previewToday: NO fetch call» |
| **Consent versioning** | semver `CONSENT_VERSION = '1.0'`. `needsReconsent()` compares stored vs current. | research.js:50, 161-165 |
| **Material-change decision tree** | `RESEARCH_CONSENT_RULE.md` formalizes when bump required (decision tree + taxonomy + 5 worked examples). | docs/RESEARCH_CONSENT_RULE.md |
| **Server logs minimal** | Logs only student_id + cohort + upload_ts + bytes; payload bodies never logged. | comments in storage.js |
| **Rate limiting** | 10 uploads/day/student via in-memory `rateLimit.js`. | `checkAndIncrement()` |

Этот набор — material для **Главы 4 Privacy contribution**. Каждый компонент
поддерживается code + smoke test + design rationale в docs. Это сильнейшая
часть диплома.

### 8.2 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D6.1 | **HE consent native review pending.** Deployment blocker для real HE-cohort. RU/EN OK. | 🟡 HIGH (deployment-only) | 0 ч own time | Organizational: dispatch `HE_CONSENT_REVIEW_BRIEF.md` to ulpan teacher (если когорта RU-primary — не блокирует). |
| D6.2 | **`[Railway production server, расположение и compliance]` остаётся placeholder в consent §«Хранение данных»** | 🔴 MUST | 30 минут | Заполнить: data center location (EU? US?), provider (Railway), GDPR/equivalent compliance language. Указать что данные хранятся на Railway EU/US (по факту deploy). **Без этого consent неполный — material info missing**. Может потребовать CONSENT_VERSION bump → reconsent у пилотов (приемлемо до запуска real cohort). 🟦 если пилот уже запущен — FROZEN. |
| D6.3 | **Нет explicit threat model document.** Threats защищаемые vs не-защищаемые scattered по комментариям. | 🟡 HIGH | 2-3 ч | Это сильно усиливает Главу 4. Создать `docs/THREAT_MODEL.md` — STRIDE-style таблица: для каждого asset (`student_id`, `aggregates`, `outcomes`, `deletions.log`) — какие attacks defended (re-identification via cross-data correlation, raw text exfiltration, audit log tampering, replay attack), какие not (compromised server admin = можно подделать deletions.log; physical device access = student_id leaks; coercion of student = withdraw is impossible if forced). Material для thesis §4. |
| D6.4 | **Нет comparison table с alternatives** (DP, federated, open-dataset, vendor analytics). Plan §4 упоминает но не формализовано. | 🟡 HIGH | 2-3 ч | Создать в Главе 4 thesis (не отдельный doc) сравнительную таблицу: LinguistPro vs Differential Privacy vs Federated Learning vs Open Anonymized Dataset vs Vendor Analytics (Duolingo/Memrise). По осям: privacy guarantee strength, research utility, implementation complexity, withdrawal mechanism, suitability for small cohorts (k=5). Это **scientific contribution differentiation**. |
| D6.5 | **`student_id` is auth token for DELETE.** Lost device + lost UUID = cannot withdraw. | 🟢 NICE | 0 ч | Document в thesis §4 как acknowledged trade-off (privacy-vs-recoverability). PhD-tier would add recovery key; diploma — acknowledge as trade-off and move on. |
| D6.6 | **`deletions.log` is append-only plaintext, no hash chain.** Compromised admin could erase deletion entries. | ⚪ PARK | — | PhD-tier threat. Diploma-defendable as «deletions.log integrity relies on hosting infrastructure»; future work. |
| D6.7 | **No IRB / Helsinki framework explicitly named.** Diploma about privacy-preserving research should name framework. | 🟡 HIGH | 1-2 ч | Add в thesis §4 + consent template: «consent follows Helsinki Declaration §22-32 (informed consent for human research) + GDPR Art. 6(1)(a) (consent as lawful basis). Этическая overisight: university IRB / [specify]». Если университет не имеет formal IRB pre-approval — заявить что study reviewed by [supervisor name] as advised academic ethics. |
| D6.8 | **CONSENT_VERSION = '1.0' hardcoded в JS** — material change without code edit = invisible to participants. | 🟢 NICE | 1 ч | Process gate: добавить в `RESEARCH_CONSENT_RULE.md` §5 checklist item «if you edit RESEARCH_ETHICS_CONSENT_TEMPLATE.md, also check `git diff public/js/research.js#CONSENT_VERSION` was bumped». Можно автоматизировать pre-commit hook. PhD-tier — но 1 час и закрывает класс ошибок. |

### 8.3 D6.3 + D6.4 — почему важны для thesis

Глава 4 — главный defendable вклад. Без явного threat model + comparison
table, она читается как «вот мы сделали анонимизацию» — не как design
contribution.

Threat model отвечает «что именно защищаем». Comparison table отвечает
«почему наш дизайн лучше альтернатив для этого use case (small cohort
educational research)».

Без обеих — Глава 4 теряет ~50% своей силы. Обе закрываются ~5 часов
письменной работы (не кодом), в Glave 4 thesis text напрямую.

---

## 9. D7 — Reproducibility

> **Вопрос:** pre-registration, data dictionary, replication package.

### 9.1 Strong points

- Schema formalized (METRICS_SCHEMA.md)
- `mirt-reference.json` fixture для scoring engine reproducibility
- R/Python/SPSS examples в RESEARCHER_GUIDE.md §7
- All-smoke runner (`npm run smoke:research:fast`) — 18 suites / 248 cases / ALL GREEN at last release

### 9.2 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D7.1 | **No pre-registration** | 🟡 HIGH | 1-2 ч | См. §14 (Top-3 #3) — OSF pre-registration перед пилотом. |
| D7.2 | **No replication package.** Если другой researcher хочет повторить — нужно: anonymized sample CSV + analysis notebook (R или Python) + setup instructions + dependency versions. | 🟡 HIGH | 4-6 ч | Создать `analysis/` директорию: (a) `analysis/replication_notebook.Rmd` или `.ipynb` со всеми analyses из плана (Pearson r, multiple regression с covariates, growth_delta vs primary metrics, sensitivity); (b) `analysis/SAMPLE_anonymized_cohort.csv` — synthetic данные (можно generate'нуть из существующего seed_research_fake_cohort.js); (c) `analysis/README.md` с deps (R version, lavaan, tidyverse). Можно сделать в post-pilot если пилот не запущен. |
| D7.3 | **No separate DATA_DICTIONARY.md.** Schema в METRICS_SCHEMA.md, но inline с архитектурой; reviewer хочет separate dictionary. | 🟢 NICE | 2-3 ч | Extract per-field table: name, type, units, range, semantics, edge cases, source-of-truth code reference. Можно автогенерировать из validate.js. Best for thesis appendix. |
| D7.4 | Quiz recalibration script (`scripts/quiz/recalibrate-from-data.R`) deferred to v3.4. | ⚪ PARK | — | Acknowledged. Methodology говорит «empirical IRT recalibration deferred to v3.4». |
| D7.5 | **`active_minutes_real` algorithm только в code comments** (local-db.js:1580-1645), не в METRICS_SCHEMA. | 🟢 NICE | 1 ч | Extract formula + edge cases в METRICS_SCHEMA §4 (Layer 1). Material для thesis Methodology §«operationalization». |

---

## 10. D8 — Documentation completeness

> **Вопрос:** units, ranges, semantics, edge cases, timezone, outlier handling.

### 10.1 Gap table

| # | Gap | Severity | Cost | Закрытие |
|---|---|---|---|---|
| D8.1 | **Timezone handling unclear.** `todayUtc()` в rateLimit использует UTC. `events.ts` — UTC ISO. Но user-day-boundary не aligned с UTC for IL users (UTC+2/+3). Evening sessions across UTC midnight = wrong day attribution. | 🟡 HIGH | 1-2 ч | Decision: либо (a) explicitly say "all metrics in UTC; user evening sessions may cross day boundary" в METRICS_SCHEMA + thesis, либо (b) use cohort_meta.timezone field + apply offset before bucketing. (a) проще и diploma-defendable; (b) PhD-tier. Выбрать (a). Document в thesis Methodology. |
| D8.2 | **No outlier detection в pipeline.** Если `obj.duration_ms` корруптится (clock skew, bug), `audio_play_ms_total` corrupts. | 🟢 NICE | 1 ч | Clamp duration_ms ≤ 600_000 (10 минут per row max) перед суммированием. Defensive. |
| D8.3 | **`sentence_id` не unique cross-text** (D1.4 duplicate). | 🟡 HIGH | См. D1.4 | См. D1.4 |
| D8.4 | **Heartbeat algorithm** documented в code, не в METRICS_SCHEMA (D7.5 duplicate). | 🟢 NICE | См. D7.5 | См. D7.5 |
| D8.5 | **`growth_delta` formula** упоминается в plan §8 derived metrics, но computed externally — нужна явная formula + handling null pre_test_score в Methodology. | 🟡 HIGH | 30 мин | Methodology §«Derived metrics»: явная formula, handling null (если pre или post null → growth_delta excluded from regression). Это закрывает D2.1 если pre-test собран. |

---

## 11. Extended functions

### 11.1 Methodology vs implementation gap

| Plan claim | Implementation reality | Gap severity | Mitigation |
|---|---|---|---|
| «6-layer engagement taxonomy» | Layers 1-3 emit; Layer 4 Hebrew-specific (binyan_coverage, root_encounter_diversity, niqqud_marked_time_ratio) — schema-future-proofed, not emitted | 🟢 NICE | Limit Layer 4 claims в thesis OR emit (1-2 days work, 🟦 FROZEN if pilot starts) |
| «heartbeat-based time-spent» | Implemented, but audio не triggers activity; passive 5-min idle window | 🟡 HIGH | D1.1 + D1.2 above |
| «cards_reviewed measures SRS retention» | Measures stub Trainer only; primary review в Anki | 🟡 HIGH | D1.3 — frame as proxy, use cards_exported_to_anki as primary mastery proxy |
| «calibrated quiz with reliable difficulty» | Expert-judgement placeholders; external review pending | 🟡 HIGH | D5.1 — limit quiz_score to secondary outcome |
| «two-key privacy with linkable outcome» | Manual UUID-write at exam — fragile | 🟡 HIGH | D2.4 — analyze + document |
| «one-click withdrawal complete» | DELETE rewrites jsonl + outcomes.csv | ✅ | Strongly defendable |
| «k=5 enforced» | aggregateCohort returns students:[] when <k | ✅ | Strongly defendable |
| «default OFF opt-in» | `lsGet(LS.enabled, '') === '1'` — explicit consent click required | ✅ | Strongly defendable |
| «retention 2 years» | `cohort_meta.retention_until` field, но automated deletion job не shipped | 🟡 HIGH | Either ship retention enforcement (PARK — too much work pre-pilot) OR document «manual deletion at retention_until» в thesis + RESEARCHER_GUIDE. Acceptable for diploma. |

### 11.2 Claim-evidence chain audit

Прохожу по вероятным thesis claims:

| Claim | Evidence | Verdict |
|---|---|---|
| «Privacy-preserving design preserves user privacy» | Schema validator + k=5 + two-key + complete withdrawal + smoke tests | ✅ **STRONG** |
| «Engagement correlates with learning outcomes» | Requires pilot data; underpowered N=5-12; multiple comparisons unaddressed | ⚠ **WEAK by default**. Strengthens to MEDIUM after D2.1 (pre-test), D4.1-3 (statistical framing), pre-registration |
| «Design is reusable for other CALL apps» | Open-source repo + schema doc + consent template | ⚠ **WEAK**. No external adoption. Strengthen with «porting guide» section в thesis +  explicit abstract architecture (k-anonymity / two-key as generic patterns) |
| «Calibrated quiz is valid outcome measure» | 1PL Rasch + AI pre-review + project-owner provisional sign-off | ⚠ **WEAK**. Strengthens after external ulpan-teacher review (organizational, not code) |
| «Withdrawal is complete» | DELETE strips jsonl + outcomes.csv + audit log | ✅ **STRONG** |
| «No PII collected» | Schema FORBIDDEN_FIELDS + recurseForbidden + smoke | ✅ **STRONG** |

### 11.3 Reviewer simulation — 5 sharpest questions

Что спросил бы скептик-рецензент на защите. Для каждого — best defense.

**Q1.** *«Ваш N=8-15. С α=0.05, β=0.20 для r=0.5 нужен N=28. Как вы
защищаете любой null finding given underpower? И как defendable positive
finding given что 30 тестируемых variables = 1.5 spurious significant
correlations by chance?»*

**Best defense:** «We explicitly frame the empirical study as exploratory,
not confirmatory. We pre-registered 4 primary hypotheses (active_minutes,
cards_added_to_srs, notes_created, srs_error_rate × growth_delta) with
Bonferroni correction α=0.0125. All other 26 metrics are reported as
descriptive with 95% CI but no significance claim. Null findings on the
4 primary hypotheses are interpreted as "no evidence of medium-to-strong
effect at this sample size" — they do not rule out small effects. The
methodological contribution (Chapter 4) is independent of empirical
findings and is the primary diploma contribution.»

→ **Defends** IF D4.1-3 closed (statistical framing in Methodology) AND
pre-registration done (§14 Top-3 #3).

**Q2.** *«Ваш `active_minutes_real` считает пользователя который клацнул
1 раз 4:59 минут назад как active engaged — даже если он ушёл. Validate
вы с stopwatch ±10%? Audio listening не trigger heartbeat. Как defendable
"real" time-on-task?»*

**Best defense:** «We acknowledge the operational definition: the metric
captures interactive engagement, not passive listening. We validated
against stopwatch on N=3 manual sessions with results within ±15% (see
Methodology §X). For passive audio listening, we report `audio_play_ms_total`
separately. We do not claim total exposure time; we claim interaction-time
as a measurable engagement layer.»

→ **Defends** IF D5.3 done (stopwatch validation) AND framing in
Methodology is operational, not theoretical.

**Q3.** *«Ваш `cards_reviewed` measures in-app stub Trainer, но
SRS_STRATEGY говорит Anki — primary review layer. Так data captures
secondary path. Как это supports claims about retention?»*

**Best defense:** «Correct — and we explicitly frame retention as out
of scope for this diploma's empirical claims. Our SRS metrics are
operationally defined as creation-and-export activity (cards_added_to_srs,
cards_exported_to_anki) which captures the user's intent to retain, not
the retention outcome itself. The Anki review pipeline is on the v3.4
roadmap with bidirectional sync; until then, retention validation is
deferred to future work. The current diploma claims focus on engagement,
not retention.»

→ **Defends** by acknowledging trade-off. Plan §15 SRS_STRATEGY already
formalizes this — we just need it in thesis.

**Q4.** *«Calibrated quiz difficulty parameters = expert judgement
placeholders, ulpan-teacher review pending. Sign-off explicitly
"development_and_dogfood_only". Почему quiz_score_normalized acceptable
outcome variable?»*

**Best defense:** «We use teacher CSV `post_test_score` as primary
outcome (when available). Quiz score is reported as secondary
diagnostic measurement with its `quiz_se` (standard error) attached.
Empirical IRT recalibration is explicitly deferred to v3.4 once ≥30
quiz responses accumulate; until then, quiz scores function as supplementary
diagnostic with documented measurement uncertainty.»

→ **Defends** IF Methodology explicitly downgrades quiz to secondary
AND `quiz_se` is reported alongside score in dashboard.

**Q5.** *«Two-key linking requires student manually transcribing UUID
on exam paper. Error rate? If 30% mistranscribe или refuse to share,
your linked sample doubly selected. How is this not fatal?»*

**Best defense:** «We report the transcription error rate (estimated
from cross-validation: students who shared UUIDs were asked to confirm
via a second channel — we report N matched / N total). We acknowledge
the double-selection (opt-in to app + opt-in to share UUID) as a
limitation. We perform a sensitivity analysis comparing engagement
distribution of linked-subsample vs full-opt-in cohort. If distributions
match within reasonable bounds, generalization to opt-in cohort is
defensible; if not, claims are scoped to linked-subsample only.»

→ **Defends** IF you actually do the sensitivity analysis (D2.4 above).
Without it — fatal.

### 11.4 Comparison gap

Главa 4 (Privacy contribution) **обязана** содержать comparison table.
Текущее состояние: упомянуто в plan §4, не формализовано.

| Подход | Privacy guarantee | Research utility | Implementation cost | Withdrawal | Suitable for k=5? |
|---|---|---|---|---|---|
| LinguistPro opt-in research-mode | k=5 + two-key + schema-strict | High (full taxonomy) | Medium | One-click complete | ✅ Designed for small cohorts |
| Vendor analytics (Duolingo/Memrise) | None (raw + identified) | High but private | Low (vendor-built) | Vendor TOS dependent | ✅ but anti-research |
| Differential Privacy | Strong (formal ε-DP) | Lower (noise injected) | High (calibrated noise) | N/A (aggregates only) | ⚠ Noise dominates at small N |
| Federated Learning | Strong (no central data) | Limited (gradient leakage) | Very High | Per-device | ⚠ Overkill for small cohorts |
| Open Anonymized Dataset | Variable (re-id attacks) | High but irreversible | Low | None (once published) | ❌ k=5 not enforced |
| Anki + manual logs | Total (no upload) | None (no aggregation) | None | N/A | ❌ No research mode |

Это таблица для thesis §4. Закрывает D6.4.

### 11.5 Quantification gap

Места где можно подкрепить качественное claim количественной metrикой:

- «Withdrawal works» → «Withdrawal completes in <X ms>, removes 100% of
  jsonl rows and outcomes.csv rows in N=5 tested cases». Measure with a
  smoke addition.
- «k=5 sufficient» → cite Sweeney (2002) k-anonymity bounds; report
  expected re-identification risk at k=5 for typical cohort size.
- «No PII in payloads» → grep audit на real pilot data: «N=X uploads
  inspected, 0 HE chars in any string field» (already manually verified
  by user; reportировать).
- «Heartbeat accuracy» → D5.3 stopwatch validation.
- «Calibrated quiz reliable» → mean `quiz_se` distribution across pilot
  N students.
- «Default OFF» → unit test that fresh localStorage → enabled === false.
  Already pinned.

Большинство из этих — already enforced through code/smoke. Translate
into prose claims в thesis §4.

---

## 12. Сводная таблица всех gap'ов

Все gap'ы из §3-§10 + §11. Sorted by severity. Cost — оценка часов.

| # | Gap | Severity | Cost | Type | Owner |
|---|---|---|---|---|---|
| D6.2 | Consent template Railway placeholder | 🔴 MUST | 0.5 ч | Doc | Auto |
| D2.1 | Pre-test baseline missing | 🔴 MUST | 0 ч + organisational | Process | User (teacher) |
| D4.1 | Underpower not framed | 🔴 MUST | 0.5 ч | Thesis text | User (in Methodology) |
| D4.2 | Multiple comparisons inflation | 🔴 MUST | 1 ч | Thesis text + pre-reg | User |
| D4.3 | Wide CIs not reported | 🔴 MUST | 0.5 ч | Thesis text + dashboard tweak | User |
| D1.1 | active_minutes overcounts passive | 🟡 HIGH | 2-3 ч | Code OR doc-only | User (decision) |
| D1.2 | Audio not activity-marking | 🟡 HIGH | 1 ч | Code | User |
| D1.3 | cards_reviewed measures stub | 🟡 HIGH | 0 ч | Thesis text | User |
| D1.4 | sentence_id distinct inflated | 🟡 HIGH | 1 ч | Code (🟦 FROZEN if pilot started) | User |
| D1.7 | Multi-device per-device UUID | 🟡 HIGH | 0 ч | Thesis text | User |
| D2.2 | Hawthorne effect | 🟡 HIGH | 0 ч | Discussion text | User |
| D2.3 | Selection bias on opt-in | 🟡 HIGH | 0 ч | Discussion text | User |
| D2.4 | Double selection on linking | 🟡 HIGH | 1-2 ч | Sensitivity analysis | User (post-pilot) |
| D2.5 | Confounding variables | 🟡 HIGH | 1-2 ч | Pre-test survey 5 items | User (teacher) |
| D3.1 | Generalizability scope | 🟡 HIGH | 0 ч | Methodology text | User |
| D4.4 | No pre-registration | 🟡 HIGH | 1-2 ч | OSF | User |
| D5.1 | Quiz expert-judgement only | 🟡 HIGH | 0 ч own | Methodology + organisational | User |
| D5.3 | active_minutes stopwatch validation missing | 🟡 HIGH | 1-2 ч | Manual validation | User |
| D6.3 | No threat model document | 🟡 HIGH | 2-3 ч | New doc / thesis §4 | User |
| D6.4 | No comparison table | 🟡 HIGH | 2-3 ч | Thesis §4 | User |
| D6.7 | No IRB framework named | 🟡 HIGH | 1-2 ч | Thesis §4 + consent | User |
| D7.1 | No pre-registration (dup D4.4) | 🟡 HIGH | dup | dup | dup |
| D7.2 | No replication package | 🟡 HIGH | 4-6 ч | analysis/ dir | User (post-pilot) |
| D8.1 | Timezone handling unclear | 🟡 HIGH | 1-2 ч | Methodology text | User |
| D8.3 | sentence_id (dup D1.4) | 🟡 HIGH | dup | dup | dup |
| D8.5 | growth_delta formula | 🟡 HIGH | 0.5 ч | Methodology | User |
| D6.1 | HE consent native review | 🟡 HIGH (deployment-only) | 0 ч own | Organizational | User |
| D2.6 | Instrumentation effect quiz | 🟢 NICE | 0 ч | Limitation | User |
| D2.7 | Drift between use and exam | 🟢 NICE | 0 ч | Methodology | User |
| D3.2 | L1 bias undocumented | 🟢 NICE | 0 ч | Methodology | User |
| D3.3 | Outcome scale per-teacher | 🟢 NICE | 0 ч | Methodology | User |
| D4.5 | Quiz SE not used in weighting | 🟢 NICE | 0 ч | Optional | User |
| D5.2 | No inter-rater for teacher grading | 🟢 NICE | 0 ч | Limitation | User |
| D5.4 | Self-reported scores | 🟢 NICE | 0 ч | Methodology | User |
| D6.5 | Lost UUID = no withdrawal | 🟢 NICE | 0 ч | Trade-off doc | User |
| D6.8 | CONSENT_VERSION not auto-checked | 🟢 NICE | 1 ч | Pre-commit hook | User |
| D7.3 | No DATA_DICTIONARY.md | 🟢 NICE | 2-3 ч | Thesis appendix | User |
| D7.5 | Heartbeat algorithm only in comments | 🟢 NICE | 1 ч | Doc | User |
| D8.2 | No outlier detection | 🟢 NICE | 1 ч | Code (🟦 FROZEN if pilot) | User |
| D1.5 | Schema-future-proofed fields | 🟢 NICE | 0 ч | Doc | User |
| D1.6 | engagement_score not computed | 🟢 NICE | 0 ч | R/Python post-export | User |
| D5.5 | No quiz test-retest | ⚪ PARK | — | — | — |
| D6.6 | deletions.log integrity | ⚪ PARK | — | — | — |
| D7.4 | Quiz recalibration deferred | ⚪ PARK | — | — | — |
| 11.1.* | retention enforcement automation | ⚪ PARK | — | — | — |

**Total cost estimate to close all MUST + HIGH:** ~25-30 часов работы,
из которых ~80% — thesis text writing, не код. Освободить **5-7 рабочих
дней** в pre-pilot окне на это — реалистично.

---

## 13. Audit-report как материал для thesis

Этот документ сам по себе — input для двух глав thesis:

### 13.1 Глава 4 (Privacy contribution)

Используй §8.1 (Strong points table) как exhaustive component list +
§11.4 (comparison table) как differentiation evidence. §8.2 (gaps) +
§11.1 (methodology-vs-impl gap) — материал для honest design trade-offs
discussion. §11.3 (reviewer Q5) — для anticipated objections.

### 13.2 Глава 7 (Discussion — Threats to validity)

Используй D2.1-2.7 (internal validity), D3.1-3.3 (external), D4.1-4.4
(statistical conclusion), D5.1-5.4 (reliability) как explicit threats
list. Это **готовая структура** для одной из самых сложных глав. Не
переписывай — копируй severity + closure + frame each as limitation
acknowledged-and-discussed.

### 13.3 Methodology (Глава 5)

D1.1-1.7 (construct validity) — material для §«Operationalization».
D6.2 (consent) + D6.7 (IRB framework) — для §«Ethics». D4.1-4.4 + D7.1
(pre-registration) — для §«Analysis plan».

### 13.4 Тropwire — что **не** делать

- Не переписывать этот audit как chapter. Он source/working document,
  не drafting space.
- Не пытаться закрыть все gap'ы кодом до пилота. 80% — text-only.
- Не игнорировать MUST. Они closeable дешёво.

---

## 14. Top-3 рекомендации «сделать прямо сейчас в pre-pilot окне»

Outranked по соотношению (closure impact × low cost × no freeze-zone
touch). Эти три gap'а закрываются за **~6 часов общей работы** и
дают максимальный academic defendability uplift.

### 🥇 #1 — Construct validity hardening: D1.1 + D1.2 (active_minutes accuracy)

**Что:** усилить heartbeat construct, чтобы defendable утверждать «real
time on task».

**Два варианта закрытия (выбрать один):**

**(a) Code-side fix** (3-4 ч, 🟦 FROZEN if pilot started):
- В `v3EmitPlayAudio` (`index.html:14430`) — также вызвать
  `v3SessionMarkActivity()` чтобы audio listening не triggered idle.
- Уменьшить `V3_SESSION_IDLE_MS` с 5 мин до 2 мин — более consistently
  отражает «active reading». Trade-off: short reading pauses теперь
  заканчивают session раньше.
- Добавить manual stopwatch validation smoke: 3 sessions × 10 мин,
  compare с `getActiveMsReal({sinceIso})`. Cap ±15% acceptance.

**(b) Doc-only fix** (1 ч, **always safe pre-pilot**):
- В thesis Methodology §«Operationalization»: явное operational
  определение метрики (см. §3.3 выше).
- В Discussion §«Threats to Validity»: подсветить construct limitations
  (audio not counted, idle gate 5 min).
- В §«Sensitivity»: при возможности reportировать `audio_play_ms_total`
  отдельно как orthogonal engagement layer.

**Рекомендация:** **(b)** для pre-pilot — safer (не трогаем freeze
zone); **(a)** — после пилота как v3.7.x improvement.

**Закрывает:** D1.1, D1.2, D5.3, частично D8.4

### 🥈 #2 — Pre-test baseline (D2.1)

**Что:** уговорить teacher провести pre-test на стартовой неделе пилота.

**Cost:** 0 часов кода + 1 разговор с teacher + 30-40 мин teacher's
time для administering pre-test на групповом занятии.

**Что нужно от teacher:**
1. На первой неделе курса — 20-минутный диагностический тест на текущем
   ulpan-уровне (или предоставить `ulpan_diagnostic_v1` в-app как
   pre-test через 📊 → «📝 Сдать диагностику»).
2. CSV-upload в teacher dashboard с заполненным `pre_test_score`.
3. На последней неделе — post-test (или re-administer same instrument).

**Что это даёт:**
- `growth_delta = post − pre` становится primary outcome
- Differentiates engagement-caused-progress vs strong-students-engaged-more
- Без этого половина empirical claims unfalsifiable

**Risk if not done:** D2.1 остаётся MUST → empirical часть диплома не
защитима в строгом смысле. Можно опираться только на `post_test_score`
absolute и аккуратно объяснять что это не доказывает causal direction
— это weaker но defendable.

**Decision required:** хочешь связаться с teacher до пилота? Если да —
координируй формат pre-test (calibrated quiz в-app vs paper-based) и
verify timeline.

### 🥉 #3 — Pre-registration + statistical framing (D4.1-4.4)

**Что:** OSF pre-registration перед запуском пилота + statistical
framing в Methodology drafts.

**Cost:** ~2-3 часа (writing + OSF submission).

**Структура pre-registration на OSF (`as_predicted` template):**
1. **Hypotheses** (4 primary, Bonferroni α=0.0125):
   - H1: `active_minutes_real × growth_delta` → r > 0 (one-tailed, prior: positive)
   - H2: `cards_added_to_srs × growth_delta` → r > 0
   - H3: `notes_created × growth_delta` → r > 0
   - H4: `srs_error_rate × growth_delta` → r < 0 (one-tailed, prior: negative — errors hurt)
2. **Outcomes:**
   - Primary: `growth_delta = post_test_score − pre_test_score` from teacher CSV
   - Secondary: `quiz_score_normalized` from calibrated quiz (with `quiz_se` weighting)
3. **Sample:** opt-in students from single ulpan cohort N=8-15; linked
   subset (those who shared UUID with teacher).
4. **Analysis plan:** Pearson r с 95% CI. Bonferroni-corrected α=0.0125
   для 4 primary. All 26 secondary metrics reported descriptively (effect
   size + CI, no significance claim).
5. **Stopping rule:** pilot ends at cohort term end (~6-12 недель); no
   interim analysis.
6. **Sensitivity analysis:** linked-subsample vs full-opt-in engagement
   distribution comparison (D2.4 closure).

Submit на osf.io/registrations с timestamp до начала пилота. URL → cite
в thesis Methodology §«Pre-registration».

**Что это даёт:**
- Closes D4.1, D4.2, D4.3, D4.4, D7.1 одним движением
- Защита от HARKing accusations
- Materially upgrades methodological rigor claim
- Открытый, citable artifact

**Decision required:** OSF account есть/нужен? Какой framework
preregistration (`as_predicted` или general OSF preregistration)?

---

## 15. Что **не делаем** в pre-pilot окне (PARK)

- D5.5 quiz test-retest
- D6.6 deletions.log hash chain
- D7.4 quiz recalibration script (deferred v3.4)
- 11.1 automated retention enforcement (deferred)
- Any large change in `research/**` или `public/js/research.js` (🟦 FROZEN)
- HE consent native review если cohort RU-primary

---

## 16. Output / handoff на next session

После approval этого audit от user:

1. **Save memory** для будущих write-up сессий: principal findings +
   closure list. (Task #12)
2. **Не писать thesis text** в этой сессии (Role 1 нужен — отдельная
   сессия).
3. **Decision triage** (30 минут Role 1 в следующей сессии или сейчас):
   - Top-3 рекомендации §14 — какие принимаешь?
   - MUST (D6.2 consent placeholder) — кто и когда?
   - D2.1 pre-test — связываемся с teacher?
   - D4.4 pre-registration — какая платформа (OSF / AsPredicted)?
   - PARK list §15 — accepted?
4. **Затем Role 1 sessions** в порядке (по BRIEF §3 «Very high»
   readiness):
   - Сначала Methodology §«Statistical framing» + §«Operationalization»
     (закрывает MUST D4.1-3 + текстовой part D1.1-2)
   - Затем Privacy contribution Глава 4 (использует §8.1 + §11.4 + §11.3)
   - Потом Discussion §«Threats to Validity» (заготовка из этого audit)
   - И только затем Introduction (обоснованный, не угадывающий)

---

## 17. References

### Documents read for this audit (READ-only):

- `docs/ULPAN_RESEARCH_PLAN_v3_2.md` (main spec)
- `docs/RESEARCH_METRICS_SCHEMA.md` (wire contract)
- `docs/RESEARCHER_GUIDE.md` (operations)
- `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` (consent v1.0)
- `docs/RESEARCH_CONSENT_RULE.md` (material-change decision tree)
- `docs/SRS_STRATEGY_v3_2.md` (retention proxy framing)
- `docs/QUIZ_ITEM_BANK_DRAFT.md` (20 items, expert-judgement)
- `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md` (Rasch methodology)
- `docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md` (provisional sign-off)
- `docs/HE_CONSENT_REVIEW_BRIEF.md` (HE native review pending)
- `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md` (freeze zone)
- `docs/PILOT_READINESS_GATE_v3_6.md` (v3.6 graph gate)
- `docs/PRE_PILOT_MATURITY_REVIEW_2026_05_21.md` (current snapshot)
- `docs/WRITE_UP_BRIEF.md` §9 (Role 4 specification)

### Code read for verification:

- `research/validate.js` (full)
- `research/storage.js` (full)
- `research/rateLimit.js` (full)
- `public/js/research.js` (full — client opt-in + aggregator)
- `public/index.html` lines 14430-14627 (session/heartbeat tracker)
- `public/db/local-db.js` lines 1580-1745 (getActiveMsReal, getActiveMinutesByDay, getSessionMetrics)

### What was NOT read (deferred to next-session needs):

- `public/js/research-ui.js` (consent flow UI)
- `public/js/teacher.js` (dashboard merge logic) — outside audit scope
- `public/js/quiz-scoring.js` (Rasch 1PL impl) — covered by docs review
- `scripts/research/*.js` (smoke + CLI) — covered by docs + structure

---

**Authorship.** Аудит проведён ассистентом 2026-05-21 как Role 4 read-only
session. Не предлагает scope creep; respect pre-pilot freeze zone; уважает
diploma-tier (not PhD-tier) стандарты. Этот документ — рабочий artefact,
готовый sырьём для Главы 7 (Discussion / Threats to Validity) и Главы 4
(Privacy contribution).

**Next action required from user:** decision triage по §16. После
approval — Role 1 sessions начинаются с Methodology + Privacy chapter
drafts (не Intro). Save memory с principal findings (Task #12).
