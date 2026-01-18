# CONTRACTS — Analytics PRO

## 1) Цель
Analytics PRO измеряет учебную активность:
- time-spent без listeners (событийная модель),
- cohort по уровням/темам,
- метрики эффективности Premium (SRS, поиск, заметки).

## 2) Событийная модель (обязательный контракт)
Все метрики строятся на таблице `events`.

### 2.1. Event schema (логический контракт)
Минимальный набор полей:
- `event_id` (PK)
- `ts` (timestamp)
- `event_type` (string enum)
- `entity_type` (optional: row/sentence/note/srs_card/search)
- `entity_id` (optional)
- `session_id` (string)
- `payload_json` (json) — строго ограниченный по размеру

### 2.2. Правила безопасности
- В events **не записывать**: ключи API, токены, полные тексты (если есть риск приватности).
- Допустимо: короткие идентификаторы, агрегаты, counts, durations.

## 3) Time-spent без listeners (server-side)
### 3.1. События времени
- `session_start`
- `session_heartbeat`
- `session_end`

### 3.2. Правило расчёта (v1)
Параметры:
- `heartbeat_interval_s` (например 30–60 сек)
- `max_gap_s` (например 120 сек)

Алгоритм:
1) Для каждого `session_id` взять последовательность heartbeat/start/end.
2) Считать время как сумму `delta` между соседними событиями,
   но если `delta > max_gap_s`, то считать `delta = 0` (пользователь ушёл).
3) session_end закрывает сессию, но если end не пришёл — сессия считается закрытой после `max_gap_s`.

Результат:
- `time_spent_ms` по дню/неделе/месяцу
- `time_spent_ms` по подсистемам (по событиям open/search/review)

## 4) Cohort (уровни/темы)
### 4.1. Определение cohort
Cohort — группа строк/предложений, связанных с:
- `level`
- `topic`
- `tags`

Источник:
- значения из Library (см. DB_SCHEMA.md)

### 4.2. Метрики cohort (v1)
- `active_days`
- `time_spent_ms`
- `rows_viewed`
- `notes_created`
- `srs_reviews_count`
- `search_queries_count`

## 5) События (минимальный перечень v1)
Рекомендуемые `event_type`:
- `session_start`, `session_heartbeat`, `session_end`
- `search_query`
- `open_row`, `open_sentence`, `open_note`
- `save_note`
- `play_audio`
- `srs_review` (payload: rating)
- `export_anki`, `export_docx` (если есть)

## 6) Acceptance Tests
| ID | Сценарий | Шаги | Ожидаемое |
|---|---|---|---|
| AN-01 | session time | start + 3 heartbeat | time_spent > 0 |
| AN-02 | gap cutoff | heartbeat gap > max_gap | time не растёт |
| AN-03 | srs event | review good | events содержит srs_review |
| AN-04 | search event | сделать поиск | events содержит search_query |
| AN-05 | cohort metrics | rows с level/topic | агрегат строится |
| AN-06 | privacy | payload size | payload ограничен |
