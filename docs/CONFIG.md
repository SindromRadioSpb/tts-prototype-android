# Configuration Reference

This document describes all environment variables and configuration options for the TTS Prototype application.

## Quick Start

1. Copy `.env.example` to `.env`
2. Fill in required values:
   - `GEMINI_API_KEY` for AI translation
   - `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_CLOUD_TTS_KEY` for TTS
3. Run `node server.js` or `npm start`

`server.js` now auto-loads `.env` from the repo root via `dotenv`, so separate `--env-file` flags are not required.

## Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | — | Environment mode (`development`, `production`) |

### Local Workspace / Database (SQLite)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `data` | Local Workspace root for library DB, audio cache, backups, runtime JSON, and uploaded keys |
| `DB_PATH` | `DATA_DIR/app.db` | Path to SQLite database file |
| `MIGRATIONS_DIR` | `migrations` | Path to SQL migration files |
| `BACKUPS_DIR` | `DATA_DIR/backups` | Path to database backups |
| `NO_BACKUP` | `0` | Set to `1` to skip auto-backup before migrations |

### Google Cloud TTS

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Path to service account JSON file |
| `GOOGLE_CLOUD_TTS_KEY` | — | Inline service account JSON (alternative to file path) |
| `TTS_SAFE_TARGET_BYTES` | `4800` | Safety limit for TTS input size |
| `ALLOW_REMOTE_AUDIO_PREFETCH` | `0` | Allow audio prefetch from non-localhost (`1` = allow) |

**Note:** Either `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_CLOUD_TTS_KEY` is required for TTS functionality.

### Google Gemini AI

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | API key for Google Gemini |
| `GOOGLE_API_KEY` | — | Alternative key name (fallback) |
| `GEMINI_DAILY_LIMIT` | `50` | Maximum AI translation requests per day |
| `GEMINI_RESET_HOUR_UTC` | `21` | Hour (UTC) when daily counter resets |

### AnkiConnect Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANKI_CONNECT_HOST` | `127.0.0.1` | AnkiConnect server host |
| `ANKI_CONNECT_PORT` | `8765` | AnkiConnect server port |
| `ANKI_CONNECT_VERSION` | `6` | AnkiConnect API version |
| `ANKI_CONNECT_API_KEY` | — | API key (if AnkiConnect requires auth) |
| `ANKI_CONNECT_ORIGIN` | — | Origin header for CORS |
| `ANKI_CONNECT_TIMEOUT_MS` | `60000` | Request timeout (ms) |
| `ANKI_CONNECT_RETRIES` | `3` | Number of retry attempts |
| `ANKI_CONNECT_RETRY_DELAY_MS` | `250` | Delay between retries (ms) |
| `ANKI_ADDNOTES_CHUNK` | `25` | Batch size for addNotes (5-100) |
| `ANKI_MULTI_CHUNK` | `50` | Batch size for multi commands (10-200) |

## File Structure

```
tts-prototype-android/
├── .env                 # Your local config (gitignored)
├── .env.example         # Template with defaults
├── data/                # Local Workspace root (gitignored)
│   ├── app.db           # SQLite database
│   ├── app.db-wal       # SQLite WAL file
│   ├── app.db-shm       # SQLite shared-memory file
│   ├── audio-cache/     # TTS audio cache
│   ├── gemini-cache/    # AI response cache
│   ├── backups/         # Auto-backups
│   ├── usage.json       # Local usage counters
│   ├── premium-quota.json
│   ├── gcp-tts-key.json
│   └── gcp-translate-key.json
└── migrations/          # SQL migration files
```

## Security Notes

1. **Never commit `.env`** — it contains secrets
2. **Service account JSON** should be stored securely, not in the repo
3. **API keys** should be rotated periodically
4. **Backups** may contain sensitive user data — handle appropriately
5. **Local Workspace** files are user data and should be transferred through ZIP bundle export/import, not committed

## Troubleshooting

### TTS not working
- Check `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_CLOUD_TTS_KEY`
- Verify the service account has Text-to-Speech API enabled
- If using `GOOGLE_APPLICATION_CREDENTIALS`, use an absolute Windows path, for example:
  `GOOGLE_APPLICATION_CREDENTIALS=E:\keys\gcp-tts-service-account.json`

### Translation not working
- Check `GEMINI_API_KEY` is set
- Check daily limit hasn't been exceeded (`/api/gemini/status`)

### AnkiConnect errors
- Ensure Anki is running with AnkiConnect add-on
- Check `ANKI_CONNECT_HOST` and `ANKI_CONNECT_PORT`
- Try increasing `ANKI_CONNECT_TIMEOUT_MS` for slow connections
