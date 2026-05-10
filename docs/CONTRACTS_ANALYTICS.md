# CONTRACTS — Analytics PRO

## 0) Current Repo Status (2026-05-10, post Direction 11A Phase 11.0)

**Phase 6 architectural flip (v3.0.0) move'нул контракт fundamentally:** server-side stateful endpoints (`/api/history/event`, `/api/history/recent-*`, `/api/history/analytics`) теперь возвращают `410 Gone`. Все analytics — **client-side OPFS-resident**.

### Текущее источник правды
- **Local events table** (OPFS, через `local-db.js`) — single source of truth для all client-side analytics.
- `recordEvent()` API (см. `local-db.js:423`) — единая точка ingestion'а.
- `getAnalytics()`, `getActivityHeatmap()`, `recentActivity()` — read paths поверх `events`.

### Phase 11.0 closure (2026-05-10)

Прежние редакции этого doc'а documented 7 event types as "уже реализовано", но **только `row_tts` реально emit'ился**. Phase 11.0 закрыл этот gap. Теперь актуально emit'ятся:

| Event type | Emit point | Payload (anonymized) |
|------------|------------|----------------------|
| `text_open` | `v3LibraryOpenText` (и transitively на любом open path) | `text_id`, `source` ('library' / 'search' / 'smart-chip' / 'session-restore' / 'share-import') |
| `text_close` | На переключении на другой text + `pagehide` + `visibilitychange:hidden` | `text_id`, `payload_json.duration_ms` |
| `play_audio` | `v3RowTtsTrackPlay` + dashboard playRow (рядом с legacy `row_tts`) | `text_id`, `sentence_id`, `source` (asset_key), `payload_json.duration_ms`, `payload_json.replay_count` |
| `row_tts` | Legacy emit (kept для backwards-compat с `getAnalytics`) | `text_id`, `sentence_id`, `source` (asset_key) |
| `save_note` | `v3NotesSave` (когда _prevLen=0 && _newLen>0 — first save) | `text_id`, `sentence_id`, `payload_json.note_kind` ('free' for v3.2 baseline; templates → Direction 9), `payload_json.body_length` |
| `note_edit` | `v3NotesSave` (когда _prevLen > 0 — existing note edited) | `text_id`, `sentence_id`, `payload_json.chars_added`, `payload_json.chars_removed`, `payload_json.body_length` |
| `srs_review` | `local-db.js srs.reviewCard()` (single point) | `card_id`, `text_id` (via sentence FK), `sentence_id`, `session_id` (if SRS Trainer active), `payload_json.{grade, interval_before_days, interval_after_days, state_before, state_after, ease_before, ease_after}` |
| `srs_session_started` | `v3SrsTrainerOpen` | `session_id` |
| `srs_session_finished` | `v3SrsTrainerClose` | `session_id`, `payload_json.{duration_ms, cards_reviewed}` |
| `search_query` | `v3IdeSearchExecute` | `payload_json.{query_length, result_count, scope}` — **query string itself NEVER recorded** |
| `smart_tag_override` | `v3TextMetaSave` (после `setManualSmartTag`) | `text_id`, `payload_json.tag` ('struggling' / 'mastered' / 'auto') |
| `translit_toggle` | `v3IdeToggleColumn` (when key === 'translit') | `payload_json.visible` (boolean) |

### Phase 11.1 closure (2026-05-10)

Heartbeat-based time-spent v2 — реализована. Three new event types:

| Event type | Emit point | Payload |
|------------|------------|---------|
| `session_start` | First user interaction or page-load when visible (after `DOMContentLoaded`) | `session_id`, `payload_json.{app_version, platform}` (`web/desktop` / `web/mobile-ios` / `web/mobile-android` / `web/pwa`) |
| `session_heartbeat` | Every 30s while: visible + interaction within last 60s + duration < 60min | `session_id` |
| `session_end` | `visibilitychange:hidden` / idle timeout (5 min без interaction) / max-session reached (60 min) / `pagehide` / `beforeunload` | `session_id`, `payload_json.{duration_ms, reason}` (reason ∈ `idle` / `max-length` / `visibility-hidden` / `pagehide` / `beforeunload` / `explicit`) |

Constants (from `public/index.html`):
- `V3_SESSION_HEARTBEAT_MS = 30 × 1000`
- `V3_SESSION_IDLE_MS = 5 × 60 × 1000`
- `V3_SESSION_MAX_MS = 60 × 60 × 1000`

Activity signals (mark session active, throttled to 1 Hz):
- `keydown` / `click` / `pointerdown` / `scroll` / `touchstart`

### Aggregation API (`local-db.js` exports)

| Function | Returns | Use case |
|----------|---------|----------|
| `getActiveMsReal({ sinceIso? })` | `number` ms | Real active time over window. Backbone of all other helpers. |
| `getActiveMinutesByDay({ days = 30 })` | `Array<{date, active_minutes, active_ms}>` | Per-day timeseries (zero-filled). For future heatmap variant + research-mode time-of-day distribution. |
| `getSessionMetrics({ days = 7 })` | `{ sessions_count, heartbeats_count, sessions_completed, sessions_orphaned, active_days_count, active_ms_real }` | Session-level summary. Research-mode aggregation upload (Direction 11B). |

### `getAnalytics()` shape evolution

Backwards-compatible. Both fields coexist:
- `time_ms` — legacy plays × 4000 estimate (preserved for v3.1 dashboards).
- `active_ms_real` — heartbeat-derived precise measurement (Phase 11.1).

Callers should prefer `active_ms_real` когда `> 0`.

### Aggregation rule (Phase 11.1 v1)

For each session:
- If `session_end.payload_json.duration_ms` exists → use it (precise).
- Else (orphan session — closed via crash/forced-quit) → `(heartbeats × 30s) + 30s start baseline` (slight underestimate; never overestimates).

Implementation: two-pass aggregation (baseline approximation + per-session precision deltas) — see `getActiveMsReal` in `local-db.js`. Single-query approach not feasible without JSON window functions in vanilla SQLite.

### Не реализовано (→ Direction 11B research mode)

### Не реализовано (→ Direction 11B research mode)
- Cohort aggregates по level/topic/tags на уровне server-side `/api/research/v1/*` endpoint family. Опт-ин upload daily aggregates.

### Не реализовано (→ Direction 9 M6)
- `card_added_to_srs` event — пока добавление карточек в SRS происходит косвенно через template generation; explicit "add this note as SRS card" flow появится с notes redesign.

### Privacy invariants (enforced — Phase 11.0)
- В `events.payload_json` **никогда не пишется**: raw Hebrew text, note body, search query string, audio bytes, user identifying info.
- Записывается **только**: counts, lengths, durations, internal IDs (text_id / sentence_id / card_id / note_id — local-only, не уходят на сервер в обычной работе).
- Server-side telemetry — **отсутствует** (out of scope post-Phase-6). Research-mode aggregates (Direction 11B) — separate opt-in flow.

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
