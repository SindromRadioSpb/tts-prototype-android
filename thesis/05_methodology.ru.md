# Глава 5 — Эмпирическая методология

> **Статус.** ЧЕРНОВИК ЗАВЕРШЁН (sequential drafting по согласованной cadence 2026-05-22).
> **Целевая длина.** ~12 страниц (drafted длиннее ради основательности по user-запросу; editing pass отложен).
> **Bilingual workflow.** RU mirror EN-канонического `thesis/05_methodology.md`. Sync invariant по `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Glossary.** `thesis/GLOSSARY.md` — canonical RU↔EN маппинги ключевых терминов.
> **Источники.** `docs/ULPAN_RESEARCH_PLAN_v3_2.md §3` + §8, `docs/RESEARCH_METRICS_SCHEMA.md`, `docs/RESEARCHER_GUIDE.md §3-§6`, `docs/SRS_STRATEGY_v3_2.md`, `docs/QUIZ_ITEM_BANK_DRAFT.md`, `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md`, `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md §3-§6`, `thesis/04_privacy_contribution.ru.md §4.3-§4.4`, OSF preregistration `osf.io/zdv9j` (DOI 10.17605/OSF.IO/ZDV9J).
> **Соответствие OSF preregistration.** Эта глава — narrative-расширение pre-registered analysis plan. Четыре primary гипотезы, Bonferroni-corrected α, effect-size-with-CI inference framing, критерии исключения данных и политика missing data зафиксированы в `osf.io/zdv9j` и воспроизведены здесь полной прозой. Любое отклонение от зафиксированного плана в Главе 6 будет явно flagged как deviation from preregistration с полным justification'ом.
> **Стилистические соглашения.** Академическое «мы»; цитирование APA 7; маркеры `[TODO: процитировать X]`.
> **Последнее обновление.** 2026-05-22 (черновик завершён).

---

## 5.1 Обзор research design

Эта глава операционализирует архитектурные обязательства Главы 4 в конкретный empirical research design: single-cohort correlational исследование цифровой учебной активности и учебных результатов в курсе иврит-ульпана, предварительно зарегистрированное на Open Science Framework ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)) до сбора каких-либо данных участников.

Дизайн **эксплораторен по самой конструкции**. Как §5.5 делает явно, естественный размер когорты одной ульпан-группы (N ≈ 8–15 enrolled студентов, с ожидаемой эффективной связанной подвыборкой N ≈ 5–12) находится ниже конвенционального порога мощности для обнаружения medium-effect корреляций. Исследование поэтому представляет оценки размера эффекта с явными 95% доверительными интервалами, а не p-value-centric inference, и формулирует нулевые результаты как «отсутствие свидетельств при данном размере выборки», а не как «свидетельство отсутствия» лежащих в основе отношений. Эта формулировка зафиксирована в preregistration и согласуется с поворотом Открытой Науки к estimation размера эффекта, а не к significance-test ритуалу [TODO: процитировать Wasserstein & Lazar 2016 ASA statement on p-values; Lakens 2018 equivalence-test pedagogy].

Эмпирическое исследование — **вторичный** вклад диплома. Его основная цель — продемонстрировать, что privacy-preserving research-mode архитектура Главы 4 может быть развёрнута на реальной когорте и produce interpretable output даже при малом N. Методологический вклад, защищаемый в Главе 4, независим от любого конкретного эмпирического исхода. Эта асимметричная weighting подтверждается здесь снова, потому что она формирует каждый методологический выбор, следующий далее: где статистическая мощность ограничена когортой, мы выбираем precise effect-size estimation, а не спекулятивный power-targeted recruitment; где construct validity ограничена offline-first архитектурой, мы выбираем честные operational definitions, а не claims на исчерпывающее измерение вовлечённости.

## 5.2 Участники

### 5.2.1 Целевая популяция

Целевая популяция — взрослые изучающие иврит (ages 18+), enrolled в курс ульпана, преимущественно русскоязычные L1-носители на уровнях CEFR A2–B2. Когорта в данном исследовании состоит из всех enrolled студентов группы одного ульпан-учителя, recruited через непрямой referral этого учителя. Главный исследователь не контактирует с участниками напрямую во время recruitment — намеренный процедурный выбор, сохраняющий two-key split-knowledge архитектуру §4.3.5 (исследователь знает анонимные UUID и метрики; учитель знает имена и экзаменационные баллы; связывание инициируется участником).

### 5.2.2 Критерии включения и исключения

**Критерии включения**, применяемые в начале исследования:

- Enrolled в recruiting ульпан-когорту.
- Возраст 18 или старше (self-attested на consent-экране, не документально).
- Имеет доступ к устройству, способному запустить современный веб-браузер с `localStorage` и IndexedDB (фактически любое устройство менее чем ~5-летней давности).
- Предоставляет явное информированное согласие внутри приложения LinguistPro — пять обязательных чекбоксов, покрывающих добровольное участие, право на отзыв, сбор только агрегатов, отсутствие PII и согласие на участие.

**Критерии исключения**, pre-specified в OSF preregistration до любой инспекции данных:

- **E1.** Не opt-in в research-mode (нет consent-клика → нет собранных данных → не участник).
- **E2.** Opt-in, но не произвёл ни одной выгрузки данных в течение cohort term'а (нет сигнала — исключён из анализа).
- **E3.** Отозвал согласие в середине курса через in-app one-click withdrawal flow (данные полностью удалены server-side; учтён в attrition, но не включён в финальный анализ).
- **E4.** Собственный dogfood UUID главного исследователя, идентифицируемый точным UUID-match'ем, зафиксированным в analysis notebook до экспорта датасета когорты.
- **E5.** Отсутствует outcome score после 14-дневного settling window (нет валидного `post_test_score` ни из одного из трёх путей: teacher CSV, student self-report, in-app calibrated quiz) — исключён из primary correlation анализов, но сохранён в cohort descriptive statistics там, где engagement-only метрики позволяют.

### 5.2.3 Размер выборки и мощность

Исследование использует **opportunistic sampling**: выборка равна тем участникам, которых естественная когорта содержит, без recruitment'а за её пределами. Целевая enrollment — N ≈ 8–15. Из них эффективная выборка для primary hypothesis tests (**связанная подвыборка**) — N ≈ 5–12 — ограничена участниками, которые и opt-in в research mode, и добровольно раскрыли свой UUID учителю для outcome linking.

Мы признаём, что данный размер выборки **underpowered** для детекции корреляций средних эффектов. При Bonferroni-corrected α = 0.0125 (одностороннем) и конвенциональной 80% мощности детектируемый эффект при N = 10 — приблизительно r ≥ 0.78 — только large effects. Средние эффекты (0.3 ≤ r < 0.5) статистически недетектируемы при данном размере. Полное обсуждение мощности, включая impactations для нулевых результатов и rationale для preregistration при данном размере выборки несмотря на признанную underpower, зафиксировано в OSF preregistration и воспроизведено в §5.5.6.

## 5.3 Инструменты

### 5.3.1 LinguistPro как инструмент измерения вовлечённости

Engagement-метрики собираются автоматически LinguistPro — open-source веб-приложением для изучения иврита, которое участники используют как один из своих учебных инструментов во время курса ульпана. Research-mode приложения эмитирует daily aggregated summary активности участника, структурированный как **шестислойная engagement-таксономия**, адаптированная из learning-analytics литературы [TODO: процитировать Siemens 2013 learning-analytics foundational или эквивалент]:

- **Слой 1: Engagement** — количество сессий, активные минуты (heartbeat-derived; см. §5.6.1), активные дни, time-of-day distribution.
- **Слой 2: Volume** — открытые тексты (distinct и total), прочитанные предложения, длительность audio-проигрывания, encountered слова, SRS карточки созданные и экспортированные, заметки созданные и редактированные, поисковые запросы (только counter — никогда сами строки запросов).
- **Слой 3: Quality** — SRS error rate, cards-due completion ratio, smart-tag overrides.
- **Слой 4: Hebrew-specific** — transliteration toggles, audio replay distribution, niqqud-marked time ratio (если собирается), binyan coverage и root-encounter diversity (если morphology Tier 3+ активен).
- **Слой 5: Outcome** — заполняется отдельно (см. §5.3.2–§5.3.4).
- **Слой 6: Cohort-level** — distributions, clusters, и time-to-mastery patterns, выводимые во время анализа, не хранимые server-side.

Полная схема определена в `docs/RESEARCH_METRICS_SCHEMA.md` и обеспечивается на серверной границе schema-strict валидатором, описанным в §4.4.1. Только daily aggregates покидают устройство участника; сырые события участника остаются локально в OPFS-резидентной SQLite database браузера, никогда не загружаемые.

### 5.3.2 Teacher CSV как primary outcome instrument

**Primary outcome переменная** — `growth_delta = post_test_score − pre_test_score`, где оба балла reported учителем ульпана через CSV upload в конце курса. Ожидаемая шкала — 0–100 (configurable per cohort через `cohort_meta.outcome_scale`). Учитель загружает через интерфейс outcomes-CSV teacher dashboard; формат — `student_id, pre_test_score, post_test_score, exam_date, uploaded_by`, где `student_id` — анонимный UUID участника, раскрытый участником учителю (по дизайну two-key linking §4.3.5).

Если учитель не administer'ит или не report'ит `pre_test_score`, secondary outcome `post_test_score` (absolute, не differenced) используется вместо него; соответствующие тесты отчитываются как secondary с явным признанием того, что causal direction не может быть выведено из absolute outcome alone.

### 5.3.3 Calibrated Rasch 1PL диагностический квиз (tertiary outcome)

Приложение предлагает in-app **calibrated diagnostic quiz** (`ulpan_diagnostic_v1`) как параллельный outcome path. Квиз состоит из 20 items, сбалансированных по уровням CEFR A1–C1 (4/4/5/4/3), и scored one-parameter logistic (Rasch) моделью, реализованной в чистом JavaScript в `public/js/quiz-scoring.js` [TODO: процитировать Rasch 1960/1980 foundational; Bond & Fox 2007 applied Rasch measurement]. Output — `quiz_score_normalized` (0–100 трансформация latent ability θ ∈ [−3, +3]), `quiz_cefr_band` (детерминированный linear bucket score'а, не отдельно measured datum), и `quiz_se` (standard error θ estimate, указывающий measurement precision).

Item bank квиза несёт `calibration_method: "expert_judgement_v1"` flag на момент написания; difficulty parameters — placeholders, derived из expert judgement и AI pre-review, awaiting empirical IRT recalibration, как только ≥ 30 cohort responses накопятся (deferred к v3.4+ по `docs/ULPAN_DIAGNOSTIC_QUIZ_v1.md §6`). Внешний ulpan-teacher review item bank — pending. Соответственно, quiz outcome обрабатывается как **secondary** к teacher CSV; quiz scores отчитываются вместе с teacher-CSV scores в dashboard'е, но четыре primary гипотезы тестируются против `growth_delta`, derived из teacher CSV когда доступно, fall back'ая к `post_test_score` absolute (из любого пути), когда growth недоступен.

### 5.3.4 Self-report как tertiary fallback

Участники могут submit'ить свой собственный end-of-course exam score через self-report path приложения (Research panel → 🎓 Сдать экзамен). Этот путь обрабатывается как outcome source с наименьшей authority: используется только когда и teacher CSV, и calibrated quiz outcomes недоступны для участника. Self-report известен ненадёжным для academic-performance recall [TODO: процитировать Kuncel et al. 2005 self-report academic accuracy meta-analysis или эквивалент], и это признано в §5.9 Ограничения.

## 5.4 Процедура

### 5.4.1 Provisioning когорты (pre-recruitment)

До participant recruitment главный исследователь provision'ит когорту на research-сервере. Шаг provisioning создаёт `cohort_meta.json`, содержащий код когорты, k-anonymity threshold (default 5), retention-дата (2 года post-cohort-end), researcher token hash, и минимальная версия согласия. Provisioning выполняется через CLI `scripts/research/create_cohort.js` или через in-UI admin форму на `/teacher.html`. Cohort code — non-secret group identifier (regex `[A-Z0-9-]{4,16}`).

### 5.4.2 Recruitment и согласие

Учитель ульпана distribute'ит cohort code enrolled студентам через канал по своему выбору (WhatsApp, Telegram, printed handout, email), вместе с брифом, объясняющим исследование (RU primary; EN translation доступен). Главный исследователь не контактирует с участниками напрямую во время recruitment — непрямой referral сохраняет two-key разделение.

Участник навигирует в LinguistPro веб-приложение, открывает Research panel, и ему предъявляется informed-consent экран (`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`). Участник прочитывает полный шаблон, чекит пять обязательных consent-чекбоксов (добровольное участие, право на отзыв, сбор только агрегатов, нет PII, согласие на участие), вводит cohort code, и подтверждает. По подтверждении приложение генерирует анонимный UUID v4 client-side через `crypto.randomUUID()`, сохраняет его в `localStorage.researchStudentId_v1` и enable'ит daily aggregator.

### 5.4.3 Фаза ежедневного использования

В течение duration'а курса ульпана (обычно 6–12 недель) участники используют LinguistPro как один из своих учебных инструментов по ивриту. Приложение эмитирует события в локальную OPFS-резидентную SQLite таблицу `events`; once-per-day агрегатор собирает daily aggregate payload из этих событий, POST'ит его на `/api/research/v1/metrics`, и логирует результат локально (видимый участнику через transparency modal §4.4.4).

Участники свободны использовать приложение столько, сколько желают. Нет требования minimum-usage, нет engagement-таргета, нет participation reminder от исследователя. Opt-in полностью обратим в любой момент через one-click withdrawal flow §4.3.6.

### 5.4.4 Outcome capture

В конце курса три независимых пути захватывают outcome:

1. **Teacher CSV upload** (authoritative primary). Учитель загружает CSV, маппящий `student_id` (UUID) на `pre_test_score`, `post_test_score`, и exam date.
2. **In-app calibrated quiz** (secondary). Участники проходят 20-item 1PL Rasch diagnostic; score, CEFR band и standard error загружаются.
3. **Self-report** (tertiary fallback). Участники вводят свой собственный score через Research panel.

Связывание UUID с real-world идентичностью требует, чтобы участник добровольно раскрыл свой UUID учителю — обычно записав его на экзаменационной бумаге. Этот шаг — **participant-initiated** opt-in к outcome linking, которого требует two-key архитектура. Участники, которые opt-in в исследование, но отказываются раскрыть свой UUID, остаются в cohort engagement dataset, но их экзаменационные баллы не могут быть связаны с их engagement записью; их данные contribute'ят к descriptive statistics, но не к correlation tests §5.5.

### 5.4.5 Settling window и data freeze

В конце cohort term'а **14-дневное settling window** позволяет учителю завершить CSV outcome upload, а участникам — submit'ить любые last-minute self-reports. Главный исследователь не инспектирует engagement-vs-outcome отношение в течение этого window'а — correlation view teacher dashboard'а доступно throughout cohort, но PI commit'ит не использовать его для inference decisions, пока dataset не заморожен.

В конце settling window analytic dataset экспортируется через CSV-интерфейс teacher dashboard'а как три файла: `cohort_<code>_aggregates.csv` (per-student totals + outcomes), `cohort_<code>_timeseries.csv` (per-student per-day), и `cohort_<code>_derived.csv` (composite indices). Этот CSV bundle — **замороженный** analytic dataset; любое subsequent server-side изменение (late upload, late withdrawal) документируется в «post-freeze events» секции thesis'а (Глава 6), но не модифицирует frozen dataset.

## 5.5 План анализа

Эта секция воспроизводит OSF pre-registered analysis plan ([doi:10.17605/OSF.IO/ZDV9J](https://doi.org/10.17605/OSF.IO/ZDV9J)) в narrative форме. Любое отклонение от этого плана в Главе 6 будет явно flagged как deviation from preregistration с полным justification'ом.

### 5.5.1 Primary гипотезы

Тестируются четыре primary гипотезы, с directional one-tailed предсказаниями, основанными на prior CALL литературе о engagement и learning outcomes:

- **H1.** `total_active_minutes_real` коррелирует **положительно** с `growth_delta`. *Rationale:* time-on-task — робастный предиктор learning gain в CALL литературе [TODO: процитировать Hattie 2009 *Visible Learning*; Ericsson & Pool 2016 deliberate practice].
- **H2.** `total_cards_added_to_srs` коррелирует **положительно** с `growth_delta`. *Rationale:* активное создание карточек указывает, что обучающийся обрабатывает и курирует новый материал — метакогнитивный engagement-сигнал за пределами raw exposure time.
- **H3.** `total_notes_created` коррелирует **положительно** с `growth_delta`. *Rationale:* note-taking — effortful retrieval-and-elaboration активность, ассоциированная с deeper encoding [TODO: процитировать Mueller & Oppenheimer 2014 longhand vs laptop note-taking].
- **H4.** `srs_error_rate` коррелирует **отрицательно** с `growth_delta`. *Rationale:* higher error rate во время практики указывает на weaker recall; мы ожидаем inverse relationship с overall learning gain.

Все остальные ≈ 20 собираемых метрик — **эксплораторные**, не pre-registered для confirmatory тестирования.

### 5.5.2 Статистические модели

**Primary tests (bivariate Pearson correlation).** Для каждого из H1–H4 мы вычисляем Pearson product-moment correlation coefficient *r* между engagement predictor'ом и `growth_delta`, с 95% доверительным интервалом, derived через Fisher *z*-трансформацию (z′ = 0.5 × ln((1+r)/(1−r)); CI вычисляется в *z*-space'е, затем back-transformed в *r*-space).

**Confirmatory multiple linear regression (supplementary).** Single OLS regression совместно estimate'ит четыре predictor'а:

```
growth_delta ~ active_minutes_real + cards_added_to_srs + notes_created + srs_error_rate
              + [covariates если собраны: pre_test_score, motivation, hours_per_week]
```

Reported outputs: стандартизированные β коэффициенты с 95% CI; omnibus R²; adjusted R² (small-N penalized); variance-inflation factors (VIF) для collinearity diagnosis. Interaction terms **не** включены — размер выборки не поддерживает interaction power.

### 5.5.3 Критерии inference

Все четыре primary гипотезы используют **one-tailed tests** при Bonferroni-corrected α = 0.05 / 4 = 0.0125 per hypothesis. Decision rule:

- **«Directionally supported»** если (a) *r* в предсказанном направлении, И (b) 95% CI excludes zero, И (c) *p* < 0.0125.
- **«Directionally consistent but underpowered»** если *r* в предсказанном направлении и 95% CI overlaps zero (независимо от *p*-value). При ожидаемом размере выборки это — наиболее вероятный исход для moderate effects.
- **«No evidence of large effect»** если *r* мал (|r| < 0.3) или в неправильном направлении.

95% CI на *r* — не *p*-value — это **primary inferential statistic**. При N ≈ 10 sample *r* = 0.5 даёт 95% CI приблизительно [−0.10, 0.83]; это descriptively информативно об uncertainty способом, которым single *p*-value не является.

Нулевой результат на четырёх primary гипотезах интерпретируется как **«нет свидетельств large effect при данном размере выборки»**, *не* как подтверждение нулевой гипотезы. Мы признаём «отсутствие свидетельств — не свидетельство отсутствия» явно throughout results и discussion.

### 5.5.4 Контроль multiple comparisons

Через четыре primary гипотезы Bonferroni correction устанавливает α на 0.0125 per test. Выбор Bonferroni над false-discovery-rate методами (Benjamini-Hochberg) обоснован малым числом pre-registered tests (4) с сильными directional prior предсказаниями; conservativeness Bonferroni уместен в этом confirmatory режиме. False-discovery control становится более полезным для high-dimensional screening, что не является режимом primary анализа.

≈ 20 exploratory метрик **не** corrected для multiple comparisons, потому что они **не significance-tested вообще** — они отчитываются с descriptive statistics и 95% CI как только effect-size estimates. Любой exploratory finding, который выглядит compelling, отчитывается как **гипотеза для future confirmatory study**, никогда не elevated retroactively в confirmatory status (HARKing prohibition).

### 5.5.5 Тесты предположений модели

Для каждого primary test и для confirmatory regression мы отчитываемся post-fit diagnostics как descriptive evidence, не как inferential gates:

- **Normality of residuals.** Shapiro-Wilk test + visual Q-Q plot.
- **Linearity.** Residuals-vs-fitted scatter с loess smoothing.
- **Homoscedasticity.** Breusch-Pagan test.
- **High-influence observations.** Cook's distance для каждой observation; values d > 4 / N flagged.
- **Multicollinearity** (только regression). VIF для каждого predictor'а; values > 5 flagged как concern.

Decision criteria, contingent на diagnostic outcomes:

- Если Shapiro-Wilk indicates non-normal residuals при малом N, мы дополнительно отчитываемся Spearman ρ как robust alternative наряду с Pearson *r* (sensitivity check, не replacement).
- Если Breusch-Pagan indicates heteroscedasticity, мы дополнительно отчитываемся Huber-White heteroscedasticity-consistent (HC3) standard errors для regression коэффициентов.
- Если Cook's distance flag'ит более одной high-influence observation в sample N = 10, мы отчитываемся анализ как с flagged observation(s), так и без — никогда silently excluded.
- Если все три из {normality, homoscedasticity, linearity} fail катастрофически И robust methods diverge от primary в magnitude или direction, affected гипотеза понижается с confirmatory до exploratory в thesis, с disagreement reported transparently. Это понижение решается **до** видения каких-либо primary effect sizes, основываясь только на assumption-test outcomes.

### 5.5.6 Статистическая мощность: underpower как design constraint

При Bonferroni-corrected one-tailed α = 0.0125 и 80% conventional power [TODO: процитировать Cohen 1988 *Statistical Power Analysis for the Behavioral Sciences*]:

- N = 28 требуется для детекции r = 0.5 (medium effect).
- N = 14 требуется для детекции r = 0.7 (large effect).
- При ожидаемом N ≈ 10 (linked subsample) исследование имеет 80% power только для r ≥ 0.78.

Эта underpower — не bug; это **структурное ограничение** single-ulpan-cohort diploma-scale исследования. Мы pre-register и проводим эмпирическое исследование при данном размере выборки потому что:

1. Методологический вклад, защищаемый в Главе 4, независим от empirical outcome; роль empirical study — демонстрация, что архитектура может быть развёрнута и produce interpretable output, не статистическое подтверждение CALL-engagement гипотез.
2. Pre-registration при малом N всё ещё защищает против HARKing и multiple-comparison inflation, что являются нетривиальными рисками независимо от мощности. Pre-registered analysis auditable post-hoc против deviation.
3. Effect-size estimation с CI информативно даже при малом N — wide CI сам является правильным научным reporting'ом, когда данные не поддерживают tight conclusions [TODO: процитировать Cumming 2014 *new statistics* on estimation framing].

Мы признаём, что confirmatory inference при этом размере хрупок. Нулевые findings отчитываются как «нет свидетельств large effect»; positive findings отчитываются с wide CIs, которые следует интерпретировать как effect-size estimates с substantial uncertainty, не как proven correlations. Эта формулировка — центральное методологическое обязательство эмпирической главы.

### 5.5.7 Включение и исключение данных

Включение: все участники, которые opt-in в research mode, были enrolled в recruiting cohort в начале исследования, и произвели ≥ 1 data upload в течение cohort term'а. Возраст ≥ 18.

Критерии исключения E1–E5 определены в §5.2.2 и pre-registered до любой инспекции данных. Outlier handling на уровне observation:

- Per-metric values за пределами ±3 SD от cohort mean отчитываются отдельно, но **не** исключаются из primary analysis. При малом N outlier exclusion слишком aggressive — single exclusion может flip correlation sign or magnitude.
- Outlier impact assessed через Spearman ρ (rank-based, outlier-resistant), reported наряду с Pearson *r*.
- Cook's distance flags в regression отчитываются с sensitivity анализами как с flagged observation, так и без.

Любое post-hoc исключение, не покрытое E1–E5, явно flagged в thesis как deviation from preregistration с полным justification'ом.

### 5.5.8 Handling missing data

- `pre_test_score` отсутствует → `growth_delta` null; fall back к `post_test_score` absolute как secondary outcome с явным causal-direction caveat.
- `post_test_score` отсутствует из всех трёх путей (teacher CSV, self-report, calibrated quiz) → участник исключён из primary correlation по E4.
- Calibrated quiz score отсутствует → tertiary outcome null для этого участника; primary анализы на `growth_delta` proceed; quiz-specific validity checks drop этого участника через pairwise listwise deletion.
- Engagement-метрики не могут отсутствовать для opted-in участников, которые загрузили ≥ 1 день. Zero values сохраняются как zero (zero engagement — meaningful signal, не missing-data event).
- Covariate отсутствует → listwise-deleted из regression. Если covariate missingness превышает 30%, regression rerun без covariates; это decision rule committed до инспекции magnitude любого covariate effect.

**Imputation не применяется**, по deliberate choice: при малом N методы imputation (mean substitution, regression imputation, multiple imputation через `mice`) introduce больше uncertainty, чем resolve. Честное reporting N-with-data предпочтительнее. Missingness rate reported наряду с primary анализами. Если overall missingness rate на primary outcome превышает 30%, primary анализы явно downgrade'аются до «exploratory only» status в thesis.

Мы признаём Missing-Not-At-Random (MNAR) риск: участники, которые disengage от приложения в середине курса, также более вероятно skip экзамен или withdraw, что создаёт selection bias на linked subsample. Sensitivity анализ §5.5.9 (linked-vs-opt-in distribution comparison) непосредственно адресует этот риск.

### 5.5.9 Sensitivity анализы

- **Linked-vs-opt-in distribution comparison.** Per-metric engagement distributions сравниваются между linked subsample (теми, кто шарил UUID с учителем) и full opted-in cohort (без outcome data) через Kolmogorov-Smirnov test, reported descriptively. Если linked subsample систематически more engaged, claims scoped к linked subsample only в Discussion (Глава 7).
- **Multi-device fragmentation.** Где manual UUID linking через `scripts/research/link_student_ids.js` applied (только по participant request), primary results reported и с, и без manual linking applied.
- **Drift между last app use и exam.** Median days между `last_upload_date` и `exam_date` reported как descriptive context; longer drift может attenuate engagement-outcome correlation через forgetting-curve effects.
- **Spearman ρ наряду с Pearson r.** Reported для каждого primary test как outlier-resistant robustness check.

### 5.5.10 Эксплораторные анализы

Все ≈ 20 метрик, не среди четырёх primary гипотез, — exploratory, reported descriptively с effect size + 95% CI **без** significance testing. Полный exploratory list документирован в OSF preregistration; ключевые анализы включают per-secondary-metric × `growth_delta` scatter plots, composite `engagement_score` × `growth_delta` (vs raw active minutes), `cards_added_to_srs / cards_exported_to_anki` ratio как mastery proxy, time-of-day distribution patterns, и per-day engagement trajectory patterns.

Compelling exploratory findings явно labeled «exploratory, not confirmatory» в thesis Discussion и proposed как гипотезы для future confirmatory studies. HARKing prohibition обязателен throughout.

## 5.6 Операционализация

Эта секция предоставляет operational definitions для конструктов, измеряемых исследованием. Каждое определение честно о том, что и не захватывается соответствующей метрикой.

### 5.6.1 active_minutes_real

`active_minutes_real` **операционально определён** как сумма 30-секундных heartbeats, эмитируемых приложением, пока вкладка браузера visible **И** user interaction (`keydown`, `click`, `pointerdown`, `scroll`, или `touchstart`) произошёл в течение предыдущих 5 минут. Heartbeats fire на 30-секундном интервале; если interaction не произошёл ≥ 5 минут, heartbeat counter pause'ится (idle gate); если вкладка hidden (`visibilitychange`), heartbeats suppressed; одна сессия capped на максимум 60 минут для предотвращения runaway counters.

Это определение захватывает **interactive engagement**, не total exposure time. В частности, **audio-only sessions без interaction не считаются** — участник, слушающий 10-минутный Hebrew audio passage без скроллинга, клика или typing'а, не будет accumulate `active_minutes_real`. Это known under-counting для passive listening и признаётся здесь и в §5.9 Ограничения.

Реализация живёт в `public/index.html` lines 14430–14627 (`v3SessionStart` / `v3SessionHeartbeat` / `v3SessionEnd`) и `public/db/local-db.js` `getActiveMsReal()`. Manual stopwatch validation этой метрики против трёх test sessions (≈ 10 минут каждая) рекомендуется pre-pilot как часть construct-validity check (audit Recommendation D5.3); результат, если performed, reported в Главе 6 наряду с cohort data.

### 5.6.2 SRS-метрики: proxy framing

`srs_error_rate = cards_again / cards_reviewed` измеряет review accuracy участника **только в in-app stub Trainer'е**. По `docs/SRS_STRATEGY_v3_2.md` (approved 2026-05-12), LinguistPro — слой **creation и linkage** для SRS карточек; Anki — **recommended review** слой. Большинство участников, которые seriously используют SRS, экспортируют свои карточки в Anki и review там, где их grades не visible research-серверу.

Diploma therefore reports `srs_error_rate` как **proxy** для SRS engagement, с явным caveat'ом, что он captures только secondary in-app review path. Complementary метрика `cards_exported_to_anki / cards_added_to_srs` (mastery proxy) reported как exploratory secondary indicator commitment'а участника к retention материала в real review pipeline. Полная retention validation deferred к future v3.4+ Anki Connect bidirectional sync.

### 5.6.3 Формула growth_delta и handling null

`growth_delta = post_test_score − pre_test_score`, computed deterministically из teacher-reported numerical scores. Ожидаемая шкала — 0–100 (configurable per cohort через `cohort_meta.outcome_scale`).

Null handling:

- Если `pre_test_score` null → `growth_delta` null → участник использует `post_test_score` absolute как secondary outcome (с явным causal-direction caveat в анализах).
- Если `post_test_score` null из всех трёх путей → участник исключён по E4.
- Если оба present, но scores равны (zero growth) → `growth_delta = 0` сохраняется; это meaningful signal, не missingness.

Derived metric computed at analysis time в R notebook'е, не stored server-side, обеспечивая single canonical formula. OSF preregistration locks эту формулу.

### 5.6.4 Treatment multi-device UUID

По дизайну (decision §4.3.2), каждое устройство генерирует свой UUID. Участник, использующий LinguistPro на телефоне и laptop'е, появляется в dataset'е как **два участника** по умолчанию. Это deliberate consequence per-device privacy архитектуры: server-side identity mapping не существует.

Участники, желающие быть analyzed как single observation, могут request manual linking out-of-band; researcher then executes `scripts/research/link_student_ids.js` (см. `docs/RESEARCHER_GUIDE.md §2.1.2`), который переписывает cohort `.jsonl` файлы и `outcomes.csv`, маппя secondary UUID на primary, audited в `deletions.log`. Каждое manual linking decision документируется в analysis notebook'е с date, reason и verification method. Primary results reported **и с, и без** manual linking applied как sensitivity check (§5.5.9).

### 5.6.5 Handling временной зоны

Все timestamps в схеме (`upload_ts`, `since_ts`, `events.ts`) recorded в **UTC**, с day-level granularity для upload-level timestamps. `time_of_day_histogram` использует UTC hours. Для участников в IL (UTC+2/+3 в зависимости от daylight savings) evening sessions могут пересечь UTC midnight boundary и быть attributed к следующему календарному дню в histogram'е и daily-aggregate windows; это acknowledged minor distortion, который не влияет на cumulative metrics, но влияет на per-day breakdowns на day boundary. Cohort-level patterns reported в time-of-day analysis interpreted с этим caveat в mind.

## 5.7 Скоуп обобщения

Findings исследования scoped к population, sample которой когорта. Конкретно:

- **Sampling unit**: студенты, enrolled в группу одного ульпан-учителя в начале исследования; recruitment opportunistic в пределах этой естественной когорты.
- **Geographic scope**: где бы студенты учителя ни проживали (когорта может быть in-person в физическом ulpan facility или online/remote в зависимости от instructional mode учителя). Geographic data не captured per privacy architecture, так что geographic scope документируется на cohort level через teacher-supplied context, не через per-student capture.
- **L1 composition**: преимущественно русскоязычные L1-носители; HE-primary cohort deployment gated на HE consent native review (`docs/HE_CONSENT_REVIEW_BRIEF.md`), который pending на момент написания.
- **CEFR level**: A2–B2 typical for adult ulpan groups.
- **App familiarity**: opted-in участники systematically more app-friendly, чем полная ulpan group; linked subsample doubly so (opt-in AND chose to share UUID с учителем). Generalization за пределы linked subsample поэтому restricted.
- **Outcome scale**: cohort-specific (`cohort_meta.outcome_scale`); grading style учителя влияет на comparability cross-cohort exam scores. Comparative claims across teachers не supported данным дизайном.

Мы не claim generalization к (a) Hebrew learners в general, (b) ulpan students в других институциях, (c) participants без app affinity, или (d) различным L1 populations. Эти restrictions документируются честно, потому что over-claiming generalization был бы dishonest path; contribution исследования в более широкое CALL knowledge — через методологическую рамку (Глава 4), reusable для future studies, не через empirical generalization из этой single cohort'ы.

## 5.8 Операционализация этики

Этическая рамка, объявленная в §4.7 — Хельсинкская декларация §22–32, GDPR Article 6(1)(a), и de-facto ethics oversight diploma supervisor'а `[имя руководителя]` — operationalized в процедуре следующим образом:

- **Информированное согласие** administered через five-checkbox consent screen при первом opt-in. Участники прочитывают full template (`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`), check все пять обязательных чекбоксов, вводят cohort code, и подтверждают. `acceptConsent(version)` call записывает consent timestamp и version в `localStorage.researchConsentVersion_v1`.
- **Voluntariness** preserved через opt-in default: участники, которые не click consent, не enrolled, и приложение функционирует идентично для них. Withdrawal one-click and complete.
- **Минимизация данных** (GDPR Art. 5(1)(c)) operationalized через allow-list `FORBIDDEN_FIELDS` schema validator'а и recursive deep-check (§4.4.1).
- **Право на удаление** (GDPR Art. 17) operationalized через `deleteStudentFromCohort()` cascading delete (§4.4.2). Withdrawal удаляет все server-side records и clear's local state unconditionally.
- **Supervisor oversight** exercised throughout cohort term; supervisor `[имя руководителя]` review's progress и acknowledged в thesis acknowledgements.
- **Auditable артефакты**: consent template version per participant logged с каждым upload; OSF preregistration timestamps analysis plan; `deletions.log` audit's каждое withdrawal; open-source кодовая база доступна для внешнего scrutiny.

Более полное обсуждение IRB-style рамки появляется в §4.7 и в supporting `thesis/IRB_FRAMEWORK_DRAFT.md`.

## 5.9 Ограничения методологии

Полное Discussion threats to validity появляется в Главе 7. Здесь мы preview методологические ограничения, которые дизайн известно carries:

**Статистические ограничения.** Размер выборки N ≈ 8–15 (linked subsample N ≈ 5–12) ниже conventional power thresholds для medium-effect detection. Pre-registered Bonferroni correction при α = 0.0125 дополнительно повышает effective detection floor. Confirmatory inference хрупок; effect-size estimation с wide CIs — most informative reporting mode.

**Construct ограничения.** `active_minutes_real` captures interactive engagement, не passive listening (§5.6.1). `srs_error_rate` измеряет secondary in-app stub Trainer, не primary Anki review path (§5.6.2). `growth_delta` требует teacher-reported `pre_test_score`; в когортах без administered pre-tests fallback `post_test_score` absolute не может поддержать causal direction interpretation (§5.6.3).

**Selection bias.** Opt-in в research voluntary, так что opt-in cohort systematically more app-friendly, чем full ulpan group. Linked subsample (те, кто дополнительно шарили UUID с учителем) doubly selected и может differ further от opt-in cohort на conscientiousness и engagement dispositions. Sensitivity analysis §5.5.9 непосредственно addresses этот bias.

**Hawthorne effect.** Участники знают, что их поведение измеряется (transparency UI §4.4.4 делает это visible); сама прозрачность создаёт observer-effects на поведение. Это inherent cost privacy-transparent design [TODO: процитировать Adair 1984 Hawthorne re-examination]. Мы принимаем его как structural limitation opt-in transparency-first research-mode.

**Confounding variables.** Motivation, prior Hebrew exposure, family support, age и hours-per-week available for study не measured server-side. Pre-registered regression может включать covariates, если brief teacher-administered pre-cohort survey их собирает, но teacher cooperation не guaranteed.

**Single-cohort generalizability.** §5.7 документирует scope. Findings не claimed обобщать за пределы linked subsample этой single cohort.

**Калибровка quiz instrument'а.** Rasch 1PL diagnostic использует expert-judgement difficulty parameters на момент написания; external ulpan-teacher review pending. Quiz therefore обрабатывается как secondary outcome, не primary.

Эти ограничения документируются честно в OSF preregistration и methodology, потому что over-claiming strength методов был бы intellectually dishonest. Глава 7 (Discussion) интерпретирует их в context'е obtained results.

## 5.10 Резюме и переход к Results

Эта глава операционализировала архитектурные обязательства Главы 4 в конкретный empirical дизайн: single-cohort correlational исследование с четырьмя pre-registered primary гипотезами, Bonferroni-corrected α = 0.0125, effect-size-with-CI inference, и явным acknowledgement of underpower как structural к diploma-scale single-cohort setting'у. Процедура preserves two-key split-knowledge архитектуру через indirect teacher-mediated recruitment и participant-initiated outcome linking. Operationalization честна о том, что метрики captures и не captures. Ethics framed внутри Helsinki + GDPR + supervisor-oversight и operationalized через code-level mechanisms (consent versioning, cascading deletion, schema-strict validation). Ограничения документируются up-front, а не relegated в Discussion alone.

Глава 6 reports obtained results — и confirmatory (четыре primary гипотезы с effect sizes + CIs), и exploratory (более широкая descriptive картина engagement patterns и их relationships к outcome). Reader invited читать findings Главы 6 через methodological lens, established здесь: как effect-size estimates с uncertainty made visible через 95% confidence intervals, не как significance-test verdicts.

---

**Конец Главы 5.**
