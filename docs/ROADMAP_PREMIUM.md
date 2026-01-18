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
