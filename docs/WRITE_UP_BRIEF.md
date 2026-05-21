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
4. Начать писать Introduction.

Прежде чем что-то писать — задай уточняющие вопросы по этим четырём
пунктам и предложи план первой сессии.
```

## 9. Status

- **Создано:** 2026-05-21 (после polish-блока)
- **Last update:** 2026-05-21 (initial version)
- **Действует до:** запуска write-up серии. После первой write-up
  сессии — обновить с уточнениями структуры и формата.
