# DB_SCHEMA — целевая схема и инварианты (SQLite)

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

## 3) Слои данных (логическая модель)
### 3.1. Library
Назначение: хранение строк/текстов обучения и их метаданных.

Рекомендуемые сущности:
- `library_rows` (или эквивалент)
  - PK: `row_id`
  - raw поля: `hebrew`, `hebrew_niqqud`, `ru`, `translit`, `source`, `notes_md` (опционально)
  - metadata: `level`, `topic`, `tags_json` (канонизированный)

### 3.2. Sentences (если у вас предложения — отдельная сущность)
- `sentences`
  - PK: `sentence_id`
  - FK: `row_id`
  - `text_raw`, `text_norm`
  - позиция/порядок

Если sentence не выделяется — jump-to-sentence реализуется через anchor внутри row.

### 3.3. Notes
- `sentence_notes` (или эквивалент)
  - PK: `note_id`
  - FK: `row_id` и/или `sentence_id`
  - `content_md`
  - `updated_at`

Premium расширение:
- `note_templates`
  - template_id, name, content_md, created_at
- `note_versions` (version history)
  - version_id, note_id, content_md, created_at, editor/source

### 3.4. Search index
Минимум v1:
- колонка `hebrew_norm` в `library_rows` (или отдельная таблица)
- индекс по `hebrew_norm`

Альтернатива v2:
- SQLite FTS5 таблица для нормализованных полей

### 3.5. SRS
- `srs_cards` (state)
  - card_id (PK)
  - entity_type, entity_id (unique)
  - state, due_date, interval_days, ease, lapses, last_review_ts
- `srs_reviews` (log)
  - review_id (PK)
  - card_id (FK)
  - ts, rating, payload_json (optional, ограниченный)

### 3.6. Analytics events
- `events`
  - event_id (PK)
  - ts
  - event_type
  - session_id
  - entity_type/entity_id (optional)
  - payload_json (optional)

### 3.7. Audio assets
- `audio_assets`
  - audio_id (PK)
  - key_hash (unique)
  - storage_ref (path/url)
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
