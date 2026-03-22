# GLOSSARY_DOMAIN — сущности, IDs и anti-confusion rules (Single Source of Truth)

## 1) Цель
Зафиксировать единый словарь доменных сущностей и их идентификаторов так, чтобы:
- исключить путаницу `type/id`, `textId/sentenceId/rowId/noteId`, `order_index`;
- обеспечить единые ожидания для UI↔API↔DB↔Exports;
- сделать навигацию (DeepLink/Back-to-results/Jump-to-sentence) детерминированной и воспроизводимой.

Документ описывает ТОЛЬКО доменные термины и правила “как называть и как не путать”.
Алгоритмы — в `docs/CONTRACTS_NAVIGATION.md`.
DB-инварианты — в `docs/DB_SCHEMA.md`.
Smoke — в `docs/SMOKE-CHECK.md`.

---

## 2) Словарь идентификаторов (ID Vocabulary)

### 2.1. Stable IDs (разрешены как навигационные ключи)
| Имя | Смысл | Требование стабильности | Основной источник |
|---|---|---|---|
| `textId` | PK текста (Text) | MUST stable | DB (таблица текстов).text_id |
| `sentenceId` | PK предложения/строки (Sentence) | MUST stable | DB: sentences.sentence_id ИЛИ (в упрощённой модели) library_rows.row_id |
| `rowId` | PK строки библиотеки (Row) | MUST stable | DB: library_rows.row_id |
| `noteId` | PK заметки (Note) | MUST stable | DB: sentence_notes.note_id |
| `audioId` | PK аудио-актива (AudioAsset) | MUST stable | DB: audio_assets.audio_id |

### 2.2. Позиционные значения (НЕ являются ID)
| Имя | Смысл | Стабильность | Можно ли использовать в deep link |
|---|---|---|---|
| `order_index` | позиция в тексте/порядок | NOT stable | НЕТ (запрещено) |
| `activeIndex` | индекс активного hit в UI | runtime | НЕТ (только UI state) |
| `offset/limit/page` | пагинация выдачи | runtime | НЕТ (часть контекста, не ID) |

---

## 3) Таблица доменных сущностей

| Сущность | Что это | Канонический ID | Где живёт (источник истины) | Где используется | Связи/инварианты |
|---|---|---|---|---|---|
| **Text** | Текст/карточка/документ в Library | `textId` | DB | UI (открытие текста), Search scope=texts/both, Exports | Один Text содержит множество Row/Sentence; открытие текста может делать jump по anchor |
| **Row** | Единица отображения/хранения “строки” Library | `rowId` | DB (library_rows.row_id) | UI таблицы/рендер Rows, Notes контекст (FK), иногда якорь jump | Row может соответствовать одному Sentence (упрощённо) или содержать несколько элементов/сегментов |
| **Sentence** | Единица jump-to-sentence (предложение/строка/сегмент) | `sentenceId` | DB (sentences.sentence_id) или в упрощённой модели = `rowId` | Navigation Target.type=sentence; API hits; Jump-to-sentence | Обязательная связь для resolver: `sentenceId -> textId` |
| **Note** | Заметка пользователя, привязанная к контексту текста | `noteId` | DB (sentence_notes.note_id) | Navigation Target.type=note; Notes выдача/рендер | Note обязана иметь контекст: FK на `sentenceId` или `rowId` |
| **AudioAsset** | Результат TTS (аудио), привязан к сущности | `audioId` | DB (audio_assets.audio_id) | UI playback, кэш/библиотека аудио, Exports | Привязка к stable ID сущности; key_hash unique (для дедупликации) |
| **SearchSession (v3)** | Состояние поиска и навигации по результатам | (не PK) | sessionStorage | Back-to-results, restore, active hit pointer | Содержит origin/scope/qRaw/filtersKey + результаты + scrollRestore |
| **Target (v1)** | Машиночитаемое “куда перейти” | `Target.id` зависит от `Target.type` | URL (deeplink) / nav_stack / runtime | Resolver, deep links, Copy link | `type` строго из enum: text/sentence/note/search; `id` обязан быть stable ID для соответствующей сущности |
| **DeepLink (v1)** | Стабильная ссылка на Target | `/#/t/<base64url(json_target)>` | URL hash | Entry point boot (hash) | Должна быть детерминированной и канонизированной (фиксированный порядок ключей, без временных полей) |

---

## 4) Mapping: как сущности кодируются в Target v1

### 4.1. Target.type = `text`
- `Target.id = textId`
- Опционально: `context.anchor.sentence_id` как внутренний якорь для jump внутри текста.
- Нельзя класть в id: sentenceId/noteId/order_index.

### 4.2. Target.type = `sentence`
- `Target.id = sentenceId`
- Если `sentenceId` не гарантированно глобально уникален, должен использоваться `ref.textId` (для резолва без двусмысленности).
- Якорь не требуется (jump делается по самому sentenceId).

### 4.3. Target.type = `note`
- `Target.id = noteId`
- Рекомендовано указывать `ref.sentenceId` или `ref.rowId` для восстановления контекста и jump (если UX требует).

### 4.4. Target.type = `search`
- `Target.id = searchKey` (opaque, не entity ID)
- Для воспроизведения выдачи обязателен контекст через `ref.scope/ref.q/ref.filtersKey` (или восстановление через SearchSession v3).

---

## 5) Row vs Sentence — текущая ситуация (важно)

### 5.1. Доменная реальность
- **Row** — стабильная единица Library (`rowId`).
- **Sentence** — стабильная единица Jump/Navigation (`sentenceId`).

### 5.2. Возможны две реализации данных (обе допускаются DB_SCHEMA)
A) **Sentences как отдельная таблица**:
- Sentence имеет собственный `sentenceId`, а Row — свой `rowId`.
- Sentence привязан к Row (FK `row_id`).

B) **Sentence не выделяется**:
- `sentenceId` фактически равен `rowId`, а jump реализуется через “anchor внутри row”.

### 5.3. Важно про Target.type enum
В Target v1 канонически поддержаны только: `text|sentence|note|search`.
Термин/пример `row` как `Target.type` считается неканоничным до отдельного выравнивающего патча.

Практическое правило до выравнивания:
- Для deep links/Copy link/навигации используем только enum типов Target v1.
- Если в UI есть “открыть строку”, она должна быть представлена либо как `sentence` (если `sentenceId == rowId`), либо как `text + anchor`, либо через будущий расширенный тип после обновления контрактов.

---

## 6) SearchSession v3 (операционная сущность, не PK)

SearchSession хранится в sessionStorage и служит для:
- восстановления выдачи (session restore);
- Back-to-results без потери scroll/highlight;
- навигации prev/next по hits.

Рекомендуемые поля v3 (канонический набор для будущей схемы):
- `origin`: `lib|dash|null`
- `scope`: `texts|both|notes|rows|null`
- `qRaw`: string
- `filtersKey`: string (детерминированный ключ фильтров)
- `notesResults`: array
- `rowsResults`: array
- `activeType`: `notes|rows|null`
- `activeIndex`: number >= 0
- `scrollRestore`: map key -> {scrollTop, savedAt}
- `updatedAt`: ISO timestamp

---

## 7) НЕ ПУТАТЬ (Anti-confusion rules)

1) `Target.id` — это **stable ID сущности**, а не позиция и не индекс.
2) `order_index` — НИКОГДА не является ID и не попадает в deep link.
3) `rowId` и `sentenceId` — разные понятия; равенство возможно только в “упрощённой модели”.
4) `searchKey` (Target.type=search) — **не entity ID**, а opaque ключ выдачи.
5) `filtersKey` — ключ фильтров выдачи; не путать с `searchKey`.
6) `activeIndex` — UI-индекс по массиву hits; не путать с `order_index` и не использовать как ID.
7) `ref.textId` — часть контракта резолва sentence, если sentenceId не глобально уникален.
8) `ref.rowId/ref.sentenceId` в note — контекст, а не основной ID заметки.
9) `context.anchor.sentence_id` — внутренний якорь для jump при `type=text`; не заменяет `Target.id`.
10) `Row` — доменная сущность, но `Target.type=row` не каноничен для v1 до выравнивающего патча.
11) Любая ссылка обязана резолвиться в экран или вернуть контролируемую ошибку (NOT_FOUND/CORRUPT) без падения UI.
12) Любое изменение смысла `type/id` внутри одного `v` запрещено.
13) Любые изменения storage keys навигации/сессии требуют обновления docs и smoke.
14) Exports обязаны ссылаться на stable IDs (textId/sentenceId/rowId/noteId/audioId), а не на позиционные индексы.
15) Если реальная DB-схема не подтверждена миграциями — любые расхождения считаются блокером “DB evidence patch”.

---

## 8) Open questions / Assumptions (явно)
- Уникальность `sentenceId` (глобально или внутри text) должна быть подтверждена DB evidence patch.
- Стратегия представления “открыть row detail” через канонический Target v1 должна быть выровнена отдельным патчем (закрытие NAV-GAP-ROW-01).
- Shapes API hits и обязательные поля (`textId+sentenceId` в hit и т.п.) фиксируются в `docs/API_CONTRACTS.md` отдельным патчем.
- Exports contract фиксируется отдельным документом (не в рамках Glossary).

---

## 9) Ссылки (обязательные чтения)
- `docs/CONTRACTS_NAVIGATION.md`
- `docs/DB_SCHEMA.md`
- `docs/SMOKE-CHECK.md`
- `docs/ROADMAP_PREMIUM.md`
