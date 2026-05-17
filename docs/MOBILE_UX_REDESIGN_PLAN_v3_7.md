# Mobile UX Redesign Plan v3.7 → Premium

**Дата:** 2026-05-18  
**Версия:** v3.7  
**Файл реализации:** `public/index.html` (~39K строк)  
**Viewport для мобиле:** 380px  
**Источник:** 18 скриншотов из `Smoke-check/redesign_17.05.26/` + live Playwright-тест

---

## Сводная таблица проблем

| # | Компонент | Root cause (строка) | Приоритет |
|---|-----------|---------------------|-----------|
| 1 | Заголовки аккордеонов | `.classic-disclosure-summary` — двухколоночный flex без mobile-compact | P3 |
| 2 | Чипы статуса | `@media 600px` → `white-space:normal` (стр. 2156–2157) | P1 |
| 3 | Настройки озвучки — grid | `@media 600px` → `grid-template-columns:1fr` (стр. 2194) | P2 |
| 4 | Настройки перевода + лейблы | То же + длинные `<option>` тексты | P2 |
| 5 | Блок Результат | `@media 600px` → `flex-direction:column; width:100%` (стр. 2198–2200) | P1 |
| 6 | Кнопка ⬇ audio + статусы | `.audio-block {flex-direction:column}` (стр. 1461–1466) | P2 |
| 7 | Библиотека — шапка кнопок | Глобальное `button.btn-secondary {width:100%}` (стр. 2119–2124) | P1 |
| 8 | Библиотека — карточка кнопки | То же, `flex:1 1 auto` не работает из-за override | P1 |
| 9 | Дашборд — шапка + фильтры | То же правило | P1 |
| 10 | Дашборд — Активность overflow | `.v3-dash-rows-header` без overflow-x | P0 |
| 11 | Feedback dark theme | Inline `style="color:#0f172a"` vs CSS class override | P0 |

---

## Детальные требования

### Проблема 2: Чипы статуса (скрины 2, 5)

**Root cause:**
- Строки 663–668: `.classic-state-row { display:flex; flex-wrap:wrap; }`
- Строки 2156–2157: `@media 600px` — `white-space: normal` на чипах

**Фикс:**
```css
@media (max-width: 600px) {
  .classic-state-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 2px;
  }
  .classic-state-chip, .classic-trust-chip {
    white-space: nowrap;
    flex-shrink: 0;
  }
}
```

**Премиум:** Сократить лейблы чипов: "Текст: готов" → "✓ готов", "Результат: сохранён" → "💾 сохранён", "Источник: Library" → "📚 Library". Fade-маска справа через CSS `mask-image`.

---

### Проблема 3–4: TTS/Translation grid (скрины 3, 4)

**Root cause:**
- Строка 2194: `.classic-fields-grid-two { grid-template-columns: 1fr; }`
- Строки 2195–2197: `.classic-inline-meta .btn-secondary { width: 100%; }`

**Фикс:**
```css
@media (max-width: 600px) {
  .classic-fields-grid-two {
    grid-template-columns: repeat(2, 1fr);
  }
  .classic-inline-meta {
    flex-wrap: nowrap;
    overflow-x: auto;
  }
  .classic-inline-meta .provenance-badge,
  .classic-inline-meta .btn-secondary {
    width: auto;
    flex: 1 1 auto;
    min-width: 0;
    font-size: 11px;
    padding: 6px 8px;
    white-space: nowrap;
  }
}
```

**Премиум:** Сократить `<option>` тексты перевода: "Транслит: SBL Academic" → "SBL Academic".

---

### Проблема 5: Блок Результат (скрин 5)

**Root cause:** Строки 2198–2200: `flex-direction:column; width:100%` на `.classic-result-actions`

**Фикс:**
```css
@media (max-width: 600px) {
  .classic-result-actions {
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 8px;
  }
  .classic-result-actions .btn-secondary,
  .classic-result-actions .btn-word {
    flex: 1 1 auto;
    min-width: 0;
    width: auto;
    padding: 10px 8px;
    font-size: 13px;
  }
}
```

---

### Проблема 6: Audio download button (скрин 6)

**Root cause:** Строки 1461–1466: `.audio-block { flex-direction: column; }`

**Фикс (CSS):**
```css
@media (max-width: 600px) {
  .audio-block {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .audio-download-btn {
    padding: 6px 10px;
    font-size: 16px;
    min-width: 36px;
    white-space: nowrap;
  }
}
```

**Фикс (JS — строка ~18561):** кнопка показывает только иконку ⬇, полный текст в `title`.

**Статусы:** `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` на контейнер статуса + `title` атрибут с полным текстом.

---

### Проблема 7–9: Модальные кнопки (скрины 7–13)

**Root cause:** Строки 2117–2128 — глобальное `button { width: 100%; }` на `@media 600px`.

**Архитектурный фикс (ключевой):**
```css
/* Модальные окна исключаются из глобального растягивания */
@media (max-width: 600px) {
  .v3-modal button.btn-primary,
  .v3-modal button.btn-secondary {
    width: auto;
  }
}
```

**Библиотека — шапка: grid 3-в-строку:**
```css
@media (max-width: 600px) {
  #v3LibraryModal .v3-modal-header > div:last-child {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    width: 100%;
  }
  #v3LibraryModal .v3-modal-header > div:last-child button {
    width: auto;
    font-size: 11.5px;
    padding: 8px 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #v3LibraryWipeAllBtn { grid-column: 1 / -1; }
}
```

**Фильтры — grid 2 колонки:**
```css
@media (max-width: 600px) {
  .v3-lib-toolbar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .v3-lib-toolbar input[type="text"] { grid-column: 1 / -1; }
  .v3-lib-toolbar select { width: auto; font-size: 12px; }
}
```

**Карточки Библиотеки — grid 3-в-строку:**
```css
@media (max-width: 720px) {
  .v3-lib-card-actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    width: 100%;
  }
  .v3-lib-card-actions button { width: auto; font-size: 12px; padding: 8px 4px; }
  .v3-lib-card-actions .v3-lib-danger { grid-column: 1 / -1; }
}
```

**Дашборд — шапка:**
```css
@media (max-width: 600px) {
  #v3DashboardModal .v3-modal-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  #v3DashboardModal .v3-modal-header > div:last-child {
    display: flex;
    gap: 8px;
  }
  #v3DashboardModal .v3-modal-header > div:last-child .btn-secondary {
    flex: 1;
    width: auto;
  }
}
```

**Дашборд — фильтры:**
```css
@media (max-width: 600px) {
  .v3-dash-toolbar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .v3-dash-toolbar input[type="text"] { grid-column: 1 / -1; }
  .v3-dash-toolbar select { width: auto; font-size: 12px; }
}
```

---

### Проблема 10: Активность overflow (скрин 14)

**Root cause:** `.v3-dash-rows-header` без flex-wrap; `.v3-dash-row-item` с `justify-content:space-between` выталкивает кнопки за экран.

**Фикс:**
```css
@media (max-width: 600px) {
  .v3-dash-rows-header {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .v3-dash-rows-header select { flex: 1; min-width: 0; width: auto; }
  .v3-dash-row-item { flex-direction: column; }
  .v3-dash-row-actions { justify-content: flex-start; }
  .v3-dash-row-actions button { width: auto; }
}
```

---

### Проблема 11: Feedback dark theme (скрин 16)

**Root cause:** Заголовок (строка 9665) имеет inline `style="color:#0f172a"`. Category card descriptions — inline `style="color:#475569"`. CSS `!important` должен побеждать, но на некоторых mobile WebView не работает.

**Надёжный фикс:** Убрать inline color, перенести в CSS-классы:
```html
<!-- строка 9665: убрать color из style -->
<div id="v3FbTitle" class="v3-fb-title" style="font-size:20px; font-weight:600;">
```
```css
.v3-fb-title { color: #0f172a; }
.feedback-dark .v3-fb-title { color: #f1f5f9; }

.v3-fb-cat-desc { color: #475569; }
.feedback-dark .v3-fb-cat-desc { color: #cbd5e1; }
```

---

## Премиальные требования (P+)

### P+1. Bottom Sheet для модалов
```css
@media (max-width: 600px) {
  .v3-modal { align-items: flex-end; padding: 0; }
  .v3-modal-panel {
    width: 100%; max-width: 100%;
    max-height: 92vh; margin: 0;
    border-radius: 20px 20px 0 0;
    animation: v3SheetIn 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .v3-modal-panel::before {
    content: ''; display: block;
    width: 40px; height: 4px;
    background: var(--theme-border-hard);
    border-radius: 2px;
    margin: 8px auto 0;
  }
}
@keyframes v3SheetIn {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

### P+2. Горизонтальные фильтр-чипы (вместо select)
Заменить `<select>` для фильтров уровня и тегов на horizontally-scrollable pill strip. Требует JS-рефакторинга рендеринга фильтров.

### P+3. Compact accordion summary с live state
JS обновляет `data-status` атрибут на `<summary>` при изменении настроек. CSS `::after` рендерит его компактно.

### P+4. FAB для скачивания audio
`position: fixed; bottom: 72px; right: 16px;` — показывается только когда аудио загружено.

### P+5. Stats widget в Дашборде
"🎧 9 · 🔤 3 · ⏱ 36с" + `<details>` для полной статистики.

---

## Порядок реализации

| Приоритет | Задача | Сложность |
|-----------|--------|-----------|
| P0 | #11 feedback dark — убрать inline color | XS |
| P0 | #10 Activity overflow — flex-wrap + column | XS |
| P1 | Архитектурный фикс: `.v3-modal button { width: auto; }` | XS |
| P1 | #2/#5 Чипы — horizontal scroll, nowrap | XS |
| P1 | #7/#8/#9 Lib/Dash кнопки — grid 3-in-row | S |
| P2 | #3/#4 TTS/Trans — 2-column grid, inline-meta compact | XS |
| P2 | #5 Result actions — row layout | XS |
| P2 | #6 Audio download — icon button | S |
| P2 | #4 Dropdown label сокращение | XS |
| P3 | P+1 Bottom sheet | M |
| P3 | P+3 Accordion live state | M |
| P4 | P+2 Filter chips | L |
| P4 | P+4 FAB audio | S |
| P4 | P+5 Stats widget | S |
