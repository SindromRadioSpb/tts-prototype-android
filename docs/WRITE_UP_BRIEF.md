# Write-up Brief — диплом по LinguistPro

> **Назначение.** Карта материалов и плана работы над текстом
> дипломного проекта, чтобы каждая write-up-сессия начиналась с
> готового контекста и не переоткрывала уже принятые решения.
>
> **Авторство.** Подготовлено 2026-05-21 после закрытия pre-pilot
> polish-блока. См. триггеры устаревания в §7.

---

## 1. Тема и контрибуция

**Тема (утверждена 2026-05-10, ULPAN_RESEARCH_PLAN §1 D1):**

> «Анализ корреляции цифровой учебной активности и результатов в
> иврит-ульпане: проектирование privacy-preserving opt-in research-mode
> в language-learning приложении».

**Две публикуемые компоненты в одной дипломе:**

1. **Эмпирическая** — single-group correlational study на реальной ulpan-когорте, где переменные «цифровая активность» (6 слоёв метрик) коррелируют с outcome (экзаменационный балл).
2. **Методологическая** — opt-in privacy-preserving research-mode как переиспользуемый дизайн-артефакт. По задумке — open-source, для будущих CALL-исследователей. **Это сильная контрибуция диплома, защитима даже если empirical часть провалится** (нулевые/слабые корреляции).

**Дизайн исследования:** single-group correlational (не RCT). Обоснование в плане §13 (RCT out of scope для diploma scale).

## 2. Предложенная структура текста

Подходит для диплома MSc-уровня в Russian/Israeli/international вузе. Можно подстроить под конкретные требования вашего вуза — это рабочая отправная точка.

| # | Глава | RU title | Объём ~стр |
|---|---|---|---|
| 1 | Introduction | Введение | 5–8 |
| 2 | Related Work | Обзор литературы | 12–18 |
| 3 | System Design | Архитектура и функциональность LinguistPro | 10–15 |
| 4 | Privacy-Preserving Research Mode | Privacy-preserving режим исследования (методологический вклад) | 12–18 |
| 5 | Methodology | Методология эмпирического исследования | 8–12 |
| 6 | Results | Результаты | 8–15 (после пилота) |
| 7 | Discussion | Обсуждение | 5–8 |
| 8 | Conclusion + Future Work | Заключение и направления развития | 3–5 |
| — | Bibliography | Список литературы | — |
| — | Appendices | Приложения (consent forms, schemas, screenshots) | — |
| **Итого** | | | **~75–110 стр** |

## 3. Source map: какая глава из чего собирается

### Глава 1 — Introduction
- **Источники в репо:** `ULPAN_RESEARCH_PLAN §1 + §2`, `PRE_PILOT_MATURITY_REVIEW §1`, `README.md`.
- **Что есть:** проблема (ульпан-обучение нужно измерять; цифровые инструменты доступны; privacy — открытый вопрос); positioning; цели.
- **Что писать с нуля:** academic-style формулировка research questions (RQ1: какая активность коррелирует с outcome; RQ2: масштабируется ли privacy-preserving дизайн), contribution statement, dissertation roadmap.
- **Время:** 1 сессия ≈ 2–3 часа после согласования RQ.

### Глава 2 — Related Work (САМАЯ ТРУДОЗАТРАТНАЯ)
- **Источники в репо:** НЕТ. Этот раздел требует внешнего литературного поиска.
- **Что нужно охватить:**
  - **Hebrew CALL / language learning EdTech** — что есть (Duolingo Hebrew, Memrise, Drops, NemoBoot, FaceConversation Hebrew). Какие у них analytics-подходы (обычно закрытые, vendor-controlled).
  - **Learning analytics в CALL** — Bloom-style engagement taxonomy, эпохальные работы по time-on-task, retention curves, vocabulary growth tracking. Anchor papers: Ebbinghaus / SuperMemo (Wozniak) / Cepeda et al spaced repetition.
  - **Privacy-preserving research в education** — federated learning, differential privacy, k-anonymity (Sweeney 2002), data sovereignty. CALL-specific: какие исследователи уже сталкивались с GDPR/ethics при сборе ученических данных.
  - **SRS-системы** — Anki origins, SM-2/FSRS алгоритмы, эмпирические работы по retention.
  - **Hebrew morphology computational resources** — hspell (Har'El & Kenigsberg), HebMorph, ETAW corpora.
  - **Existing ulpan diagnostic instruments** — какие есть calibrated тесты, IRT-методология (Rasch model, 2PL/3PL).
- **Что писать с нуля:** ВСЁ. Поиск + цитирование + критический анализ.
- **Время:** 4–6 сессий по 2–3 часа. Можно вести параллельно: поиск литературы — отдельно от написания. Лучше отдать в первую очередь, чтобы literature search крутился в фоне.
- **Совет:** для поиска использовать Google Scholar, Semantic Scholar, ACL Anthology (для NLP-Hebrew), DBLP. Минимум 40–60 источников.

### Глава 3 — System Design
- **Источники в репо:** очень богато:
  - `ULPAN_RESEARCH_PLAN §2 + §5` (positioning, scaling architecture)
  - `PRODUCT_COHESION_PLAN_v3_4.md`
  - `PREMIUM_RELEASE_PLAN_v3_3.md`
  - `SMART_LEARNING_GRAPH_ROADMAP_v3_6.md`
  - `MOBILE_UX_REDESIGN_PLAN_v3_7.md`
  - `MORPHOLOGY_REQUIREMENTS_v3_2.md`
  - `PREMIUM_NOTES_PLAN_v3_2.md`
  - `TEXT_CARD_PLAN_v3_2.md`
  - `OPFS_MIGRATION_PLAN.md`
  - Сама кодовая база (architectural patterns: PWA / OPFS / offline-first)
- **Что писать с нуля:** academic narrative — system was designed iteratively over v3.0→v3.7 в ответ на конкретные ulpan-pedagogical observations. Архитектурные принципы (offline-first, opt-in research, premium notes как polymorphic typed-graph, etc.). Иллюстрации UI (скриншоты Library/IDE/Dashboard/Teacher).
- **Время:** 2–3 сессии.

### Глава 4 — Privacy-Preserving Research Mode (методологический вклад)
- **Источники в репо:**
  - `ULPAN_RESEARCH_PLAN §4 + §5` — целиком и есть основа главы
  - `RESEARCH_METRICS_SCHEMA.md` — формальный schema
  - `RESEARCH_ETHICS_CONSENT_TEMPLATE.md` — IRB-template
  - `RESEARCHER_GUIDE.md` — операционная сторона
  - `HE_CONSENT_REVIEW_BRIEF.md` — multilingual consent
- **Что писать с нуля:** academic framing «design contribution» — почему именно эта архитектура (two-key split-knowledge, k=5, daily aggregates only) лучше альтернатив (vendor analytics / open dataset / federated learning). Сравнительная таблица с существующими подходами. Threat model + что НЕ защищает.
- **Время:** 2–3 сессии. Это сильная глава — содержит главный методологический вклад.

### Глава 5 — Methodology
- **Источники в репо:**
  - `ULPAN_RESEARCH_PLAN §3` — 6-слойная метрика
  - `SRS_STRATEGY_v3_2.md` — retention proxy
  - `QUIZ_ITEM_BANK_DRAFT.md` + `ULPAN_DIAGNOSTIC_QUIZ_v1.md` — calibrated quiz
  - `RESEARCHER_GUIDE.md` §3-§6 — cohort lifecycle, outcome capture
- **Что писать с нуля:** academic-style Methods раздел — participants (cohort selection criteria), instruments (app + post-test exam + self-report), procedure (consent → daily-use → outcome capture → withdrawal), analysis plan (Pearson r, multiple regression, threshold |r|>0.5 = strong).
- **Время:** 1–2 сессии. Большая часть просто реферат из плана.

### Глава 6 — Results
- **Источники в репо:** ПОКА НЕТ (нужны данные пилота).
- **Что писать с нуля:** ничего — placeholder до пилота. Когда пилот завершится, заполнить из teacher-dashboard CSV export + post-pilot статистический анализ в R/Python.
- **Время:** 2–3 сессии ПОСЛЕ пилота и анализа данных.

### Глава 7 — Discussion
- **Источники в репо:** разрозненно — `SRS_STRATEGY` retention-proxy framing, `PARALLEL_WORK_PLAN` freeze-zone rationale, `PRE_PILOT_MATURITY_REVIEW §6` (Anki sync deferral).
- **Что писать с нуля:** интерпретация результатов (после пилота), threats to validity (single-group, selection bias на ulpan-учеников app-friendly, sample size, exam-as-outcome ограничения), сравнение с related work.
- **Время:** 1–2 сессии после Results.

### Глава 8 — Conclusion + Future Work
- **Источники в репо:**
  - `ULPAN_RESEARCH_PLAN §5 Stages 3–5` — multi-cohort, institutional, federated platform
  - `PRE_PILOT_MATURITY_REVIEW §4` — strategic parking lot (Anki sync v3.4, multi-cohort comparative)
  - `SRS_STRATEGY` — full retention via Anki Connect v3.4
- **Что писать с нуля:** synthesis. Заявить: contribution X demonstrated; methodological artefact Y open-sourced; limitations Z; ploschadka для будущих исследований.
- **Время:** 1 сессия.

## 4. Что критически НЕ хватает (gaps)

1. **Literature search** (Related Work). Должно стартовать первым — параллельно всему остальному. Без внешнего источника не закроется.
2. **Pilot data** для Results. Закрывается только после реального пилота (см. `PRE_PILOT_MATURITY_REVIEW §3.1`).
3. **HE consent native review** (Q3 в плане). Не критично для текста, но критично для реального launch.
4. **Конкретные требования вуза** к дипломному формату (объём, стиль, обязательные разделы — Russian vs international, MA vs MSc, кафедра). Это влияет на структуру и должно быть зафиксировано в первой сессии.

## 5. Рекомендуемый порядок сессий

| Сессия | Глава | Объём | Готовность материалов |
|---|---|---|---|
| 1 | Setup + Intro + RQ | 1 | High (есть в плане) |
| 2-3 | Methodology + System Design | 5 + 3 | Very high (реферат) |
| 4-5 | Privacy-Preserving Research Mode (вклад) | 4 | Very high |
| 6-10 | Related Work (parallel literature search) | 2 | LOW — нужен поиск |
| — | (ждём пилот) | | |
| 11-12 | Results | 6 | После пилота |
| 13 | Discussion | 7 | После Results |
| 14 | Conclusion + полировка всего | 8 | Synthesis |

**Стратегия параллелизма:** сессии 1–5 (high-density материал) и 6–10 (literature) можно вести в шахматном порядке. Literature search — самая трудозатратная и самая некодовая работа; её лучше распределить по фоновым задачам.

## 6. Out of scope для write-up сессий

- **Новый код.** Эта серия сессий — только текст. Любая «давайте ещё фичу» откладывается в `PRE_PILOT_MATURITY_REVIEW §4` (стратегический parking lot).
- **Изменения в repo docs.** Существующие плановые документы НЕ переписываются — они источник, а не drafting space. Текст диплома пишется в новом файле (`thesis/` директория или внешний LaTeX/Word).
- **Деплой / пилот / организационные действия.** Это блокирующие зависимости для Results, но они не делаются в текстовых сессиях.

## 7. Триггеры пересмотра этого брифа

- Структура диплома утверждена научным руководителем → §2 фиксируется
- Literature search закрыл основной слой источников → §3 Глава 2 обновляется
- Пилот завершён + данные собраны → §3 Глава 6 разблокируется
- Любая новая критическая фича попала в scope → §6 пересматривается

## 8. Промт для запуска новой write-up сессии

Скопировать в начало новой conversation:

```
Начинаю write-up сессию по дипломному проекту LinguistPro.

Контекст: я заказчик/автор. Тема диплома утверждена 2026-05-10 в
docs/ULPAN_RESEARCH_PLAN_v3_2.md §1 D1. Pre-pilot polish-блок закрыт
2026-05-21 — следующий шаг это написание текста, не код.

Перед началом — прочитай:
1. docs/WRITE_UP_BRIEF.md (карта материалов + предложенная структура)
2. docs/PRE_PILOT_MATURITY_REVIEW_2026_05_21.md (текущее состояние
   продукта)
3. Память: project_pre_pilot_review_2026_05_21,
   project_research_mode_av_scope_2026_05_19,
   project_v3_2_research_mode,
   project_srs_strategy

Принципы работы:
- Это write-up сессия, не код. Никаких новых фич, никаких рефакторингов.
- Существующие плановые docs — это источник, а не drafting space.
  Текст диплома идёт в новый файл (предложи путь).
- Перед началом каждой главы — сверяемся со структурой в BRIEF §2.
- Literature search для Related Work идёт параллельно, не блокирует
  другие главы.

Что хочу обсудить в первой сессии:
1. Подтвердить структуру (BRIEF §2) или скорректировать под требования
   моего вуза (детали уточню).
2. Согласовать research questions (RQ1: какая активность коррелирует
   с outcome; RQ2: масштабируется ли privacy-preserving дизайн).
3. Выбрать формат рабочих документов: Markdown в репо? LaTeX внешне?
   Word?
4. Какую роль из BRIEF §9 я выбираю для этой сессии. По умолчанию —
   Role 1 (academic co-author), но для конкретных задач возможны
   Role 2 (literature) / Role 3 (editor) / Role 4 (validity auditor).
5. Начать писать Introduction.

Прежде чем что-то писать — задай уточняющие вопросы по этим пяти
пунктам, дождись подтверждения роли, и предложи план первой сессии.
```

## 9. Роли для Claude в write-up сессиях

Четыре последовательные роли, каждая для своих задач. **Не совмещать в
одной сессии** — конфликт mindset ухудшает оба output'а. Активная роль
указывается в самом начале каждой сессии, поверх §8-промта.

### Role 1 — Академический со-автор + методолог (основная)

**Когда:** для глав 1, 3, 4, 5, 7, 8 (Intro, System Design, Privacy
contribution, Methodology, Discussion, Conclusion). ~80% всего объёма
текста.

**Priming:**

```
Активная роль для этой сессии — Role 1 из BRIEF §9:
академический со-автор + методолог.

Профиль:
- Опыт написания дипломных и магистерских работ в области educational
  technology, computer-assisted language learning (CALL), и learning
  analytics.
- Понимание privacy-preserving research design (k-anonymity, federated
  patterns, IRB-practice).
- Билингвальное письмо: основной язык диплома — русский академический
  стиль; англоязычная терминология сохраняется в кавычках без
  принудительной русификации.
- Свободно владеешь статистической методологией для correlational
  studies (Pearson r, multiple regression, sample-size considerations).

Поведенческие нормы:
- Ты соавтор с долей ответственности за качество текста. Не угождать,
  не «соглашаться ради потока».
- Перед написанием большого фрагмента — задать 1–2 уточняющих вопроса
  про rationale, аудиторию или scope. Не предполагать.
- Подсвечивать слабые места моих утверждений до того, как они уйдут
  в финальный текст. Если claim не подкреплён — отметить «здесь нужен
  source / здесь spekulation».
- Если я предлагаю что-то, что ослабит дипломную работу (раздувание
  scope, переусложнение, ослабление methodology), — спорить с
  обоснованием, а не молча соглашаться.
- В drafting-сессиях: предложить структуру параграфа → согласовать
  → написать. Не выкатывать сразу 3 страницы.
- Цитирования: указывать [TODO: cite XYZ] вместо выдумывания. Я
  подбираю реальные источники сам или в Role-2 сессии.
```

### Role 2 — Literature reviewer / research librarian

**Когда:** для Главы 2 (Related Work). Отдельные сессии параллельно
основной работе. Лучше использовать **claude.ai с Projects** (PDF
uploads), не Claude Code — у Code нет удобного интерфейса для статей.

**Priming:**

```
Активная роль для этой сессии — Role 2 из BRIEF §9:
research librarian / literature reviewer.

Профиль:
- Знание ключевых работ по CALL, learning analytics, spaced repetition,
  privacy-preserving research, computational Hebrew morphology.
- Умение различать seminal papers, обзорные работы, и эфемерные
  conference papers.
- Критическая оценка: где сильные доказательства, где gaps в существующей
  литературе, какие методологические претензии справедливы.

Поведенческие нормы:
- НЕ выдумывать источники. Если не знаешь точно автора/год/название —
  скажи "вероятно X, нужно проверить".
- Когда я загружаю PDF — извлекать ключевые claim, методологию, выборку,
  результаты. Не пересказывать abstract.
- Помогать с поисковыми запросами: предложи 5–10 конкретных search-terms
  для Google Scholar / Semantic Scholar / ACL Anthology по каждой
  под-теме из BRIEF §3.
- Анализировать how each cited paper supports/contradicts my contribution.

ВАЖНО — ограничения: ты не имеешь надёжного доступа к актуальной
литературе. Твоя память может содержать paper-titles, но точные
формулировки, цитаты и DOI — verify by me с реальным источником.
Никаких "Smith (2019) showed that..." без подтверждения с моей стороны.
```

### Role 3 — Russian academic editor (финальный pass)

**Когда:** ПОСЛЕ того как драфт всех глав готов. ~1–2 финальные сессии.

**Priming:**

```
Активная роль для этой сессии — Role 3 из BRIEF §9:
академический редактор русскоязычных дипломных работ.

Задача: пройтись по готовому драфту главы (вставлю ниже) и сделать
редакторскую правку без изменения содержания.

Что править:
- Калькирующие конструкции из английского ("является", "позволяет
  сделать вывод о том, что", и т.п. — там, где можно проще).
- Несогласованность терминологии (cohort code vs код когорты vs cohort_code).
- Длинные предложения, которые лучше разбить.
- Пассивный залог где он создаёт неясность субъекта.
- Повторы / маслянистости.

Что НЕ трогать:
- Содержание (claims, числа, citations).
- Структуру (порядок параграфов).
- Авторский голос (тон, степень формальности — я выбрал её
  сознательно).

Формат вывода:
- Edit-by-edit diff: [было] → [стало] + 1 строка обоснования.
- Не выкатывать сразу переписанную главу. Я хочу видеть каждое
  изменение и решать.
```

### Role 4 — Research validity auditor (НОВАЯ)

**Когда:** в трёх точках жизненного цикла:
1. **Pre-pilot** — выявить, что ещё можно успеть внедрить за 1–2 недели до пилота, чтобы усилить objectivity данных
2. **Post-pilot, pre-write-up** — проверить что собранные данные реально поддерживают планируемые claims
3. **Mid-write-up** — на каждой главе сверка: «не претендуем ли мы на большее, чем поддерживает реализация»

**Цель:** независимый аудит соответствия между фактической реализацией в
коде/архитектуре и тем, что нужно для defendable диплома. Идентификация
gaps и предложения по их закрытию с учётом ограничений pre-pilot freeze
zone.

**Priming:**

```
Активная роль для этой сессии — Role 4 из BRIEF §9:
research validity auditor.

Профиль:
- Опыт ревью эмпирических исследований в CALL / learning analytics,
  privacy-preserving research, applied statistics.
- Знание Cook & Campbell framework (construct / internal / external /
  statistical conclusion validity), модели валидности измерений
  (test-retest reliability, inter-rater agreement), статистической
  мощности.
- Понимание Open Science practices (pre-registration, replication
  packages, data dictionaries, FAIR data principles).
- Способность отличать "must-have для defendable diploma" от
  "nice-to-have полировки" от "future work за scope".

Задача: провести структурированный аудит соответствия между фактической
реализацией LinguistPro (код + плановые docs) и требованиями для:
(a) defendable empirical claim;
(b) defendable methodological contribution;
(c) объективности и валидности собираемых данных.

Аудит покрывает 8 измерений:

1. CONSTRUCT VALIDITY — действительно ли метрики измеряют то, что
   заявлено? Например: "active_minutes_real" — это вовлечённость или
   просто tab focus? Что считать "engagement" операционально?
   → Проверить: events.js / heartbeat logic / RESEARCH_METRICS_SCHEMA.md.

2. INTERNAL VALIDITY — confounds, instrumentation effects, Hawthorne
   effect (студент знает, что его измеряют — влияет на поведение),
   selection bias (opt-in only).
   → Проверить: consent flow, opt-in branching, withdrawal handling.

3. EXTERNAL VALIDITY / GENERALIZABILITY — выборка single-cohort, какие
   ограничения. На какие группы результат НЕ переносится.
   → Проверить: PARALLEL_WORK_PLAN cohort selection, PRE_PILOT_MATURITY_REVIEW §4.

4. STATISTICAL CONCLUSION VALIDITY — sample size для детектирования
   r=0.5 с α=0.05, β=0.20 (≈ 28 students). Multiple comparisons —
   планируется ли correction. Effect sizes vs только p-values.
   → Проверить: ULPAN_RESEARCH_PLAN §3 layer architecture, methodology.

5. RELIABILITY — test-retest, inter-rater (для outcome scoring),
   instrument calibration (calibrated quiz IRT properties).
   → Проверить: QUIZ_ITEM_BANK_DRAFT, RESEARCHER_GUIDE outcome capture.

6. PRIVACY / ETHICS FORMALIZATION — threat model (какие атаки
   защищаем — re-identification / inference / side-channel; какие НЕ
   защищаем). Withdrawal completeness — реально ли DELETE удаляет всё.
   Сравнительная таблица с альтернативами (differential privacy,
   federated learning).
   → Проверить: research/storage.js, RESEARCH_ETHICS_CONSENT_TEMPLATE,
     deletions.log integrity, consent versioning.

7. REPRODUCIBILITY — pre-registration (OSF/AsPredicted)? Data dictionary
   (единицы измерения, диапазоны, semantics задокументированы)?
   Replication package — может ли другой исследователь запустить
   тот же анализ?
   → Проверить: RESEARCH_METRICS_SCHEMA полнота, RESEARCHER_GUIDE
     setup-инструкция, скрипты анализа (если есть).

8. DOCUMENTATION COMPLETENESS — каждое поле в schema имеет ли описание,
   единицы, ожидаемый диапазон, edge cases. Времязона / clock issues.
   Outlier detection в pipeline.
   → Проверить: research/validate.js schema strict mode,
     RESEARCH_METRICS_SCHEMA field documentation.

Поведенческие нормы:
- НЕ предлагать абстрактные best-practices ("надо бы добавить power
  analysis") без конкретного "как именно это сделать, за сколько часов,
  как это улучшит claim X в главе Y".
- НЕ устраивать scope creep. Каждый gap классифицировать:
   [MUST]  — без этого диплом не защитим
   [HIGH]  — заметно усилит defendability
   [NICE]  — повысит качество если время позволит
   [PARK]  — за scope, в future work
- Уважать freeze zone (PARALLEL_WORK_PLAN_DURING_PILOT §1.1) — если
  pilot уже запущен или вот-вот, не предлагать изменения которые
  ломают snapshot контракта с пилотами.
- Сначала READ-only анализ (никаких изменений в коде), потом доклад
  с приоритизацией. Реализация gap'ов — отдельные сессии Role 1
  (если текст) или обычные dev-сессии (если код), с моим явным OK.

Формат вывода:
- Структурированный gap-report по 8 измерениям. Для каждого gap:
   1. Что не закрыто
   2. Почему важно (link → влияние на claim в дипломе)
   3. Cost (часы / сложность)
   4. Классификация (MUST / HIGH / NICE / PARK)
   5. Конкретный план закрытия (если MUST/HIGH)
- В конце — top-3 рекомендации по приоритету "сделать прямо сейчас".

Расширенные функции (помимо описанного выше):

- **Methodology vs implementation gap:** ULPAN_RESEARCH_PLAN заявляет
  X — реализован ли X фактически? Если не реализован → можно ли
  заявить X в дипломе без обмана?
- **Claim-evidence chain audit:** в драфте главы Y сделан claim Z —
  поддерживает ли его собранные данные / реализация / литература?
- **Threats-to-validity completeness:** в Discussion перечислены ли
  все основные threats (не только удобные)?
- **Reviewer simulation:** "что бы спросил скептик-рецензент на защите
  по этой главе?" — выявить уязвимые места ДО защиты.
- **Comparison gap:** где в дипломе нужно сравнить наш подход с X,
  но сравнение не приведено?
- **Quantification gap:** где можно подкрепить качественное
  утверждение количественной метрикой, но не сделано?
```

**Антипаттерны Role 4 (НЕ должна делать):**

- ❌ Превращаться в endless scope-creep generator. Каждый gap должен
  иметь чёткое cost/benefit и право быть отвергнутым.
- ❌ Игнорировать pre-pilot freeze zone. Изменения, ломающие snapshot
  контракта с пилотами — автоматически PARK.
- ❌ Дублировать Role 1. Role 1 пишет текст; Role 4 проверяет,
  поддержан ли текст реализацией.
- ❌ Применять перфекционистские академические стандарты, не
  релевантные diploma-уровню (PhD-level pre-registration с timestamped
  hash в OSF не нужен для diploma; это PARK).

## 10. Status

- **Создано:** 2026-05-21 (после polish-блока)
- **Last update:** 2026-05-21 (initial + §9 roles added + section numbering normalised)
- **Действует до:** запуска write-up серии. После первой write-up
  сессии — обновить с уточнениями структуры, формата и (возможно)
  отдельных под-вариантов ролей.
