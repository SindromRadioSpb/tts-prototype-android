'use strict';
// The news index (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.1): one row per article —
// a slice article of the hourly harvest or a study article — and its search row. Derived data: every
// row is rebuilt from news_harvest_items, news_overview_items and news_articles/news_works.
// Day of an article = Israel date of first_seen_at (when it entered the slice); a study article without
// a slice row — Israel date of published_at (spec §8а п.2).
const { normHe, stemsHe, normRu } = require('../news/newsSearchNorm');
const { withTxnLock } = require('./txnLock');

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

const KEEP_DAYS = 45;
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
function israelDay(iso) { const t = Date.parse(iso || ''); return Number.isFinite(t) ? DAY_FMT.format(new Date(t)) : null; }
const ms = v => Date.parse(v || '') || 0;
const join = (...parts) => parts.filter(Boolean).join(' ');

const COLS = ['item_key', 'day', 'outlet_id', 'section', 'story_key', 'edition_slot', 'edition_published_at', 'published_at', 'fresh_at', 'kind', 'work_id', 'selected_by', 'paywalled', 'full_ok',
  'title_he', 'title_ru', 'subtitle_he', 'subtitle_ru', 'lead_he', 'lead_ru', 'url', 'body_until', 'updated_at'];

function createNewsIndex({ db, now = () => Date.now(), bodyText = () => '' } = {}) {
  // The article behind any of its keys: the slice row (by url or canonical key) and the study article.
  async function gather(k) {
    const h = await dbGet(db, `SELECT * FROM news_harvest_items WHERE url_key=? OR canonical_key=? ORDER BY (status='failed') LIMIT 1`, [k, k]);
    const keys = [...new Set([k, h && h.url_key, h && h.canonical_key].filter(Boolean))];
    const q = keys.map(() => '?').join(',');
    const a = await dbGet(db, `SELECT article_id, outlet_id, canonical_url, section, published_at, title_he, title_ru, story_key, tier, deleted_at FROM news_articles
      WHERE article_id IN (${q}) AND tier<>'withdrawn' AND deleted_at IS NULL`, keys).catch(() => null);
    const o = await dbGet(db, `SELECT i.*, e.slot edition_slot, e.published_at edition_published_at FROM news_overview_items i LEFT JOIN news_editions e ON e.edition_id=i.edition_id
      WHERE i.item_key IN (${q}) ORDER BY i.updated_at DESC LIMIT 1`, keys).catch(() => null);
    let work = null;
    if (a && (a.tier === 'fresh' || a.tier === 'archive')) work = await dbGet(db, 'SELECT work_id FROM news_works WHERE article_id=? AND position_no=1', [a.article_id]);
    return { h: h && h.status !== 'failed' ? h : null, a, o, work, keys };
  }

  function rowOf({ h, a, o, work }) {
    const itemKey = (a && a.article_id) || (h && (h.canonical_key || h.url_key));
    const title = (h && (h.title_he || h.feed_title)) || (o && o.title_he) || (a && a.title_he);
    if (!itemKey || !title) return null;
    const published = (h && (h.published_at || h.feed_pub_at)) || (a && a.published_at) || (o && o.published_at) || null;
    const day = h ? israelDay(h.first_seen_at) : israelDay(published);
    if (!day) return null;
    const fresh = Math.max(ms(o && o.changed_at), ms(o && o.edition_published_at), ms(published), h ? 0 : ms(a && a.published_at));
    return {
      item_key: itemKey, day, outlet_id: (h && h.outlet_id) || (a && a.outlet_id) || (o && o.outlet_id),
      section: (h && h.section) || (o && o.section) || (a && a.section) || null,
      story_key: (o && o.story_key) || (h && h.story_key) || (a && a.story_key) || null,
      edition_slot: (o && o.edition_slot) || null, edition_published_at: (o && o.edition_published_at) || null, published_at: published, fresh_at: new Date(fresh || ms(h && h.first_seen_at)).toISOString(),
      kind: a ? 'learn' : 'slice', work_id: work ? work.work_id : null, selected_by: (h && h.selected_by) || null,
      paywalled: (h && h.paywalled) || (o && o.paywalled) ? 1 : 0, full_ok: h && h.full_ok ? 1 : 0,
      title_he: title, title_ru: (o && o.title_ru) || (a && a.title_ru) || null, subtitle_he: (h && h.subtitle_he) || (o && o.subtitle_he) || null,
      subtitle_ru: (o && o.subtitle_ru) || null, lead_he: (h && h.lead_he) || (o && o.lead_he) || null, lead_ru: (o && o.lead_ru) || null,
      url: (h && h.url) || (o && o.url) || (a && a.canonical_url) || null, body_until: null, updated_at: new Date(now()).toISOString(),
    };
  }

  async function dropKey(k) {
    const r = await dbGet(db, 'SELECT rid FROM news_index WHERE item_key=?', [k]);
    if (!r) return 0;
    await dbRun(db, 'DELETE FROM news_search WHERE rowid=?', [r.rid]);
    await dbRun(db, 'DELETE FROM news_index WHERE rid=?', [r.rid]);
    return 1;
  }

  // keys: any of url_key / canonical_key / article_id → { upserted, removed }.
  async function refresh(keys) {
    let upserted = 0, removed = 0;
    for (const k of new Set((keys || []).filter(Boolean))) {
      const g = await gather(k), row = rowOf(g);
      for (const other of g.keys) if (!row || other !== row.item_key) removed += await dropKey(other);
      if (!row) continue;
      await dbRun(db, `INSERT INTO news_index(${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})
        ON CONFLICT(item_key) DO UPDATE SET ${COLS.filter(c => c !== 'item_key').map(c => `${c}=excluded.${c}`).join(', ')}`, COLS.map(c => row[c]));
      const { rid } = await dbGet(db, 'SELECT rid FROM news_index WHERE item_key=?', [row.item_key]);
      const he = normHe(join(row.title_he, row.subtitle_he, row.lead_he, bodyText(g)));
      await dbRun(db, 'DELETE FROM news_search WHERE rowid=?', [rid]);
      await dbRun(db, 'INSERT INTO news_search(rowid, he, stems, ru) VALUES (?,?,?,?)', [rid, he, stemsHe(he), normRu(join(row.title_ru, row.subtitle_ru, row.lead_ru))]);
      upserted++;
    }
    return { upserted, removed };
  }

  // A batch of writes as one transaction under the process-wide lock (review W2 I3: no 100k autocommits).
  const dbExec = sql => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
  const inTransaction = task => withTxnLock(async () => {
    await dbExec('BEGIN IMMEDIATE');
    try { const r = await task(); await dbExec('COMMIT'); return r; }
    catch (e) { try { await dbExec('ROLLBACK'); } catch (_) {} throw e; }
  });
  // Every slice row and study article, in batches of one transaction each; then the search index is
  // merged and the WAL checkpointed. → number of keys refreshed.
  async function backfill({ batch = 200 } = {}) {
    let n = 0;
    for (const [table, col] of [['news_harvest_items', 'url_key'], ['news_articles', 'article_id']]) {
      let last = '';
      for (;;) {
        const part = await dbAll(db, `SELECT ${col} k FROM ${table} WHERE ${col} > ? ORDER BY ${col} LIMIT ?`, [last, batch]);
        if (!part.length) break;
        await inTransaction(() => refresh(part.map(r => r.k)));
        n += part.length; last = part[part.length - 1].k;
      }
    }
    await dbRun(db, "INSERT INTO news_search(news_search) VALUES('optimize')").catch(() => {});
    await dbRun(db, 'PRAGMA wal_checkpoint(TRUNCATE)').catch(() => {});
    return n;
  }

  // Slice rows older than 45 days leave the index; study rows stay as long as their article. → rows removed.
  async function prune(nowMs = now()) {
    const cut = israelDay(new Date(nowMs - KEEP_DAYS * 86400000).toISOString());
    const old = await dbAll(db, `SELECT item_key FROM news_index WHERE kind='slice' AND day < ?`, [cut]);
    let n = 0;
    for (const r of old) n += await dropKey(r.item_key);
    return n;
  }

  // Boot: rebuild the whole index once per index version (stored in news_settings) → keys refreshed.
  async function ensureBuilt(version) {
    const r = await dbGet(db, "SELECT value_json FROM news_settings WHERE key='index_version'");
    if (r && JSON.parse(r.value_json) === version) return 0;
    const n = await backfill();
    await dbRun(db, `INSERT INTO news_settings(key, value_json, updated_at) VALUES ('index_version', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`, [JSON.stringify(version), new Date(now()).toISOString()]);
    return n;
  }

  return { refresh, backfill, prune, ensureBuilt, israelDay };
}

module.exports = { createNewsIndex, israelDay, KEEP_DAYS };
