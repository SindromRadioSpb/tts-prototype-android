# CONTRACTS — Navigation (Premium)

## 1) Цель
Обеспечить стабильную навигацию Premium:
- “Back to results” (история навигации),
- Deep links (стабильные ссылки),
- Jump-to-sentence работает одинаково из Rows и Notes.

## 2) Термины
- **Target** — “куда перейти”: row/sentence/note/search_results.
- **Context** — “откуда пришли / что было на экране”: query, filters, sort, paging, источник.
- **Resolver** — функция, которая по target возвращает данные для экрана.

## 3) Navigation Target Contract (Single Source of Truth)

### 3.1. Канонические типы Target (Wave D минимальный набор)
Допустимые значения `type`:
- `text`
- `sentence`
- `note`
- `search` (вместо `search_results`)

Любой иной `type` считается ошибкой `UNSUPPORTED_TYPE`.

### 3.2. Структура объекта Target (v=1)
```json
{
  "v": 1,
  "type": "text|sentence|note|search",
  "id": "string",
  "ref": {
    "textId": "string|null",
    "sentenceId": "string|null",
    "rowId": "string|null",
    "noteId": "string|null",
    "scope": "texts|both|notes|rows|null",
    "q": "string|null",
    "filtersKey": "string|null"
  },
  "context": {
    "search": {
      "scope": "texts|both|notes|rows|null",
      "q": "string|null",
      "lang": "he|ru|en|auto|null",
      "filters": {
        "tags": [],
        "topic": null,
        "level": null,
        "tagMode": "all|any|null",
        "includeArchived": false
      },
      "sort": "relevance|recent|alpha|null",
      "page": 1
    },
    "ui": {
      "origin": "lib|dash|deeplink|null",
      "activeType": "notes|rows|null",
      "activeIndex": 0,
      "scroll": { "key": "string|null", "top": 0 }
    },
    "anchor": {
      "sentence_id": "string|null"
    }
  }
}
```
### 3.3. Строгая семантика id (запрещает “перепутать id”)

| type     | Что означает id                      | ref (когда обязателен)                                                        | Запрещено                                 |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------- |
| text     | `textId` (PK текста)                 | нет                                                                           | класть сюда sentenceId/noteId/order_index |
| sentence | `sentenceId` (PK предложения/строки) | `ref.textId` обязателен, если sentenceId не гарантированно глобально уникален | класть сюда textId/order_index            |
| note     | `noteId` (PK заметки)                | рекомендовано: `ref.sentenceId` или `ref.rowId`                               | класть сюда sentenceId                    |
| search   | `searchKey` (opaque)                 | `ref.scope/ref.q/ref.filtersKey` обязательны для воспроизведения              | класть сюда entity ID                     |

### 3.4. Инварианты Target

1. Любой Target обязан:

резолвиться в экран, или

возвращать контролируемую ошибку (NOT_FOUND/CORRUPT/UNSUPPORTED_VERSION) без падения UI.

2. type + id достаточно для прямого открытия только если id — канонический стабильный PK этой сущности.
Если для sentence требуется textId, это фиксируется через ref.textId.

3. context.anchor.sentence_id используется только как “внутренний якорь” (например, type=text открыть текст и прыгнуть к sentence).
Для type=sentence якорь не требуется.

4. Позиционные значения (например order_index) никогда не являются id и не используются как ключ deep link.

## 4) Deep Links (A4 стабильные ссылки)
### 4.1. Формат ссылки

Рекомендуемый формат для статического UI:

/#/t/<base64url(json_target)>

Где json_target — объект Target (см. выше).
Пример:

/#/t/eyJ2IjoxLCJ0eXBlIjoicm93IiwiaWQiOiIxMjMifQ

### 4.2. Правила обработки

1. При открытии ссылки:

- decode target,

- validate schema (v/type/id),

- вызвать resolveTarget(target).

2. Если decode/validate не прошёл:

показать “Некорректная ссылка” + предложить перейти в Dashboard.

3. Если объект не найден:

показать “Элемент не найден” + кнопка “Back to results” (если контекст есть).

## 4.3. Deep Link Encoding (base64url JSON) — строгие правила
Формат deep link (канонический):
`/#/t/<base64url(utf8(json_target))>`

Где:
- `json_target` — объект Target (раздел 3),
- сериализация — UTF-8,
- кодирование — base64url без паддинга `=` (URL-safe алфавит `A–Z a–z 0–9 - _`).

### Канонизация JSON (для детерминированных ссылок)
Чтобы одна и та же сущность давала одинаковую ссылку:
- ключи в JSON должны идти в фиксированном порядке (как в разделе 3.2),
- значения `null` допускаются, но **рекомендуется** не включать большие поля в `context` без необходимости,
- запрещены “временные” поля в target (timestamps, runtime flags).

### Legacy входы (backward compatibility)
До полного внедрения `/#/t/<...>` допускается legacy-вход:
- `?textId=...&sentenceId=...&type=notes|rows&hl=...` (переходный формат)

Приоритет при boot:
1) hash deep link `/#/t/<...>` (если валиден),
2) query params legacy (если hash отсутствует),
3) session restore (например `v3SearchSession`),
4) default dashboard/library.

## 5) Back to results (Premium navigation history)
### 5.1. Что сохраняем

Храним стек nav_stack:

- push: при переходе с результатов поиска на detail

- pop: при нажатии “Back to results”

- reset: при явном новом поиске/переходе в dashboard (по правилу)

Минимально сохраняемые поля в stack item:

- serialized target (base64url)

- timestamp

- optional: UI scroll position

### 5.2. Правила “push”

Добавлять запись в стек, если:

- текущий экран = Rows results,

- user action = open row/note/sentence,

- контекст содержит query/filters (или “последний поисковый контекст”).

### 5.3. Правила “reset”

Стек очищается если:

- пользователь запустил новый поиск (q изменился) и подтвердил,

- пользователь перешёл в Dashboard “с нуля”.

## 6) Jump-to-sentence единообразие
### 6.1. Единое правило

Любой переход к sentence должен использовать один и тот же механизм:

- Target.type = sentence или

- Target.type = row + context.anchor.sentence_id

### 6.2. Resolver API (логический контракт)

resolveTarget(target) возвращает:

- screen: rows|note|sentence|search_results

- payload: данные для рендера

- navigation: back-ключи и корректный “back to results”

## 6.3. Resolution rules (resolveTarget) — однозначный алгоритм

### Входные статусы
- `OK` — target резолвится в UI-экран.
- `CORRUPT` — decode/validate не прошёл (битая base64/JSON/схема).
- `NOT_FOUND` — схема валидна, но сущность по id не найдена в БД.
- `UNSUPPORTED_VERSION` — `v` больше поддерживаемого.
- `UNSUPPORTED_TYPE` — `type` вне списка (раздел 3.1).

### Алгоритм resolveTarget(target)
1) Validate:
   - `v` (int), `type` (enum), `id` (string non-empty).
2) Normalize:
   - привести legacy поля к v=1 структуре (если нужно).
3) Resolve by type:
   - `text`: открыть текст по `textId=id`, если есть `context.anchor.sentence_id` → jump.
   - `sentence`: открыть текст, содержащий `sentenceId=id`:
       - если известен `ref.textId` → открыть этот текст,
       - иначе найти по индексу/таблице связь `sentenceId -> textId`.
     Затем выполнить jump-to-sentence.
   - `note`: открыть заметку по `noteId=id`, при наличии `ref.sentenceId/ref.rowId` — обеспечить “context jump” (если UX требует).
   - `search`: восстановить выдачу:
       - либо через `ref.scope/ref.q/ref.filtersKey`,
       - либо через session restore.
4) Возврат:
   - вернуть screen + payload + navigation keys (Back-to-results, active hit pointer).

## 7) Error handling (NOT_FOUND / CORRUPT / UNSUPPORTED)
### CORRUPT (битая/некорректная ссылка)
UI обязан:
- показать сообщение “Некорректная ссылка”
- дать CTA: “Открыть Dashboard”
- НЕ падать, НЕ зависать в полузагруженном состоянии.

### NOT_FOUND (сущность не найдена)
UI обязан:
- показать “Элемент не найден”
- дать CTA:
  - “Back to results” (если есть восстановимый контекст),
  - иначе “Открыть Dashboard”.

### UNSUPPORTED_VERSION / UNSUPPORTED_TYPE
UI обязан:
- показать “Ссылка устарела / не поддерживается”
- дать CTA: “Открыть Dashboard”
- (опционально) предложить обновить приложение.

## 8) Acceptance Tests (обязательные)

| ID     | Сценарий            | Шаги                               | Ожидаемое                      |
| ------ | ------------------- | ---------------------------------- | ------------------------------ |
| NAV-01 | Deep link row       | открыть /#/t/<target row>          | открывается нужная строка      |
| NAV-02 | Deep link not found | открыть ссылку на удалённый id     | “не найдено” без падения       |
| NAV-03 | Back to results     | Search → open row → Back           | возврат к тем же результатам   |
| NAV-04 | Jump from Rows      | в Rows нажать jump-to-sentence     | позиционирование одинаковое    |
| NAV-05 | Jump from Notes     | из Notes jump-to-sentence          | позиционирование одинаковое    |
| NAV-06 | Stack reset         | новый поиск после просмотра detail | back возвращает на новый поиск |
| NAV-07 | Corrupt link        | открыть битую base64               | “некорректная ссылка”          |

## 9) Non-negotiable rules for agents (обязательно)
1) Нельзя менять смысл `type/id` в рамках одного `v`.
2) Нельзя использовать позиционные поля (`order_index`) как навигационные ID.
3) Любой новый target/type → обновить этот документ и NAV tests.
4) Любой новый формат ссылки → обязателен backward compatibility план.
5) Любое изменение boot приоритетов (hash/query/session) → обновить раздел 4.3.
6) Любые ошибки резолва должны быть контролируемыми (NOT_FOUND/CORRUPT), без падения UI.
7) “Copy link” обязан генерировать **канонический** deep link.
8) Back-to-results обязан возвращать пользователя в **тот же** origin (lib/dash) и восстанавливать scroll + highlight.
9) Любые изменения navigation state storage (sessionStorage keys) → обновить docs.
10) Нельзя делать “drive-by refactor” навигации без явного запроса.

## 10) Evidence-first workflow (обязательно перед любыми правками Navigation)
Перед правками:
- repo-wide Search/Grep по паттернам: `deeplink|hashchange|resolveTarget|v3SearchSession|BackToMatches|replaceState|base64url`
- составить Code Map (entry/state/handlers/UI hooks)
- указать IDE evidence в отчёте патча.

## 11) Skills, которые обязаны триггериться при изменениях Navigation
- `.claude/skills/patch-workflow`
- `.claude/skills/navigation-deeplink-contract` (если существует в репо)
- (если затрагивается БД) skill зоны DB/migrations + обновление `DB_SCHEMA.md`

---

## DOC-AUDIT pointers (DOC-AUDIT-NAV-01)

Этот раздел — **аудит документации**, не меняет контрактов поведения.

### Known contradictions (требуют закрытия отдельным патчем)
1) В тексте/примерах встречается `row` как target-сущность, но `row` отсутствует в enum типов Target (см. Gap NAV-GAP-ROW-01).
2) В правилах jump встречается “Target.type=row + anchor”, что конфликтует с текущим enum (см. Gap NAV-GAP-ROW-01).

### Open gaps (см. единый реестр)
Единый реестр дыр: `docs/ROADMAP_PREMIUM.md` → `DOC-AUDIT-NAV-01 — Gap Register`.

Ссылки на ключевые Gap ID:
- NAV-GAP-ROW-01
- NAV-GAP-ID-SENT-02
- NAV-GAP-SEARCHKEY-03
- NAV-GAP-SESSION-V3-04
- NAV-GAP-NAVSTACK-05
- NAV-GAP-ORDERINDEX-10


