# Changelog

Все заметные изменения в проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/),
версионирование — [SemVer](https://semver.org/).

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
