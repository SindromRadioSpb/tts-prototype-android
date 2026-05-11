# Changelog

Все заметные изменения в проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/),
версионирование — [SemVer](https://semver.org/).

## [Unreleased] — v3.2.0 in progress

**Mega-release scope** (~7–9 рабочих недель). Approved 2026-05-10. Master plan: [`docs/PREMIUM_RELEASE_PLAN_v3_2.md`](docs/PREMIUM_RELEASE_PLAN_v3_2.md).

### Shipped (so far)

- **Direction 9 Phase 9.1 — Foundation COMPLETE** *(2026-05-10..11, branch `worktree-agent-ad33453576637a27d`)*. All 5 sub-phases shipped: 9.1.A schema migrations + 9.1.B polymorphic API + 9.1.C modal UI revamp with premium hardening + 9.1.D bundle compat + 9.1.E i18n finalization. Test counts evolved 18 → 38 → 39 → **42** notes-v2 cases; events-emission stable at 23/23 throughout. See `docs/research/9_1_FOUNDATION_FINAL_REPORT.md` for the full closure record.
  - **9.1.A** *(commit `8da394e`, merged to main)*: migrations 021–025 — `notes_v2` polymorphic table, `note_versions`, `note_links`, `roots`, `sentence_notes` → notes_v2 data migration + read-only VIEW shim. 64k body_json cap + json_valid CHECK invariants. Diagnostic helpers `dbQuery` / `dbRun` exported. **18/18 tests**.
  - **9.1.B** *(commit `3a45833`, merged to main)*: notes API rewritten on top of new schema. Backwards-compat preserved (legacy `upsertNote/listNotes/deleteNote/searchNotes/resolveNote` work through VIEW + new schema). New polymorphic helpers: 16 exports including `createNote/updateNote/deleteNoteById/listNotesByTarget/listAllNotesForText/getNoteById/searchAllNotes/listNoteVersions/restoreNoteVersion/setNoteLinks/listOutgoingLinks/listBacklinks/seedRoots/searchRootsAutocomplete/getNotesSmartCollectionsSummary/getTextIdsForNotesSmartChip`. `updateNote` auto-snapshots versions with `+N/-M` diff_summary + 50-FIFO retention. `restoreNoteVersion` itself versioned. **38/38 tests**.
  - **9.1.C** *(branch-only, commits `949a932..a2d6efa`)*: Notes modal UI revamp + premium polish + hardening pass. Initial 5-stage agent implementation: target picker (7 kinds: sentence/word/root/binyan/text/note/free), note type switcher (5 kinds), M5 versioning sidebar with per-line diff view, M7 Library smart-chips (4 new: with-note/audio-noted/srs-noted/templated). Interactive premium polish: dynamic modal title per target_kind, i18n stubs, a11y focus rings, dark-mode contrast. Hardening pass closed 1 High + 5 Medium issues: H1 race condition in `_appendNoteVersion` → retry-on-conflict + new test; M1 delete confirm dialog (Direction 6 baseline); M2 i18n hooks for status strings; M3 Library smart-chip cache invalidation; M4 note-target self-loop prevention; M5 ~150 lines dead code removed (legacy `v3NotesForceClose`, `v3NotesBindHotkeysOnce`). **39/39 tests** + new H1 race case.
  - **9.1.D** *(branch-only, commit `d439683`)*: bundle compat via web-only `library/notes_advanced.json` file in ZIP. Android v2 schema_version=1 preserved; Android ignores unknown ZIP entries. Web→web roundtrip preserves full notes_v2 + 50-FIFO versions + outgoing links + user-customized roots. FK rewiring with 3 maps (textId/sentenceId/noteId) + sentence-bound free note MERGE semantics (no duplicate on collision). Manifest carries `notes_advanced_path` + `notes_advanced_present` flags. **42/42 tests** (+3 bundle roundtrip cases).
  - **9.1.E** *(branch-only)*: i18n finalization. ~90 new keys authored for `ru` / `en` / `he` locales across `notes.*` / `library.*` / `confirms.*` / `toast.*` namespaces. `noteTooLong` cap updated 16000 → 65,536 to match schema. Hebrew translations machine-grade; native review scheduled before Direction 11 ulpan deployment. Final regression: **23/0 events + 42/0 notes-v2 + main app 0 new JS errors**.
  - **9.1.F post-smoke hardening** *(branch-only, this commit)*: three bugs caught during user smoke-check addressed.
    1. **Versioning semantics rewritten** — `v_N` now snapshots the body **after** the N-th save (was "previous body before update", which produced confusing "v1 = first edit" displays where the latest edit was never visible). `createNote` and `upsertNote` (legacy free notes) now both seed `v1` so history is meaningful from the first save. `restoreNoteVersion` snapshots the restored body as a new version, not the pre-restore body. Plus the **reopen fix**: `v3NotesOpen` now back-fills `v3NotesModalNoteId` from `notes_v2` via async lookup when a sentence-bound row is reopened, so the History sidebar shows existing versions across modal close/reopen cycles (was empty until the next save). New test `createNote seeds v1 = body at creation (snapshot semantics)`; existing version tests updated to match. **43/43 notes-v2**.
    2. **Notes Preview / textarea / sentence-ctx theming** — replaced hardcoded `background: #fff` (and no explicit `color`) with `var(--theme-bg-card)` + `var(--theme-text-primary)` everywhere in the modal so dark mode is readable (was white text on white background on Preview block).
    3. **Row TTS bundle-import bug** — Row TTS now does a HEAD pre-flight against `/api/audio/<key>` before setting `<audio>.src`, falling through to fresh TTS generation on cache miss instead of bubbling up `MEDIA_ERR_SRC_NOT_SUPPORTED` ("Failed to load because no supported source was found"). Tightened server: `POST /api/audio/cache/upload` now returns `ok:false` + 500 when `writeMp3IfNotExists` fails, instead of `ok:true` masking the write error.

- **Direction 9 Phase 9.0** — Hebrew root extractor research *(two-phase, 2026-05-10)*:
  - **v1** *(commit `39230f8`)* — initial recommendation Plan B+C (manual + autocomplete + seed dictionary). Cause: AGPL libraries (HebMorph, hspell) vetoed when commercial-friendly licensing was assumed.
  - **v2 / re-research** *(commit `6f5c1ad`)* — user clarified app is non-commercial open-source → **AGPL unlocked**. New recommendation **Option A: HebMorph sidecar** for native root extraction (250K word forms, 10+ years production maturity via Elasticsearch Hebrew plugin). Plan B+C retained as graceful offline/OOV fallback — three-tier layered architecture.
  - **Net for v3.2:** Phase 9.4 ships premium-tier auto-extraction. Effort revised 2.5–3.5d → **5.5–7d** (+3d). New endpoint `POST /api/morphology/v1/analyze` (stateless, same baseline as `/api/transliterate`). Risk Low → Medium (operational sidecar uptime; mitigated by graceful client-side fallback).
  - **v3.3 follow-up:** DictaBERT in-browser via transformers.js becomes new highest-priority morphology epic — fully-offline premium upgrade.

- **Direction 11A — Analytics Foundation** *(2026-05-10, commits `7ed309f` → `3f6b959`)*. Closes the long-standing CONTRACTS_ANALYTICS drift (Tier 0 audit gap) и переводит time-spent на heartbeat-based real measurements, useful to all users (not only research mode).
  - **Phase 11.0:** 12 event types wired into `events` table — `text_open`, `text_close`, `play_audio`, `save_note`, `note_edit`, `srs_review`, `srs_session_started`, `srs_session_finished`, `search_query`, `smart_tag_override`, `translit_toggle`, plus legacy `row_tts` preserved for backwards-compat. New `v3Emit()` helper + privacy-strict invariants enforced (no raw text / note bodies / search query strings ever leak — see `docs/CONTRACTS_ANALYTICS.md § 0`).
  - **Phase 11.1:** heartbeat-based session tracking with idle gating (5 min) + visibility gating + max-session cap (60 min). Three new aggregation API exports in `local-db.js`: `getActiveMsReal()`, `getActiveMinutesByDay()`, `getSessionMetrics()`. `getAnalytics()` shape evolved with new `active_ms_real` field alongside legacy `time_ms` (backwards-compat preserved). 23/23 browser-driven Playwright tests pass.
  - **Test page:** `public/db/events-emission-test.html` — runs all 12 emit + Phase 11.1 aggregation tests in browser; can be visited any time at `/db/events-emission-test.html`.

### Planned
- **Direction 9 — Premium Notes Redesign** (~13–17 days): polymorphic note targets (sentence / word / root / binyan / text / note / free), 4 templates (word_study / grammar_rule / translation_discrepancy / pronunciation_note), audio-anchored notes, bidirectional links + backlinks, versioning + diff (50 versions retention), note → SRS micro-card, Hebrew root extractor research. Schema migrations 021–025. Bundle compat preserved (sentence-bound free notes inline; advanced notes in new `library/notes_advanced.json` web-only). See [`docs/PREMIUM_NOTES_PLAN_v3_2.md`](docs/PREMIUM_NOTES_PLAN_v3_2.md).
- **Direction 10 — Text-card System** (~7–8.5 days): three-mode lifecycle (Mode A bulk builder / Mode B peer-share via lightweight JSON exploiting content-addressed audio cache / Mode C curator request with Standard-vs-Curated split). v3.2 без новых server endpoints. See [`docs/TEXT_CARD_PLAN_v3_2.md`](docs/TEXT_CARD_PLAN_v3_2.md).
- **Direction 11A — Analytics Foundation** (~5–7 days, ships independently): closes CONTRACTS_ANALYTICS gap (12 event types), heartbeat-based time-spent v2, improves Activity Heatmap accuracy for all users.
- **Direction 11B — Research Mode** (~11–14 days): opt-in privacy-preserving research infrastructure for ulpan diploma project. Anonymous student_id + cohort code + daily aggregate uploads + new endpoint family `/api/research/v1/*` (architectural exception: aggregates only, no PII) + teacher dashboard `/teacher.html` + IRB-style consent. See [`docs/ULPAN_RESEARCH_PLAN_v3_2.md`](docs/ULPAN_RESEARCH_PLAN_v3_2.md), [`docs/RESEARCH_METRICS_SCHEMA.md`](docs/RESEARCH_METRICS_SCHEMA.md), [`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`](docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md).

### Deferred → v3.3
- Functional code-split монолита `public/index.html`.
- Sherpa adapter lazy-load.
- Knowledge-graph view для notes (Direction 9 M8).
- Server-side TTL share-cache + short public URLs (Direction 10 v3.3 epic).
- End-to-end encryption на text-card share.
- Calibrated in-app diagnostic quiz.
- Multi-cohort comparative dashboard.
- Premium table-edit mechanics (long-press DnD).

### Documentation prep (2026-05-10)
- New plan docs: `PREMIUM_RELEASE_PLAN_v3_2.md`, `PREMIUM_NOTES_PLAN_v3_2.md`, `TEXT_CARD_PLAN_v3_2.md`, `ULPAN_RESEARCH_PLAN_v3_2.md`, `RESEARCH_METRICS_SCHEMA.md`, `RESEARCH_ETHICS_CONSENT_TEMPLATE.md`.
- Tier 0 audit reconciliation: `PREMIUM_RELEASE_PLAN_v3_1.md` audit checklist updated to reflect actual shipped state (16 feedback Tier 1+2 items + WCAG + sticky bar + suspend semantics flipped to `[x]`); honest gaps preserved as `[ ]` или `[~]` with cross-references to v3.2 directions.
- Plans archived (superseded): `FINAL_RELEASE_PLAN.md` → `FINAL_RELEASE_PLAN.archived-2026-05-10.md`; `LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.md` → `LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.archived-2026-05-10.md`.
- I18N_PREMIUM_COMPLETION_PLAN re-stated as COMPLETE.
- NAV_CODEMAP `(deferred)` markers removed (sticky bar давно работает).
- ROADMAP_PREMIUM P3/P4/P5/P6 statuses updated to reflect v3.1 partial closures + v3.2 cross-references.
- Top-level README Roadmap section expanded с v3.2 scope.

## [3.1.0] — 2026-05-10

**Premium polish release.** Восемь directions из [Premium Release Plan v3.1.0](docs/PREMIUM_RELEASE_PLAN_v3_1.md) — все `[x]`. Релиз о цельном premium-качестве: типография, темы, локализация, onboarding, smart-sort, error gentleness, PWA, trust signals. Никаких новых тяжёлых фич — каждый экран ощущается так же продуманно, как feedback-модалка.

Совместимость: ZIP-bundle формат не менялся (unified Android v2 spec из v3.0.0). OPFS-схема расширена миграцией 020 (`manual_smart_tag` column) — backwards-compatible, авто-применяется при upgrade.

### Added

#### Direction 1 — Hebrew typography & RTL
- Self-hosted woff2 шрифты в `public/fonts/`: Frank Ruhl Libre / Assistant / Noto Sans Hebrew (3 веса × 3 шрифта = 9 файлов, ~167 KB total). `font-display: swap`, premium fallback chain.
- Premium Hebrew rendering: `font-feature-settings: kern + calt + liga`, `text-rendering: optimizeLegibility`, line-height-1.65 для никуда.
- Bidi-isolation в mixed-content строках (иврит + русский + английский).
- Visual regression page `/typo-test.html` со всеми сложными комбинациями огласовок.

#### Direction 2 — App-wide theming (light / dark / auto)
- CSS-variable foundation на `:root` — 12 светлых + 12 тёмных переменных, shadow-trio, density tokens.
- Три режима: `light` / `dark` / `auto` (по системной prefers-color-scheme), persistent в `localStorage.appTheme_v1`.
- **Pre-paint inline boot** в `<head>` — блокирует FOWT (Flash Of Wrong Theme) перед первым кадром.
- Toggle `🌗` в IDE header + Classic toolbar (cycle auto → light → dark).
- Density modes (compact / comfortable / spacious) через `body.theme-density-*` + `localStorage.appDensity_v1`.
- Live-react на изменения OS-темы через `matchMedia`.
- Inline-style overrides для legacy hardcoded цветов (`#fff`, `#0f172a`, `#475569`) через theme-aware selectors.

#### Direction 3 — Full i18n coverage
- **3 локали**: русский, английский, **עברית** (с автоматическим RTL `dir`).
- **Phase 1**: smart-chip strings + 8 high-traffic toasts мигрированы.
- **Phase 2**: остальные ~120 hardcoded `showToast("…")` callsites мигрированы на `t("toast.*")` с поддержкой параметров (`{error}`, `{count}`, `{done}/{total}` etc.). Составные сообщения переписаны как композиция `t() + (cond ? t() : "")`.
- **Verification**: финальный `grep` по hardcoded toast-литералам в `public/index.html` = 0.
- Динамически отрендеренный контент реагирует на `i18n:changed` event без перезагрузки.

#### Direction 4 — Onboarding & discovery
- First-time welcome modal с двумя CTA: «Попробовать на демо» / «Начать с моего текста».
- Inline 5-предложение Hebrew demo с автоматической установкой языка `he-IL`.
- Persistent decision via `localStorage.onboardingSeen_v1`.
- Кнопка «Сбросить onboarding» в About modal для повторного показа.

#### Direction 5 — SRS + Library smart-sort
- **Activity heatmap** в Dashboard (GitHub-style 7×~30 grid за 30 дней, цвет → интенсивность).
- **Library smart-filter UI**: 4 чипа `⏱ Недавние / 🔥 Сложные / ✓ Освоено / ✨ Новые с прошлого визита`. Persistent в URL hash (`#smart=struggling`), one-click ✕ clear, mobile-responsive (2-up grid на ≤600px), full theme-aware.
- **Manual smart-tag override** (миграция 020): пользователь может вручную пометить карточку как «🔥 Сложно» / «✓ Освоено» через Text Meta Edit, переопределяя SRS-derived auto classification. Inline badge на library card.
- Last-visit timestamp tracking в `localStorage.v3LibraryLastVisit_v1` для «Новые с прошлого визита».
- Foundation helpers в `local-db.js`: `getActivityHeatmap`, `getStrugglingTexts`, `getMasteredTexts`, `getTextsCreatedAfter`, `setManualSmartTag`, `getManualSmartTag`.

#### Direction 6 — Error gentleness app-wide
- Все active-path `alert(...)` / `window.confirm(...)` callsites переведены на `v3ConfirmModal` / `showToast`.
- Остались только 3 fallback-path вызова (внутри самого `v3ConfirmModal`-ultimate-fallback, в feedback Phase6 alert try-catch, в WA-confirm fallback).
- В `public/index.html` нет ни одного destructive blocking-диалога в active code path.

#### Direction 7 — Performance / PWA
- **manifest.json** с `id`, `scope`, `start_url`, standalone display, тремя app shortcuts (Library / SRS / Dashboard), theme/background colors.
- **Icon set**: vector SVG + 192/512/512-maskable/180/32 PNG. LP monogram на slate-900 с blue accent bar (premium signal). Генерируется pure-Node скриптом `scripts/generate-pwa-icons.js` без external deps (built-in `zlib` для IDAT). Re-runnable через `npm run pwa:icons`.
- **PWA meta tags**: `theme-color` (light/dark via media query), `apple-touch-icon`, `apple-mobile-web-app-capable` + `status-bar-style`, `application-name`.
- **Tiered Cache-Control** на статику: fonts/icons immutable (1y), JS modules must-revalidate (1d), shell entry points (`index.html`, `manifest.json`, `sw.js`) no-cache.
- **JSZip lazy-load** (~95 KB сэкономлено на cold start). `v3LoadJSZip()` идемпотентный helper по образцу `v3FbLoadQr()` (qrcode.js уже был lazy).
- **Service Worker** (`public/sw.js`) с тремя стратегиями:
  - **Precache** (install): app shell + i18n + DB layer + TTS layer + fonts + icons. Полный offline cold start после первой загрузки.
  - **Stale-while-revalidate** (runtime): остальная same-origin статика (lazy modules, /typo-test.html, /mockups/*).
  - **Network-first** с timeout 2.5s + cache fallback: `/api/client-config`.
  - **Network-only**: все остальные `/api/*` (translate, tts, audio, transliterate, export-docx, feedback) — кеширование исказило бы корректность (квоты, состояние, upload).
- **Premium update UX**: новый SW устанавливается в `waiting`, не выполняет `skipWaiting()` автоматически. Приложение показывает toast «Доступно обновление» с кнопками «Обновить» / «Позже» — пользователь контролирует момент применения.
- **Cache invalidation** на activate, versioned cache names (`linguistpro-precache-v3.1.0-pwa-1`), `clients.claim()`.
- **Module preload hints**: `<link rel="modulepreload">` для `sqlite-api.js` / `local-db.js` / `i18n/index.js` — параллельная загрузка с HTML parsing.
- **Removed**: vestigial `fonts.googleapis.com` `<link>` из `<head>` (Direction 1 self-hosted woff2 сделал его dead code).

#### Direction 8 — Trust signals + content polish
- Footer на всех экранах: «🔒 Данные на этом устройстве» badge → `docs/OPFS_USER_GUIDE.md`, version + commit, GitHub link, Privacy link.
- About modal с full credits, license, dependencies, onboarding-reset кнопкой.
- `docs/PRIVACY.md`.
- Version из `package.json` через `/api/client-config`.

### Changed

- README — теперь premium WOW-first-impression top-level entry point.
- `docs/PREMIUM_RELEASE_PLAN_v3_1.md` — live-status переключён на complete для всех 8 directions.
- Server static-asset middleware — теперь tiered Cache-Control вместо одного дефолта.
- `package.json` version bumped 3.0.0 → 3.1.0.

### Fixed

- **Theming regressions** (Direction 2 follow-ups): premium color-system rework для table / headers / cards / panel cards / modal headers / mobile bottom-sheet / mobile card overflow / source-link colour / filter chip / heatmap cell outline.
- **IDE checkbox dark-mode**: column-settings panel («Настройки таблицы сохранены на устройстве») использовал hardcoded `#f8fafc` background, в dark theme labels становились white-on-white. Switched to `var(--theme-bg-muted / border-soft / text-primary / accent[-hover])`.
- **Library bundle export**: notes preserved в `exportBundle` (раньше CASCADE-related path терял notes для архивированных текстов).
- **Premium pipeline**: madlad fallback restoration + SBL gemination edge case.
- **Classic mode toggle**: contract restoration (placement + visibility).
- **IDE table headers**: refresh on locale change (i18n event listener).
- **Table editing** (post-Direction-1 follow-up): consecutive moves + mobile reorder/cell-editing; `tbl-edit-mode` class restoration after `renderTable`.

### Documentation

- New: [`docs/PWA.md`](docs/PWA.md) — install, offline, update lifecycle, troubleshooting, cache versioning, icon regeneration, deferred items.
- New: top-level [`README.md`](README.md) — WOW-first-impression entry point with what / why / how / architecture / roadmap.
- Updated: [`docs/PREMIUM_RELEASE_PLAN_v3_1.md`](docs/PREMIUM_RELEASE_PLAN_v3_1.md) — live-status finalized.
- Updated: this entry.

### Deferred → v3.2

- **Functional code-split** (Dashboard / SRS / IDE → отдельные dynamic-import ES-модули). Требует extraction inline `<script>` блоков из 30k-line `public/index.html` в ES-модули с явными imports/exports вместо `window.*` глобалов. Out of scope для v3.1.0 ради стабильности; v3.1.0 шипает PWA как **продукт** (install, offline, fast), а не как архитектурный refactor монолита.
- **Sherpa adapter lazy-load** (~13.7 KB) — небольшая экономия, но в чувствительной TTS startup-sequence.
- **Premium table-edit mechanics** — отложено per `docs/` backlog.

### Tooling

- New npm script: `npm run pwa:icons` → запускает `scripts/generate-pwa-icons.js`.

## [3.0.0] — 2026-05-08

Большой релиз: полный переход на offline-first архитектуру (OPFS + wa-sqlite),
агрессивная очистка серверных stateful-эндпоинтов, премиум-UX bundle.

### Breaking changes
- `localMode` теперь дефолтный — пользовательская библиотека хранится
  в OPFS (Origin Private File System) браузера, не на сервере.
- Серверные stateful API (`/api/library/*`, `/api/srs/*`, `/api/progress/*`,
  `/api/history/*`, `/api/notes/search`, `/api/sentences/search`,
  `/api/nav/resolve`, `POST /api/library/import`) возвращают `410 Gone`.
  Helper-функции в `server.js` сохранены для отката, но обработчики
  закрыты middleware `gone410`.
- Опт-аут (`localStorage.localMode='0'`) формально работает, но не имеет
  смысла — серверные ручки 410 Gone, в server-mode библиотека неработоспособна.
- Тест `tests/storage_location_audit.test.js` удалён — он документировал
  pre-Phase-6 контракт «данные на сервере», который инвертирован релизом.

### Added — Phases 0–5 (offline-first foundation)
- **Phase 0:** wa-sqlite (sync + async Asyncify) + VFS fallback chain
  (`AccessHandlePoolVFS` → `IDBBatchAtomicVFS`) + sticky VFS preference;
  19 SQLite миграций; `/db/db-init-test.html` с 16 тестами.
- **Phase 1:** все чтения из OPFS (texts/sentences/notes/audio_assets
  с JOIN, search, nav resolve, recent activity).
- **Phase 2:** все записи (CRUD, JSON+ZIP экспорт/импорт, stateless
  `POST /api/export/docx`).
- **Phase 3:** локальная аналитика (`getAnalytics({days, includeArchived})`),
  dashboard refresh, recent-rows из events.
- **Phase 4:** SRS-режим (templates, today/summary, sessions, review,
  trainer-view); премиум Anki-экспорт с кастомной моделью
  `LinguistPro SRS Card v1` и fuzzy grading.
- **Phase 5:** ZIP-bundle с аудио в unified Android v2 формате;
  re-upload MP3 в Railway audio-cache; 2-фазный импорт (texts → audio).

### Added — Pre-Phase-6 consolidated plan (A/B/D bundle)
- **A1:** first-open migration prompt с тремя кнопками (перенести /
  начать с чистого листа / решу позже).
- **A2:** mobile dogfood прошёл на iPhone iOS 17+ и Android Chrome.
- **A3:** cross-device ZIP roundtrip — Kotlin strict-schema compliance
  для Android v2 import (language default `'he-IL'`, content_hash explicit
  null, created_at/updated_at fallback к export-ts, tags coerce).
- **A4:** concurrent-tabs guard через `BroadcastChannel` — non-blocking
  minimisable banner.
- **B1:** storage quota monitoring (`navigator.storage.estimate()` widget +
  80%/95% thresholds в save-path).
- **B2:** migration failure rollback — per-text atomicity в `importBundle`
  через `deleteText`/CASCADE + `rollbackImportedTexts` +
  `window.v3Phase6UndoLastMigration`.
- **B3:** in-memory undo для delete-text — snapshot через
  `exportBundle({textIds})` + `v3UndoToast` 7s window.
- **B4:** per-IP rate limiting на stateless endpoints (60/min transliterate,
  30/min export-docx, 2000/min audio-cache-upload — после hotfix).
- **B5:** OPFS pre-Phase-6 telemetry (`window.v3OpfsTelemetry.list()` /
  `.summary()`).
- **D1:** user-facing OPFS storage guide (`docs/OPFS_USER_GUIDE.md`).
- **D2:** header trust audit — `requireSameOriginJson` middleware на
  stateless POSTs (Content-Type + Origin/Referer guard).
- **D3:** PRAGMA integrity_check on startup — idle-time после init.
- **D4:** notes audit Test 16 — multi-line/Unicode/2KB/RTL/JSON-shaped
  notes survive roundtrip + CASCADE при deleteText.
- **D5:** kill switch — env-var `KILL_LOCAL_MODE=1` на Railway →
  `/api/client-config` отдаёт `flags.killLocalMode=true` → 15-min cached
  на клиенте → принудительный сброс LOCAL_MODE без app-deploy.

### Added — Phase 6 release
- `LOCAL_MODE` теперь true по умолчанию (`localStorage.localMode !== '0'`).
- A1 prompt fires для всех первого-разовых посетителей; copy переписан
  под пост-flip реальность.
- `gone410` middleware на стейтфул-эндпоинтах.
- `GET /api/library/export(/bundle)` сохранён для last-mile recovery.

### Added — Premium UX (cross-cutting)
- Card-level TTS profile auto-apply + cache-first playback.
- Multi-select + bulk delete/archive в Library.
- Wipe-all с type-confirm modal.
- VFS fallback chain для mobile (iPhone iOS 17+, Android Chrome).
- One-time server→OPFS migration кнопка («Импорт из облака»).
- Stateless `POST /api/transliterate` + LOCAL_MODE lazy-fill при открытии
  карточки (восстановление translit для legacy-данных).
- Reconcile audio links после `importBundle` для уже существующих текстов.
- Diagnostic helper `window.__localDB.audioLinkDiag(titleSubstring)`.

### Fixed
- Bulk-delete + cache-restore FK constraint failure: session держал
  stale `textId` после delete, FK ломался при `addSentence`. Fix:
  `v3SessionForgetTextIfStale` + defense-in-depth в
  `v3LibraryUpdateCurrentCore`.
- «Сохранить как новый» теперь всегда доступен при наличии update-target
  (раньше было только при `baseTextId`/draft-fork).
- `v3Phase6ResetDecision` чистит все ключи (`phase6FirstOpenSeen`,
  `localMode`, `phase6LastMigration`).
- Bulk ZIP-import 429-storm: rate limit на `/api/audio/cache/upload`
  поднят с 200/min → 2000/min; client `uploadOne` retry'ит 429 с
  Retry-After + exponential backoff (3 попытки).
- Translit edits SBL-профиля не сохранялись — `tableEditSaveCell`
  безусловно удалял `payload.translit`.
- Edit-marker badge + niqqud column + activity panel
  (`(без названия) (пусто) 0`) + TTS settings ignored.
- Anki «all duplicates»: AnkiConnect Plus возвращает per-note ошибки
  как Python-stringified list — теперь регэкс + JSON.parse + retry-as-fresh.
- Mobile init failure: false-negative на `createSyncAccessHandle` per
  spec в main thread → VFS fallback chain в worker.
- AnkiConnect health-check в LOCAL_MODE: direct из браузера к
  `127.0.0.1:8765`, минуя Railway.

### Documentation
- `docs/OPFS_MIGRATION_PLAN.md` — статусная таблица + dated changelog
  по фазам и багфиксам.
- `docs/OPFS_USER_GUIDE.md` — user-facing reference: где живут данные,
  таблица endpoint'ов после Phase 6, kill switch, FAQ.
- `docs/C_SERIES_PLAN.md` — рекомендованный порядок реализации
  C-серии и premium-product требования (post-Phase-6 backlog).

---

## [2.0.0] и ранее

См. историю коммитов: `git log --oneline`. Включает Phase 4-9 SRS,
Anki-экспорт, dashboard аналитика, IDE-режим, audio-prefetch,
Hebrew TTS POC, classic mode, i18n.
