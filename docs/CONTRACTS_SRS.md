# CONTRACTS — SRS Engine (Premium)

## 0) Current Repo Status (2026-03-22)
Текущее состояние репозитория частично совпадает с контрактом ниже: sentence-level v1 уже реализован, а часть расширений остаётся planned.

Что уже реализовано:
- миграция `010_srs_tables.sql`
- миграция `011_srs_sessions.sql`
- миграция `012_srs_templates.sql`
- миграция `013_srs_review_events_fk_fix.sql`
- миграция `014_srs_attempts.sql`
- таблицы `srs_cards`, `srs_card_templates`, `srs_review_events`
- таблица `srs_attempts`
- `GET /api/srs/templates`
- `GET /api/srs/cards?sentenceId=...&templateCode=...`
- `POST /api/srs/cards`
- `POST /api/srs/cards/generate`
- `POST /api/srs/review`
- `GET /api/srs/today`
- `GET /api/srs/today/summary`
- `POST /api/srs/sessions`
- `GET /api/srs/sessions/:id`
- `GET /api/srs/sessions/:id/next`
- `POST /api/srs/sessions/:id/review`
- `POST /api/srs/sessions/:id/finish`
- `GET /api/srs/cards/:id/trainer-view`
- `POST /api/srs/attempts/check`
- рабочий SRS inspector в IDE: fetch/add/review без заглушек
- отдельный trainer entry point с session flow `start -> reveal -> rate -> next`
- trainer modes `reveal`, `typing`, `listening`, `cloze`
- template-filtered trainer queue (`he_to_ru` / `ru_to_he`)
- API smoke happy path для create/review/today + trainer attempts/session review

Что ещё не реализовано:
- dashboard-level Today widget
- suspend/delete lifecycle для удалённых sentence
- row-level cards
- интеграция review events с analytics/event layer

Документ ниже описывает текущий v1 sentence-level контракт и отмечает, что row-level/v2-расширения ещё не завершены.

## 1) Цель
SRS — ядро “платной учебности”:
- карточки на уровне row или sentence,
- очередь “Сегодня к повторению”,
- review events: again/hard/good/easy,
- детерминированное планирование (минимум v1).

## 2) Entity model
### 2.1. На каком уровне карточка
Текущий v1 в репозитории:
- карточка создаётся только на уровне **sentence**
- `entity_type = "sentence"`
- `entity_id = sentenceId`
- на одну sentence теперь допустимо несколько карточек через `template_id`
- базовые templates в runtime: `ru_to_he`, `he_to_ru`

Планируемое расширение:
- row-level cards можно добавить в v2+, но в текущем коде этого ещё нет

## 3) SRS Card State (v1)
Минимальные поля состояния:
- `card_id` (PK)
- `entity_type`, `entity_id`, `template_id` (unique triple)
- `source_sentence_id`
- `meta_json`
- `state` ∈ { "new", "learning", "review", "suspended" }
- `due_date` (YYYY-MM-DD)
- `interval_days` (real, но v1 пишет day-based deterministic values)
- `ease_factor` (float, default 2.5)
- `lapses` (int)
- `reps` (int)
- `last_review_at` (timestamp)

## 4) Review Event Contract
### 4.1. Текущий API-вход
- `POST /api/srs/review`
- body: `{ sentenceId, templateCode?, cardId?, rating, reviewTimeMs? }`
- `rating` ∈ { `1`, `2`, `3`, `4` } = Again / Hard / Good / Easy
- если card ещё нет, server создаёт её автоматически перед review

### 4.2. Текущий API-выход
- обновлённое состояние карточки
- новое `due_date`
- запись в `srs_review_events`
- интеграция с единым `events` layer пока не реализована

### 4.3. Дополнительные endpoint’ы v1
- `GET /api/srs/templates` → catalog шаблонов
- `GET /api/srs/cards?sentenceId=...&templateCode=...` → snapshot конкретной template-card
- `POST /api/srs/cards` → явное создание card по template
- `POST /api/srs/cards/generate` → batch-create нескольких template-card
- `GET /api/srs/today?limit=25` → due queue по card-level queue item

## 5) Scheduling правила (v1, предсказуемый минимум)
Начальные значения:
- new card: `interval_days = 0`, `ease = 2.5`, `due_date = today`

Переходы:
- `again`:
  - `lapses += 1`
  - `interval_days = 0`
  - `due_date = today`
  - `state = learning`
- `hard`:
  - `interval_days = max(1, floor(interval_days * 1.2))` (если 0 → 1)
  - `ease = max(1.3, ease - 0.15)`
  - `due_date = today + interval_days`
- `good`:
  - `interval_days = max(1, floor(interval_days * ease))` (если 0 → 1)
  - `ease` без изменений
  - `due_date = today + interval_days`
  - `state = review`
- `easy`:
  - `interval_days = max(2, floor(interval_days * (ease + 0.15)))` (если 0 → 2)
  - `ease = ease + 0.1`
  - `due_date = today + interval_days`
  - `state = review`

Примечание: это v1-алгоритм. Он должен быть детерминированным и стабильным для пользователя.

## 6) Queue “Сегодня к повторению”
Контракт выборки:
- включить карточки, где `due_date <= today`
- исключить `state = suspended`
- сортировка:
  1) overdue first (due_date asc)
  2) learning before review
3) last_review_at asc (или null first)

## 7) Удаление/изменение сущностей
Инварианты:
1) Если entity удалена — карточка должна:
   - либо удаляться каскадом,
   - либо помечаться `suspended` (предпочтительно, чтобы не терять историю).
2) История `srs_review_events` сохраняется.

## 8) Acceptance Tests
| ID | Сценарий | Шаги | Ожидаемое |
|---|---|---|---|
| SRS-01 | create new | создать card | due=today, state=new |
| SRS-02 | review again | rating=again | due=today, lapses+1 |
| SRS-03 | review good | rating=good | interval>=1, due>today |
| SRS-04 | review easy | rating=easy | interval>=2, due>today |
| SRS-05 | today queue | due<=today | card в Today |
| SRS-06 | overdue ordering | 2 overdue | старшая due раньше |
| SRS-07 | suspended | suspend card | не в Today |
| SRS-08 | event logging | review | есть запись в `srs_review_events` |
| SRS-09 | delete entity | удалить row/sentence | card suspended или cascade |
| SRS-10 | reproducible | повторить review | одинаковый результат при одинаковых входах |

## 9) Non-goals (v1)
- Полный SM-2 / FSRS — v2+
- Cross-device sync — отдельная задача
- “Leech” detection — v2+

## 10) Approved Patch Roadmap (PATCH-03..PATCH-08)
### PATCH-03 — SRS Core
- sentence-level cards
- `/api/srs/cards`
- `/api/srs/review`
- `/api/srs/today`
- IDE inspector quick actions

### PATCH-04 — Trainer Foundations
- отдельная кнопка входа в trainer
- session model
- today summary
- start / next / review / finish API
- минимальный trainer UI с reveal + rating flow

### PATCH-05 — Card Templates
- статус: реализовано частично
- template-driven cards: `ru_to_he`, `he_to_ru`
- generation rules: `POST /api/srs/cards/generate`
- audio/cloze остаются planned

### PATCH-06 — Trainer Modes
- статус: реализовано базовое ядро
- trainer modes: `reveal`, `typing`, `listening`, `cloze`
- answer checking server-side через `POST /api/srs/attempts/check`
- trainer payload через `GET /api/srs/cards/:id/trainer-view`
- attempts logging в `srs_attempts`
- trainer queue фильтруется по `templateCode`, чтобы opposite-direction cards не смешивались
- IDE default template selection: `Hebrew -> Russian`
- richer hint system и audio/cloze-specific templates остаются на следующие патчи

### PATCH-07 — Analytics Alignment
- `srs_review`
- `trainer_attempt`
- `srs_session_started`
- `srs_session_finished`

### PATCH-08 — Anki Export v1
- статус: baseline реализован
- `GET /api/srs/export/status`
- `GET /api/srs/export/anki/preview`
- `POST /api/srs/export/anki`
- локальная metadata-таблица `srs_card_exports`
- idempotent export metadata и stable note type mapping
- automatic smoke покрывает preview/status/dry-run; реальный push требует запущенный Anki Desktop + AnkiConnect
