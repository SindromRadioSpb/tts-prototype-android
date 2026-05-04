# Local Workspace Storage Iteration Plan

## Goal

Implement a premium local-first storage model based on a user-owned Local Workspace:

- SQLite remains the source of truth for library data in `DATA_DIR/app.db`.
- Audio remains file-backed in `DATA_DIR/audio-cache/`.
- Settings, quotas, and uploaded service keys remain local in `DATA_DIR/*.json`.
- Export/import remains the supported sharing and device-transfer mechanism.
- Railway/cloud storage is not required for the personal library.

Optional encryption is explicitly planned as a later layer. This iteration must not block on encryption, but it must avoid decisions that make encryption hard to add.

## Scope

In scope:

- Document the Local Workspace storage contract.
- Align docs with current `storage.js` path behavior.
- Complete ZIP bundle export/import so it carries texts, sentences, notes, audio files, and audio metadata.
- Add regression tests for bundle notes/audio behavior.
- Preserve current SQLite schema unless a migration is strictly required.

Out of scope:

- Cloud sync.
- Multi-user conflict resolution.
- OS keychain integration.
- End-to-end encrypted vault/container.
- Android-native storage implementation.

## Current Confirmed Storage Model

- `DATA_DIR` is resolved by `storage.js`; default is repository-local `data/`.
- `DB_PATH` defaults to `DATA_DIR/app.db`.
- `USAGE_FILE` defaults to `DATA_DIR/usage.json`.
- `AUDIO_CACHE_DIR` defaults to `DATA_DIR/audio-cache`.
- `GEMINI_CACHE_DIR` defaults to `DATA_DIR/gemini-cache`.
- `BACKUPS_DIR` defaults to `DATA_DIR/backups`.
- Uploaded service keys are stored as `DATA_DIR/gcp-tts-key.json` and `DATA_DIR/gcp-translate-key.json`.
- SQLite uses WAL and foreign keys.

## PATCH-01: Storage Contract

### Requirements

1. Add or update documentation so `DATA_DIR` is described as a Local Workspace root, not a Railway volume.
2. Document the workspace layout:
   - `app.db`
   - `app.db-wal`
   - `app.db-shm`
   - `audio-cache/*.mp3`
   - `audio-cache/hebrew-local/*`
   - `gemini-cache/`
   - `backups/`
   - `usage.json`
   - `premium-quota.json`
   - `gcp-tts-key.json`
   - `gcp-translate-key.json`
3. Document ownership boundaries:
   - SQLite tables hold library, notes, progress, translation cache, audio metadata, and analytics/SRS state.
   - Audio binary payloads remain files, referenced from SQLite by content-addressed `asset_key`.
   - JSON files hold local runtime settings, quota counters, and uploaded key material.
4. Document recovery rules:
   - WAL/SHM are database files and must not be manually deleted while the app is running.
   - Backups must include DB, WAL, and SHM when present.
   - ZIP bundle export is the supported user-facing transfer path.
5. Document security posture:
   - No secrets in git.
   - Uploaded keys are local-only.
   - Optional encryption is a future layer; current iteration must keep key files isolated under `DATA_DIR`.

### Acceptance

- `docs/CONFIG.md` no longer implies root-level `audio-cache` or `gemini-cache` as the primary local storage.
- `docs/DATA_PROTECTION.md` uses Local Workspace language.
- A dedicated storage contract document exists and is linked from `docs/README.md`.
- No code behavior changes are required for PATCH-01 unless comments are misleading.

## PATCH-02: Complete Bundle Export

### Requirements

1. ZIP export must include:
   - texts
   - sentences
   - sentence notes
   - text-level audio asset keys
   - sentence-level audio asset keys
   - `audio_assets` metadata for included audio
   - MP3 files from `DATA_DIR/audio-cache/*.mp3`
   - manifest with schema version, counts, partial backup status, and missing audio report path
2. ZIP import must restore:
   - texts as new local entities unless duplicate skip mode applies
   - sentences with new stable IDs
   - notes mapped to the newly created sentence IDs
   - audio metadata rows
   - sentence/text audio links
3. Notes mapping rules:
   - Preferred mapping: exported row order inside the same exported text.
   - Do not reuse imported source IDs as local IDs.
   - If a row is skipped or missing, record a controlled import error and continue.
4. Audio safety:
   - Only import `audio/<sha256>.mp3`.
   - Reject path traversal and non-hex asset names.
   - Write audio atomically through a temporary file before rename.
   - Backup must be created before mutating DB or extracting audio for large bundle imports.
5. Bundle schema:
   - Increment bundle schema version when adding notes.
   - Keep backward compatibility with schema version 1 bundles that do not contain notes.

### Acceptance

- Exported `library/library.json` includes notes.
- Importing that ZIP into a clean DB recreates note content.
- Existing bundle import without notes still works.
- Audio files and metadata remain content-addressed by `asset_key`.

## Risks

| Risk | Severity | Cause | Mitigation |
|------|----------|-------|------------|
| Notes are lost during transfer | HIGH | Current ZIP bundle does not carry `sentence_notes` | PATCH-02 exports/imports notes and adds regression tests |
| Key files remain plain JSON | HIGH | Current implementation writes uploaded service account JSON under `DATA_DIR` | Keep local-only, gitignored, documented; plan optional encryption/keychain next |
| Backup is created too late during ZIP import | MEDIUM | Current bundle import extracts audio before pre-import backup | Move backup before audio extraction and DB mutation |
| Path traversal in ZIP import | MEDIUM | ZIP entries are user-controlled input | Only accept exact `audio/<sha256>.mp3`, write under `AUDIO_CACHE_DIR` |
| Docs drift from runtime paths | MEDIUM | Older docs/comments mention Railway/root caches | PATCH-01 updates docs and misleading comments |
| Regression in legacy JSON import/export | LOW | Bundle changes may accidentally alter `/api/library/export` | Keep JSON export path unchanged unless tests require otherwise |

## DoD

- [ ] Локальная библиотека полностью работает без Railway/cloud storage.
- [ ] ZIP export/import переносит тексты, предложения, заметки, аудио и метаданные.
- [ ] `npm run db:integrity` проходит.
- [ ] `node --test` проходит для новых regression tests.
- [ ] Docs обновлены: storage contract, export/import contract, recovery.
- [ ] Нет новых секретов в git.

## Commit Message

`docs(storage): plan local workspace iteration`
