# Final Release Plan — ARCHIVED 2026-05-10

> ⚠ **THIS DOCUMENT IS ARCHIVED.** Superseded by:
> - **v3.0.0 release** (2026-05-08) — offline-first architecture flip; все server stateful endpoints turned `410 Gone`. Большинство PATCH-R0..R6 items в этом doc ссылаются на server-side endpoints, которых больше не существует.
> - **v3.1.0 release** (2026-05-10) — premium polish (8 directions complete).
> - **v3.2.0 plan** (in progress) — см. `docs/PREMIUM_RELEASE_PLAN_v3_2.md`.
>
> **Residual outstanding items carried forward в v3.2 backlog:**
> - **PATCH-R2 Playwright viewport regression suite** — карьеризован в Tier 3 (Architecture) backlog. Будет нужен **до** Direction 7's deferred functional code-split (когда оно ship'ится в v3.2+ или later).
> - **PATCH-R3 SRS Today integration + time-spent v2** — закрывается Direction 11A v3.2 (`docs/ULPAN_RESEARCH_PLAN_v3_2.md` Phase 11.0–11.1).
> - **PATCH-R5 security audit** (parameterized SQL, npm audit, error-leak) — separate quality task, low priority post-Phase-6 (минимизированная server surface).
>
> **Definition of Done items NOT carried forward:** many DoD items в этом doc предполагают server-side library + auth platform (`src/platform`), который в v3.0.0 был decommissioned.
>
> Документ оставлен для исторической справки и evidence в audit trail. **Не используется как active plan.**

**Project:** tts-prototype-android  
**Actual target:** web application for desktop and mobile browsers  
**Date:** 2026-05-05  
**Status:** ARCHIVED 2026-05-10 — superseded by v3.0.0 + v3.1.0 + v3.2 plan.

## Repo Audit Report

### Entry Points
- `server.js:159` — Express app and static `public/` hosting.
- `server.js:165` — `/api/client-config`, browser runtime flags.
- `server.js:3836` — `/api/library/texts`, library listing.
- `server.js:4613` — `/api/notes/search`, notes search contract.
- `server.js:4793` — `/api/sentences/search`, sentence search contract.
- `server.js:4892` — `/api/nav/resolve`, deep link target resolver.
- `server.js:4964` — `/api/srs/*`, SRS templates/cards/review/trainer/session endpoints.
- `server.js:5701` — `/api/srs/export/*`, Anki export status/preview/push.
- `server.js:6661` — `/api/history/event`, analytics event ingestion.
- `server.js:6783` — `/api/history/analytics`, dashboard analytics.
- `server.js:7203` / `server.js:7329` — ZIP bundle export/import.
- `public/index.html` + `public/check_script.js` — main browser UI, Classic/IDE/Dashboard/Trainer flows.
- `src/platform/index.js:29` — optional auth/groups platform layer, currently not mounted from `server.js`.

### Data Layer
- SQLite is the active local workspace DB. Contract: `docs/DB_SCHEMA.md`.
- Tables already documented: `texts`, `sentences`, `sentence_notes`, `audio_assets`, `history_events`, `events`, `srs_cards`, `srs_review_events`, `srs_session_runs`, `srs_attempts`, `srs_card_exports`.
- Migrations are in `migrations/001_v3_bootstrap.sql` through `migrations/019_strip_pipe_from_niqqud.sql`.
- User transfer path is ZIP bundle export/import, not copying live DB files: `docs/STORAGE_CONTRACT.md`.

### Existing Patterns to Reuse
- API contracts live in `docs/API_CONTRACTS*.md` and `docs/CONTRACTS_*.md`.
- Smoke policy lives in `docs/SMOKE-CHECK.md`.
- Frontend selector map lives in `docs/UI_MAP.md`.
- Tests use Node built-in test runner: `npm test`.
- API smoke is script-based: `npm run test:api-smoke`.

### Open Risks

| Risk | Severity | Cause | Mitigation |
| --- | --- | --- | --- |
| Current patch is incomplete | HIGH | `server.js` is modified and bundle test is untracked | Close PATCH-R0 first; run targeted and full tests |
| Large monolithic frontend | HIGH | `public/index.html` and `public/check_script.js` contain most UI logic | Freeze behavior; extract only after release or behind tests |
| Mobile/browser QA gap | HIGH | Docs define checks, but no automated viewport regression suite is present | Add Playwright desktop/iPhone/Android smoke before RC |
| Auth platform drift | MED | `src/platform` has PostgreSQL/auth code but is not mounted from `server.js` | Decide: exclude from release or wire behind explicit flag |
| Analytics not final | MED | Roadmap says time-spent v2/cohort aggregates are not closed | Implement minimal release analytics or document as post-release |
| SRS gaps remain | MED | suspend/delete semantics and dashboard Today integration are incomplete | Close required SRS release scope before RC |
| TTS assets/licensing | MED | Hebrew local/web WASM policy is restricted by config and docs | Finalize model staging, checksums, license mode, fallback UX |
| Tracked artifacts | LOW | Root command/temp files were tracked | Removed from index and ignored going forward |

## Implementation Plan

### Scope

**In scope for final release:**
- Stable local web app startup on Windows.
- Desktop, iPhone Safari, Android Chrome browser UX.
- Library CRUD/import/export with notes/audio preservation.
- Navigation/search/deep links.
- TTS playback/cache/provider diagnostics.
- SRS trainer baseline + Today/dashboard entry point.
- Anki export dry-run and live path diagnostics.
- Data backup/restore/bundle transfer.
- Security pass for secrets, path traversal, import zip, and API input validation.
- Release documentation and reproducible smoke checks.

**Out of scope unless explicitly re-approved:**
- Native Android/iOS packaging.
- Full PostgreSQL multi-user platform, unless `src/platform` is intentionally mounted and tested.
- Full FSRS/SM-2 replacement.
- New large UI redesign before release.
- New ML model training.

### Architecture Decision

Ship the current product as a local-first web application backed by SQLite and static browser UI. Do not split the monolithic frontend before release; instead, freeze current behavior with smoke/viewport tests and reserve modularization for post-release.

## Patch Series

### PATCH-R0: Repo Hygiene + Current Bundle Patch Closure

**Files already touched:** `.gitignore`, `server.js`  
**Files to add/track:** `tests/libraryBundleExportImport.test.js`  
**Purpose:** close the in-progress bundle schema v2 work before any new feature work.

Steps:
1. Keep removed root artifacts out of Git: `$db`, `curl`, `git`, `node`, `npm`, `export.json`, `body.json`, `payload_meta_test.json`, `how -1 --name-only`, `tts-translator-dashboard@2.0.0`, `~WRL0005.tmp`.
2. Track `tests/libraryBundleExportImport.test.js`.
3. Verify bundle schema v2 exports notes and imports notes after new sentence IDs are created.
4. Update `docs/STORAGE_CONTRACT.md` if schema v2 fields are not already documented.
5. Decide what to do with untracked `scripts/i18n_patch_v2.py`: either delete locally or move to `Архив/`.

Tests:
- `node --test tests/libraryBundleExportImport.test.js`
- `npm test`
- `npm run db:migrate`

Commit:
- `fix(bundle): preserve notes in library bundle transfer`

### PATCH-R1: Release Gate Baseline

Purpose: make release verification reproducible.

Steps:
1. Make `scripts/smoke-check.ps1` and `scripts/smoke-check.sh` the single release gate.
2. Ensure `npm ci`, `npm test`, `npm run db:migrate`, `node db/integrity-cli.js`, and `npm run test:api-smoke` pass on a clean checkout.
3. Add a release checklist command section to `docs/SMOKE-CHECK.md`.
4. Update GitHub Actions branches from old `week_*` branches to `main`.

Tests:
- `powershell -ExecutionPolicy Bypass -File scripts/smoke-check.ps1`
- `bash scripts/smoke-check.sh`

Commit:
- `chore(release): define final smoke gate`

### PATCH-R2: Browser UX RC

Purpose: lock desktop/mobile browser behavior.

Steps:
1. Add Playwright smoke for desktop, iPhone Safari-size viewport, Android Chrome-size viewport.
2. Cover app boot, Classic/IDE toggle, Library open, search, row select, notes modal, SRS trainer open, Dashboard open.
3. Validate no text overlap at target widths: 390px, 430px, 768px, 1024px, 1440px.
4. Preserve existing UI; only fix blocking responsive defects.

Tests:
- `node scripts/browser-release-smoke.js`
- Manual Safari iPhone + Android Chrome pass.

Commit:
- `test(ui): add desktop and mobile browser smoke`

### PATCH-R3: Core Learning Flows

Purpose: close release-critical learning workflows.

Steps:
1. Navigation: close remaining row/sentence terminology gaps or mark them non-blocking in `docs/ROADMAP_PREMIUM.md`.
2. Search: verify snippet/highlight and Hebrew normalization acceptance tests.
3. Notes: verify create/edit/delete/jump and bundle roundtrip.
4. SRS: implement or explicitly defer suspend/delete semantics; wire Today summary into Dashboard.
5. Analytics: implement minimum `session_start/session_heartbeat/session_end` only if release KPIs require time-spent v2; otherwise document as post-release.

Tests:
- NAV-01..NAV-12 from `docs/SMOKE-CHECK.md`.
- SRCH-01..SRCH-10 from `docs/CONTRACTS_SEARCH.md`.
- SRS-01..SRS-10 from `docs/CONTRACTS_SRS.md`.
- `npm run test:api-smoke`

Commit:
- `feat(release): complete learning flow release scope`

### PATCH-R4: TTS, Audio, Anki Hardening

Purpose: make audio/export reliable enough for end users.

Steps:
1. Run `npm run tts:models:check`.
2. Verify online TTS key upload/delete/status.
3. Verify `/api/audio/:assetKey` playback and prefetch completion behavior.
4. Verify AnkiConnect unavailable diagnostics and live export idempotency.
5. Confirm no non-commercial Hebrew local model is enabled in commercial release mode.

Tests:
- `npm run test:tts-browser-smoke`
- Manual AnkiConnect unavailable/live scenarios from `docs/SMOKE-CHECK.md`.

Commit:
- `fix(audio): harden tts and anki release flows`

### PATCH-R5: Security + Data Protection

Purpose: close release blockers before RC.

Steps:
1. Audit `.env`, uploaded keys, backups, bundle import, path handling, zip extraction, and Anki requests.
2. Confirm every SQL path uses parameters.
3. Confirm bundle import allows only flat `audio/<64hex>.mp3` entries.
4. Confirm error responses do not expose secrets.
5. Update `docs/DATA_PROTECTION.md` if release behavior changed.

Tests:
- `npm audit --omit=dev`
- Targeted security tests for bundle path traversal and bad API input.

Commit:
- `security(release): harden import and secret handling`

### PATCH-R6: Release Candidate

Purpose: freeze and tag.

Steps:
1. Run full smoke gate on clean checkout.
2. Run desktop/mobile browser smoke.
3. Export/import a real bundle between two clean data dirs.
4. Verify docs: `CONFIG.md`, `DATA_PROTECTION.md`, `STORAGE_CONTRACT.md`, `SMOKE-CHECK.md`.
5. Create release notes with known limitations.

Tests:
- `npm test`
- `npm run db:migrate`
- `npm run test:api-smoke`
- `powershell -ExecutionPolicy Bypass -File scripts/smoke-check.ps1`

Commit:
- `chore(release): prepare final release candidate`

## Definition of Done

- [ ] Clean checkout installs with `npm ci`.
- [ ] `npm test` passes.
- [ ] `npm run db:migrate` passes on empty DB.
- [ ] `npm run test:api-smoke` passes.
- [ ] Browser smoke passes on desktop, iPhone-size, Android-size viewports.
- [ ] Manual Safari iPhone and Android Chrome pass completed.
- [ ] Bundle export/import preserves texts, sentences, notes, audio metadata, and audio files.
- [ ] No tracked runtime DB/cache/audio/temp artifacts.
- [ ] No secrets in tracked files.
- [ ] Release docs match shipped behavior.
- [ ] Known limitations are documented.

## Release Commit Message

`chore(release): prepare final web release`
