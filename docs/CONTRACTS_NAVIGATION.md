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

## 3) Navigation Target Contract (обязательный)
### 3.1. Структура объекта Target
```json
{
  "v": 1,
  "type": "row|sentence|note|search_results",
  "id": "string",
  "context": {
    "source": "rows|notes|dashboard|deeplink",
    "q": "string|null",
    "lang": "hebrew|russian|english|auto|null",
    "filters": { "tags": [], "topic": null, "level": null },
    "sort": "relevance|recent|alpha|null",
    "page": 1,
    "anchor": { "sentence_id": "string|null" }
  }
}

### 3.2. Инварианты

1. Любой Target должен:

- резолвиться в экран, или

- возвращать контролируемую ошибку NOT_FOUND без падения UI.

2. type + id — достаточно для прямого открытия (deep link).

3. context.anchor.sentence_id используется для jump-to-sentence.

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

## 7) Acceptance Tests (обязательные)

| ID     | Сценарий            | Шаги                               | Ожидаемое                      |
| ------ | ------------------- | ---------------------------------- | ------------------------------ |
| NAV-01 | Deep link row       | открыть /#/t/<target row>          | открывается нужная строка      |
| NAV-02 | Deep link not found | открыть ссылку на удалённый id     | “не найдено” без падения       |
| NAV-03 | Back to results     | Search → open row → Back           | возврат к тем же результатам   |
| NAV-04 | Jump from Rows      | в Rows нажать jump-to-sentence     | позиционирование одинаковое    |
| NAV-05 | Jump from Notes     | из Notes jump-to-sentence          | позиционирование одинаковое    |
| NAV-06 | Stack reset         | новый поиск после просмотра detail | back возвращает на новый поиск |
| NAV-07 | Corrupt link        | открыть битую base64               | “некорректная ссылка”          |



