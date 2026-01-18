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

---

### P3 — SRS Engine (ядро “платной учебности”)
Функции:
- Таблица карточек/элементов SRS (row/sentence level)
- Блок “Сегодня к повторению” в Dashboard
- Review events: again/hard/good/easy

Ключевые требования:
- srs_cards + srs_reviews
- прогнозируемая очередь "today"
- события review должны попадать в events (для аналитики)

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

---

### P6 — Dashboard Premium UX
Функции:
- единый premium dashboard: SRS Today + Analytics + progress
- быстрый возврат к контексту обучения
- дизайн, минимизация фрикции

Ключевые требования:
- KPI: скорость доступа к "Today", число действий, время до первого review
- стабильные API/контракты слоёв

---

## Dependency Matrix (эпик → блокеры)
| Epic | Требуемые контракты | Требуемые изменения БД | Требуемые API/модули | Обязательные проверки |
|---|---|---|---|---|
| P1 Navigation | CONTRACTS_NAVIGATION | стабильные IDs (row/sentence/note), link storage | resolveTarget(), navigation context | navigation acceptance tests |
| P2 Search PRO | CONTRACTS_SEARCH | hebrew_norm + индекс (или FTS), возможно search_index | search endpoint + snippet/highlight | search acceptance tests + perf sanity |
| P3 SRS | CONTRACTS_SRS | srs_cards, srs_reviews | today queue + review endpoint | SRS acceptance tests |
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

## DOC-AUDIT-NAV-01 — Coverage & Gaps (Single Source of Truth)

Этот раздел фиксирует **только аудит/дыры документации** и НЕ является контрактом поведения.
Контракты поведения: `docs/CONTRACTS_NAVIGATION.md`, схемы: `docs/schemas/*`, проверки: `docs/SMOKE-CHECK.md`.

### Coverage (что уже формально описано)
- Target v=1: структура + инварианты + ошибки: см. `docs/CONTRACTS_NAVIGATION.md`
- Deep links: формат/encoding/boot priority/legacy: см. `docs/CONTRACTS_NAVIGATION.md`
- NAV acceptance: NAV-01..NAV-07: см. `docs/CONTRACTS_NAVIGATION.md`
- DB invariants по stable IDs: см. `docs/DB_SCHEMA.md`
- Smoke triggers + NAV quick checks: см. `docs/SMOKE-CHECK.md`

### Gap Register (открытые дыры)
| Gap ID | Коротко | Где проявляется | Риск | Закрываем патчем |
|---|---|---|---|---|
| NAV-GAP-ROW-01 | row присутствует в терминах/примерах, но отсутствует в enum типов Target | CONTRACTS_NAVIGATION | невалидные target’ы / путаница type/id | DOC-GLOSSARY-DOMAIN-01 (+ выравнивание CONTRACTS) |
| NAV-GAP-ID-SENT-02 | не зафиксирована уникальность sentenceId и необходимость ref.textId | CONTRACTS_NAVIGATION + DB_SCHEMA | deep link sentence может быть нерезолвим | DOC-GLOSSARY-DOMAIN-01 + DB evidence patch |
| NAV-GAP-SEARCHKEY-03 | не определён searchKey (opaque) и его хранение | CONTRACTS_NAVIGATION | невоспроизводимые ссылки на выдачу | DOC-SCHEMA-SEARCH-SESSION-V3-01 + API_CONTRACTS |
| NAV-GAP-SESSION-V3-04 | отсутствует контракт v3SearchSession (schema + examples) | CONTRACTS_NAVIGATION | restore/boot не детерминирован | DOC-SCHEMA-SEARCH-SESSION-V3-01 |
| NAV-GAP-NAVSTACK-05 | не зафиксированы storage keys/limits/формат nav_stack | CONTRACTS_NAVIGATION | регрессии Back-to-results | DOC-NAV-CODEMAP-01 + schemas |
| NAV-GAP-UI-MAP-06 | отсутствует UI_MAP (selectors/data-attrs) | SMOKE-CHECK (sticky bar) | ломается автоматизация/тестирование | DOC-UI-MAP-01 |
| NAV-GAP-API-CONTRACTS-07 | нет API_CONTRACTS по search endpoints и hit invariants | ROADMAP P1/P2 | Claude “угадывает” JSON shape | DOC-API-CONTRACTS-01 |
| NAV-GAP-FIXTURES-08 | нет fixtures для NAV сценариев (2 минуты) | SMOKE-CHECK | невоспроизводимость | DOC-FIXTURES-NAV-01 |
| DB-GAP-REALITY-09 | DB_SCHEMA не подтверждена миграциями (таблицы/PK/FK могут отличаться) | DB_SCHEMA | контракт может не совпасть с фактом | DB evidence patch |
| NAV-GAP-ORDERINDEX-10 | не описано где допустим orderIndex (только как UI-якорь, не ID) | CONTRACTS + UI | риск использования orderIndex как ID | DOC-GLOSSARY-DOMAIN-01 (+ Target schema запреты) |

### Правило
Любой патч, который закрывает Gap ID, обязан:
1) обновить соответствующий контракт/схему,
2) добавить/обновить smoke/acceptance,
3) удалить или пометить Gap ID как CLOSED (с ссылкой на Patch ID).
