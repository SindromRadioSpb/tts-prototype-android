# iPhone local DB: diagnostic handoff 3.11.541

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
