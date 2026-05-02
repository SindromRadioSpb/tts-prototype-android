# Multilingual UI — Definition of Done

**Date:** 2026-05-02  
**Scope:** Russian (default) · English · Hebrew (RTL)  
**Status:** ✅ All criteria met (including Premium Completion PATCH-08–16)

---

## Patches completed

| Patch | Description | Status |
|-------|-------------|--------|
| PATCH-01 | Repo audit + i18n plan document | ✅ |
| PATCH-02 | i18n core module (locale files + `t()` / `appSetLocale()` / `applyI18n()`) | ✅ |
| PATCH-03 | Language selector UI in Classic Mode + IDE Mode | ✅ |
| PATCH-04 | Static HTML strings → `data-i18n` attributes | ✅ |
| PATCH-05 | Dynamic JS strings → `t()` calls | ✅ |
| PATCH-06 | RTL hardening for Hebrew | ✅ |
| PATCH-07 | Smoke tests + DoD document | ✅ |
| PATCH-08 | Premium audit plan: `docs/I18N_PREMIUM_COMPLETION_PLAN.md` | ✅ |
| PATCH-10 | Stats panel: static HTML + dynamic `updateTtsCostInfo` / `loadStats` / `formatDuration` | ✅ |
| PATCH-11 | Result chips, build/speak buttons, primary hints, download audio, `v3UiUpdateActiveHeader` | ✅ |
| PATCH-11 | Table column headers in `renderTable()` `colMeta` | ✅ |
| PATCH-12 | Library v3 card meta labels + action buttons | ✅ |
| PATCH-14 | Dashboard dynamic: badges, chips, pin/unpin, action buttons, activity header, empty states | ✅ |
| PATCH-15 | System diagnostics render: all status values, card titles, field labels | ✅ |
| PATCH-16 | Extended smoke tests (Suite 7: 105 new tests) | ✅ |

---

## Smoke test evidence (PATCH-16 — 154 tests)

```
node tests/i18n.smoke.js

[Suite 1] Locale file symmetry
  ✓ ru.js loads and has keys
  ✓ en.js loads and has keys
  ✓ he.js loads and has keys
  ✓ en.js has all keys from ru.js
  ✓ he.js has all keys from ru.js

[Suite 2] t() key resolution
  ✓ default locale is ru
  ✓ t() resolves a simple key in ru
  ✓ t() resolves a nested key in ru
  ✓ t() falls back to ru for key missing in current locale
  ✓ t() returns key string for unknown key

[Suite 3] Interpolation
  ✓ t() interpolates {param} in en
  ✓ t() interpolates multiple params
  ✓ t() leaves unfilled {placeholders} as-is

[Suite 4] appSetLocale()
  ✓ appSetLocale('en') switches locale
  ✓ appSetLocale('he') switches locale
  ✓ appSetLocale() persists to localStorage
  ✓ appSetLocale() rejects unknown locale, falls back to ru

[Suite 5] RTL / dir attribute
  ✓ appSetLocale('he') sets dir=rtl on documentElement
  ✓ appSetLocale('ru') sets dir=ltr on documentElement
  ✓ appSetLocale('en') sets dir=ltr on documentElement
  ✓ appSetLocale('he') sets lang=he on documentElement

[Suite 6] Critical toast key presence
  ✓ 29 critical keys resolve in all 3 locales

[Suite 7] Premium completion key coverage
  ✓ 100 premium keys resolve in all 3 locales
  ✓ 4 template interpolation tests (statTtsQuotaInfo, statResetIn, time.hourMin, dashboard.shownOf)

Results: 154 passed, 0 failed
```

---

## DoD checklist

### Core i18n module
- [x] `window.t(key, params?)` — resolves key in current locale, falls back to `ru`, returns key string if missing
- [x] `window.appSetLocale(code)` — validates against `['ru','en','he']`, persists to `localStorage('app.locale')`
- [x] `window.appGetLocale()` — returns current locale code
- [x] `window.applyI18n()` — applies `data-i18n*` attributes to live DOM
- [x] Safety shim at top of inline `<script>`: `if (typeof t !== 'function') window.t = k => k`
- [x] `CustomEvent('i18n:changed', { detail: { locale } })` dispatched on every locale change

### Locale files
- [x] `public/i18n/locales/ru.js` — Russian translations (default, authoritative)
- [x] `public/i18n/locales/en.js` — English translations, key-symmetric with ru.js
- [x] `public/i18n/locales/he.js` — Hebrew translations, key-symmetric with ru.js
- [x] All locale files loaded in `<head>` before TTS scripts and before inline `<script>` block
- [x] 5 SRS trainer toast keys added in PATCH-05: `srsSessionFailed`, `srsModeChangeFailed`, `srsAudioUnavailable`, `srsTypeAnswerFirst`, `srsAnswerCheckFailed`

### Language selector
- [x] `#appLangSelect` in Classic Mode utility bar (hidden on <480px mobile, `.classic-lang-wrap`)
- [x] `#appLangSelectIde` in IDE header (`v3-ide-header-actions`)
- [x] Both selectors sync bidirectionally via `appSetLocale()`
- [x] Native language names: **Русский / English / עברית**
- [x] `onchange="appSetLocale(this.value)"` wired on both

### Static HTML migration (`data-i18n*`)
- [x] Classic Mode: eyebrow, title, subtitle, all nav buttons, composer panel, TTS settings panel, translation settings panel, result panel, table workspace, table settings, edit toolbar
- [x] IDE Mode: header buttons (aria-label + title), left panel tabs, search/library/history controls, center panel (title tools, column controls, empty state), modal close buttons
- [x] Library modal, Save-meta modal, Anki modal, Dashboard modal, Nav sticky bar
- [x] Language selector `<option>` labels use `data-i18n`

### Dynamic JS migration (`t()`)
- [x] SRS row actions: `srsUnavailable`, `srsAdded`, `srsFailed`, `srsReviewUnavailable`, `srsReviewSaved`, `srsReviewFailed`
- [x] AnkiConnect: `ankiAvailable`, `ankiUnavailable` (3 call-sites), `ankiPreviewFailed`, `ankiExported` (2 call-sites), `ankiExportFailed` (2 call-sites)
- [x] IDE export functions: `openLibraryFirst` (2), `audioBatchUnavailable`, `selectRowFirst`, `copied`, `copyFailed`, `ankiModalUnavailable`, `noTextSelected`, `generatingDocx`, `docxDownloaded`, `docxFailed`
- [x] Confirm dialog: `confirm.clearText`
- [x] SRS trainer: `srsSessionFailed`, `srsModeChangeFailed`, `srsAudioUnavailable`, `srsTypeAnswerFirst`, `srsAnswerCheckFailed`, `srsReviewFailed`

### Premium completion — dynamic render functions (PATCH-10–15)
- [x] **Stats panel** (PATCH-10): `updateTtsCostInfo()` — cost info + quota template; `loadStats()` Gemini reset (3 variants); `formatDuration()` using `time.hourMin/minSec/sec`; static HTML summary + labels via `data-i18n`
- [x] **Result chips + buttons** (PATCH-11): `classicSyncMainPanels()` — source chip (3), build/speak buttons (6), primary hints (4), trust chips (10), result summary (5); download audio button (2 call-sites)
- [x] **Text info header** (PATCH-11): `v3UiUpdateActiveHeader()` — draft/saved status, tableBuilt/stale subtitle, provider/niqqud labels, provenance origin, source label
- [x] **Table headers** (PATCH-11): `renderTable()` `colMeta` — Hebrew, Niqqud, Translit (3 variants), Translation; `table.colTranslitLat/Ru/Sbl` keys
- [x] **Library cards** (PATCH-12): card render template — level/progress/source/lastOpened/created labels; open/resume/edit/archive/delete action buttons
- [x] **Dashboard** (PATCH-14): `v3DashBadges()` — seen/last badges; `v3DashboardRenderActiveChips()` — level/archive chips; `v3DashRenderItem()` — source, pin/unpin, action buttons; `v3DashRenderActivitySection()` — shownOf template, noActivity empty state; `v3DashboardSelectText()` — loading state; fixed `const t` → `const foundText` variable collision
- [x] **Diagnostics** (PATCH-15): `v3DiagRenderData()` — sidecar (online/unavailable), models (ready/unloadedIdle), GCP (configured/notConfigured, quotaChars/used/quota/nearLimit/periodFrom), library counts (textsActive/sentences), card titles (cacheCard/libCard/versionsCard), updated timestamp; new `diag.*` namespace

### Re-render on locale change (PATCH-14 / `i18n:changed`)
- [x] `document.addEventListener("i18n:changed", ...)` registered at end of inline script
- [x] Re-renders: `classicSyncMainPanels()`, `v3UiUpdateActiveHeader()`, `updateTtsCostInfo()`, `renderTable(currentTableData)` (guarded), `v3LibraryApplyFilter()`, `v3DashboardRender()`

### RTL hardening
- [x] `document.documentElement.dir = 'rtl'` set on locale `'he'`, `'ltr'` for `'ru'`/`'en'`
- [x] `[dir="rtl"]` CSS: `flex-direction: row-reverse` on all major flex containers (utility-bar, utility-nav, shell-head, composer-tools, result-actions, primary-actions, inline-meta, card-head, result-head, table-settings-row, ide-header-actions, modal-header, modal-actions, nav-left/right, export-actions, lib-toolbar, filter-row, ide-tabs, center-title-row, center-actions, center-title-tools, col-settings, chips-row)
- [x] `[dir="rtl"]` CSS: `text-align: end` on titles, subtitles, labels, hotkeys
- [x] `[dir="rtl"] .lang-select`: chevron flipped to `left 8px`, padding reversed
- [x] `[dir="rtl"] .v3-ide-header-logo`: `flex-direction: row-reverse`
- [x] Hebrew/Niqqud data columns always `direction: rtl !important` regardless of page dir
- [x] Transliteration/translation columns always `direction: ltr !important`
- [x] `[dir="rtl"] #inputText`: `direction: rtl; text-align: right`

### Non-goals (intentionally not translated)
- Provider IDs: `google`, `azure`, `elevenLabs`, `openai`, `browserTts`
- Voice IDs: `he-IL-Standard-A`, `he-IL-Wavenet-B`, etc.
- localStorage keys (frozen, must not change): `app.locale`, `tts_*`, `v3_library_*`, etc.
- API endpoint paths
- Console debug/error messages
- Technical identifiers in diagnostics: "Sidecar (AI local)", "GCP Translate", "Doc cache", "Segment cache", "Overrides", "Segmenter", "Nakdan (niqqud)", "MADLAD-400", "Idle timeout", "AnkiConnect"
- `geminiModelInfo` / `geminiTodayInfo` content (server-side strings)
- Data-value comparisons in JS (e.g. `sourceMeta.indexOf("кэш")` checks provenance data, not UI text)

---

## Files changed

```
public/index.html                     — HTML data-i18n migration, JS t() migration, RTL CSS, script tags, safety shim
public/index.html                     — HTML data-i18n migration, JS t() migration, RTL CSS, script tags, safety shim, i18n:changed listener
public/i18n/index.js                  — NEW: i18n core module
public/i18n/locales/ru.js             — NEW + EXTENDED: Russian locale (default) — +66 keys in PATCH-08–16
public/i18n/locales/en.js             — NEW + EXTENDED: English locale — +66 keys, symmetric with ru.js
public/i18n/locales/he.js             — NEW + EXTENDED: Hebrew locale (RTL) — +66 keys, symmetric with ru.js
tests/i18n.smoke.js                   — NEW + EXTENDED: 154-test smoke suite (PATCH-16 added Suite 7)
docs/I18N_MULTILINGUAL_UI_PLAN.md     — NEW: audit + architecture plan (PATCH-01)
docs/I18N_PREMIUM_COMPLETION_PLAN.md  — NEW: premium completion execution plan (PATCH-08)
docs/I18N_MULTILINGUAL_UI_DOD.md      — THIS FILE
```
