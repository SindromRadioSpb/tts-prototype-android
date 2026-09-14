# iPhone local DB: diagnostic handoff 3.11.541

## 3.11.546: compatible shell before boot on browsers without iframe credentialless

Owner acceptance of 3.11.545 (normal Chrome): Studio library, Room, Continue
and Mediatheque open; no DB lock is held. Remaining symptom: opening a YouTube
material alternated pages before the player appeared (three owner videos,
report with eight documents in 60 s). Mechanism (code + frames + journal):
index.html/library.html are COEP-isolated; StudioYtPlayer requires iframe
credentialless there; WebKit lacks it, so the Room/Studio booted, rendered the
reader, then compatibleShell() navigated to /study-library.html or
/study-studio.html (same files without COEP) and booted again.

Owner decision: load the compatible shell first. A first inline `<head>` script
(`compatibleShellRedirect`) in both shells replaces `/`, `/index.html`,
`/library.html` with the study-* shell, keeping search and hash, only when the
page is crossOriginIsolated and iframe credentialless is missing. Chromium and
the compatible shells are unchanged; compatibleShell() remains a fallback. No DB
module, header, backend or data change. Onboarding also shows on
/study-studio.html. No code uses SharedArrayBuffer/Atomics; the fonts README
claim is stale.

Evidence: unit 5/5 (RED before). `compatible-shell-redirect-smoke.js`: RED on
3.11.545 WebKit (isolated Room starts its DB worker); GREEN WebKit (redirect
before any worker, one DB worker, search/hash kept, no extra history entry,
Studio too); Chromium no redirect. Studio lifecycle and navigation-progress
smokes pass in WebKit through compatible shells.

Deferred by owner: Incognito Room crash during canon import (no journal yet).

## 3.11.545: root cause proven on the device; cached documents stop their DB worker

Owner reports from 3.11.544 with identity recording (2026-09-14):

- Normal Chrome, AccessHandlePool: `linguistpro-opfs-db-owner-v1` held by C1,
  the Studio worker of document `a8b0967f` (generation 1). That document
  started, completed about 50 RPCs, and 1.6 s after start recorded
  `pagehide persisted=true` with no later `pageshow`. At that moment 9 RPCs
  were queued: last phase `waiting-lock` for request 52, then pagehide writes
  58/59 and `close` 60 behind them. The waiter C2 is the next Studio document
  `aa780091`, started 261 ms later. `holderIsSelf=false`, different documents,
  one worker per document.
- Incognito, IDB: `/app.db-outer` held by Room document `87510106`. Its Studio
  link ran `close`, but already-queued request 230 reopened IndexedDB and began
  a transaction; then `pagehide persisted=true`. The next Studio waited 214 s
  in `idb-opening`.
- Documents whose pagehide had `persisted=false` did not hold the lock later.

Mechanism: WebKit keeps a back/forward-cached document's dedicated worker
suspended without releasing its Web Locks or storage connections; a `close`
queued at pagehide cannot run before the freeze. Every later document in the
tab waits until the cached page is restored or evicted. Chromium does not cache
such pages and Playwright used no cache, so earlier gates passed. This replaces
the 3.11.535 design "pagehide queues close; the worker stays alive".

Fix:

- A capture `pagehide(persisted)` listener terminates the page's DB worker. The
  browser releases its locks and handles; SQLite/IndexedDB roll back unfinished
  work. In-flight SQL fails with `DB_PAGE_SUSPENDED` and is never replayed; an
  interrupted boot init is replayed on a fresh worker.
- Calls issued while cached wait in the page and run after `pageshow(persisted)`,
  which reopens the store. `ensureLocalDB` waits for that reopen.
- If a transaction was open (or a BEGIN queued), its later statements fail with
  `DB_TRANSACTION_ABORTED` until its ROLLBACK/COMMIT, an explicit close or
  recovery; the reopen does not clear this mark.
- Normal unload keeps the cooperative close.
- Studio `v3NavAwayWithDbClose` and the Room Studio link await a debounced
  working-row write before closing.

Evidence:

- RED: `scripts/multitab/page-cache-lock-release-smoke.js` on 3.11.544 code
  (Chromium AccessHandlePool) — next document
  `DB_LOCK_WAIT_TIMEOUT [held=1; holder=unknown; holderId=uninstrumented]`,
  the device signature; `PAGE_CACHE_EXPECT_RED=1` WebKit IDB — blocked.
  Unit RED: 6 new tests.
- GREEN: that smoke on Chromium AccessHandlePool and WebKit IDB — next document
  reads at once, cached transaction rolled back, late continuation rejected,
  pagehide write deferred and applied after pageshow, integrity ok, review_log
  unchanged. `studio-nav-progress-flush-smoke.js` both engines — row selected
  inside the 350 ms debounce is saved before Studio → Room. Node 199/199;
  reader-resume 53/53; studio-media-progress 4/4; Studio lifecycle both
  engines; operation lease; lock identity; IDB failed-sync.
- Limits: the fixture stops the worker with a busy loop and dispatches real
  pagehide/pageshow(persisted) events; it does not reproduce WebKit caching
  itself. A debounced row change made within 350 ms (Studio) / 800 ms (Room)
  before a plain link navigation is not guaranteed. Suspension of a second
  LinguistPro tab in the background is not addressed. Physical iPhone
  acceptance is pending.

## 3.11.544: lock-holder identity collection (owner-approved)

Owner answers (2026-09-14): exactly one LinguistPro tab in normal Chrome and
one in Incognito; the tab visited before the brief recovery was not
LinguistPro. Normal and Incognito are separate storage/lock partitions, so a
background LinguistPro tab is excluded as the normal-profile holder. Remaining
candidates: the same document (second worker or lost release), a
back/forward-cached document of the same tab, a terminated worker whose lock
was not released, or an uninstrumented client. None is established.

Implementation (opt-in recording only):

- Each DB worker holds one uncontended identity Web Lock (`ifAvailable`, never
  awaited by DB work, released when the 15-minute window ends). Its name has
  only allowlisted fields: surface enum, release, random document id, random
  worker id, worker generation within that document, creation second.
- `navigator.locks.query()` reports that name with the same client as the
  worker's DB locks. The support page labels clients C1, C2, ... and never
  outputs raw clientIds. The browser lock manager answers even when the holder
  is frozen.
- Report v2 `locks.relations`: per held DB lock, its holder label, whether it
  is identified, and each waiter (identified, same client, same document).
  The status text adds the holder's surface, release, document, generation,
  age and its last recorded page lifecycle event.
- A worker failing with a DB lock error adds
  `holderId=self|<surface>/<release>/same-document|other-document/gen/age|uninstrumented`.
- The journal stores page lifecycle events (page start, worker created/error,
  pagehide/pageshow with `persisted`, hidden/visible) separately from SQL
  phases, with document id and generation, so phase bursts cannot evict them.

Interpretation for the next device report: `self` means a same-worker
deadlock; same document with a different generation means two workers in one
page; another document whose last event is `pagehide persisted=true` without a
later `pageshow` means a cached document holds it; another document whose last
event is `pagehide persisted=false` means a torn-down page's worker still
holds it; `uninstrumented` means a worker created before recording was enabled
or not running this release.

Caveats: only workers created after enabling recording carry an identity.
Holding an extra lock while recording may change browser caching decisions;
the recorded `persisted` values show whether caching still occurred.

Evidence: unit tests RED on 3.11.543 (5 failing: missing identity
functions, lifecycle eviction), GREEN 45/45 with the DB startup/lease tests.
`scripts/multitab/lock-holder-identity-smoke.js`: Chromium AccessHandlePool and
WebKit IDB — no identity without opt-in, holder identified as the earlier
page's worker, waiter as another document, no raw clientIds, SQL or titles in
the report, AccessHandlePool timeout message carries `holderId=other/...
/other-document`, integrity ok, review_log unchanged. Studio lifecycle gates
pass on both engines. Physical iPhone acceptance remains open.

## Follow-up 3.11.543: confirmed IDB lock retention; OPFS holder still unidentified

Baseline `b4806833` (3.11.542). Physical iPhone acceptance remains FAIL/open.

Owner observation after 542, normal profile: Studio stalled on a fresh load.
After switching to another tab and returning, the review counter showed the
correct value for about a second; the page then reloaded by itself and the
counters and Studio materials list stalled again (Library opens, list does
not). One query therefore succeeded after the hidden period, and a fresh
document waits again. Studio has no unconditional reload on return (only
explicit Retry, a requested SW update, follower takeover), so a browser
content-process restart is possible but NOT established.

### Confirmed defect: one aborted IndexedDB transaction pins `/app.db-outer`

- `IDBContext` left its completion chain permanently rejected after a single
  aborted readwrite transaction. `IDBBatchAtomicVFS.xUnlock` awaited that sync
  before releasing SQLite's Web Lock, so every unlock failed: `/app.db-outer`
  and `/app.db-reserved` stayed held by a live worker, later writes in that
  worker returned `disk I/O error`, and close threw a TypeError (an explicit
  abort carries a null error) without closing the IDB connection.
- Real-browser repro `scripts/multitab/idb-failed-sync-unlock-smoke.js` with
  `IDB_FAULT_EXPECT_RED=1` (baseline files): WebKit and Chromium keep both
  locks and a second document gets `database is locked`. This is the lock
  state of the Incognito report (held + pending `/app.db-outer`, waiter in
  migrations).
- Fix: latch the first transaction failure and report it once; typed
  AbortError for an abort without error; close always closes the IDB
  connection; xUnlock always releases the Web Lock after SQLite leaves the
  lock level and returns SQLITE_IOERR when sync failed.
- Evidence: IDBContext unit 4/4. Smoke, commit-record fault, WebKit and
  Chromium: failure reported, row absent, locks released, second document
  reads, later write succeeds, close releases, integrity ok, review_log
  unchanged. Cleanup-transaction fault: same lock/poison/integrity results.
  Existing gates pass: IDB legacy/native coordination (WebKit, Chromium),
  failed-open queue (WebKit IDB), Studio lifecycle (WebKit IDB, Chromium
  AccessHandlePool), operation lease (Chromium 4 tabs both backends, WebKit
  IDB 8 tabs).
- NOT established: that the owner's Incognito session had an aborted IDB
  transaction; its iOS trigger (quota, suspension interruption, I/O error)
  was not observed. AccessHandlePool (normal profile, owner library) does not
  use this path: this does not fix the normal-profile failure.
- Separate observation, unchanged: if only the abandoned-version cleanup
  transaction aborts, SQLite reports `disk I/O error` although the row commits
  (both engines, before and after the fix). A false failure, not data loss.

### Automation limit

Scratch engine experiment without app code: Playwright WebKit (Windows) and
Chromium never placed a page with a dedicated worker in back/forward cache
(`pageshow.persisted=false`, with and without `no-store`). CDP
`Page.setWebLifecycleState=frozen` did not suspend the dedicated worker (a
500 ms lock operation finished while frozen). Neither engine models a
suspended lock holder, so earlier green gates could not detect that class.

### Code facts relevant to the OPFS owner lock

- Studio writes to the local DB from `visibilitychange:hidden` and `pagehide`:
  `session_end` and `text_close` via `recordEvent`, progress via `setProgress`.
  Up to three separate lease cycles start while the page is being hidden, each
  reacquiring every AccessHandlePool OPFS sync handle.
- A client suspended while holding the owner lock, or whose pending request is
  granted after suspension, holds it without answering the probe. 541/542
  diagnostics cannot distinguish that from other holders: Web Lock clientIds
  are excluded and locks carry no identity.
- No iframe loads an app document; all production importers share one
  `local-db.js` URL. No second DB worker in one document was found in code.

Unranked, unproven holder candidates: the tab's back/forward-cached
Studio/Room document; another LinguistPro tab in background; a same-document
worker; a client not running instrumented code.

### Missing fact and proposed collection (not implemented)

Missing fact: which client holds `linguistpro-opfs-db-owner-v1` while a fresh
document waits: same document or another; same tab (cached) or another tab;
surface, release, age; its last lifecycle event and RPC before holding.

Proposal: while opt-in recording is enabled, every document and DB worker
holds a never-contended identity Web Lock whose name contains only allowlisted
fields (kind, surface, release, random document/worker id, creation minute).
The support page joins the owner lock's holder and waiter clientIds from
`navigator.locks.query()` to those identity locks and prints per-report labels,
never raw clientIds; a holder without an identity lock is reported as
uninstrumented. The lock manager answers even when the holder is frozen.
The journal adds per-worker lease acquired/released events.

## Follow-up 3.11.542: failed-open queue repair (not full device acceptance)

Owner supplied both requested 541 reports. Normal profile: AccessHandlePool,
held/pending `linguistpro-opfs-db-owner-v1`; recorded worker holdsLease=false.
Private profile: IDB, held/pending `/app.db-outer`, migration-stage wait.
Both reports follow a hidden event; no respondingWorkers does not prove death.
Reported storage usage is below quota; this says nothing about process RAM.
The original holder and the native failed-page cause remain UNPROVEN.

Confirmed in source and a red/green test: after a failed open, eight queued
operations caused eight independent open attempts. Close followed that queue.
The facade also posted SQL while init was pending/failed. Repair:

- Startup SQL awaits the shared init and propagates its failure without posting.
- OperationLease latches physical-open failure; queued SQL fails without opening.
  Close remains allowed, but does not clear the failure. Explicit init retries.
- Recovery no longer terminates a live worker based on a historical timeout;
  it awaits cooperative closure and explicitly reinitializes the same backend.
- The diagnostic pending duration now uses actual elapsed time, not literal 8000.

Evidence: 30 targeted node tests pass. `failed-open-queue-smoke.js` passes with
Chromium/AccessHandlePool and WebKit/IDB: real fixture-held browser locks,
nine rejected init/write calls, prompt close, no delayed writes after recovery,
same-store read/write and integrity_check=ok. Only fixture-served lock deadlines
are shortened to 100ms; production deadlines remain unchanged. Existing actual
Studio lifecycle gates pass for both backends (five Library cycles, 100 reads,
numeric SRS, Studio-to-Room, unchanged nonempty review_log). Four-tab operation
gates pass with Chromium on both backends.

No reset, backend migration, unknown-lock stealing or owner-data access. The
patch fixes the cascade after the first failure, not its unidentified holder.
Do not ask for another identical 541 report. Next investigation must distinguish
holder lifecycle/physical-resource closure from the now-bounded waiter queue.
Release validation is recorded separately from physical iPhone acceptance.

Baseline: `0d79f0f3` / 3.11.540. Owner acceptance is FAIL, not inferred from
desktop/WebKit automation. Owner's latest normal-profile screenshot explicitly
says `vfs=AccessHandlePool`, `DB_LOCK_WAIT_TIMEOUT`, `held=1`, `holder=unknown`.
The earlier Incognito report said IDB. These are different physical stores;
never switch the saved backend to make a list appear empty but successful.
Another Incognito screenshot is Chrome's native failed-page screen after a
second Room open, not an application DB-lock message. Its cause is unproven.

## Diagnostic release, not an asserted iPhone fix

`/db-diagnostics.html` is a lightweight support page with no local-db import,
SQLite worker, WASM, canonical corpus download, or OPFS/IDB database open.
It queries only Web Locks, a content-free BroadcastChannel snapshot, storage
usage/quota, saved backend preference and the dedicated diagnostic journal.
Existing workers answer probes independently of the serialized SQL queue.

The page offers explicit 15-minute recording and copy/export-to-clipboard of
the visible JSON. No automatic network upload. Normal and Incognito reports
must be gathered separately in the same browser profile as the failure.
After a native page crash, open the support URL directly. Journal survival
depends on browser storage preservation; closing the private session can erase
it. An incomplete journal is NOT proof of OOM, worker death, or another tab.

Recorded fields are allowlisted: release, random per-worker correlation ID,
surface enum, numeric request ID, RPC kind (not SQL), timestamps, pending count,
stage, VFS enum, lease/transaction flags and typed DB error code. There are no
text titles/bodies/IDs, SQL, parameters, API keys, full page URL/query/hash,
review history, or arbitrary browser error messages. Raw Web Lock client IDs
and unrelated lock names remain excluded. At most 8 runs × 24 events are kept.
Disabling recording stops journal writes, TTL stops the worker phase stream,
storage errors never block DB initialization. This journal is best-effort
diagnostic metadata, not a transactional audit log.

Stages distinguish browser preflight, worker-module loading, sync/async WASM
initialization, OPFS initial/repeated handle acquisition, SQLite open,
migrations, SQL execution, SQLite close and VFS close. A still-pending RPC is
recorded after 8 seconds without timing out, retrying or terminating that RPC.
Explicit report text distinguishes responding holder vs unresponsive unknown
holder vs no current locks. It never labels an unknown holder as a dead tab.

Links appear in Studio's Library error, the Room error state, and both footers.
The support page is Russian-language; the application entry labels reuse the
existing translated `dashboard.secDiag` key. Release URLs, precache and shell
integrity include the new diagnostic graph.

## Evidence

- Node tests: opt-in/TTL/stop, bounded retention, persistence, sanitization,
  unavailable storage; existing local DB concurrency/lease/progress gates.
- `STUDIO_BACKEND=AccessHandlePool MULTITAB_ENGINE=chromium` with the existing
  `studio-idb-lifecycle-smoke.js`: an actual OPFS request waits behind a
  synthetic owner lock while the support page loads and receives waiting-lock
  from the worker outside its SQL queue. Releasing ONLY the fixture's own lock
  lets the original pending read finish. No retries/stealing/reset are involved.
- The same runner in WebKit IDB validates normal reads, 20 synthetic cards,
  SRS counters, ru/en/he retranslation, Studio → Room, integrity and unchanged
  nonempty review_log. Diagnostic-page requests contain no worker/WASM/local-db;
  JSON contains neither fixture title nor SQL. Controls fit the 380px viewport.

Next owner evidence: enable recording, reproduce normal-profile failure,
return to support URL, refresh/copy report; repeat separately in Incognito
without ending the private session. Identify which report is which. Do not
reset the library. After those reports, choose the next runtime fix from the
observed failing stage rather than another speculative lock-policy change.
