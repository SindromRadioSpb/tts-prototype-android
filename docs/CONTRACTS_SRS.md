# CONTRACTS — SRS Engine (Premium)

## 1) Цель
SRS — ядро “платной учебности”:
- карточки на уровне row или sentence,
- очередь “Сегодня к повторению”,
- review events: again/hard/good/easy,
- детерминированное планирование (минимум v1).

## 2) Entity model
### 2.1. На каком уровне карточка
Вариант v1 (рекомендуемый):
- карточка создаётся на уровне **sentence**, если sentence выделена как сущность
- иначе на уровне **row**

Контракт:
- `entity_type` ∈ { "row", "sentence" }
- `entity_id` — стабильный ID (см. DB_SCHEMA.md)

## 3) SRS Card State (v1)
Минимальные поля состояния:
- `card_id` (PK)
- `entity_type`, `entity_id` (unique pair)
- `state` ∈ { "new", "learning", "review", "suspended" }
- `due_date` (YYYY-MM-DD)
- `interval_days` (int)
- `ease` (float, default 2.5)
- `lapses` (int)
- `last_review_ts` (timestamp)

## 4) Review Event Contract
### 4.1. Вход
- `card_id`
- `rating`: `again|hard|good|easy`
- `ts` (если не передан — server time)
- optional: `duration_ms`, `source` (dashboard/row/note)

### 4.2. Выход
- обновлённое состояние карточки
- новое `due_date`
- запись в `srs_reviews`
- запись события в `events` (см. CONTRACTS_ANALYTICS.md)

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
  3) last_review_ts asc (или null first)

## 7) Удаление/изменение сущностей
Инварианты:
1) Если entity удалена — карточка должна:
   - либо удаляться каскадом,
   - либо помечаться `suspended` (предпочтительно, чтобы не терять историю).
2) История `srs_reviews` сохраняется.

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
| SRS-08 | event logging | review | есть запись в events |
| SRS-09 | delete entity | удалить row/sentence | card suspended или cascade |
| SRS-10 | reproducible | повторить review | одинаковый результат при одинаковых входах |

## 9) Non-goals (v1)
- Полный SM-2 / FSRS — v2+
- Cross-device sync — отдельная задача
- “Leech” detection — v2+
