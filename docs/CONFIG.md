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

### Research Mode — Admin (cohort provisioning from UI)

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEARCH_ADMIN_TOKEN` | — (disabled) | Master key that unlocks `POST /api/research/v1/admin/cohort`. When **unset**, the endpoint returns `503 ADMIN_DISABLED` and the in-UI "＋ Создать новую когорту" form on `teacher.html` reports cohort creation as disabled. This is the **secure default**: an open creation endpoint on a public privacy server would be an abuse vector (cohort squatting / disk fill). |

**How it's used end-to-end:**

1. **Operator** (you/server admin) sets `RESEARCH_ADMIN_TOKEN` once at deploy:
   - **Local dev:** add `RESEARCH_ADMIN_TOKEN=<your-secret>` to `.env` and restart the server. `.env` is loaded only on boot — changes don't hot-reload.
   - **Railway production:** add the variable in Railway → project → Variables. Railway re-deploys on save.
2. **Teacher** receives that same secret (out-of-band: messenger, printout, etc.) and pastes it once per browser session into the "Admin-секрет" field of the cohort-creation form on `/teacher.html`. The teacher also chooses a memorable cohort code and researcher token (or 🎲-generates one) — these become the teacher's dashboard login.
3. **Researcher / assistant** (if any) gets only the cohort code + researcher token from the teacher — never the master key.
4. **Student** gets only the cohort code (anonymous join). The master key MUST NOT reach students.

**Security expectations:**

- **Production:** the master key should be a long random string (≥ 32 chars). Generate via e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- **Local dev:** anything works; the value is for your machine only and `.env` is gitignored.
- **Rotation:** change the value in `.env` / Railway Variables and restart the server. Existing cohorts are unaffected — they authenticate via their own per-cohort `researcher_token`, not the master key.
- **Endpoint is also same-origin + rate-limited (10/h)** and the secret is compared in constant time. See `server.js` `POST /api/research/v1/admin/cohort`.

**CLI fallback:** `scripts/research/create_cohort.js` still works as the operator-side fallback (e.g. if the in-UI form is broken or if you prefer a scripted workflow). Both paths share the same `research/storage.createCohort()` and produce identical `cohort_meta.json`.

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
