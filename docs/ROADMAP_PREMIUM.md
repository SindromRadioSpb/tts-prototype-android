# ROADMAP Premium — tts-prototype-android

## Цель
Зафиксировать порядок развития Premium-фич так, чтобы:
- не ломались контракты,
- навигация/поиск/SRS/аналитика развивались на корректном фундаменте,
- изменения были проверяемыми (smoke-check + acceptance tests).

## Эпики Premium (основные)
### P1 — Premium Navigation UX
Функции:
- Back to results (история навигации Premium)
- Deep links (A4 стабильные ссылки)
- Jump-to-sentence одинаково из Rows и Notes

Ключевые требования:
- единый Navigation Target Contract
- стабильные идентификаторы entity (row/sentence/note)
- воспроизводимый navigation context

Статус репозитория на 2026-03-22:
- Реализовано частично/в основном: deep links, hash boot priority, `resolveTarget()`, copy link, SearchSession restore, back-to-results.
- Остался открытым терминологический долг вокруг `row` vs `sentence` в контрактах.

---

### P2 — Rows Search PRO
Функции:
- Нормализация иврита (критически важно)
- Авто-детект языка запроса
- Snippet + Highlight (обязательны)
- Одинаковая логика перехода (jump) из Rows и Notes

Ключевые требования:
- search keys в БД (как минимум hebrew_norm)
- индексирование (иначе медленно)
- единая логика snippet/highlight (матчим по нормализованному, подсвечиваем в оригинале)

Статус репозитория на 2026-03-22:
- Реализовано в основном: `he_norm`, search endpoints, snippet/highlight DTO, jump flow из search.
- Автоматические API smoke для `/api/nav/resolve`, `/api/notes/search`, `/api/sentences/search` уже добавлены.
- Не закрыта часть perf/acceptance формализации.

Обновление 2026-06-03 (`v3.5.58`):
- ✅ **«Нормализация иврита» закрыта** — `_searchNrm` снимает ниггуд/кантилляцию/bidi с **запроса** (OPFS-side, `local-db.js`); поиск с огласовками = без огласовок.
- ✅ **Поиск word_study-заметок** — `searchWordNotes` ищет по `notes_v2` (`body_json` слово/перевод/огласовка + заголовок), JOIN предложения через составной `target_id`. Раньше UI звал легаси `searchNotes` (только `sentence_notes`) → word-заметки не находились.
- ✅ **Переход к заметке** из попадания поиска («📝 Перейти к заметке»).
- ⏳ Не закрыто: FTS5-индекс (пока `LIKE` по `body_json` — достаточно на текущем масштабе, C-series); offset-якорь «тап→заметка».

---

### P3 — SRS Engine (ядро “платной учебности”)
Функции:
- Таблица карточек/элементов SRS (row/sentence level)
- Блок “Сегодня к повторению” в Dashboard
- Review events: again/hard/good/easy

Ключевые требования:
- srs_cards + srs_review_events
- прогнозируемая очередь "today"
- события review должны попадать в events (для аналитики)

Статус репозитория на 2026-05-10:
- ✅ Реализован sentence-level SRS v1: `/api/srs/cards`, `/api/srs/review`, `/api/srs/today` (post-Phase-6 → 410 Gone, заменены на OPFS-side `local-db.js` API).
- ✅ IDE inspector больше не содержит `coming soon` заглушки: Add/Review flow рабочий.
- ✅ PATCH-04 foundation: trainer entry point + `today summary` + session API.
- ✅ PATCH-05 core: `srs_card_templates` table + template-driven card model + session queue на `cardId`.
- ✅ Suspend semantics: `WHERE state != 'suspended'` filter в `local-db.js:763`.
- ✅ Activity heatmap в Dashboard (Direction 5 v3.1.0).
- ⚠ **Ещё не закрыты** (→ Direction 11A v3.2):
  - Audio/cloze-specific templates (table есть, seeded только `card_kind='sentence'`).
  - Dashboard Today integration (есть `todaySummary()` query в `local-db.js:754`, но не surfaced в Dashboard primary view).
  - Delete semantics (отличается от archive/suspend — нет explicit delete-card path).
  - Review events ↔ unified analytics contract — формальная alignment.
- 🆕 **Расширение в v3.2 (Direction 9 M6):** `card_kind='note'` для note → SRS micro-card (см. `docs/PREMIUM_NOTES_PLAN_v3_2.md`).

---

### P4 — Analytics PRO
Функции:
- time-spent без listeners (событийная модель)
- cohort по уровням/темам
- отчёты в Dashboard

Ключевые требования:
- событийная таблица events
- правила расчёта time-spent (gap thresholds)
- агрегации (on-demand или периодические)

Статус репозитория на 2026-05-10:
- ✅ `events` table создан, OPFS-side (post-Phase-6).
- ⚠ **Contract drift discovered (Tier 0 audit 2026-05-10):** `CONTRACTS_ANALYTICS` документирует 7 event types как реализованные, но grep подтверждает: **client-side только `row_tts`** реально emit'ится. Server-side `history_events` (legacy) — отдельная история, возвращает 410 Gone после Phase 6.
- ⚠ **Не закрыто** (→ Direction 11A v3.2):
  - Phase 11.0 — close emission gap (12 event types: `text_open`, `text_close`, `play_audio`, `save_note`, `note_edit`, `srs_review`, `srs_session_*`, `search_query`, `card_added_to_srs`, `smart_tag_override`, `translit_toggle`).
  - Phase 11.1 — time-spent v2 (`session_start/heartbeat/end` + idle + visibility + interaction tracking).
  - `time_ms = plays * 4000` estimated → real heartbeat-derived.
- ⚠ **Не закрыто** (→ Direction 11B v3.2):
  - Cohort aggregates over `events` (per-cohort rollups in opt-in research mode).
  - См. `docs/ULPAN_RESEARCH_PLAN_v3_2.md`.

---

### P5 — Notes Premium
Функции:
- Шаблоны заметок
- Версии/история изменений notes
- Связь с navigation/jump

Ключевые требования:
- note_versions или change log
- стабильный note_id и связь с source target (row/sentence)
- единый контракт "open note from target"

Статус репозитория на 2026-05-10:
- ✅ Базовые sentence notes CRUD реализованы (LIKE-based search; Markdown subset с XSS-safe render).
- ✅ Manual smart-tag override (Direction 5 v3.1.0) — отдельный механизм поверх notes.
- ⚠ Templates / version history / backlinks / audio-anchored / polymorphic targets — **deferred → Direction 9 v3.2 (Premium Notes Redesign)**.
- 🆕 **v3.2 scope (Direction 9):** полный premium redesign — polymorphic targets (sentence / word / root / binyan / text / note / free) + 4 templates (word_study / grammar_rule / translation_discrepancy / pronunciation_note) + audio-anchored notes + bidirectional links + version history (50 versions retention) + note → SRS micro-card. См. `docs/PREMIUM_NOTES_PLAN_v3_2.md`.

---

### P6 — Dashboard Premium UX
Функции:
- единый premium dashboard: SRS Today + Analytics + progress
- быстрый возврат к контексту обучения
- дизайн, минимизация фрикции

Ключевые требования:
- KPI: скорость доступа к "Today", число действий, время до первого review
- стабильные API/контракты слоёв

Статус репозитория на 2026-05-10:
- ✅ Dashboard / history / IDE shell.
- ✅ Activity heatmap (Direction 5 v3.1.0).
- ⚠ **Не закрыто** (→ Direction 11A v3.2):
  - Real time-spent (Phase 11.1) — heatmap accuracy upgrade.
- ⚠ **Не закрыто** (→ P3 SRS Today integration, частично через Direction 11A):
  - SRS Today section в Dashboard primary view.
- 🆕 **Новый research-grade dashboard `/teacher.html`** в Direction 11B v3.2 — for cohort-level analytics, не для single-user Dashboard.

---

## Dependency Matrix (эпик → блокеры)
| Epic | Требуемые контракты | Требуемые изменения БД | Требуемые API/модули | Обязательные проверки |
|---|---|---|---|---|
| P1 Navigation | CONTRACTS_NAVIGATION | стабильные IDs (row/sentence/note), link storage | resolveTarget(), navigation context | navigation acceptance tests |
| P2 Search PRO | CONTRACTS_SEARCH | hebrew_norm + индекс (или FTS), возможно search_index | search endpoint + snippet/highlight | search acceptance tests + perf sanity |
| P3 SRS | CONTRACTS_SRS | srs_cards, srs_review_events | today queue + review endpoint | SRS acceptance tests |
| P4 Analytics | CONTRACTS_ANALYTICS | events + агрегаты | event ingestion + reporting | analytics acceptance tests |
| P5 Notes Premium | NAVIGATION + NOTES части | note_versions / change log | templates + versioning endpoints | notes regression suite |
| P6 Dashboard | SRS + ANALYTICS | агрегаты/индексы | dashboard API | UI regression checklist |

## Правило приоритета
1) Сначала реализуются **блокеры контрактов** (ID, нормализация, события).
2) Затем UX/премиум-обвязка.
3) Любые изменения контрактов — отдельный PATCH с обновлением docs и fixtures.

## Definition of Ready (DoR) для начала эпика
Эпик можно начинать, если:
- контракт для эпика существует и содержит acceptance tests,
- известны таблицы/колонки/индексы, которые нужно добавить миграцией,
- определены минимальные smoke-check шаги для эпика.

## Definition of Done (DoD) эпика
Эпик закрыт, если:
- выполнены acceptance tests,
- задокументированы любые изменения контрактов,
- smoke-check проходит в "зелёном" режиме,
- QA-reviewer не блокирует релиз.

---

## Approved Delivery Roadmap (2026-03-22)
Утверждённый порядок реализации:

### PATCH-03 — SRS Core
- sentence-level `srs_cards` / `srs_review_events`
- `/api/srs/cards`, `/api/srs/review`, `/api/srs/today`
- IDE quick actions для add/review

### PATCH-04 — Trainer Foundations
- отдельный trainer entry point по специальной кнопке
- session schema + session API
- `Today summary`
- отдельный trainer UI/workspace без перегруза IDE inspector

### PATCH-05 — Card Templates
- статус: in progress, core реализован
- шаблоны карточек: `ru_to_he`, `he_to_ru`
- generation endpoints: `/api/srs/templates`, `/api/srs/cards/generate`
- session queue переведена на `cardId`
- audio/cloze variants остаются на следующие патчи

### PATCH-06 — Trainer Modes
- статус: базовый PATCH-06 реализован
- reveal / typing / listening / cloze
- server-side answer checking
- attempts logging (`srs_attempts`)
- automatic API smoke coverage для `trainer-view` и `attempts/check`

### PATCH-07 — Analytics Alignment
- статус: baseline реализован
- выравнивание `history_events`, `srs_review_events`, будущего `events`
- SRS/trainer/search/notes/audio events уже пишутся в единый analytics layer
- дальнейший шаг: постепенно переводить dashboard aggregates на `events`

### PATCH-08 — Anki Export v1
- статус: baseline реализован
- SRS card preview/status/export endpoints добавлены
- `srs_card_exports` хранит stable metadata per exported card
- automatic smoke покрывает preview/status/dry-run path
- полноценный live push зависит от локально запущенного Anki Desktop + AnkiConnect

Правило:
- каждый PATCH должен быть independently runnable/testable
- изменения схемы только новыми миграциями
- любые новые SRS endpoints обязаны быть отражены в контрактах и smoke

---

## DOC-AUDIT-NAV-01 — Coverage & Gaps (Single Source of Truth)

Этот раздел фиксирует **только аудит/дыры документации** и НЕ является контрактом поведения.
Контракты поведения: `docs/CONTRACTS_NAVIGATION.md`, схемы: `docs/schemas/*`, проверки: `docs/SMOKE-CHECK.md`.

### Coverage (что уже формально описано)
- Target v=1: структура + инварианты + ошибки: см. `docs/CONTRACTS_NAVIGATION.md`
- Deep links: формат/encoding/boot priority/legacy: см. `docs/CONTRACTS_NAVIGATION.md`
- NAV acceptance: NAV-01..NAV-07: см. `docs/CONTRACTS_NAVIGATION.md`
- DB invariants по stable IDs: см. `docs/DB_SCHEMA.md`
- Smoke triggers + NAV quick checks: см. `docs/SMOKE-CHECK.md`
- SearchSession schema/examples: см. `docs/schemas/search_session_v3.schema.json` и `docs/schemas/examples/*`
- UI selectors/data-attrs: см. `docs/UI_MAP.md`
- Search API contracts: см. `docs/API_CONTRACTS.md`
- NAV fixtures: см. `docs/fixtures/nav/*`

### Gap Register (открытые дыры)
| Gap ID | Коротко | Где проявляется | Риск | Закрываем патчем |
|---|---|---|---|---|
| NAV-GAP-ROW-01 | row присутствует в терминах/примерах, но отсутствует в enum типов Target | CONTRACTS_NAVIGATION | невалидные target’ы / путаница type/id | DOC-GLOSSARY-DOMAIN-01 (+ выравнивание CONTRACTS) |
| NAV-GAP-ID-SENT-02 | не зафиксирована уникальность sentenceId и необходимость ref.textId | CONTRACTS_NAVIGATION + DB_SCHEMA | deep link sentence может быть нерезолвим | DOC-GLOSSARY-DOMAIN-01 + DB evidence patch |
| NAV-GAP-SEARCHKEY-03 | не определён searchKey (opaque) и его хранение | CONTRACTS_NAVIGATION | невоспроизводимые ссылки на выдачу | DOC-SCHEMA-SEARCH-SESSION-V3-01 + API_CONTRACTS |
| NAV-GAP-SESSION-V3-04 | CLOSED — контракт v3SearchSession добавлен (`docs/schemas/search_session_v3.schema.json` + examples) | ROADMAP audit only | остаточный риск: runtime/storage drift | DOC-SCHEMA-SEARCH-SESSION-V3-01 |
| NAV-GAP-NAVSTACK-05 | не зафиксированы storage keys/limits/формат nav_stack | CONTRACTS_NAVIGATION | регрессии Back-to-results | DOC-NAV-CODEMAP-01 + schemas |
| NAV-GAP-UI-MAP-06 | CLOSED — `docs/UI_MAP.md` существует и покрывает selectors/data-attrs | ROADMAP audit only | остаточный риск: runtime drift без smoke | DOC-UI-MAP-01 |
| NAV-GAP-API-CONTRACTS-07 | CLOSED — `docs/API_CONTRACTS.md` существует; DTO актуализирован в PATCH-01 docs-reality-sync | ROADMAP audit only | остаточный риск: контракт drift при новых DTO | DOC-API-CONTRACTS-01 |
| NAV-GAP-FIXTURES-08 | CLOSED — fixtures добавлены в `docs/fixtures/nav/*` | ROADMAP audit only | остаточный риск: fixtures не участвуют в CI | DOC-FIXTURES-NAV-01 |
| DB-GAP-REALITY-09 | CLOSED — фактическая схема сверена с `migrations/*.sql`, `db/*Repo.js`, `db:integrity`, `smoke-check` | ROADMAP audit only | остаточный риск: contracts для SRS/analytics всё ещё опережают код | DB evidence patch |
| NAV-GAP-ORDERINDEX-10 | не описано где допустим orderIndex (только как UI-якорь, не ID) | CONTRACTS + UI | риск использования orderIndex как ID | DOC-GLOSSARY-DOMAIN-01 (+ Target schema запреты) |

### Правило
Любой патч, который закрывает Gap ID, обязан:
1) обновить соответствующий контракт/схему,
2) добавить/обновить smoke/acceptance,
3) удалить или пометить Gap ID как CLOSED (с ссылкой на Patch ID).
