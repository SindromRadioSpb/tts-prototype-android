# UI_MAP — стабильные selectors / ids / data-attrs (PRO-PREMIUM)

Цель: зафиксировать **стабильный UI-контракт** (Single Source of Truth) для навигации (NAV), поиска (Search), заметок (Notes) и смежных UX-потоков.
Документ предназначен для:
- Claude Code / агентов (evidence-first, deterministic)
- smoke/e2e сценариев NAV-01..NAV-07
- предотвращения путаницы “что где скроллится”, “какой контейнер matches”, “какие data-attrs обязательны”.

## 0) Governance (нельзя нарушать молча)

**Стабильными считаются:**
- `id="..."` элементов, указанных в этом документе
- ключевые классы: `.v3-modal`, `.v3-modal-body`, `.v3-note-hit`, `.v3-hit-active`, `.row-note-btn`, `.row-note-active`
- data-attrs в разделе `Hit Contract` и `Row Notes Contract`

**Любое изменение стабильных идентификаторов требует:**
1) обновить этот документ (`docs/UI_MAP.md`)
2) обновить связанный codemap (`docs/NAV_CODEMAP.md`) и/или contracts (`docs/CONTRACTS_NAVIGATION.md`) при необходимости
3) обновить smoke (NAV quick checks)

## 1) Глобальные паттерны UI

### 1.1. Модальные окна (Modal pattern)
Каждый модал следует паттерну:
- root: `div.v3-modal` + `hidden` для скрытия
- backdrop: `.v3-modal-backdrop` (обычно onclick=Close)
- panel: `.v3-modal-panel`
- body (scroll container): `.v3-modal-body`

**ВАЖНО:** для NAV scroll-restore используется именно `.v3-modal-body`, а не matches boxes.

### 1.2. Рекомендуемый стиль селекторов для автоматизации
Приоритет:
1) `#id`
2) `#id .class` (когда нужен контейнер)
3) `element.class[data-attr="..."]` (только где это часть контракта)

Не использовать для контрактных тестов:
- текстовые селекторы
- DOM-порядок дочерних узлов
- nth-child

## 2) NAV Sticky Bar (контракт)

| Элемент | Стабильный selector | Назначение |
|---|---|---|
| Sticky root | `#v3NavSticky` | контейнер sticky-панели NAV |
| Back | `#v3NavBackBtn` | back-to-matches |
| Prev | `#v3NavPrevBtn` | предыдущий hit |
| Next | `#v3NavNextBtn` | следующий hit |
| Status | `#v3NavStatus` | текстовый статус (например “2 / 10”) |

### 2.1. Хоткеи (NAV)
- Prev: `Alt + [`
- Next: `Alt + ]`

## 3) Search Modals: Library / Dashboard

### 3.1. Library Search Modal

**Root:** `#v3LibraryModal`  
**Scroll container:** `#v3LibraryModal .v3-modal-body`

Ключевые элементы:

| Зона | Selector | Назначение |
|---|---|---|
| Search input | `#v3LibrarySearch` | строка поиска (Library) |
| Scope select | `#v3SearchScopeLib` | scope поиска (texts/both/notes/rows) |
| Reset filters | `#v3LibraryResetFilters` | сброс фильтров |
| Active chips | `#v3LibraryActiveChips` | активные фильтры (chips) |
| Facets | `#v3LibraryFacets` | блок фасетов/фильтров |
| Status | `#v3LibraryStatus` | статус/подсказки |
| Results list | `#v3LibraryList` | список текстов/строк (основной контент) |

**Matches containers (НЕ scroll containers):**
- Notes matches: `#v3LibraryNotesMatches`
- Rows matches: `#v3LibraryRowsMatches`

### 3.2. Dashboard Modal

**Root:** `#v3DashboardModal`  
**Scroll container:** `#v3DashboardModal .v3-modal-body`

Ключевые элементы:

| Зона | Selector | Назначение |
|---|---|---|
| Search input | `#v3DashSearch` | строка поиска (Dashboard) |
| Scope select | `#v3SearchScopeDash` | scope поиска (texts/both/notes/rows) |
| Tag match mode | `#v3TagMatchModeDash` | режим тегов (any/all) |
| Level select | `#v3DashLevel` | фильтр level |
| Activity list | `#v3DashActivityList` | список “Activity” |
| Rows list | `#v3DashRowsList` | список последних строк по выбранному тексту |

**Matches containers (НЕ scroll containers):**
- Notes matches: `#v3DashNotesMatches`
- Rows matches: `#v3DashRowsMatches`

## 4) Hit Contract (matches → jump/prev/next/back)

### 4.1. Hit element (обязательная разметка)
Каждый hit в matches рендерится элементом:
- class: `.v3-note-hit`
- data-attrs:
  - `data-hit-type`: `"notes"` или `"rows"`
  - `data-hit-idx`: 0-based индекс hit внутри соответствующего массива results
  - `data-text-id`: textId (stable id)
  - `data-sentence-id`: sentenceId (stable id)
  - `data-order-index`: позиционный индекс (НЕ ID)

Рекомендуемый стабильный селектор hit:
- `.v3-note-hit[data-hit-type="<notes|rows>"][data-hit-idx="<n>"]`

### 4.2. Active hit highlight
Активный hit помечается классом:
- `.v3-hit-active`

Правило: в DOM не должно быть более одного `.v3-note-hit.v3-hit-active` на тип.

### 4.3. Matches box routing (origin × type)
Функция выбора контейнера matches основана на:
- `origin in {lib,dash}`
- `type in {notes,rows}`

Контейнеры:
- lib/notes → `#v3LibraryNotesMatches`
- lib/rows  → `#v3LibraryRowsMatches`
- dash/notes → `#v3DashNotesMatches`
- dash/rows  → `#v3DashRowsMatches`

## 5) Notes UI (modal) + Notes per row (таблица)

### 5.1. Notes Modal (per sentence)

**Root:** `#v3NotesModal`  
**Scroll container:** `#v3NotesModal .v3-modal-body`

Ключевые элементы:

| Зона | Selector | Назначение |
|---|---|---|
| Status | `#v3NotesStatus` | статус сохранения/ошибок |
| Textarea | `#v3NotesText` | текст заметки |
| Markdown wrap | `#v3NotesMdWrap` | контейнер markdown-режима |
| Preview | `#v3NotesPreview` | preview (может быть hidden) |
| Preview toggle | `#v3NotesPreviewToggleBtn` | переключение preview/edit |

Hotkeys:
- `Esc` — закрыть (guard-aware)
- `Ctrl+Enter` — сохранить (только если focus внутри modal panel)

### 5.2. Row Notes Contract (кнопка заметки в строке таблицы)
Кнопка заметки (в таблице строк) — это:
- selector: `button.row-note-btn`
- обязательные data-attrs:
  - `data-row-idx` (0-based индекс строки в текущей таблице)
  - `data-sentence-id` (sentenceId; присутствует только если строка из Library)

Состояние:
- `.row-note-active` означает “заметка есть” (подсветка + всегда видима).

Делегат клика:
- слушает `button.row-note-btn`
- читает `data-row-idx`
- извлекает `row._v3_textId` и `row._v3_sentenceId`
- вызывает `v3NotesOpen(textId, sentenceId, rowIdx)`

## 6) Табличный Row UX (минимум для NAV/Notes интеграции)

| Элемент | Selector | Назначение |
|---|---|---|
| Table root | `#proTable` | таблица строк |
| Row element | `#proTable tbody tr[data-row-idx]` | строка таблицы (rowIdx) |
| Row selected | `#proTable tbody tr.row-selected` | выбранная строка |
| Row TTS button | `button.row-tts-btn[data-row-idx]` | озвучка строки |
| Row Notes button | `button.row-note-btn[data-row-idx]` | заметка строки |

