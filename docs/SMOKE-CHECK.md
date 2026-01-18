# SMOKE-CHECK — правила проверок и триггеры

## 1) Цель
Сделать завершение патча воспроизводимым:
- обязательный минимум проверок всегда,
- дополнительные проверки в зависимости от зоны изменений,
- запрет на “тихие” изменения форматов/контрактов.

## 2) Базовый минимум (всегда)

### 2.0. Pre-change Investigation (IDE-grade) — обязательно ДО правок
Перед тем как писать PLAN и менять код:
1) Сделать repo-wide разведку через инструменты Claude Code (Read/Grep/Glob/Search), чтобы найти реальные точки изменения.
2) Составить короткий "Code Map":
   - entry points (DOMContentLoaded/hashchange/handlers)
   - state storage (sessionStorage/localStorage ключи)
   - handlers (open/close/back/jump/resolve)
   - UI hooks (кнопки/компоненты, откуда инициируются действия)
3) Зафиксировать IDE evidence в отчёте патча:
   - какие паттерны искали
   - какие файлы/блоки нашли

Guardrail больших файлов:
- не делать Read(public/index.html) целиком;
- использовать Search(output_mode=content) вокруг совпадений.

Рекомендуемые паттерны (минимум 1–2 набора по зоне):
- Navigation: deeplink|hashchange|location.hash|encode|decode|back.*result|nav_stack|scrollRestore|resolveTarget|anchor|jump
- Search: search|query|normalize|hebrew_norm|token|snippet|highlight|rank|fts
- SRS: srs_|review|due|again|hard|good|easy|schedule|interval
- Analytics: events?|track|time_spent|cohort|aggregate|dashboard|privacy

### 2.1. Команды
- `git status`
- `git diff --stat`
- `scripts/smoke-check.ps1` (Windows) или `scripts/smoke-check.sh` (WSL)

### 2.2. Что проверяет smoke-check v2
- Node/npm версии
- установка зависимостей
- `npm run db:migrate`
- `node tools/step8_2-db-check.js` (если существует)
- guard: запрещённые tracked артефакты (db/cache/node_modules)

## 3) Триггеры по зонам изменений (обязательные правила)
### 3.1. DB / Migrations зона
Триггер:
- изменения в `migrations/` или `db/` или `data/` (кроме .gitignore)

Обязательно:
- smoke-check v2
- проверить корректность миграции:
  - новый файл миграции добавлен (если менялась схема)
  - порядок миграций не менялся
- обновить `docs/DB_SCHEMA.md` если добавлены таблицы/колонки/индексы

### 3.2. Navigation зона
Триггер:
- изменения в `public/`, `server.js`, навигационных модулях/роутах

Обязательно:
- пройти acceptance tests NAV-01..NAV-07 из `CONTRACTS_NAVIGATION.md`
- проверить deep link decode + NOT_FOUND поведения

#### 3.2.1 NAV quick checks (ручные, 2 минуты)
- Notes hits: Jump → sticky bar → Prev/Next → Back → restore scroll + highlight
- Rows hits: Jump → Prev/Next → Back → highlight не пропадает (Library + Dashboard)
- Close: закрывает sticky bar; повторный Jump снова показывает bar
- Deep link:
  - валидный target открывает нужную строку (NAV-01)
  - битая ссылка показывает CORRUPT UI (NAV-07)
  - удалённый id показывает NOT_FOUND UI (NAV-02)

#### 3.2.2 NAV quick checks (fixtures-driven, deterministic, 2 минуты)

Цель: сделать проверку NAV воспроизводимой “по кнопке”, без ручного подбора данных.
Источник входных данных: `docs/fixtures/nav/` (Patch `DOC-FIXTURES-NAV-01`).
Требование: ссылки/targets берём ТОЛЬКО из fixtures, чтобы NAV-01..NAV-07 были повторяемы.

Предпосылки:
- Сервер использует `DB_PATH` (env) или по умолчанию `data/app.db`, порт по умолчанию `3000`:contentReference[oaicite:6]{index=6}.
- Не коммитить `data/app.db` и любые временные БД в git (см. CLAUDE.md guardrails).

Шаги (WSL/Linux/macOS):
1) Подготовить временную БД из fixtures (см. `docs/fixtures/nav/README.md` для точного seed-скрипта):
   - создать файл БД (например `/tmp/nav-fixtures.db`)
   - применить seed из `docs/fixtures/nav/` (обычно через `sqlite3 <db> < <seed.sql>`)
2) Запустить сервер на fixtures-БД:
   - `DB_PATH=/tmp/nav-fixtures.db node server.js`
3) Открыть в браузере ссылки из `docs/fixtures/nav/README.md` (они должны быть полными URL под `http://localhost:3000`):
   A) OK deeplink (NAV-01): открывается нужная сущность/строка, позиционирование корректно
   B) NOT_FOUND deeplink (NAV-02): “Элемент не найден” + CTA, UI не падает:contentReference[oaicite:7]{index=7}
   C) CORRUPT deeplink (NAV-07): “Некорректная ссылка” + CTA, UI не падает:contentReference[oaicite:8]{index=8}

Шаги (Windows PowerShell):
1) Подготовить временную БД из fixtures (см. `docs/fixtures/nav/README.md`):
   - создать файл БД (например `$env:TEMP\nav-fixtures.db`)
   - применить seed из `docs/fixtures/nav/` (обычно через `sqlite3 <db> ".read <seed.sql>"`)
2) Запустить сервер на fixtures-БД:
   - `$env:DB_PATH="$env:TEMP\nav-fixtures.db"; node server.js`
3) Открыть ссылки из `docs/fixtures/nav/README.md` и выполнить пункты A/B/C.

Проверка “orderIndex changed but ids stable” (обязательно):
- Выполнить шаг из `docs/fixtures/nav/README.md`, который изменяет order_index/orderIndex (вставка строки/сдвиг нумерации),
  НЕ меняя stable ids.
- Повторно открыть ТОТ ЖЕ OK deeplink:
  - должна открыться та же сущность (по stable id), несмотря на изменение orderIndex.
  - это подтверждает инвариант “order_index ≠ id” и устойчивость ссылок.

Acceptance:
- Пункты A/B/C обязаны соответствовать NAV-01/NAV-02/NAV-07 и Error handling контракту:contentReference[oaicite:9]{index=9}.
- “orderIndex changed…” обязан подтверждать, что deep link не зависит от позиционных полей (см. ADR-0002).

### 3.3. Search зона
Триггер:
- изменения в поисковом коде/эндпойнтах/SQL, или добавление `hebrew_norm`

Обязательно:
- пройти SRCH-01..SRCH-10 из `CONTRACTS_SEARCH.md`
- sanity perf:
  - запросы не должны делать полный scan без индекса (если ожидается индекс)

### 3.4. Notes зона
Триггер:
- изменения notes репозитория/эндпойнтов/UI

Обязательно:
- базовые сценарии:
  - создать/редактировать/открыть note
  - jump-to-sentence из note (если включено)
- если добавляется versioning/templates:
  - обновить документы и добавить acceptance tests

### 3.5. SRS зона
Триггер:
- изменения `srs_*` таблиц/кода/эндпойнтов

Обязательно:
- SRS-01..SRS-10 из `CONTRACTS_SRS.md`
- событие `srs_review` логируется в events (если analytics включена)

### 3.6. Analytics зона
Триггер:
- изменения event ingestion/агрегаций/дашборда аналитики

Обязательно:
- AN-01..AN-06 из `CONTRACTS_ANALYTICS.md`
- проверить privacy: payload не содержит секретов и больших текстов

## 4) Политика документации (блокирующая)
Если патч:
- меняет формат данных,
- меняет контракт API,
- меняет поведение навигации/поиска/SRS/аналитики,

то он ОБЯЗАН:
- обновить соответствующий файл `docs/CONTRACTS_*.md` или `docs/DB_SCHEMA.md`,
- обновить acceptance tests при необходимости.

QA-reviewer должен блокировать патч без обновления документации.

## 5) Чеклист завершения патча (DoD)
- [ ] smoke-check v2 зелёный
- [ ] acceptance tests зоны изменений выполнены и отмечены
- [ ] docs обновлены (если контракт/схема менялись)
- [ ] отсутствуют запрещённые tracked артефакты
- [ ] commit message соответствует формату PATCH-XX
- [ ] IDE-grade pre-change investigation выполнен:
- [ ] repo-wide Search/Grep/Glob сделан
- [ ] Code Map сформирован
- [ ] IDE evidence записан в отчёте патча

---

## DOC-AUDIT pointers (DOC-AUDIT-NAV-01)

Перед любыми изменениями в Navigation зоне (public/server/nav handlers) дополнительно:
1) Открыть `docs/ROADMAP_PREMIUM.md` → `DOC-AUDIT-NAV-01 — Gap Register`.
2) Проверить, не затрагивает ли патч открытые Gap ID:
   - NAV-GAP-ROW-01 (row vs sentence)
   - NAV-GAP-SESSION-V3-04 (v3SearchSession schema отсутствует)
   - NAV-GAP-NAVSTACK-05 (storage keys/limits)
   - NAV-GAP-UI-MAP-06 (selectors/data-attrs)
   - NAV-GAP-FIXTURES-08 (fixtures отсутствуют)

Если патч частично закрывает Gap ID — обязан обновить реестр (пометить CLOSED и указать Patch ID).
