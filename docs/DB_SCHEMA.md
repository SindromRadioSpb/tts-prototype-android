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

## 2.1. Navigation IDs — источник истины и стабильность

Навигация (Premium) использует **только стабильные ID**. Позиционные индексы используются только как UI-помощники.

| ID | Таблица/поле (контракт) | Стабильность | Примечание |
|---|---|---|---|
| textId | (таблица текстов).text_id | MUST | Используется для открытия текста и контекста sentence |
| sentenceId | (таблица предложений).sentence_id или library_rows.row_id | MUST | Ключ jump-to-sentence и deep link sentence |
| rowId | library_rows.row_id | MUST | Если строки выделены отдельно от sentence |
| noteId | sentence_notes.note_id | MUST | Ключ deep link note |
| order_index | sentences.order_index | NOT stable | Запрещено использовать как deep link id |
| audio_id | audio_assets.audio_id | MUST | Привязка аудио к сущности по stable id |

Обязательные связи для навигации:
- sentenceId -> textId (иначе deep link sentence не может открыть правильный текст)
- noteId -> sentenceId или rowId (иначе note deep link не может восстановить контекст)

Если фактические имена таблиц отличаются — этот раздел должен быть обновлён на основании `migrations/*.sql` и `db/*Repo.js`.

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
