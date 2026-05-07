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

let sqlite3 = null;
let db = null;
let vfsName = null;   // 'AccessHandlePool' or 'IDBBatchAtomic'
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
  await vfs.isReady;
  sqlite.vfs_register(vfs, true);

  const opened = await sqlite.open_v2(
    'app.db',
    SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
    vfs.name
  );
  return { sqlite, db: opened, vfsName: vfs.name, vfsKind: 'sync' };
}

// Try IDBBatchAtomicVFS (async). Works wherever IndexedDB is available.
async function initWithIDB() {
  // Async wa-sqlite build + async VFS.
  const SQLiteModule = (await import('./wa-sqlite-async.mjs')).default;
  const { IDBBatchAtomicVFS } = await import('./IDBBatchAtomicVFS.js');

  const module = await SQLiteModule();
  const sqlite = Factory(module);

  const vfs = new IDBBatchAtomicVFS('tts-opfs-idb', { durability: 'relaxed' });
  await vfs.isReady;
  sqlite.vfs_register(vfs, true);

  const opened = await sqlite.open_v2(
    'app.db',
    SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
    vfs.name
  );
  return { sqlite, db: opened, vfsName: vfs.name, vfsKind: 'async' };
}

async function initDB(preferVfs) {
  const errors = [];

  // Build the order of VFS attempts. preferVfs (from main thread's
  // localStorage) puts the user's last-successful VFS first so existing
  // data isn't orphaned when browser capabilities change between sessions.
  const order = ['AccessHandlePool', 'IDBBatchAtomic'];
  if (preferVfs && order.indexOf(preferVfs) >= 0) {
    order.sort((a, b) => (a === preferVfs ? -1 : (b === preferVfs ? 1 : 0)));
  }

  for (const choice of order) {
    if (db) break;
    try {
      const r = (choice === 'AccessHandlePool')
        ? await initWithAccessHandlePool()
        : await initWithIDB();
      sqlite3 = r.sqlite; db = r.db; vfsName = r.vfsName; vfsKind = r.vfsKind;
    } catch (e) {
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

    } else {
      self.postMessage({ id, ok: false, error: `Unknown type: ${type}` });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message ? e.message : e) });
  }
};
