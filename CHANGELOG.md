# Changelog

Все заметные изменения в проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/),
версионирование — [SemVer](https://semver.org/).

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
