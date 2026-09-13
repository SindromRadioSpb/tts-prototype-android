# Multitab runtime — automated evidence

Date: 2026-09-13. Baseline: `ff41fae5` / production 3.11.527.
Candidate: `fix/multitab-runtime-2026-09-13` / 3.11.528.
Profiles: disposable browser contexts; application server uses `smokeServerEnv` and a temporary data directory, with dotenv suppressed. No owner profile, paid provider, production mutation, or external media request.

## Results

| Command / configuration | Result |
|---|---|
| `npm test` | PASS, 1586/1586, 36.11 s on final canonical LF sources, including cleanup hardening. |
| `node --test tests/operationLease.test.js tests/accessHandleCleanup.test.js tests/vfsBootRecovery.test.js` after final cleanup hardening | PASS, 14/14. |
| `node --test tests/localDbInitConcurrency.test.js` after fixture terminology cleanup | PASS, 2/2. |
| `npm run test:api-smoke` | PASS. Disposable server/API and migration checks. |
| `node scripts/multitab/operation-lease-smoke.js` | PASS: Chromium, 4 tabs, OPFS and IndexedDB; final runtime rerun 1824 / 1593 ms. |
| Same, `MULTITAB_TABS=8` | PASS: Chromium, 8 tabs, OPFS 2170 ms / IndexedDB 1979 ms. Timings describe the small synthetic scenario, not an owner-library benchmark. |
| Same, `MULTITAB_ENGINE=webkit MULTITAB_BACKENDS=tts-opfs-idb` | PASS: Windows WebKit 26.4, 4 tabs, IndexedDB, 3587 ms. |
| Same, WebKit with forced OPFS | UNSUPPORTED in this test build: `navigator.storage.getDirectory` unavailable. The error was not counted as a pass. |
| `node scripts/multitab/studio-surfaces-smoke.js` | PASS: 2 full Studios + Room + Mediatheque; independent input/active identities, same-tab reload, peer close without reload, visible catalogue invalidation, actual local MP4 playback, frozen idle Studio, zero pageerrors. |
| `git diff --check` | PASS. |

`npm run smoke:multitab` now runs both maintained browser scripts; the retired owner/follower entry point no longer accepts an unavailable/crashed database as success.

## Independent assertions

- Every tab reads all committed synthetic rows from real SQLite.
- A second tab cannot observe a first tab's uncommitted insert. ROLLBACK leaves no row.
- SAVEPOINT / ROLLBACK TO / RELEASE preserve transaction ownership.
- Closing a tab during BEGIN/INSERT rolls back; another tab opens the store successfully.
- Idle clients have no held `linguistpro-opfs-db-owner-v1` lock.
- Close/reopen and page reload retain stored materials; `PRAGMA integrity_check` returns `ok`.
- Concurrent replacements with the same baseline timestamp produce exactly one save and one `DB_TEXT_CHANGED`.
- Injected duplicate row insertion rolls back the entire replacement to the prior sentences.
- Seeded, nonempty `review_log` and `word_status` remain exactly equal before/after all tested database operations.
- Fake OPFS acquisition with an early rejection and late successful handle closes both handles before rejecting initialization.
- Transaction idle timeout and elapsed-time check after simulated frozen timers prevent late continuation writes.
- Failed physical close does not release the lock and does not permit queued writes.

## Visual and interaction artifacts

- [Mediatheque desktop](mediatheque-desktop.png)
- [Mediatheque 380px Russian](mediatheque-380-ru.png)
- [Mediatheque 380px Hebrew / RTL](mediatheque-380-he.png)
- [Local MP4 playing in Room at 380px](video-playing-380.png)

Screenshots were inspected. Video success is established by actual media `play()` and increasing `currentTime`, not by the screenshot alone. The fixture is the existing `scripts/premium/fixtures/material-lifecycle/three-second.mp4`.

## Limits and reproducibility notes

- Full unit tests initially found changed storage fixtures and stale release-version assertions. Storage fixtures were aligned with the new runtime, release assertions with candidate 528 / locale 223, and table-cache assertion with tab storage. Behavioural assertions were retained.
- A fresh Windows checkout applied CRLF to Python helper sources while their committed downloadable package contains LF. For packaged-byte verification these three local source files were restored to their exact Git blob bytes; no downloader product change is included.
- Some pre-existing corpus tests rewrite tracked generated artifacts. Those test-only changes were restored in this initially clean isolated worktree and are excluded from the change.
- Production was queried read-only: `/api/client-config` reported `3.11.527`. No deployment took place.
- Physical iPhone/Chrome/Safari/PWA, long iOS background suspension, the supplied YouTube scenario, and VoiceOver remain separate acceptance gates. Device OS/browser version was requested and was not available when this evidence was recorded.
- Active draft/session storage is tab-scoped. The change does not claim durable recovery of every unsaved tab after permanently closing it; saved materials remain in shared SQLite.

Architecture and release procedure: [decision](../../../planning/MULTITAB_RUNTIME_ARCHITECTURE_2026_09_13.md).
