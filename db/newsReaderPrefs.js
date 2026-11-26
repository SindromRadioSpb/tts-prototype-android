'use strict';
// A signed-in reader's outlets (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §7.4): «мои» in
// their order, hidden outlets, folded groups and the overview's «Все | Мои». Kept as sent after cleaning: only
// outlets of the catalog, only known groups; the browser keeps the same shape for a visitor (public/js/news-prefs.js).
const Outlets = require('../public/js/news-outlets');

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const GROUP_KEYS = new Set([...Outlets.GROUPS, ...Outlets.REGIONS.map(r => 'local:' + r)]);

function cleanPrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ids = v => [...new Set((Array.isArray(v) ? v : []).filter(id => typeof id === 'string' && Outlets.byId(id)))].slice(0, 60);
  const mine = ids(r.mine), hidden = ids(r.hidden).filter(id => !mine.includes(id));
  const collapsed = [...new Set((Array.isArray(r.collapsed) ? r.collapsed : []).filter(g => GROUP_KEYS.has(g)))];
  return { v: 1, mine, hidden, collapsed, overview: r.overview === 'mine' ? 'mine' : 'all' };
}

function createReaderPrefs({ db, now = () => Date.now() }) {
  async function get(actorId) {
    const row = await dbGet(db, 'SELECT prefs_json FROM news_reader_prefs WHERE actor_id=?', [String(actorId)]);
    if (!row) return null;
    try { return cleanPrefs(JSON.parse(row.prefs_json)); } catch (_) { return null; }
  }
  async function put(actorId, raw) {
    const prefs = cleanPrefs(raw);
    await dbRun(db, `INSERT INTO news_reader_prefs(actor_id, prefs_json, updated_at) VALUES (?,?,?)
      ON CONFLICT(actor_id) DO UPDATE SET prefs_json=excluded.prefs_json, updated_at=excluded.updated_at`, [String(actorId), JSON.stringify(prefs), new Date(now()).toISOString()]);
    return prefs;
  }
  return { get, put };
}
module.exports = { createReaderPrefs, cleanPrefs };
