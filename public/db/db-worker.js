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
// Selection happens at init: try #1 inside a try/catch; on any failure
// (NotSupportedError / TypeError on createSyncAccessHandle / capacity
// errors / etc.) fall back to #2. The choice is reported back to the
// main thread in the init response.
//
// Protocol:
//   Request:  { id, type: 'init'|'query'|'run'|'exec', sql?, params? }
//   Response: { id, ok: true,  rows?, changes?, vfs? }
//           | { id, ok: false, error: string }

import { Factory, SQLITE_OPEN_READWRITE, SQLITE_OPEN_CREATE } from './sqlite-api.js';
import { MIGRATIONS } from './migrations.js';
import { computeVfsOrder } from './vfs-order.js';

let sqlite3 = null;
let db = null;
let vfs = null;       // the live VFS instance — needed to release its resources on close()
let vfsName = null;   // 'AccessHandlePool' or 'tts-opfs-idb'
let vfsKind = null;   // 'sync' or 'async' (for diagnostic surface)

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

    await execMulti('BEGIN;');
    try {
      await execMulti(MIGRATIONS[i]);
      await runSingle('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
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
  // Sync wa-sqlite build + sync VFS.
  const SQLiteModule = (await import('./wa-sqlite.mjs')).default;
  const { AccessHandlePoolVFS } = await import('./AccessHandlePoolVFS.js');

  const module = await SQLiteModule();
  const sqlite = Factory(module);

  const vfs = new AccessHandlePoolVFS('/tts-opfs');
  try {
    await vfs.isReady;
    sqlite.vfs_register(vfs, true);

    const opened = await sqlite.open_v2(
      'app.db',
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      vfs.name
    );
    return { sqlite, db: opened, vfs, vfsName: vfs.name, vfsKind: 'sync' };
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
  // Async wa-sqlite build + async VFS.
  const SQLiteModule = (await import('./wa-sqlite-async.mjs')).default;
  const { IDBBatchAtomicVFS } = await import('./IDBBatchAtomicVFS.js');

  const module = await SQLiteModule();
  const sqlite = Factory(module);

  const vfs = new IDBBatchAtomicVFS('tts-opfs-idb', { durability: 'relaxed' });
  try {
    await vfs.isReady;
    sqlite.vfs_register(vfs, true);

    const opened = await sqlite.open_v2(
      'app.db',
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      vfs.name
    );
    return { sqlite, db: opened, vfs, vfsName: vfs.name, vfsKind: 'async' };
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
  const order = computeVfsOrder(preferVfs);

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
    throw new Error('All VFS init attempts failed. ' + summary);
  }

  await execMulti('PRAGMA foreign_keys = ON;');
  await runMigrations();
}

// initDBOnce can fail AFTER a real open() succeeded (e.g. runMigrations() hits a transient lock
// mid-transaction) — in that case db/sqlite3/vfs ARE live and must be closed before a retry, or
// the leaked connection/handles defeat the whole point of this cleanup.
async function _closeCurrentConnection() {
  try { if (sqlite3 && db) await sqlite3.close(db); } catch (_) {}
  try { if (vfs && typeof vfs.close === 'function') await vfs.close(); } catch (_) {}
  db = null; sqlite3 = null; vfs = null; vfsName = null; vfsKind = null;
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
    try { await initDBOnce(preferVfs); return; }
    catch (e) { lastErr = e; console.warn(`[db-worker] init attempt ${i + 1}/${ATTEMPTS} failed:`, e && e.message); }
  }
  await _closeCurrentConnection();   // last attempt also failed post-open — don't leak it either
  throw lastErr;
}

// ── message handler ────────────────────────────────────────────────────────

self.onmessage = async ({ data }) => {
  const { id, type, sql, params, preferVfs } = data;
  try {
    if (type === 'init') {
      await initDB(preferVfs || null);
      self.postMessage({ id, ok: true, vfs: vfsName, vfsKind });

    } else if (type === 'query') {
      const rows = await queryRows(sql, params || []);
      self.postMessage({ id, ok: true, rows });

    } else if (type === 'run') {
      const changes = await runSingle(sql, params || []);
      self.postMessage({ id, ok: true, changes });

    } else if (type === 'exec') {
      await execMulti(sql);
      self.postMessage({ id, ok: true });

    } else if (type === 'close') {
      // Graceful pre-navigation teardown (Room↔Studio cross-nav): explicitly release the sync
      // access handle / IDB connection BEFORE the page unloads, instead of hoping the browser's
      // abrupt worker-termination-on-navigate releases it in time for the next page's open().
      await _closeCurrentConnection();
      self.postMessage({ id, ok: true });

    } else {
      self.postMessage({ id, ok: false, error: `Unknown type: ${type}` });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message ? e.message : e) });
  }
};
