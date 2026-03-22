# API_CONTRACTS — Search endpoints (PRO-PREMIUM)

Этот документ — Single Source of Truth для API-контрактов поиска:
- GET /api/notes/search
- GET /api/sentences/search

Цель: зафиксировать shape запросов/ответов, семантику токенов, guards и инварианты,
чтобы исключить путаницу id/type/orderIndex и обеспечить предсказуемость для агентов.

Связанные документы:
- docs/GLOSSARY_DOMAIN.md (сущности: Sentence/Note/Row/Target/SearchSession)
- docs/CONTRACTS_NAVIGATION.md (NAV semantics, deep links)
- docs/NAV_CODEMAP.md (data flows UI↔state↔jump)
- docs/UI_MAP.md (selectors + data-attrs для hits)

---

## 0) Общие правила ответов

### Success envelope (оба endpoints)
Успешный ответ (включая guard-ранний выход) возвращает:
- `ok: true`
- `query: { ... }` (echo параметров, включая raw `q`)
- `results: []` (массив DTO)
- `more: boolean` (наличие следующей страницы)

Notes search: `res.json({ ok:true, query, results, more })`:contentReference[oaicite:29]{index=29}  
Sentences search: `res.json({ ok:true, query, results, more })`:contentReference[oaicite:30]{index=30}

### Error envelope
Ошибки возвращают HTTP 400/500 с:
- `{ error: "<CODE>", ...optional_meta }`

---

## 1) Общая семантика query tokens

### 1.1. Tokens поддерживаемые server-side парсерами

#### A) Shared parser (server) — для /api/sentences/search
Поддерживает:
- `#tag` (пример: `#corrosion`)
- `tag:xxx` (пример: `tag:heat`)
- `topic:xxx` (пример: `topic:metals`)

Возвращает:
- `qText` — текст без токенов (needle)
- `tagTokens` — tags (dedupe case-insensitive, max 25)
- `topicNeedle` — тема или null
Evidence: server shared token parser:contentReference[oaicite:31]{index=31}:contentReference[oaicite:32]{index=32}

#### B) Notes parser (server) — для /api/notes/search
Дополнительно к tag/topic поддерживает markers “notes-only” внутри `q`:
- `in:notes`, `in:note`, `notes-only`, `notesonly`, `notes`
- `note:` / `notes:` (любая форма, включая `note:something`, трактуется как notesOnly marker)
Также игнорирует `in:texts` / `texts` (если UI экспериментально “переключает обратно”).
Evidence: notes parser:contentReference[oaicite:33]{index=33}

### 1.2. UI needles (подсветка)
UI при подсветке совпадений в notes исключает служебные токены из needles:
- `topic:...`, `in:notes`, `note:...`
Evidence: UI extract needles:contentReference[oaicite:34]{index=34}

---

## 2) GET /api/notes/search

### 2.1. Purpose
Поиск совпадений в заметках (Note) и привязанных предложениях (Sentence) с возможностью:
- фильтрации по tags/topic/level/archived
- режима notesOnly (строгие guards, чтобы не сканировать всё)

UI вызывает endpoint из `v3NotesSearchNow`, лимитируя выдачу до 50 результатов, offset=0,
и пишет results в SearchSession:contentReference[oaicite:35]{index=35}.

### 2.2. Query params (request)

| Param | Type | Default | Семантика |
|---|---:|---:|---|
| `q` | string | "" | Raw query string. Поддерживает tokens (см. 1.1). |
| `search` | string | "" | Алиас для `q` (сервер берёт `q ?? search ?? ""`):contentReference[oaicite:36]{index=36} |
| `includeArchived` | "0"|"1" | "0" | Включать архивные тексты/строки:contentReference[oaicite:37]{index=37} |
| `notesOnly` | "0"|"1" | "0" | Принудительный notesOnly (OR с токеном внутри `q`):contentReference[oaicite:38]{index=38} |
| `level` | string|null | null | Фильтр уровня. Плохой level → 400 BAD_LEVEL:contentReference[oaicite:39]{index=39} |
| `tagMode` | "all"|"any" | "all" | Режим совпадения тегов:contentReference[oaicite:40]{index=40} |
| `tags` | array|string | — | Доп. теги: array, JSON-массив строк, или CSV/space. Мерджится с токенами из `q`:contentReference[oaicite:41]{index=41} |
| `topic` | string | — | Тема: явный param имеет приоритет над `topic:` токеном:contentReference[oaicite:42]{index=42} |
| `limit` | int | 50 | 0..200 (сервер clamp’ит):contentReference[oaicite:43]{index=43} |
| `offset` | int | 0 | >=0; если >5000 → 400 OFFSET_TOO_LARGE:contentReference[oaicite:44]{index=44} |

Hard limit:
- если `qRaw.length > 128` → 400 QUERY_TOO_LONG + meta:contentReference[oaicite:45]{index=45}

### 2.3. Parsing rules (server)
- `notesOnly = (?notesOnly=1) OR (notesOnly marker внутри q)`:contentReference[oaicite:46]{index=46}:contentReference[oaicite:47]{index=47}
- `tagTokens` = normalize( tags(from ?tags) + tags(from q tokens) ):contentReference[oaicite:48]{index=48}
- `topicNeedle` = `?topic` если задан, иначе token `topic:`:contentReference[oaicite:49]{index=49}
- `qText` = очищенная текстовая часть запроса (без tokens):contentReference[oaicite:50]{index=50}

### 2.4. Guards (server)
Цель: никогда не “сканировать всё”.

- Если `qText` пустой → `ok:true` + `results:[]` + `more:false`:contentReference[oaicite:51]{index=51}
- Если `notesOnly && qText.length < 2` → `ok:true` + `results:[]` + `more:false`:contentReference[oaicite:52]{index=52}

### 2.5. Success response (shape)

```ts
type NotesSearchQueryEcho = {
  q: string,              // raw qRaw
  includeNotes: true,
  notesOnly: boolean,
  includeArchived: boolean,
  level: string | null,
  tagMode: "all" | "any",
  limit: number,
  offset: number
};

type NoteSearchHit = {
  textId: string,
  sentenceId: string,
  orderIndex: number | null,

  note: string,
  noteUpdatedAt: string | null,   // ISO-ish (normalizeIsoZ)
  sentenceText: string,

  title: string,
  level: string | null,
  topic: string | null,
  source: string | null,

  tags: string[]
};

type NotesSearchResponse = {
  ok: true,
  query: NotesSearchQueryEcho,
  results: NoteSearchHit[],
  more: boolean
};
```
Evidence DTO mapping: fields выше соответствуют map на сервере
noteUpdatedAt нормализуется через normalizeIsoZ

### 2.6. Pagination semantics

Сервер делает fetch limit+1, затем:

- more = rows.length > limit

- results = first(limit)
Evidence: fetch + more logic

### 2.7. Error codes

| HTTP | error            | Когда                              |
| ---: | ---------------- | ---------------------------------- |
|  400 | QUERY_TOO_LONG   | qRaw > 128 (есть maxLen)           |
|  400 | OFFSET_TOO_LARGE | offset > 5000 (есть maxOffset)     |
|  400 | BAD_LEVEL        | level param задан, но не распознан |
|  500 | INTERNAL_ERROR   | непойманное исключение             |

## 3) GET /api/sentences/search

### 3.1. Purpose

Поиск совпадений по строкам/предложениям (rows/sentences) с выдачей DTO,
которые UI использует как hits для навигации (Jump) и списка совпадений.

### 3.2. Query params (request)

| Param             |   Type | Default | Семантика                                        |                                                          |
| ----------------- | -----: | ------: | ------------------------------------------------ | -------------------------------------------------------- |
| `q`               | string |      "" | Raw query. Поддерживает `#tag`, `tag:`, `topic:` |                                                          |
| `includeArchived` |    "0" |     "1" | "0"                                              | Включать архивные тексты/строки                          |
| `level`           | string |    null | null                                             | Фильтр уровня (без BAD_LEVEL-валидации на этом endpoint) |
| `tagMode`         |  "all" |   "any" | "all"                                            | Режим совпадения тегов                                   |
| `limit`           |    int |      50 | clamp 1..200                                     |                                                          |
| `offset`          |    int |       0 | clamp 0..5000                                    |                                                          |

Hard limit:

если qRaw.length > 128 → 400 Q_TOO_LONG

### 3.3. Parsing rules (server)

parsed = v3SearchParseQueryTokens(qRaw):
- qText = текст без токенов
- tagTokens = dedupe tags, max 25
- topicNeedle = token topic: или null
Evidence: shared parser + usage

### 3.4. Guard (server)

Если qText пустой или длина < 2 → ok:true, results:[], more:false

### 3.5. Success response (shape)

```
type SentencesSearchQueryEcho = {
  q: string,              // raw qRaw
  includeArchived: boolean,
  level: string | null,
  tagMode: "all" | "any",
  limit: number,
  offset: number
};

type SentenceSearchHit = {
  textId: string,
  sentenceId: string,
  orderIndex: number | null,

  he: string,
  he_niqqud: string,
  translit: string,
  ru: string,

  title: string,
  level: string | null,
  topic: string | null,
  source: string | null,

  tags: string[]
};

type SentencesSearchResponse = {
  ok: true,
  query: SentencesSearchQueryEcho,
  results: SentenceSearchHit[],
  more: boolean
};
```
Evidence DTO mapping: серверная нормализация results

### 3.6. Pagination semantics

more = (results.length === limit)
Примечание: это эвристика (в отличие от notes-search с limit+1).

### 3.7. Error codes

| HTTP | error          | Когда                  |
| ---: | -------------- | ---------------------- |
|  400 | Q_TOO_LONG     | qRaw > 128             |
|  500 | INTERNAL_ERROR | непойманное исключение |

## 4) Non-negotiable invariants (anti-confusion)

1. textId и sentenceId в hits — stable identifiers (строки). Они используются для jump/target.

2. orderIndex — позиционный индекс (может быть null). Он НЕ является ID и не должен использоваться как ключ сущности.

3. tags в API-ответах — массив строк (не JSON-строка). Для UI это контракт.

4. Guard-поведение (пустой qText / слишком короткий qText) — это часть контракта: endpoint обязан быстро возвращать пустые результаты вместо сканирования.