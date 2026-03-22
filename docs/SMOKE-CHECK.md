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
- `npm run test:api-smoke` (если существует)
- guard: запрещённые tracked артефакты (db/cache/node_modules)
- для Windows smoke-check имеет fallback: если `npm ci` упирается в `EPERM unlink ... node_sqlite3.node`, скрипт автоматически пробует `npm install`

Примечание по Windows:
- `npm ci` может падать на `EPERM unlink ... node_sqlite3.node`, если native binary `sqlite3` удерживается внешним процессом или антивирусом.
- Текущий `scripts/smoke-check.ps1` умеет отработать этот сценарий автоматически и продолжает проверку через `npm install`, если fallback успешен.

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
- "orderIndex changed…" обязан подтверждать, что deep link не зависит от позиционных полей (см. ADR-0002).

#### 3.2.3 NAV Copy Link checks (NAV-08..NAV-12)

Цель: проверить создание и копирование deeplinks.

| ID | Сценарий | Шаги | Ожидаемое |
|----|----------|------|-----------|
| NAV-08 | Copy text link | Открыть текст → `Ctrl+Shift+L` → вставить в новую вкладку | Открывается тот же текст |
| NAV-09 | Copy sentence link | Выбрать строку (row-selected) → `Ctrl+Shift+L` → вставить | Открывается текст + jump to sentence |
| NAV-10 | Copy link via NAV bar | Search → Jump to hit → 🔗 button → вставить | Открывается та же сущность |
| NAV-11 | Copy search link | Search → results visible → `Ctrl+Shift+L` → вставить | Восстанавливается поисковая выдача (scope/q/filters) |
| NAV-12 | Link roundtrip encoding | Создать target → encode → decode → validate | target идентичен исходному |

Проверка NAV-12 (программная):
```javascript
// В консоли браузера:
const t = v3DeeplinkBuildTarget("text", "test-id-123");
const link = v3DeeplinkBuildLink(t);
const hash = "#" + link.split("#")[1];
const parsed = v3DeeplinkParse(hash);
console.assert(parsed.ok === true, "Parse failed");
console.assert(parsed.target.id === "test-id-123", "ID mismatch");
console.log("NAV-12 PASS");
```

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

#### 3.5.1. SRS -> Anki (ручной QA)

Проверить два сценария.

Сценарий A: AnkiConnect недоступен
- открыть IDE mode
- выбрать строку и вкладку `SRS`
- если карточки нет, нажать `Add to SRS`
- нажать `Check Anki`
- ожидаемо:
  - появляется явная диагностика недоступности AnkiConnect
  - `Export to Anki` не даёт ложный success-toast
  - ошибка показывает reason, а не только `HTTP 503`

Сценарий B: live export работает
- запустить `Anki Desktop` и убедиться, что `AnkiConnect` активен
- в IDE `SRS` вкладке нажать `Check Anki`
- ожидаемо:
  - success message с version
- нажать `Preview Anki`
- ожидаемо:
  - виден deck/model/direction/prompt/answer
- нажать `Export to Anki`
- ожидаемо:
  - success message содержит число note/card
  - статус меняется на `Anki: synced`
- открыть ту же карточку в Trainer и нажать `Export to Anki`
- ожидаемо:
  - повторный export не создаёт дубликаты
  - карточка остаётся idempotent по локальному status/export metadata

### 3.6. Analytics зона
Триггер:
- изменения event ingestion/агрегаций/дашборда аналитики

Обязательно:
- AN-01..AN-06 из `CONTRACTS_ANALYTICS.md`
- проверить privacy: payload не содержит секретов и больших текстов

### 3.7. IDE Layout зона (Week 12+)
Триггер:
- изменения в IDE workspace коде (`v3Ide*` функции/селекторы)
- изменения CSS под `body.v3-ide-mode`
- изменения в левой/центральной/правой панелях IDE

Обязательно:
- IDE-01..IDE-10 (см. ниже)
- проверить, что Classic mode по-прежнему работает

#### 3.7.1. IDE Quick Checks (ручные, 3-5 минут)

| ID | Сценарий | Шаги | Ожидаемое |
|----|----------|------|-----------|
| IDE-01 | Mode toggle | Нажать кнопку "IDE Mode" | Переключение в IDE layout, скрытие classic |
| IDE-02 | Classic toggle | В IDE mode нажать "Classic" | Возврат в classic layout |
| IDE-03 | Left tabs | Переключить Search → Library → History | Контент каждой вкладки показывается |
| IDE-04 | Right tabs | Переключить Notes → SRS → Audio → Export | Контент каждой вкладки показывается |
| IDE-05 | Library open text | В Library вкладке кликнуть на текст | Текст открывается в центральной панели |
| IDE-06 | Row selection | Кликнуть на строку в таблице | Строка выделена, Inspector обновляется |
| IDE-07 | Notes edit | Выбрать строку → отредактировать заметку → blur | Заметка сохраняется, индикатор появляется |
| IDE-08 | Search | Ввести запрос в Search → кликнуть на результат | Текст открывается, строка выбрана |
| IDE-09 | Responsive (1024px) | Уменьшить ширину до 1024px | Правая панель становится overlay |
| IDE-10 | Responsive (768px) | Уменьшить ширину до 768px | Обе панели становятся overlays |

#### 3.7.2. IDE + NAV Integration Checks

| ID | Сценарий | Шаги | Ожидаемое |
|----|----------|------|-----------|
| IDE-NAV-01 | Deep link в IDE mode | Включить IDE mode → перейти по deeplink | Текст открывается в центре, строка выбрана |
| IDE-NAV-02 | Search → Jump | В IDE search кликнуть на row hit | Текст открывается, переход к строке |
| IDE-NAV-03 | Back to search | После jump нажать Back | Возврат к search tab с результатами |
| IDE-NAV-04 | State persistence | Закрыть/открыть браузер в IDE mode | IDE mode сохраняется, tabs восстанавливаются |

#### 3.7.3. IDE Keyboard Shortcuts

| Комбинация | Проверка |
|---|---|
| `Ctrl+1/2/3` | Переключение left tabs |
| `Ctrl+Shift+1/2/3/4` | Переключение right tabs |
| `Escape` | Закрытие mobile overlays |

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
