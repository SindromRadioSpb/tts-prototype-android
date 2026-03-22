# DB_SCHEMA — целевая схема и инварианты (SQLite)

## 0) Current Repo Reality (2026-03-23)
Этот документ содержит и целевую модель, и фактическую схему, подтверждённую репозиторием на 2026-03-23.

Фактически подтверждено:
- `texts(id TEXT PRIMARY KEY, text_key, title, level, tags_json, source_text, source_meta_json, tts_profile_json, table_model_meta_json, is_archived, created_at, updated_at, last_opened_at)` — см. `migrations/002_v3_library.sql`
- `sentences(id TEXT PRIMARY KEY, text_id TEXT FK -> texts(id), order_index, he_plain, he_niqqud, translit, ru, row_hash, meta_json, created_at)` — см. `migrations/002_v3_library.sql`
- `sentence_notes(id TEXT PRIMARY KEY, text_id TEXT FK, sentence_id TEXT FK, note, created_at, updated_at, UNIQUE(text_id, sentence_id))` — см. `migrations/006_w10_sentence_notes.sql`
- `audio_assets(id TEXT PRIMARY KEY, asset_key UNIQUE, asset_type, relative_path, mime, duration_ms, size_bytes, tts_profile_json, created_at, last_used_at)` — см. `migrations/004_v3_audio_assets.sql`
- `history_events`, `recent_rows`, `recent_texts` — см. `migrations/005_week9_dashboard.sql`
- `srs_cards`, `srs_review_events` — см. `migrations/010_srs_tables.sql`
- `srs_session_runs` — см. `migrations/011_srs_sessions.sql`
- `srs_card_templates`, template-aware `srs_cards` — см. `migrations/012_srs_templates.sql`
- repaired FK для `srs_review_events -> srs_cards` — см. `migrations/013_srs_review_events_fk_fix.sql`
- `srs_attempts` — см. `migrations/014_srs_attempts.sql`
- `events` — см. `migrations/015_events_layer.sql`
- search normalization хранится в `sentences.he_norm` с индексом `ix_sentences_he_norm` — см. `migrations/009_hebrew_norm.sql`

Проверки, подтверждающие факт:
- `npm run db:migrate` — OK
- `node db/integrity-cli.js` — OK
- `powershell scripts/smoke-check.ps1` — runtime checks проходят до шага `npm ci`; финальный статус может падать на Windows `EPERM unlink ... node_sqlite3.node` при внешнем file lock

## 1) Цель
Зафиксировать целевую схему данных и инварианты, необходимые для Premium-фич:
- стабильные ID для navigation/deep link/jump,
- search keys (hebrew_norm),
- notes templates/versioning,
- SRS cards/reviews,
- events для analytics.

Текущая реализация схемы живёт в `migrations/*.sql`.
Этот документ определяет **контракт**, а миграции обеспечивают реальное состояние.

## 2) Общие инварианты (обязательные)
1) Все сущности, на которые возможны deep links, имеют стабильный ID:
   - row_id / sentence_id / note_id / card_id
2) Любая ссылка (target) должна резолвиться или отдавать NOT_FOUND без падений.
3) Нормализация для поиска хранится отдельно и индексируется:
   - hebrew_norm (минимум)
4) Любые изменения схемы идут только через миграции.
5) Любые JSON-поля:
   - имеют стабильную канонизацию (например tags_json canonicalization)
   - документированы

## 2.1. Navigation IDs — источник истины и стабильность

Навигация (Premium) использует **только стабильные ID**. Позиционные индексы используются только как UI-помощники.

| ID | Таблица/поле (контракт) | Стабильность | Примечание |
|---|---|---|---|
| textId | `texts.id` | MUST | Используется для открытия текста и контекста sentence |
| sentenceId | `sentences.id` | MUST | Ключ jump-to-sentence и deep link sentence |
| rowId | не выделен отдельной таблицей в текущей схеме | N/A | В текущем репозитории роль “row” фактически выполняет `sentences` |
| noteId | `sentence_notes.id` | MUST | Ключ deep link note |
| order_index | sentences.order_index | NOT stable | Запрещено использовать как deep link id |
| audio_id | `audio_assets.id` | MUST | Привязка аудио к сущности по stable id |

Обязательные связи для навигации:
- sentenceId -> textId (иначе deep link sentence не может открыть правильный текст)
- noteId -> sentenceId или rowId (иначе note deep link не может восстановить контекст)

Если фактические имена таблиц отличаются — этот раздел должен быть обновлён на основании `migrations/*.sql` и `db/*Repo.js`.

## 3) Слои данных (логическая модель)
### 3.1. Library
Назначение: хранение строк/текстов обучения и их метаданных.

Фактически:
- `texts`
  - PK: `id`
  - metadata: `text_key`, `title`, `level`, `tags_json`, `source_text`, `source_meta_json`, `tts_profile_json`, `table_model_meta_json`, `is_archived`

### 3.2. Sentences (если у вас предложения — отдельная сущность)
- `sentences`
  - PK: `id`
  - FK: `text_id`
  - `he_plain`, `he_niqqud`, `translit`, `ru`
  - search normalization: `he_norm`
  - позиция/порядок: `order_index`

Если sentence не выделяется — jump-to-sentence реализуется через anchor внутри row.

### 3.3. Notes
- `sentence_notes`
  - PK: `id`
  - FK: `text_id`, `sentence_id`
  - `note`
  - `updated_at`

Premium расширение:
- `note_templates`
  - template_id, name, content_md, created_at
- `note_versions` (version history)
  - version_id, note_id, content_md, created_at, editor/source

### 3.4. Search index
Минимум v1:
- колонка `he_norm` в `sentences`
- индекс `ix_sentences_he_norm`

Альтернатива v2:
- SQLite FTS5 таблица для нормализованных полей

### 3.5. SRS
- `srs_card_templates`
  - `id` (PK)
  - `code` (unique), `label`
  - `card_kind`, `prompt_lang`, `answer_lang`
  - `front_schema_json`, `back_schema_json`
  - `answer_mode`, `is_active`, `sort_order`
- `srs_cards` (state)
  - `id` (PK)
  - `entity_type`, `entity_id`, `template_id` (unique)
  - `source_sentence_id`, `source_note_id`, `meta_json`
  - state, due_date, interval_days, ease_factor, lapses, reps, last_review_at
- `srs_review_events` (log)
  - `id` (PK)
  - card_id (FK)
  - reviewed_at, rating, interval_before/after, ease_before/after, review_time_ms
- `srs_session_runs` (trainer session state)
  - `id` (PK)
  - `status`, `mode`, `source`
  - `queue_json` (`cardId[]` после PATCH-05)
  - `current_index`, `cards_total`, `cards_seen`, `reviews_done`
  - `stats_json`
  - `started_at`, `finished_at`
- `srs_attempts` (trainer attempts log)
  - `id` (PK)
  - `session_id` (nullable FK -> `srs_session_runs`)
  - `card_id` (FK -> `srs_cards`)
  - `attempt_type`
  - `user_answer`, `normalized_answer`, `normalized_expected`
  - `is_correct`, `latency_ms`, `meta_json`, `created_at`

### 3.6. Analytics events
Текущее фактическое состояние:
- legacy/runtime analytics:
  - `history_events`
  - `recent_rows`
  - `recent_texts`
- unified event ingestion layer:
  - `events`
    - `id` (PK)
    - `ts`
    - `event_type`
    - `entity_type`, `entity_id`
    - `session_id`
    - `text_id`, `sentence_id`, `note_id`, `card_id`
    - `source`
    - `payload_json`

PATCH-07 decision:
- `history_events` сохраняется как source для существующих dashboard summary
- `events` используется для новых cross-feature analytics events
- полный перенос агрегатов на `events` остаётся отдельным будущим шагом

### 3.7. Audio assets
- `audio_assets`
  - `id` (PK)
  - `asset_key` (unique)
  - `relative_path`
  - voice/lang/params
  - created_at

## 4) Индексы (обязательные рекомендации)
- Search:
  - index on hebrew_norm (или FTS)
- Notes:
  - index on note.updated_at
  - index on (row_id) / (sentence_id)
- SRS:
  - index on due_date
  - index on (entity_type, entity_id) unique
- Events:
  - index on ts
  - index on session_id
  - index on event_type

## 5) Политика миграций
1) Новый объект → новая миграция `migrations/NNN_*.sql`.
2) Никаких ручных правок в `data/app.db` в git.
3) Любые breaking changes сопровождаются:
   - migration path
   - обновлением контрактов (docs)
   - fixtures/проверками

## 6) Acceptance Checklist для DB изменений
- Миграции применяются на чистой БД.
- Инструмент db-check (если есть) проходит.
- Индексы присутствуют.
- Контракты (docs) обновлены.

---

## DOC-AUDIT pointers (DOC-AUDIT-NAV-01)

### Важно (DB evidence required)
Этот документ — **контракт**, а фактическая схема подтверждается `migrations/*.sql` и `db/*Repo.js`.
Перед тем как считать контракты NAV/Search/SRS/Notes “финальными”, требуется DB evidence patch.

Минимальный чеклист DB evidence (точечно, без чтения больших файлов целиком):
1) Подтвердить реальные таблицы и PK:
   - texts: text_id
   - rows/sentences: row_id и/или sentence_id
   - notes: note_id
2) Подтвердить связь для NAV resolver:
   - sentenceId -> textId
   - noteId -> sentenceId или rowId
3) Подтвердить, что `order_index` существует и используется только как позиция (не как ID).
4) Зафиксировать, где хранится `filtersKey`/search state (если в БД) и/или какая часть живёт только в sessionStorage.

### Open gaps (см. единый реестр)
Единый реестр дыр: `docs/ROADMAP_PREMIUM.md` → `DOC-AUDIT-NAV-01 — Gap Register`.

Ссылки на ключевые Gap ID:
- DB-GAP-REALITY-09
- NAV-GAP-ROW-01
- NAV-GAP-ID-SENT-02
- NAV-GAP-ORDERINDEX-10
