# I18N Multilingual UI Plan: RU / EN / HE

**Date:** 2026-05-02  
**Status:** Implementation in progress

---

## 1. Repo Audit Findings

### 1.1 UI Architecture

- **Single SPA file:** `public/index.html` (24,049 lines). Contains all CSS (inline `<style>`), all HTML, all JavaScript (inline `<script>` block starting line 6623, ~17,400 lines).
- **External TTS scripts:** `public/tts/core.js`, `providerPolicy.js`, `settings.js`, `runtimeStatus.js`, `sherpaOnnxAdapter.js`, `backends.js`
- **Reference copy:** `public/check_script.js` — mirrors the inline script block, NOT loaded by the app; used for IDE navigation only.
- **Two UI modes:** Classic Mode (default) and IDE Mode (3-panel layout, toggled via feature flag in localStorage).

### 1.2 Current Hardcoded HTML Strings (English)

| Area | Element | String |
|------|---------|--------|
| IDE Header | `#v3IdeLeftToggle` title | "Toggle Library Panel (Ctrl+1)" |
| IDE Header | logo span | "Hebrew Learning IDE" |
| IDE Header | `#v3IdeRightToggle` title | "Toggle Inspector Panel (Ctrl+2)" |
| IDE Header | `#v3IdeDashBtn` title | "Open Dashboard" |
| IDE Header | `#v3IdeSrsTrainerBtn` title | "Open SRS Trainer" |
| IDE Header | `#v3IdeExitBtn` title | "Switch to Classic Mode" |
| IDE Left | tabs | "Search", "Library", "History" |
| IDE Left | `#v3IdeSearchInput` placeholder | "Search texts, rows, notes..." |
| IDE Left | search scope options | "All (texts + rows + notes)", "Texts only", etc. |
| IDE Left | `#v3IdeLibraryFilter` placeholder | "Filter library..." |
| IDE Left | level options | "All levels", "Alef", "Alef+" etc. |
| IDE Left | sort options | "Recent", "A-Z", "Level" |
| IDE Left | history title | "Recent Activity" |
| IDE Left | empty state | "No recent activity yet" |
| IDE Left | empty search | "Enter a search query to find texts, rows, or notes" |
| IDE Center | `#v3IdeCenterTitle` | "No text selected" |
| IDE Center | play button title | "Play all rows" |
| IDE Center | columns button | "Columns ▦" |
| IDE Center | play all button | "▶ Play All" |
| IDE Center | open classic button | "Open Classic" |
| IDE Center | col labels | "Actions", "Hebrew", "Niqqud", "Translit", "Translation" |
| IDE Center | col reset | "Reset" |
| IDE Center | col saved note | "Table settings saved on this device." |
| IDE Center | empty center | "Select a text from the Library or search results" |
| IDE Center | cols sheet title | "Columns" |
| IDE Right | export section | "Full Text Export", "Export All to Anki", "Export to DOCX" |
| IDE Right | export note | "IDE export now uses the same live Anki flow as Classic mode." |
| Save Meta | labels | "Title*", "Level", "Tags", "Source" |
| Save Meta | buttons | "Cancel", "Save" |
| Nav sticky | buttons | "← Back to matches", "Prev", "Next", "Close" |

### 1.3 Hardcoded JS Strings (English) — in inline script

| Area | Lines (index.html) | String |
|------|----------|--------|
| SRS | ~8110 | "Sentence is not available for SRS" |
| SRS | ~8114 | "Added to SRS" |
| SRS | ~8118 | "Failed to add to SRS" |
| SRS | ~8126 | "Sentence is not available for review" |
| SRS | ~8130 | "SRS review saved" |
| SRS | ~8134 | "Failed to save SRS review" |
| Anki | ~8160 | "AnkiConnect available (version ${ver})" |
| Anki | ~8166 | "AnkiConnect is not available.\n\n${details}" |
| Anki | ~8194 | "Failed to load Anki preview.\n\n${...}" |
| Anki | ~8208 | "SRS card exported to Anki (${n} note, ${c} card)" |
| Anki | ~8212 | "Failed to export SRS card to Anki.\n\n${...}" |
| Audio batch | ~8260 | "Open a Library text first" |
| Audio batch | ~8267 | "Audio batch modal is not available" |
| Audio batch | ~8273 | "Select a row first" |
| Clipboard | ~8289 | "Copied to clipboard!" |
| Clipboard | ~8293 | "Copy failed" |
| Anki modal | ~8300 | "Open a Library text first" |
| Anki modal | ~8309 | "Anki export modal is not available" |
| DOCX | ~8315 | "No text selected" |
| DOCX | ~8320 | "Generating DOCX..." |
| DOCX | ~8325 | "DOCX download started" |
| DOCX | ~8329 | "DOCX export failed" |
| SRS trainer | ~9078 | placeholder "Type your answer" |
| SRS trainer | ~1339 (check_script.js offset) | "Hebrew -> Russian" |

### 1.4 Strings Already in Russian (good)

Most dynamic toast messages are already in Russian:
- "Нет активного текста для ссылки"
- "Ссылка на текст скопирована"
- "Не удалось скопировать ссылку"
- "Сохранено на этом устройстве"
- "Источник скопирован"
- All save/update/error messages for Library

### 1.5 localStorage Keys (must NOT change)

```
v3_ide_mode_enabled          v3_ide_state_v1
ide.table.columns.v1         ttsDashboard_session_state_v1
v3_search_session_v1         ttsDashboard_voiceConfig_v1
ttsDashboard_row_audio_cache_v1   ttsDashboard_last_selected_row_idx_v1
v3_lib_search_v1             v3_lib_filter_level_v1
v3_lib_sort_v1               v3_tag_match_mode_v1
v3_search_scope_key          v3_notes_include_key
v3_notes_only_key            v3Dash_activity_text_v1
v3Dash_autoplay_continue_v1  v3Dash_filter_q_v1
v3Dash_filter_level_v1       v3Dash_mode_v1
v3_save_meta_defaults_v1     v3_audio_prefetch_opts_v1
v3_audio_prefetch_job_v1     v3_anki_opts_v1
classic_status_strip_open    classic_table_settings_open
```

**New key to add:** `app.locale` — stores `"ru" | "en" | "he"`

### 1.6 Technical IDs NOT to Translate

```
google  gemini  madlad  local_neural_tts_piper  hebrew_local_piper
online_tts  hebrew_phonikud_piper  system_fallback
he-IL  ru-RU  en-US
he-IL-Standard-A  he-IL-Standard-B  ru-RU-Standard-A  ru-RU-Standard-B
sbl  ru-phonetic
alef  alef+  bet  gimel  dalet
```

Provider ID display: keep technical id in parentheses if shown to user.

---

## 2. Proposed i18n Architecture

### 2.1 File Structure

```
public/
  i18n/
    locales/
      ru.js     — Russian (default)
      en.js     — English
      he.js     — Hebrew (RTL)
    index.js    — Core module: t(), setLocale(), applyLocale()
```

### 2.2 Locale File Format

Plain JS files that assign to a global `window.I18N_LOCALES` object:

```js
// public/i18n/locales/ru.js
window.I18N_LOCALES = window.I18N_LOCALES || {};
window.I18N_LOCALES.ru = { ... };
```

### 2.3 Core Module API

```js
window.t(key)              // translate key, fallback to ru, then return key
window.appSetLocale(code)  // set locale, persist, apply dir/lang, rerender
window.appGetLocale()      // returns current locale string
window.applyI18n()         // re-apply all data-i18n bindings
```

Using `appSetLocale` / `appGetLocale` / `applyI18n` naming to avoid collisions with any existing functions.

### 2.4 DOM Binding

```html
<!-- text content -->
<button data-i18n="classic.buildTable">Собрать таблицу</button>

<!-- placeholder -->
<input data-i18n-placeholder="classic.inputPlaceholder" ...>

<!-- title (tooltip) -->
<button data-i18n-title="classic.pasteTitle" ...>

<!-- aria-label -->
<div data-i18n-aria-label="classic.navLabel" ...>
```

`applyI18n()` queries all `[data-i18n*]` and updates text/placeholder/title/aria-label.

### 2.5 Language Selector

Added to:
1. **Classic Mode** `classic-utility-bar` — compact `<select>` with native language names
2. **IDE Mode** header actions — same `<select>` (synced via shared `#appLangSelect` and `#appLangSelectIde`)

Behavior:
- Native names only: `Русский`, `English`, `עברית`
- No flags as primary identifier (flag emojis removed from selects)
- Persists in `app.locale` localStorage key
- Switching triggers `applyI18n()` + `document.dir` + `document.lang`
- Works on mobile: `<select>` is natively accessible on all platforms

### 2.6 Script Loading Order

```html
<!-- Added just before TTS scripts (line ~6617) -->
<script src="/i18n/locales/ru.js"></script>
<script src="/i18n/locales/en.js"></script>
<script src="/i18n/locales/he.js"></script>
<script src="/i18n/index.js"></script>
<!-- existing TTS scripts follow -->
<script src="/tts/core.js"></script>
...
<script> /* main inline script */ </script>
```

i18n loads after static HTML is parsed (body), so `applyI18n()` in `index.js` runs on the live DOM.

---

## 3. Files to Change

| File | Change type |
|------|------------|
| `public/i18n/locales/ru.js` | **NEW** — Russian locale |
| `public/i18n/locales/en.js` | **NEW** — English locale |
| `public/i18n/locales/he.js` | **NEW** — Hebrew locale |
| `public/i18n/index.js` | **NEW** — Core i18n module |
| `public/index.html` | **MODIFY** — add scripts, data-i18n attrs, lang selector, RTL CSS, migrate dynamic strings |
| `tests/i18n.smoke.js` | **NEW** — smoke tests |
| `docs/I18N_MULTILINGUAL_UI_PLAN.md` | **NEW** — this document |
| `docs/I18N_MULTILINGUAL_UI_DOD.md` | **NEW** — DoD evidence |

---

## 4. Risks and Blind Spots

| Risk | Mitigation |
|------|-----------|
| `showToast` signature varies (1 arg vs type param in check_script.js) | Both versions just take `message`; safe to replace string with `t(key)` |
| Dynamic HTML (innerHTML) requires `t()` at generation time | Wrap template literals with `t()` calls |
| `applyI18n()` runs before dynamic content is rendered | For dynamic sections, call `applyI18n()` after render OR use `t()` at generation time |
| RTL can break flex layouts | Use `flex-wrap` and test each panel in RTL |
| Hebrew text in transliteration column must stay LTR | Use `direction: ltr` on `[data-col="translit"]` cells |
| Level filter values are technical IDs (alef, bet, etc.) — need NOT change | Keep option `value` attrs unchanged; only change option `textContent` |
| provider option values (google-free, gcp, etc.) — must not change | Keep `value` attrs; only change display text |
| `v3ModeToggle` text is updated dynamically in JS | Add i18n-aware JS update in `v3IdeModeToggle()` |
| SRS answer placeholder set dynamically via innerHTML | Target the input and use `t()` in the template |
| Orientation FAB text updated dynamically | Update in JS with `t()` |
| Confirm dialogs use `window.confirm()` | Replace strings with `t()` calls |

---

## 5. Patch Plan

### PATCH-01 — Plan document ✅
This document.

### PATCH-02 — i18n core
1. Create `public/i18n/locales/ru.js` — full Russian locale
2. Create `public/i18n/locales/en.js` — full English locale
3. Create `public/i18n/locales/he.js` — full Hebrew locale
4. Create `public/i18n/index.js` — t(), appSetLocale(), applyI18n()

### PATCH-03 — Language selector
1. Add CSS for `.lang-select-wrap` in `<style>`
2. Add `<select id="appLangSelect">` to `classic-utility-bar`
3. Add `<select id="appLangSelectIde">` to IDE header actions
4. Sync both selects via `appSetLocale()`
5. Load saved locale from localStorage and set selected option on init

### PATCH-04 — Static HTML data-i18n
Apply `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria-label` to:
- Classic Mode: eyebrow, title, subtitle, buttons, labels, placeholders
- IDE Mode: header buttons, tabs, empty states, column labels
- Library Modal: title, buttons, placeholders, select options
- Save Meta Modal: labels, placeholders, buttons
- Anki Modal: title, label
- Dashboard/SRS Trainer: title, close button
- Navigation sticky bar: all buttons
- Table settings section

### PATCH-05 — Dynamic JS strings
In the inline script block:
- `showToast(...)` → `showToast(t("toast.xxx"))`
- `window.confirm(...)` → `window.confirm(t("confirm.xxx"))`
- Dynamic HTML templates for table header: use `t("table.colHebrew")` etc.
- SRS answer placeholder: use `t("srs.placeholderAnswer")`
- SRS template label: use `t("srs.templateLabel")`
- Orientation FAB text updates: use `t()`
- Mode toggle button text: use `t()`
- DOCX progress messages

### PATCH-06 — RTL hardening
Add CSS rules:
```css
/* RTL: mirror flex directions for UI panels */
[dir="rtl"] .classic-utility-bar { flex-direction: row-reverse; }
[dir="rtl"] .classic-shell-head { flex-direction: row-reverse; }
[dir="rtl"] .classic-composer-tools { flex-direction: row-reverse; }
[dir="rtl"] .classic-result-actions { flex-direction: row-reverse; }
[dir="rtl"] .classic-primary-actions { flex-direction: row-reverse; }
[dir="rtl"] .v3-ide-header-actions { flex-direction: row-reverse; }
[dir="rtl"] .v3-modal-header { flex-direction: row-reverse; }
[dir="rtl"] .v3-modal-actions { flex-direction: row-reverse; }
[dir="rtl"] .v3-nav-left { flex-direction: row-reverse; }
[dir="rtl"] .v3-nav-right { flex-direction: row-reverse; }

/* Text alignment: use logical values */
[dir="rtl"] .classic-screen-title { text-align: end; }
[dir="rtl"] .classic-screen-subtitle { text-align: end; }

/* Hebrew content columns always RTL */
td.rtl-he, td.rtl-he-niqqud { direction: rtl; text-align: right; }

/* Transliteration always LTR */
td[data-col="translit"] { direction: ltr; text-align: left; }

/* Translation always LTR in RTL layout */
td[data-col="ru"] { direction: ltr; text-align: left; }
```

### PATCH-07 — Tests + DoD
1. Create `tests/i18n.smoke.js` with Node.js test runner
2. Create `docs/I18N_MULTILINGUAL_UI_DOD.md`

---

## 6. Test Plan

### 6.1 Automated Smoke Tests (`tests/i18n.smoke.js`)

1. Locale registry contains `ru`, `en`, `he`
2. All keys in `ru` exist in `en` and `he`
3. `t("classic.buildTable")` returns correct string per locale
4. `t("nonexistent.key")` returns the key string and logs warning (no throw)
5. Unknown locale falls back to `ru`
6. `app.locale` localStorage key is set on `appSetLocale()`
7. Invalid locale value falls back to `ru`

### 6.2 Manual Smoke Checklist

#### RU (default)
- [ ] App opens in Russian
- [ ] Classic Mode buttons in Russian
- [ ] Library modal in Russian
- [ ] Save dialog in Russian
- [ ] No unexpected English words in main UI
- [ ] TTS settings labels in Russian
- [ ] Table column headers in Russian

#### EN
- [ ] Switch to English
- [ ] Classic Mode buttons in English
- [ ] Library modal in English
- [ ] Save dialog: "Save", "Cancel", "Title*"
- [ ] SRS trainer: "Type your answer" placeholder
- [ ] Reload → English persists

#### HE
- [ ] Switch to עברית
- [ ] `dir="rtl"` on `<html>`
- [ ] `lang="he"` on `<html>`
- [ ] UI panels readable in RTL
- [ ] Hebrew/Niqqud columns remain RTL
- [ ] Transliteration column remains LTR
- [ ] Language selector readable
- [ ] Reload → Hebrew persists

#### Regression
- [ ] Generate table from Hebrew text → works
- [ ] Niqqud present in niqqud column
- [ ] Transliteration present in translit column
- [ ] Russian translation in translation column
- [ ] Edit mode → change cell → save works
- [ ] Library open → search → filter → sort → open text
- [ ] TTS play works
- [ ] Save to Library works
- [ ] No horizontal page overflow on mobile

---

## 7. Definition of Done

See `docs/I18N_MULTILINGUAL_UI_DOD.md` (created after implementation).

---

## 8. Known Limitations (anticipated)

- IDE Mode is an experimental feature behind a flag; not all IDE strings will be translated in this iteration (focus: Classic Mode)
- Level filter option values (`alef`, `bet`, etc.) are technical IDs used in filter logic; the display text is what we translate
- Audio Prefetch Modal strings: partially covered; complex dynamic content deferred
- Server-side error messages (server.js) not translated in this iteration — they're API errors, not direct UI strings
