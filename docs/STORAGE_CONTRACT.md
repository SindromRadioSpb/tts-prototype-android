# Storage Contract

## Purpose

The application is local-first. A user's library is stored in a Local Workspace on the device, not in Railway or another cloud database.

Cloud providers may still be used for optional services such as TTS or translation, but the user's library, notes, audio cache, metadata, and local settings remain under `DATA_DIR`.

## Workspace Root

`DATA_DIR` is the Local Workspace root.

Resolution order:

1. `DATA_DIR` environment variable, resolved to an absolute path.
2. Repository-local `data/` when `DATA_DIR` is not set.

`DB_PATH` may override the SQLite path directly, but the premium default is `DATA_DIR/app.db`.

## Workspace Layout

```text
DATA_DIR/
  app.db
  app.db-wal
  app.db-shm
  audio-cache/
    <asset_key>.mp3
    hebrew-local/
      <cache_key>.wav
      <cache_key>.json
  gemini-cache/
  backups/
  usage.json
  premium-quota.json
  gcp-tts-key.json
  gcp-translate-key.json
```

## Ownership Boundaries

SQLite owns structured application data:

- `texts` and `sentences` for the text library.
- `sentence_notes` for user notes.
- `audio_assets`, `sentence_audio`, and `text_audio` for audio metadata and links.
- `translation_doc_cache` and `translation_segment_cache` for translation caches.
- progress, SRS, analytics, and history tables.

The filesystem owns binary and local runtime artifacts:

- MP3/WAV audio payloads under `audio-cache/`.
- Runtime JSON counters and uploaded service-account keys under `DATA_DIR`.
- SQLite backups under `backups/`.

Audio files are content-addressed by `asset_key`. Database rows reference relative paths such as `audio-cache/<asset_key>.mp3`; request handlers must resolve those paths from `DATA_DIR` and enforce containment inside `AUDIO_CACHE_DIR`.

## Export And Import

ZIP bundle export/import is the supported user-facing transfer path between devices.

The bundle must include:

- texts
- sentences
- sentence notes
- audio metadata
- audio files when present
- manifest and missing-audio report

Bundle import must create local IDs for imported texts and sentences, then map imported notes and audio links to the new local IDs.

## Recovery

SQLite runs in WAL mode. The following files are part of the same logical database and must be treated together:

- `app.db`
- `app.db-wal`
- `app.db-shm`

Do not delete WAL/SHM files while the app is running. Backups and restores must include WAL/SHM files when present. User-facing transfer should use ZIP bundle export rather than manually copying live database files.

## Security

- No secrets are committed to git.
- `.env` and `DATA_DIR` runtime artifacts are gitignored.
- Uploaded TTS/translation service-account files stay local under `DATA_DIR`.
- Current key storage is local plain JSON with restricted file permissions where the OS supports them.
- Optional encryption/keychain storage is a future layer and must preserve the same logical workspace boundaries.
