// db-worker.js — Dedicated Web Worker.
// Единственный владелец OPFS SQLite-соединения.
// Все операции с БД проходят через postMessage → ответ postMessage.
//
// Протокол сообщений:
//   Запрос:  { id: number, type: 'init'|'query'|'run'|'exec', sql?: string, params?: any[] }
//   Ответ:   { id: number, ok: true, rows?: object[], changes?: number }
//          | { id: number, ok: false, error: string }

import SQLiteModule from './wa-sqlite.mjs';
import { Factory, SQLITE_OPEN_READWRITE, SQLITE_OPEN_CREATE } from './sqlite-api.js';
import { AccessHandlePoolVFS } from './AccessHandlePoolVFS.js';
import { MIGRATIONS } from './migrations.js';

let sqlite3 = null;
let db = null;
let tag = null; // createTag helper

// ── helpers ────────────────────────────────────────────────────────────────

async function execMulti(sql) {
  // wa-sqlite exec() stops at first statement; iterate all statements manually
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
    break; // run handles single statement
  }
  return changes;
}

// ── migration runner ───────────────────────────────────────────────────────

async function runMigrations() {
  // Create tracker table first (idempotent)
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

// ── init ───────────────────────────────────────────────────────────────────

async function initDB() {
  const module = await SQLiteModule();
  sqlite3 = Factory(module);

  const vfs = new AccessHandlePoolVFS('/tts-opfs');
  await vfs.isReady;
  sqlite3.vfs_register(vfs, true /* makeDefault */);

  db = await sqlite3.open_v2(
    'app.db',
    SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
    'opfs-ahp'
  );

  await execMulti('PRAGMA foreign_keys = ON;');
  await runMigrations();
}

// ── message handler ────────────────────────────────────────────────────────

self.onmessage = async ({ data }) => {
  const { id, type, sql, params } = data;
  try {
    if (type === 'init') {
      await initDB();
      self.postMessage({ id, ok: true });

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
