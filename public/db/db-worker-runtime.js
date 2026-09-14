// db-worker.js — Dedicated Web Worker.
// Owns the SQLite connection. All ops go through postMessage.
//
// VFS fallback chain (premium UX: works on every modern browser):
//   1. AccessHandlePoolVFS — sync access handles, fastest. Requires
//      FileSystemSyncAccessHandle in workers (Chrome 102+ desktop,
//      Safari/iOS 17+, Edge 102+). Uses the SYNC wa-sqlite build.
//   2. IDBBatchAtomicVFS — IndexedDB-based, async. Works on every browser
//      that supports IndexedDB (i.e. effectively all of them, including
//      iOS Safari 15+, Android Chrome 80+, older desktop). Uses the
//      ASYNC (Asyncify) wa-sqlite build.
//
// First-install selection: try #1 inside a try/catch; on any failure
// (NotSupportedError / TypeError on createSyncAccessHandle / capacity
// errors / etc.) fall back to #2. The choice is reported back to the
// main thread in the init response.
// Once a storage preference exists, open/retry ONLY that physical backend.
// Falling back after a transient lock would expose an unrelated library.
//
// Protocol:
//   Request:  { id, type: 'init'|'query'|'run'|'exec', sql?, params? }
//   Response: { id, ok: true,  rows?, changes?, vfs? }
//           | { id, ok: false, error: string }

import { Factory, SQLITE_OPEN_READWRITE, SQLITE_OPEN_CREATE } from './sqlite-api.js?v=531';
import { MIGRATIONS } from './migrations.js';
import { computeVfsOrder } from './vfs-order.js';
import { OperationLease } from './operation-lease.js?v=542';
import { storageIdentity } from './storage-identity.js';
import { createRuntimeDiagnostics } from './runtime-diagnostics.js?v=541';

const runtimes = new Map();
let migrated = false;
let selectedVfs = null;
let sqlite3 = null;
let db = null;
let vfs = null;       // the live VFS instance — needed to release its resources on close()
let vfsName = null;   // 'AccessHandlePool' or 'tts-opfs-idb'
let vfsKind = null;   // 'sync' or 'async' (for diagnostic surface)
let phase = 'starting', phaseSince = Date.now();
let diagnosticEnabled = false, diagnosticUntil = 0, workerId = null, requestId = 0, operation = 'starting';
function setPhase(value) {
  phase = value; phaseSince = Date.now();
  if (diagnosticEnabled && Date.now() < diagnosticUntil) self.postMessage({ kind: 'diagnostic-phase', snapshot: runtimeSnapshot() });
}

// ── helpers ────────────────────────────────────────────────────────────────

async function execMulti(sql) {
  for await (const stmt of sqlite3.statements(db, sql)) {
    await sqlite3.step(stmt);
    await sqlite3.finalize(stmt);
  }
}

async function queryRows(sql, params = []) {
  const results = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length) sqlite3.bind_collection(stmt, params);
    while (await sqlite3.step(stmt) === 100 /* SQLITE_ROW */) {
      const names = sqlite3.column_names(stmt);
      const vals  = sqlite3.row(stmt);
      const obj   = {};
      names.forEach((n, i) => { obj[n] = vals[i]; });
      results.push(obj);
    }
    await sqlite3.finalize(stmt);
  }
  return results;
}

async function runSingle(sql, params = []) {
  let changes = 0;
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length) sqlite3.bind_collection(stmt, params);
    await sqlite3.step(stmt);
    changes = sqlite3.changes(db);
    await sqlite3.finalize(stmt);
    break;
  }
  return changes;
}

// ── migration runner ───────────────────────────────────────────────────────

async function runMigrations() {
  await execMulti(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);

  const applied = await queryRows('SELECT version FROM schema_migrations ORDER BY version');
  const done    = new Set(applied.map(r => r.version));

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (done.has(version)) continue;

    await execMulti('BEGIN IMMEDIATE;');
    try {
      // Another IDB connection may have migrated while this one waited for
      // SQLite's native lock. Decide under that lock, not from a stale list.
      const current = await queryRows('SELECT version FROM schema_migrations ORDER BY version');
      for (const row of current) done.add(row.version);
      if (!done.has(version)) {
        await execMulti(MIGRATIONS[i]);
        await runSingle('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
        done.add(version);
      }
      await execMulti('COMMIT;');
    } catch (e) {
      await execMulti('ROLLBACK;').catch(() => {});
      throw new Error(`Migration ${version} failed: ${e.message}`);
    }
  }
}

// ── init: VFS fallback chain ───────────────────────────────────────────────

// Try AccessHandlePoolVFS (sync). Returns { sqlite3, db, vfsName } on success;
// throws on any failure so the caller can move to the next VFS.
async function initWithAccessHandlePool() {
  const cached = runtimes.get('AccessHandlePool');
  if (cached) {
    try {
      setPhase('opfs-reacquiring-handles');
      await cached.vfs.reset();
      setPhase('sqlite-opening');
      const opened = await cached.sqlite.open_v2('app.db', SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, cached.vfs.name);
      return { ...cached, db: opened };
    } catch (e) { await cached.vfs.close(); throw e; }
  }

  // Sync wa-sqlite build + sync VFS.
  setPhase('loading-wasm-sync-module');
  const SQLiteModule = (await import('./wa-sqlite.mjs')).default;
  const { AccessHandlePoolVFS } = await import('./AccessHandlePoolVFS.js');

  setPhase('wasm-sync-initializing');
  const module = await SQLiteModule();
  const sqlite = Factory(module);

  setPhase('opfs-acquiring-handles');
  const vfs = new AccessHandlePoolVFS('/tts-opfs');
  try {
    await vfs.isReady;
    sqlite.vfs_register(vfs, true);

    setPhase('sqlite-opening');
    const opened = await sqlite.open_v2(
      'app.db',
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      vfs.name
    );
    const runtime = { sqlite, vfs, vfsName: vfs.name, vfsKind: 'sync' };
    runtimes.set('AccessHandlePool', runtime);
    return { ...runtime, db: opened };
  } catch (e) {
    // AccessHandlePoolVFS's constructor already grabbed real OPFS sync access handles (exclusive
    // per-origin) before open_v2 ever ran — release them on a failed attempt so they can't wedge
    // a later attempt (this worker's retry, or a different page's worker) with the same error.
    try { await vfs.close(); } catch (_) {}
    throw e;
  }
}

// Try IDBBatchAtomicVFS (async). Works wherever IndexedDB is available.
async function initWithIDB() {
  const cached = runtimes.get('tts-opfs-idb');
  if (cached) {
    try {
      setPhase('idb-reopening');
      await cached.vfs.reset();
      const opened = await cached.sqlite.open_v2('app.db', SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, cached.vfs.name);
      return { ...cached, db: opened };
    } catch (e) { await cached.vfs.close(); throw e; }
  }

  // Async wa-sqlite build + async VFS.
  setPhase('loading-wasm-async-module');
  const SQLiteModule = (await import('./wa-sqlite-async.mjs')).default;
  const { IDBBatchAtomicVFS } = await import('./IDBBatchAtomicVFS.js?v=531');

  setPhase('wasm-async-initializing');
  const module = await SQLiteModule();
  const sqlite = Factory(module);

  setPhase('idb-opening');
  const vfs = new IDBBatchAtomicVFS('tts-opfs-idb', { durability: 'relaxed', lockTimeoutMillis: 30000 });
  try {
    await vfs.isReady;
    sqlite.vfs_register(vfs, true);

    const opened = await sqlite.open_v2(
      'app.db',
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      vfs.name
    );
    const runtime = { sqlite, vfs, vfsName: vfs.name, vfsKind: 'async' };
    runtimes.set('tts-opfs-idb', runtime);
    return { ...runtime, db: opened };
  } catch (e) {
    try { await vfs.close(); } catch (_) {}
    throw e;
  }
}

// See vfs-order.js for the fix history (owner's iPhone repro 2026-07-05: the sticky-VFS
// preference compared against the wrong labels and was a silent no-op, so every boot retried
// AccessHandlePoolVFS first regardless of which VFS actually holds the user's data).
async function initDBOnce(preferVfs) {
  const errors = [];
  const order = computeVfsOrder(preferVfs, { allowFallback: false });

  for (const choice of order) {
    if (db) break;
    try {
      const r = (choice === 'AccessHandlePool')
        ? await initWithAccessHandlePool()
        : await initWithIDB();
      sqlite3 = r.sqlite; db = r.db; vfs = r.vfs; vfsName = r.vfsName; vfsKind = r.vfsKind;
    } catch (e) {
      // initWithAccessHandlePool/initWithIDB already release their own partially-acquired
      // resources on failure (see their try/catch) — nothing to clean up here.
      errors.push({ vfs: choice, error: String(e && e.message ? e.message : e) });
      console.warn(`[db-worker] ${choice} VFS init failed:`, e && e.message);
    }
  }

  if (!db) {
    const summary = errors.map(x => `${x.vfs}: ${x.error}`).join(' | ');
    throw new Error((preferVfs ? 'DB_PREFERRED_STORAGE_UNAVAILABLE: ' : 'All VFS init attempts failed. ') + summary);
  }

  await execMulti('PRAGMA foreign_keys = ON;');
  if (!migrated) { setPhase('migrations'); await runMigrations(); migrated = true; }
}

// initDBOnce can fail AFTER a real open() succeeded (e.g. runMigrations() hits a transient lock
// mid-transaction) — in that case db/sqlite3/vfs ARE live and must be closed before a retry, or
// the leaked connection/handles defeat the whole point of this cleanup.
async function _closeCurrentConnection() {
  setPhase('closing-sqlite');
  if (sqlite3 && db) await sqlite3.close(db);
  db = null;
  setPhase('closing-vfs');
  if (vfs && typeof vfs.close === 'function') await vfs.close();
  db = null; sqlite3 = null; vfs = null; vfsName = null; vfsKind = null;
  setPhase('idle');
}

// Retry wrapper: absorbs a TRANSIENT open failure (e.g. the previous page's worker/handle hasn't
// fully released yet during Room↔Studio hard navigation) rather than surfacing a scary fatal error
// on the first attempt.
async function initDB(preferVfs) {
  const ATTEMPTS = 3, DELAYS_MS = [0, 400, 900];
  let lastErr = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    if (DELAYS_MS[i]) await new Promise((r) => setTimeout(r, DELAYS_MS[i]));
    await _closeCurrentConnection();
    setPhase('opening-vfs');
    try { await initDBOnce(preferVfs); return; }
    catch (e) { lastErr = e; console.warn(`[db-worker] init attempt ${i + 1}/${ATTEMPTS} failed:`, e && e.message); }
  }
  await _closeCurrentConnection();   // last attempt also failed post-open — don't leak it either
  throw lastErr;
}

// ── message handler ────────────────────────────────────────────────────────

// OPFS uses the historical physical-owner name. IDB coordinates with legacy
// SQLite connections through their existing VFS locks, never by stealing them.
const lease = new OperationLease({
  locks: navigator.locks,
  lockName: 'linguistpro-opfs-db-owner-v1',
  requiresExternalLock: () => selectedVfs !== 'tts-opfs-idb',
  keepConnectionOpen: () => vfsName === 'tts-opfs-idb',
  open: async () => {
    setPhase('storage-identity');
    selectedVfs = await storageIdentity(selectedVfs);
    setPhase('opening-vfs');
    await initDB(selectedVfs);
    setPhase('saving-storage-identity');
    selectedVfs = await storageIdentity(vfsName);
  },
  close: _closeCurrentConnection,
  inTransaction: () => !!db && !sqlite3.get_autocommit(db),
  rollback: () => execMulti('ROLLBACK;'),
  onCommit: () => self.postMessage({ kind: 'committed' }),
});

function runtimeSnapshot() { return {
  runtime: 542, workerId, requestId, operation, phase, elapsedMs: Date.now() - phaseSince,
  holdsLease: !!lease.release || !!vfs?.hasLock?.(), transactionIdle: lease.opened && !!lease.timer,
  coordination: selectedVfs === 'tts-opfs-idb' ? 'sqlite-vfs' : 'opfs-owner',
  vfs: selectedVfs,
}; }
const diagnostics = createRuntimeDiagnostics({ locks: navigator.locks, snapshot: runtimeSnapshot });

self.onmessage = ({ data }) => {
  const { id, type, sql, params, preferVfs } = data;
  if (type === 'init') {
    diagnosticEnabled = data.diagnosticEnabled === true;
    diagnosticUntil = Date.now() + 15 * 60 * 1000;
    workerId = /^[0-9a-f-]{36}$/.test(data.diagnosticWorkerId || '') ? data.diagnosticWorkerId : null;
  }
  lease.run(async () => {
    requestId = id; operation = ['init', 'query', 'run', 'exec', 'close'].includes(type) ? type : 'unknown';
    setPhase(lease.opened ? 'transaction' : 'waiting-lock');
    if (type === 'init') {
      if (preferVfs && selectedVfs && preferVfs !== selectedVfs) throw new Error('DB_PREFERRED_STORAGE_UNAVAILABLE: storage identity mismatch');
      selectedVfs = preferVfs || selectedVfs;
      // The identity store uses an atomic IDB transaction of its own. Read it
      // before selecting coordination, not behind an unrelated OPFS owner.
      selectedVfs = await storageIdentity(selectedVfs);
      await lease.ensureOpen();
      return { vfs: vfsName, vfsKind };
    }
    if (type === 'close') { await lease.close(); return {}; }
    await lease.ensureOpen();
    setPhase('executing-sql');
    if (type === 'query') return { rows: await queryRows(sql, params || []) };
    if (type === 'run') return { changes: await runSingle(sql, params || []) };
    if (type === 'exec') { await execMulti(sql); return {}; }
    throw new Error(`Unknown type: ${type}`);
  }, { reset: type === 'close', retryOpen: type === 'init', sql }).then(
    result => { setPhase('ready'); self.postMessage({ id, ok: true, ...result }); },
    async error => {
      let detail = null;
      if (String(error.code || '').startsWith('DB_LOCK_') || error.code === 'DB_STORAGE_CLOSE_FAILED') {
        try { detail = await diagnostics.capture(); } catch (_) {}
      }
      const holder = detail?.peers.find(peer => peer?.holdsLease);
      const suffix = detail ? ` [browser=${error.browserError || 'none'}; held=${detail.locks.held?.length ?? 'unknown'}; holder=${holder?.phase || 'unknown'}; vfs=${selectedVfs || 'unknown'}]` : '';
      self.postMessage({ id, ok: false, error: String(error.message || error) + suffix, code: error.code || null, diagnostics: detail });
    }
  );
};
