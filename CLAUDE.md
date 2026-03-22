# tts-prototype-android — Project Blueprint for Claude Code

## 0) Цель репозитория
Это сервер + локальная база (SQLite) для “Программа изучение иврита (ии, голос, комп.зрение)”.
Ключевые свойства:
- стабильная схема БД через миграции
- корректная работа слоёв Library / Progress / History / Notes / Audio
- детерминированные кэши и отсутствие “мусора” в git
- устойчивые форматы экспортов (если/когда добавим DOCX/Anki)

## 1) Фактическая структура (ориентиры)
- server.js — основной сервер
- public/index.html — UI (статический)
- data/app.db — SQLite база
- db/*.js — репозитории и миграция:
  - migrate.js / migrate-cli.js / sqlite.js
  - libraryRepo.js, progressRepo.js, historyRepo.js, notesRepo.js, audioRepo.js
- migrations/*.sql — миграции схемы
- tools/step8_2-db-check.js — проверка целостности/состояния БД
- audio/, audio-cache/, gemini-cache/ — артефакты и кэши (НЕ ДОЛЖНЫ храниться в git в “чистом” состоянии)

## 1.5) IDE-grade code intelligence (обязательно для любых изменений)
Цель: использовать возможности Claude Code на уровне IDE, а не “угадывать” места в коде.

Перед PLAN и любыми правками:
1) Repo-wide разведка через инструменты (Read/Grep/Glob/Search), чтобы найти:
   - entry points (DOMContentLoaded / hashchange / роутинг / обработчики событий)
   - state storage (sessionStorage/localStorage ключи, структура сессий, кеши)
   - handlers (open/close/back/jump/resolve)
   - UI hooks (кнопки/компоненты, откуда инициируется навигация/поиск/действия)
2) Сформировать "Code Map" (коротко, 5–15 строк):
   - какие блоки отвечают за state
   - какие блоки отвечают за переходы
   - где точка расширения (куда безопасно добавлять код)
3) Только после этого писать PLAN и предлагать изменения.

Запрещено:
- писать PLAN “по памяти” или без repo-wide разведки,
- ссылаться на “примерные места” без evidence (какие поиски выполнены и что найдено).

Guardrail больших файлов:
- не делать Read(public/index.html) целиком;
- допускается только точечный Search/Grep (output_mode=content) вокруг совпадений.

## 2) Definition of Done (DoD) для любого PATCH
1) Минимальный дифф, без расширения объёма.
2) Если менялась БД:
   - новая миграция в migrations/
   - migrate-cli прогнан на чистой БД (или подтверждённо на копии)
   - инструменты проверки БД (tools/step8_2-db-check.js) выполнены
3) Если менялись репозитории db/*.js:
   - негативные кейсы (пустые данные, неверные параметры) не падают
4) Если менялся сервер/API:
   - ручной smoke (запуск сервера + 1-2 сценария)
5) Если менялась обработка аудио:
   - нет дубликатов/рассинхрона, кэши детерминированы
6) Всегда: scripts/smoke-check.(ps1|sh) зелёный или дан отчёт почему шаг пропущен.

## 3) Команды проекта (приоритет)
Предпочтительно использовать npm scripts, но smoke-check умеет работать и без них.
Рекомендуемые scripts (если добавите в package.json):
- npm run dev        -> запуск сервера
- npm run db:migrate -> запуск миграций (через db/migrate-cli.js)
- npm run db:check   -> node tools/step8_2-db-check.js
- npm run test       -> (если есть)
- npm run lint       -> (если есть)

## 4) Жёсткие правила (важно для этого репо)
1) Никогда не коммитить:
   - node_modules/
   - data/app.db
   - audio-cache/, gemini-cache/
   - большие *.mp3
2) Любые изменения схемы SQLite — только через migrations/*.sql
3) Валидация входов в API обязательна (в server.js и в db/*Repo.js)
4) Не менять форматы экспортов/JSON без явного PATCH и fixtures.

## 5) Рекомендуемый стиль работы (проверено на вашем workflow)
- Один PATCH = один чат
- После 15–20 итераций: /clear
- Использовать subagents:
  implementer -> изменения
  db-migrator -> миграции
  exporter -> экспорт/форматы/fixtures
  qa-reviewer -> финальное ревью

В отчёте патча всегда фиксировать IDE evidence:
- какие Search/Grep/Glob выполнены,
- какие файлы/блоки подтверждают выбранные точки изменения.

## 6) Navigation Governance (PRO-PREMIUM) — обязательно для NAV/поиска/deeplink

Цель: чтобы Claude Code/агенты работали детерминированно и не ломали семантику сущностей (type/id),
UI↔API↔DB связи и “Back to results”.

### 6.1) Когда этот раздел ОБЯЗАТЕЛЕН (trigger zones)
Применять этот governance, если затрагивается хотя бы одно:
- hash deeplink (`/#/t/<...>`), base64url payload, boot priority (hash/query/session)
- `resolveTarget(...)`, jump/back/prev/next, NOT_FOUND/CORRUPT UI
- search results (rows/notes), SearchSession (sessionStorage), restore scroll/highlight
- UI selectors / data-attrs для hits (например `data-hit-type`, `data-text-id`, `data-sentence-id`, `data-note-id`)
- shapes `/api/notes/search` или `/api/sentences/search`
- семантика ID в БД (textId/sentenceId/noteId/rowId) или позиционные поля (`order_index`/`orderIndex`)

Если trigger zone активен — нельзя “маленьким фиксом” менять поведение без обновления контрактов/fixtures/smoke.

### 6.2) Обязательные чтения (6–8)
Перед PLAN и любыми правками (NAV patch) прочитать:
1) docs/GLOSSARY_DOMAIN.md — сущности и “НЕ ПУТАТЬ”
2) docs/CONTRACTS_NAVIGATION.md — форматы, UX, invariants, NAV-01..NAV-07
3) docs/DB_SCHEMA.md — источники IDs и связи, стабильность/нестабильность (order_index)
4) docs/schemas/nav_target_v1.schema.json — Target v1 (v/type/id)
5) docs/schemas/deeplink_payload_v1.schema.json — payload deep link (decoded JSON)
6) docs/schemas/search_session_v3.schema.json — SearchSession v3
7) docs/UI_MAP.md — selectors + data-attrs контракт (что считается стабильным)
8) docs/SMOKE-CHECK.md (NAV) + docs/fixtures/nav/README.md — детерминированный smoke и “золотые” входы

Extended readings (по необходимости):
- Если меняется API shape / params: docs/API_CONTRACTS.md
- Если меняется boot priority: docs/adr/ADR-0001-navigation-boot-priority.md
- Если меняется семантика IDs / orderIndex: docs/adr/ADR-0002-navigation-id-stability.md

Если какой-то из файлов отсутствует — это сигнал, что соответствующие doc patches не применены/не закоммичены.
Остановиться и восстановить “источник истины” до изменений в коде.

### 6.3) Обязательные greps (минимум)
Перед PLAN выполнить repo-wide Grep/Search (не читать большие файлы целиком).
Зафиксировать результаты (файл + строки вокруг совпадений 20–80 lines).

A) public/index.html (ТОЛЬКО точечный поиск, целиком не читать):
- `hashchange`
- `/#/t/`
- `V3_SEARCH_SESSION_KEY`
- `sessionStorage.getItem(` и `sessionStorage.setItem(`
- `resolveTarget`
- `jump` / `back` / `prev` / `next` (по реальным именам функций/handlers)
- `data-hit-type` / `data-text-id` / `data-sentence-id` / `data-note-id`
- `NOT_FOUND` / `CORRUPT` (если есть текстовые маркеры или state keys)

B) server.js (файл большой — тоже только Grep + open around match):
- `/api/notes/search`
- `/api/sentences/search`
- `v3ParseNotesSearchQuery`
- `v3SearchParseQueryTokens`
- `searchNotes(` / `searchSentences(`
- `QUERY_TOO_LONG` / `OFFSET_TOO_LARGE` / `BAD_LEVEL`
- `requireDbOr503`
- `DB_PATH` / `PORT`

C) migrations/*.sql и db/*Repo.js:
- `order_index`
- `text_id` / `sentence_id` / `note_id`
- таблицы notes/rows/texts (по фактическим именам)
- любые изменения, которые могут ломать stable ids или связывание hit → target

### 6.4) Non-negotiable rules (NAV)
1) `order_index` / `orderIndex` НЕ является ID и не используется:
   - как `Target.id`
   - как deep link id
   - как ключ резолва сущности в БД
2) Target/DeepLink/Session — строго по schema-версии (v/type/id обязателен).
3) Любое изменение:
   - типов (`type` enum),
   - структуры target/ref/context,
   - структуры SearchSession,
   - shapes hits (поля, на которые опирается UI)
   => требует обновления docs/schemas + docs/fixtures + SMOKE-CHECK (NAV).
4) Любое переименование/изменение selectors или data-attrs, которые участвуют в навигации/поиске:
   - обязательно обновить docs/UI_MAP.md
   - обязательно прогнать NAV smoke (fixtures-driven)
5) Нельзя вводить “silent fallback” при CORRUPT/NOT_FOUND: UI обязан показывать контролируемый статус и CTA.

### 6.5) Evidence-first workflow (NAV patch)
В каждом NAV-патче отчёт должен содержать:
1) IDE evidence: какие Grep/Search сделаны и что найдено (файл+строки)
2) Code Map (5–15 строк): entrypoints → state/session → API → render → handlers
3) Список затронутых контрактов (какие docs/schemas/fixtures обязаны обновиться)
4) PLAN (3–7 шагов) + список файлов изменений
5) Только потом — изменения

Минимальный smoke (обязателен):
- Выполнить раздел “NAV quick checks (fixtures-driven)” из docs/SMOKE-CHECK.md
- Использовать deeplinks из docs/fixtures/nav/ и проверить OK/NOT_FOUND/CORRUPT + “orderIndex changed but ids stable”