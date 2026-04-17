# tts-prototype-android — Claude Workspace

> Project: **tts-prototype-android**
> Path: `E:\projects\tts-prototype-android`
> Purpose: Hebrew learning app — TTS, Gemini AI translation, IDE-grade navigation, SRS
> Stack: Node.js 18+ / Express 4 / SQLite 3 (WAL+FTS5) / Vanilla JS SPA
> APIs: Google Cloud TTS, Google Gemini, AnkiConnect (optional)

---
## Principles

---

Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution.
Adapt to the real architecture you see.

## 0) Operating Mode

**SAFE AUTOPILOT**: prefer read-only first (Read/Grep/Glob). Write/Edit only when strictly necessary and scoped.

---

## 1) Project-Specific Rules

### IDE-grade code intelligence (mandatory)
Before any PLAN or changes:
1. Repo-wide search (Read/Grep/Glob) to find real change points
2. Build short "Code Map" (entry points → state → handlers → UI hooks)
3. Record IDE evidence in patch report

**Guardrail:** Never `Read(public/index.html)` fully (603 KB). Use only targeted Grep/Search.

### Database discipline
- Schema changes → only through `migrations/*.sql` (currently 001–010)
- Run `node db/migrate-cli.js` on clean DB to verify
- Run `node tools/step8_2-db-check.js` for integrity
- Never edit existing migrations retroactively

### Navigation Governance (trigger zones)
Full rules in root `CLAUDE.md` section 6. Applies when touching:
- deeplinks (`/#/t/`), `resolveTarget`, SearchSession, `data-hit-type`
- `/api/notes/search`, `/api/sentences/search`
- Any ID semantics (textId, sentenceId, noteId)

Required reads: `docs/CONTRACTS_NAVIGATION.md`, `docs/GLOSSARY_DOMAIN.md`, `docs/DB_SCHEMA.md`

### Never commit
- `node_modules/`, `data/app.db`, `audio-cache/`, `gemini-cache/`, large `*.mp3`

---

## 2) Agent Routing

| Task | Agent |
|------|-------|
| Feature implementation | `implementer` → minimal patch workflow |
| DB schema / migrations | `db-migrator` → migrations safety |
| Export formats (DOCX/Anki) | `exporter` → fixtures + deterministic output |
| Code review | `qa-reviewer` → security + regression check |
| Security scan | global `security-auditor` |
| ai-stack integration | global `ml-pipeline-engineer` |

---

## 3) Skill Triggers

| Trigger zone | Skill |
|-------------|-------|
| Navigation / deeplinks / search | `navigation-deeplink-contract` |
| Hebrew search / normalization | `search-hebrew-normalization` |
| SQLite migrations | `sqlite-migration-safety` |
| SRS engine (cards, reviews) | `srs-engine-contract` |
| Analytics events | `analytics-events-contract` |
| DOCX/BiDi export | `docx-anti-bidi-export` |
| Anki export | `anki-export-contract` |
| UI changes | `ui-regression-checklist` |
| Any implementation | `patch-workflow` (IDE evidence mandatory) |
| Code review | `review` |
| Security concerns | `security` |

---

## 4) Key Commands

```bash
npm start              # запуск сервера (node server.js)
npm run db:migrate     # прогнать миграции
npm run db:integrity   # проверка целостности БД
npm run db:backup      # бэкап базы

# Smoke tests
powershell scripts/smoke-check.ps1    # Windows
bash scripts/smoke-check.sh           # WSL/Linux
```

---

## 5) Risk Register

### R1: Large SPA file (HIGH)
`public/index.html` = 603 KB. Never read fully. Only Grep around matches.

### R2: Navigation contract breakage (HIGH)
Strict governance in root CLAUDE.md §6. Any change to deeplinks/search/IDs requires:
- Schema/fixture/contract updates
- NAV-01..NAV-07 smoke checks

### R3: Migration compatibility (MEDIUM)
10 sequential migrations. New migrations must be forward-compatible.
Never alter existing migration files.

### R4: Google API credentials (MEDIUM)
TTS and Gemini keys in `.env`. Never read/log/commit.
block_secrets.py hook enforces this.

---

## 6) Future: ai-stack Integration

Local ML inference stack (`E:\projects\ai-stack`) can replace cloud APIs:

| Current (Cloud) | Future (ai-stack) | Benefit |
|-----------------|-------------------|---------|
| Google Cloud TTS | XTTS v2 / mms-tts-heb | No API cost, offline, voice cloning |
| Google Gemini | Phi-4-mini-instruct | No API cost, offline, no rate limits |
| — | whisper STT | Audio-to-text for learning exercises |
| — | NLLB translation | Offline ru↔he↔en translation |
| — | Embeddings + RAG | Semantic search over learning content |

**Integration approach:** ai-stack as FastAPI microservice, tts-prototype-android calls via HTTP.
**Details:** See `E:\projects\ai-stack\docs\pipelines.md` and `architecture.md`.
