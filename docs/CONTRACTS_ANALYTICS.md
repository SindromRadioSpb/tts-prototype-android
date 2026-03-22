# CONTRACTS — Analytics PRO

## 0) Current Repo Status (2026-03-23)
Текущее состояние репозитория теперь является hybrid-моделью: runtime dashboard по-прежнему опирается на `history_events`, а новый forward-compatible event layer живёт в таблице `events`.

Что уже реализовано:
- `history_events`, `recent_rows`, `recent_texts`
- таблица `events`
- endpoints `/api/history/event`, `/api/history/recent-texts`, `/api/history/recent-activity`, `/api/history/analytics`
- агрегаты по plays/unique_rows/unique_texts/time_ms поверх `history_events`
- event logging в `events` для:
  - `search_query`
  - `save_note`
  - `play_audio`
  - `srs_review`
  - `trainer_attempt`
  - `srs_session_started`
  - `srs_session_finished`
- `srs_review_events` как детальный SRS review log, отдельный от analytics event layer

Что ещё не реализовано в полном контрактном виде:
- `session_start/session_heartbeat/session_end` как time-spent v2 модель
- cohort-метрики v1 по level/topic/tags
- полный перенос dashboard-агрегаций с `history_events` на `events`

Текущий source of truth:
- dashboard period/all summary: `history_events`
- cross-feature event ingestion: `events`

## 1) Цель
Analytics PRO измеряет учебную активность:
- time-spent без listeners (событийная модель),
- cohort по уровням/темам,
- метрики эффективности Premium (SRS, поиск, заметки).

## 2) Событийная модель
В целевом состоянии все кросс-фичевые метрики строятся на таблице `events`.
В текущем PATCH-07 это уже верно для event ingestion, но не для всех dashboard aggregate queries.

### 2.1. Event schema (логический контракт)
Минимальный набор полей:
- `event_id` (PK)
- `ts` (timestamp)
- `event_type` (string enum)
- `entity_type` (optional: row/sentence/note/srs_card/search)
- `entity_id` (optional)
- `session_id` (string)
- `payload_json` (json) — строго ограниченный по размеру

Фактическая схема PATCH-07:
- `id` (PK)
- `ts`
- `event_type`
- `entity_type`, `entity_id`
- `session_id`
- `text_id`, `sentence_id`, `note_id`, `card_id`
- `source`
- `payload_json`

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

Фактически подтверждено в PATCH-07:
- `search_query`
- `save_note`
- `play_audio`
- `srs_review`
- `trainer_attempt`
- `srs_session_started`
- `srs_session_finished`

## 5.1. Hybrid contract for `/api/history/analytics`
Текущий endpoint `/api/history/analytics` возвращает hybrid payload:
- `period` и `all` summary по `history_events`
- `period.eventCounts` и `all.eventCounts` по таблице `events`
- `topTexts` по существующей history analytics логике

Это считается допустимым контрактом PATCH-07, пока dashboard не переведён полностью на `events`.

## 6) Acceptance Tests
| ID | Сценарий | Шаги | Ожидаемое |
|---|---|---|---|
| AN-01 | session time | start + 3 heartbeat | time_spent > 0 |
| AN-02 | gap cutoff | heartbeat gap > max_gap | time не растёт |
| AN-03 | srs event | review good | events содержит srs_review |
| AN-04 | search event | сделать поиск | events содержит search_query |
| AN-05 | cohort metrics | rows с level/topic | агрегат строится |
| AN-06 | privacy | payload size | payload ограничен |

## 7) PATCH-07 decision
Архитектурное решение для текущего репозитория:
- не ломать существующий `history_events` dashboard слой
- ввести отдельный `events` слой для всех новых feature events
- расширять dashboard постепенно, читая `events` там, где это даёт ценность без регрессий
