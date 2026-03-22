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
| Copy Link | `#v3NavCopyLinkBtn` | копировать deeplink текущего контекста |
| Prev | `#v3NavPrevBtn` | предыдущий hit |
| Next | `#v3NavNextBtn` | следующий hit |
| Status | `#v3NavPos` | текстовый статус (например "Rows 2/10") |

### 2.1. Хоткеи (NAV)
- Prev: `ArrowLeft` (когда NAV bar visible)
- Next: `ArrowRight` (когда NAV bar visible)
- Copy Link: `Ctrl+Shift+L` (global)

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

## 7) V3 IDE Workspace Layout (Week 12+)

Новый 3-панельный IDE layout, активируемый через feature flag.

### 7.1. Feature Flag

| Ключ | Хранилище | Значения | Назначение |
|---|---|---|---|
| `v3_ide_mode_enabled` | localStorage | `"0"` / `"1"` | Включение IDE mode |
| `v3_ide_state_v1` | localStorage | JSON | Состояние IDE (tabs, panels) |

CSS-режим: `body.v3-ide-mode` — включает IDE layout, скрывает classic.

### 7.2. IDE Header

| Элемент | Selector | Назначение |
|---|---|---|
| Header root | `#v3IdeHeader` | Заголовок IDE (logo + actions) |
| Left toggle | `#v3IdeLeftToggle` | Переключение левой панели |
| Right toggle | `#v3IdeRightToggle` | Переключение правой панели |
| Dashboard btn | `#v3IdeDashBtn` | Открыть Dashboard |
| Exit btn | `#v3IdeExitBtn` | Выход в Classic mode |

### 7.3. IDE Workspace Container

| Элемент | Selector | Назначение |
|---|---|---|
| Workspace root | `#v3IdeWorkspace` | Контейнер 3-panel layout |
| Left panel | `#v3IdeLeft` | Левая панель (Search/Library/History) |
| Center panel | `#v3IdeCenter` | Центральная панель (Content Viewer) |
| Right panel | `#v3IdeRight` | Правая панель (Inspector) |
| Panel backdrop | `#v3IdePanelBackdrop` | Затемнение для мобильных overlays |

### 7.4. IDE Left Panel Tabs

| Элемент | Selector | Назначение |
|---|---|---|
| Search tab content | `#v3IdeLeftSearch` | Контент вкладки Search |
| Library tab content | `#v3IdeLeftLibrary` | Контент вкладки Library |
| History tab content | `#v3IdeLeftHistory` | Контент вкладки History |
| Search input | `#v3IdeSearchInput` | Поле поиска (IDE) |
| Search scope | `#v3IdeSearchScope` | Scope поиска (IDE) |
| Search results | `#v3IdeSearchResults` | Результаты поиска (IDE) |
| Library filter | `#v3IdeLibraryFilter` | Фильтр библиотеки |
| Library level | `#v3IdeLibraryLevel` | Выбор уровня |
| Library sort | `#v3IdeLibrarySort` | Сортировка |
| Library list | `#v3IdeLibraryList` | Список текстов |
| History list | `#v3IdeHistoryList` | Список истории |

### 7.5. IDE Center Panel

| Элемент | Selector | Назначение |
|---|---|---|
| Header | `#v3IdeCenterHeader` | Заголовок активного текста |
| Title | `#v3IdeCenterTitle` | Название текста |
| Subtitle | `#v3IdeCenterSub` | Мета-информация |
| Content area | `#v3IdeCenterContent` | Контент (таблица строк) |

### 7.6. IDE Right Panel Tabs (Inspector)

| Элемент | Selector | Назначение |
|---|---|---|
| Notes tab content | `#v3IdeRightNotes` | Контент вкладки Notes |
| SRS tab content | `#v3IdeRightSrs` | Контент вкладки SRS |
| Audio tab content | `#v3IdeRightAudio` | Контент вкладки Audio |
| Export tab content | `#v3IdeRightExport` | Контент вкладки Export |
| Notes content | `#v3IdeNotesContent` | Внутренний контент Notes |
| SRS content | `#v3IdeSrsContent` | Внутренний контент SRS |
| Audio content | `#v3IdeAudioContent` | Внутренний контент Audio |
| Export content | `#v3IdeExportContent` | Внутренний контент Export |
| Note editor | `#v3IdeNoteEditor` | Редактор заметки (IDE) |

### 7.7. IDE Tab Contract

Tabs переключаются через:
- `.v3-ide-tab[data-tab="<tabname>"]` — кнопка вкладки
- `.v3-ide-tab-active` — активная вкладка

Left tabs: `search`, `library`, `history`
Right tabs: `notes`, `srs`, `audio`, `export`

### 7.8. IDE Mode Toggle

| Элемент | Selector | Назначение |
|---|---|---|
| Toggle button | `#v3ModeToggle` | Переключение Classic ↔ IDE |

### 7.9. IDE Keyboard Shortcuts

| Комбинация | Действие |
|---|---|
| `Ctrl+1` | Left panel → Search tab |
| `Ctrl+2` | Left panel → Library tab |
| `Ctrl+3` | Left panel → History tab |
| `Ctrl+Shift+1` | Right panel → Notes tab |
| `Ctrl+Shift+2` | Right panel → SRS tab |
| `Ctrl+Shift+3` | Right panel → Audio tab |
| `Ctrl+Shift+4` | Right panel → Export tab |
| `Escape` | Close mobile overlays |

### 7.10. IDE Responsive Breakpoints

| Breakpoint | Поведение |
|---|---|
| `>1200px` | Full 3-panel layout |
| `1024-1200px` | Narrower panels |
| `768-1024px` | Right panel becomes overlay |
| `<768px` | Both panels become overlays |

