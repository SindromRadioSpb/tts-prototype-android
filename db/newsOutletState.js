'use strict';
// The owner's switch and the harvest state of each outlet (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md
// §4, §8). The catalog itself (names, groups, domains) lives in public/js/news-outlets.js; this keeps what changes:
// in the slice or not, harvested by the server or by the home PC, the last good harvest, the last error.
const Outlets = require('../public/js/news-outlets');
const { NewsError } = require('./newsRepo');
const { sourceFor } = require('../news/harvest/newsHarvestSources');

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const parse = s => { try { return JSON.parse(s || 'null'); } catch (_) { return null; } };

function shape(id, row) {
  return { outlet_id: id, enabled: !!(row && row.enabled), route: (row && row.route) || 'server',
    probe: row ? parse(row.probe_json) : null, probe_at: (row && row.probe_at) || null, last_ok_at: (row && row.last_ok_at) || null,
    last_error: (row && row.last_error) || null, last_error_at: (row && row.last_error_at) || null, enabled_at: (row && row.enabled_at) || null };
}

// The outlets harvested before the probe existed (spec §5.3): they keep their switch without one.
const LEGACY = ['ynet', 'walla', 'maariv', 'n12', 'haaretz', 'c14'];

function createOutletState({ db, now = () => Date.now(), legacy = LEGACY }) {
  const iso = () => new Date(now()).toISOString();
  const known = id => !!Outlets.byId(id);

  async function list() {
    const rows = new Map((await dbAll(db, 'SELECT * FROM news_outlet_state')).map(r => [r.outlet_id, r]));
    return Outlets.OUTLETS.map(o => shape(o.id, rows.get(o.id)));
  }
  async function get(id) {
    if (!known(id)) return null;
    return shape(id, await dbGet(db, 'SELECT * FROM news_outlet_state WHERE outlet_id=?', [id]));
  }
  async function harvestable(sources) {
    const byId = new Map((await list()).map(s => [s.outlet_id, s]));
    return sources.filter(s => { const st = byId.get(s.outlet_id); return st && st.enabled && st.route === 'server'; });
  }
  async function setEnabled(id, enabled, actor, { force = false } = {}) {
    const cur = await get(id);
    if (!cur) throw new NewsError('UNKNOWN_OUTLET', 404);
    if (enabled && !sourceFor(id) && cur.route !== 'home_pc') throw new NewsError('NO_ADAPTER', 409);
    // A new outlet goes into the slice after a passed probe, or when the owner switches it on knowingly (force).
    const needsProbe = enabled && !cur.enabled && !legacy.includes(id) && cur.route !== 'home_pc' && !(cur.probe && cur.probe.pass);
    if (needsProbe && !force) throw new NewsError('PROBE_REQUIRED', 409, cur.probe ? { full: cur.probe.full, sampled: cur.probe.sampled } : null);
    const t = iso();
    await dbRun(db, `INSERT INTO news_outlet_state(outlet_id, enabled, route, enabled_at, updated_by, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(outlet_id) DO UPDATE SET enabled=excluded.enabled, enabled_at=CASE WHEN excluded.enabled=1 AND news_outlet_state.enabled=0 THEN excluded.enabled_at ELSE news_outlet_state.enabled_at END,
      updated_by=excluded.updated_by, updated_at=excluded.updated_at`, [id, enabled ? 1 : 0, cur.route, enabled ? t : null, String(actor), t]);
    await dbRun(db, 'INSERT INTO news_outlet_journal(outlet_id, action, actor, at, detail_json) VALUES (?,?,?,?,?)', [id, needsProbe ? 'enable_forced' : enabled ? 'enable' : 'disable', String(actor), t,
      needsProbe ? JSON.stringify(cur.probe ? { full: cur.probe.full, sampled: cur.probe.sampled } : { probe: null }) : null]);
    return get(id);
  }
  // okAt: a harvest of this outlet succeeded at that time (never moves back); error: the last failure.
  async function recordPoll(id, { okAt = null, error = null } = {}) {
    if (!known(id)) return;
    await dbRun(db, 'INSERT OR IGNORE INTO news_outlet_state(outlet_id) VALUES (?)', [id]);
    if (error) await dbRun(db, 'UPDATE news_outlet_state SET last_error=?, last_error_at=? WHERE outlet_id=?', [String(error).slice(0, 300), iso(), id]);
    else if (okAt) await dbRun(db, `UPDATE news_outlet_state SET last_ok_at=CASE WHEN last_ok_at IS NULL OR last_ok_at < ? THEN ? ELSE last_ok_at END,
      last_error=NULL, last_error_at=NULL WHERE outlet_id=?`, [okAt, okAt, id]);
  }
  // The probe's score (spec §5.2): kept with the outlet, shown to the owner, gates switching a new outlet on.
  async function setProbe(id, probe) {
    if (!known(id)) return;
    await dbRun(db, 'INSERT OR IGNORE INTO news_outlet_state(outlet_id) VALUES (?)', [id]);
    await dbRun(db, 'UPDATE news_outlet_state SET probe_json=?, probe_at=? WHERE outlet_id=?', [JSON.stringify(probe), probe.at || iso(), id]);
  }
  // Articles that entered the slice in the last 24 hours, per outlet (the owner's list).
  async function dayCounts() {
    const rows = await dbAll(db, 'SELECT outlet_id, COUNT(*) n FROM news_harvest_items WHERE first_seen_at >= ? GROUP BY outlet_id', [new Date(now() - 24 * 3600e3).toISOString()]);
    return new Map(rows.map(r => [r.outlet_id, r.n]));
  }
  return { list, get, harvestable, setEnabled, recordPoll, dayCounts, setProbe };
}
module.exports = { createOutletState, LEGACY };
