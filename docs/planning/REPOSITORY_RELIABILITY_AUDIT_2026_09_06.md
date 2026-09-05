# Repository reliability audit — 2026-09-06

Status: implementation, clean-checkout, CI and production gates passed for release 3.11.482.
Implementation commit: `89a3f912d4c178f1ffdebc33981e803f491c2df9`.
Source: `1500f19ee8985546cdcd96fdad39737822ba26e3`, `main`.
Target release: `3.11.482`.

## Scope and baseline

Owner authorized repository diagnosis, reversible corrections, tests and production delivery.
Existing dirty planning files, `.remember`, research screenshots, untracked corpus/agent artifacts
and local data belong to the owner and are excluded from this change's staging allowlist.
No corpus publication, provider generation, owner-profile review, account change or migration is included.

Instructions read: `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md`, project memory export,
local chronology and relevant ingest/SRS/sync planning predecessors. Applied lenses: R11 source
integrity and independent regression evidence; R12 event/projection separation; R13 recovery;
R14 tenant boundaries and SSRF; R15 local-data isolation; R16 bounded resources.

The product is a Node/Express PWA. Studio and Reading Room share OPFS/wa-sqlite, morphology,
FSRS and media components. Server SQLite separately stores authenticated accounts, cloud event
streams and publications. `review_log` is canonical memory evidence; scheduler state is derived.
External integrations include Google TTS/Translate/Gemini, local companion services, Telegram,
agent-access OAuth/MCP and optional Anki/Obsidian export. Tests here do not call paid providers.

Baseline root contracts: `node --test --test-concurrency=4 tests/*.test.js tests/i18n.smoke.js`:
1079 tests, 1073 pass, 6 fail. All six failures were existing stale UI assertions.
The first memory-canon browser smoke also failed its obsolete migration-50 pin (actual: 51).
FSRS baseline: 140/140. Production before changes: 3.11.481, healthy app/DB/migrations,
disk 90% used, approximately 3.7 GiB available; deployed image matched source HEAD.

## Confirmed findings and fixes

All findings below have high confidence from executable reproduction or the cited source/history.
Severity describes the affected scenario, not a claim of observed owner-data loss or exploitation.

| ID | Priority | Scenario, cause and evidence | Correction and regression |
|---|---|---|---|
| A1 | P1 | `db/learnerLogRepo.js:readLog`: shared SQLite connection returned an uncommitted review subsequently rolled back. A client could retain false memory evidence or advance its cursor. Actual SQL transaction test reproduced the tentative row. | Down-sync reads wait for the existing transaction lane. Rollback test now returns no rows. |
| A2 | P2 | `ingestBatch`: concurrent retries both passed the pre-lock receipt check; the second failed `ingest_batches` UNIQUE instead of replaying the accepted receipt. | Recheck receipt inside the write transaction; one event, one receipt, one projection trigger. Deterministic concurrent test. |
| A3 | P1 | `db/backup.js:createBackup`: second snapshot in the same second used the same path and overwrote the first. Fixed-clock test proved loss of the first recovery point. | UUID suffix and exclusive main-file creation preserve both snapshots. |
| A4 | P1 | `restoreBackup`: source equal to target deleted the WAL before copying the same DB and returned success. Fixture WAL was removed. | Reject same real path or inode before mutation, including path aliases. |
| A5 | P2 | `db/sqlite.js:closeDb`: readiness remained true after closing; explicit reopen returned early and `getDb` failed. | Clear lifecycle state after successful close; propagate close failures. Persist/close/reopen test. |
| A6 | P1 | `ingest/ssrfGuard.js`: validated DNS addresses were discarded, then fetch performed its own lookup; expanded IPv6 private addresses also bypassed string-prefix checks. | Canonical IPv6 and per-hop Undici dispatcher pinned to validated addresses, preserving Host/TLS hostname. Actual HTTP transport test with controlled DNS and a loopback fixture; no hostile production probing. |
| A7 | P2 | URL timeout began after DNS; redirects/error responses could retain unread bodies with their timers cleared. | One overall deadline includes DNS; every hop aborts and destroys its dispatcher. Hanging DNS, redirects, errors, gzip, streaming-size and decoding tests. |
| A8 | P1 | DOCX had only a compressed upload limit. `word/document.xml` expansion was unbounded by application policy; malformed compressed data leaked a zlib error contract. Installed adm-zip also matched GHSA-xcpc-8h2w-3j85. | 12 MiB XML ceiling before inflate, zero-size guard, typed errors; adm-zip 0.6.0. Small deterministic compressed fixtures reproduce budget rejection/corruption. |
| A9 | P2 | API smoke pointed at normal `data/app.db`, inherited operator settings and trusted any server on port 3107; observed it reading an unrelated 3.11.472 process. Related ingest/memory smokes had the same unsafe environment pattern. | Shared disposable environment, disabled dotenv in test children, loopback ephemeral ports and child-owned IPC readiness. Applied to API, ingest, memory-canon and learner-ingest gates. |
| A10 | P2 | CI watched historical branches only; `main` had no checks. Root tests had obsolete DOM assertions; memory-canon pinned 50 migrations and printed a hard-coded check count. | Enable main/PR checks, complete test discovery inside tests/, current semantic contracts and actual assertion count. Migration 51 placement explicitly checked. |
| A11 | P3 | README claimed SM-2, no cloud sync, stateless-only server, old Railway entry and 21 migrations; CLAUDE referenced missing root Python/Make files. | Align entry documentation with current code and label the old roadmap as historical. |
| A12 | P2 | Seven corpus tests required an ignored local ZIP; two more relied on Windows checkout/generated newlines. Clean worktree reproduced 9 failures hidden by the normal checkout. | Commit the unchanged, already publicly authorized source fixture for offline tests; pin historical CRLF provenance files and corrected physics input LF; make historical generator serialization explicit. No ledger/hash/content changes. Clean checkout: 1334/1334. |
| A13 | P2 | Runtime Node 20 reached EOL; installed dependency tree contained 20 production advisory matches. | Node 22 Docker/CI, sqlite3 6.0.1, UUID 11 (also Google v4 consumers), maintained esbuild and transitive patches. Windows native rebuild, clean npm ci, Alpine build/start and all tests pass; full audit has zero advisories. |

UI test-history evidence: `2e10208a` replaced the old settings toggle with native disclosure;
`bad0c41c` removed the row sheet in favor of word morphology;
`26ddba76` moved transcript correction to Import Center. Current reader locale handling uses an
animation-frame callback wrapper. Tests now assert the replacement behavior; none are disabled.

## Verification and release gates

- `npm test`: 1334/1334, zero skipped, both original and clean worktree with final dependencies.
- `npm run test:api-smoke`: all 12 grouped contracts pass on its own 3.11.482 process.
- Import smoke: 22/22; FSRS: 140/140; memory-canon: 89/89; learner-ingest: 24/24.
- New failures were reproduced before fixes: snapshot collision, self-restore, private IPv6,
  response cleanup, DNS timeout, DOCX budget/corruption, duplicate concurrent ingest and dirty down-sync read.
- `npm ci` in a detached clean worktree passed; API, import, learner-ingest and memory-canon passed there.
- One clean memory-canon run hung without diagnostic output; a rerun passed 89/89.
  Added a 90-second browser deadline and failure diagnostics so CI cannot hang indefinitely;
  the instrumented clean rerun also passed 89/89. This single-run stall is not claimed diagnosed.
- `docker build --progress=plain -t linguistpro-audit:3.11.482 .` passed from the clean source set.
  Disposable container: `/healthz` app/DB/migrations healthy; `/api/client-config` 3.11.482.
- `ai-local/.venv/Scripts/python.exe -m pytest` on the four Hebrew TTS cache/license/POC/sidecar
  test modules: 13 passed. System Python lacked FastAPI; rerunning in the existing project venv resolved it.
- `room-audio-indicator-smoke.js --locale=he`: 19/19, isolated browser at 380px, synthetic local
  rows and mocked audio; screenshot inspected. This is not real-device or provider acceptance.
- `git diff --check` and allowlist-only index review passed (45 implementation files).
- [Linux CI run 33999751248](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/33999751248):
  all steps passed, including 1334 contracts, API, import, learner sync, FSRS and browser memory canon.

## Production evidence

The normal `main` webhook deployed implementation commit `89a3f912`. SSH verified a single
application container on that image, Node 22.23.2, sqlite3 6.0.1, Undici 6.28.1 and UUID 11.1.1.
Repeated `/healthz` reads report app, DB and migrations ready; `/api/client-config` reports 3.11.482.
Live `/sw.js`, `/index.html` and `/library.html` each returned 200 and matched local SHA-256 bytes.
Two bounded import requests for loopback IPv4 and expanded IPv6 returned HTTP 400 / `PRIVATE_ADDR`.
No provider, account, publication or owner-profile changes were made by these checks.

Fresh production browser gate: 19/19, Hebrew RTL 380px, reload persistence, no page errors.
Audio is mocked and local rows are synthetic; this does not claim live BYOK audio acceptance.
The first browser attempt during release transition timed out waiting for `ensureLocalDB`.
An isolated Chrome DevTools check found the function and current version; the complete retry passed.
The timeout cause was not conclusively established. Expected unauthenticated 401 and retired
server-library 410 responses were distinguished from script/resource failures.

Deployment temporarily raised disk utilization from 90% to 99%. `docker system df` identified
unused build cache. A 24-hour-filtered prune removed 0B; the subsequent dangling/unused build-cache
prune reclaimed 3.744 GB. No image, production container or volume was pruned. After ordinary
Coolify handover completed, disk use was 89%, about 4.0 GiB free. The health endpoint still flags
disk pressure at that level; long-term capacity remains an operational risk, not a resolved issue.
The release evidence follow-up is documentation/screenshot-only; any subsequent deployment must
converge on its exact commit before final owner handoff.

## Dependencies, limits and source references

Baseline `npm audit --omit=dev`: 20 affected packages (1 critical, 8 high, 9 moderate, 2 low).
Updated adm-zip and compatible transitive patches; added explicit Undici 6.28.1 for pinned DNS.
Pinned qs 6.16.0 via override because parent packages pinned the vulnerable older minor.
Final `npm audit --json`: zero vulnerabilities, including development dependencies.
An advisory match alone is not proof of exploitability in the app. Native SQLite and UUID upgrades
were verified with actual Windows/Alpine loading, database tests and API gates, not only lockfile edits.

Reference: [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html),
[Undici transport](https://undici.nodejs.org/),
[adm-zip advisory](https://github.com/advisories/GHSA-xcpc-8h2w-3j85).
Runtime support: [Node.js EOL schedule](https://nodejs.org/en/about/eol).

This is a broad risk-based audit, not proof that every feature is defect-free. Physical iPhone/AT
acceptance, live paid-provider linguistic quality, owner OAuth/MCP acceptance, production backup
restore drills and uninspected background integrations are not claimed. Only rebuildable unused
build cache was cleared during deployment; current/rollback images, volumes and owner data were preserved.
