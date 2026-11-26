'use strict';
// The one feed of the news section (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.2): the day
// overview and every outlet are this query with different filters. Study articles always come before
// the slice; inside each, the chosen sort. Pages of 60; counts follow the same filters except kind.
const { ftsQuery, normHe, normRu, formsOf } = require('../news/newsSearchNorm');
const { GROUPS } = require('../news/harvest/newsStories');
const { israelDay, KEEP_DAYS } = require('./newsIndex');
const { bodyOf: bodyOfRow } = require('../news/harvest/newsBody');

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

const PAGE = 60, SNIPPET = 200;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const OUT = ['item_key', 'day', 'outlet_id', 'section', 'story_key', 'edition_slot', 'edition_published_at', 'published_at', 'fresh_at', 'kind', 'work_id', 'selected_by', 'paywalled', 'full_ok',
  'title_he', 'title_ru', 'subtitle_he', 'subtitle_ru', 'lead_he', 'lead_ru', 'url', 'body_until'];

const encodeCursor = o => Buffer.from(JSON.stringify({ o })).toString('base64url');
const decodeCursor = c => { try { const v = JSON.parse(Buffer.from(String(c), 'base64url').toString('utf8')).o; return Number.isInteger(v) && v >= 0 ? v : 0; } catch (_) { return 0; } };

// The text around the first query word, from the fields that were searched (normalized comparison).
function snippetOf(row, q, extra = []) {
  const words = normHe(normRu(q)).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);
  if (!words.length) return null;
  for (const text of [row.title_he, row.subtitle_he, row.lead_he, ...extra, row.title_ru, row.subtitle_ru, row.lead_ru]) {
    if (!text) continue;
    const norm = normHe(normRu(text));
    for (const form of words.flatMap(formsOf)) {
      const at = norm.indexOf(form);
      if (at < 0) continue;
      // Positions of the normalized text roughly follow the original (niqqud removal shortens it): cut by ratio.
      const k = text.length / Math.max(1, norm.length), mid = Math.round(at * k);
      const from = Math.max(0, mid - SNIPPET / 2), cut = text.slice(from, from + SNIPPET).trim();
      return (from > 0 ? '…' : '') + cut + (from + SNIPPET < text.length ? '…' : '');
    }
  }
  return null;
}

// Paragraphs of a listed article for its snippet (W3): from the slice row while the body is kept.
function slicePara(db) {
  return async r => {
    if (!r.body_until) return [];
    const h = await dbGet(db, 'SELECT data_json, data_gz FROM news_harvest_items WHERE url_key=? OR canonical_key=? LIMIT 1', [r.item_key, r.item_key]).catch(() => null);
    const a = bodyOfRow(h);
    return a && Array.isArray(a.paragraphs) ? a.paragraphs : [];
  };
}

function createNewsList({ db, now = () => Date.now(), bodyOf = slicePara(db), cardsFor = null } = {}) {
  // Until the first build the index is empty: say so instead of «no articles» (review W2 I3).
  let built = false;
  async function isBuilt() {
    if (built) return true;
    const r = await dbGet(db, "SELECT 1 FROM news_settings WHERE key='index_version'").catch(() => null);
    return (built = !!r);
  }
  // The disk guard may have shortened how far back the full text goes (W3): the page says from which day.
  async function horizon() {
    const r = await dbGet(db, "SELECT value_json FROM news_settings WHERE key='search_horizon'").catch(() => null);
    try { return r ? JSON.parse(r.value_json).from_day || null : null; } catch (_) { return null; }
  }
  // An outlet, or a reader's set of outlets (W5): the same condition for the day, its neighbours and the rows.
  const outletCond = outlet => Array.isArray(outlet) ? { sql: `outlet_id IN (${outlet.map(() => '?').join(',') || "''"})`, p: outlet } : outlet ? { sql: 'outlet_id=?', p: [outlet] } : null;
  async function latestDay(outlet) {
    const c = outletCond(outlet);
    const r = await dbGet(db, `SELECT MAX(day) d FROM news_index${c ? ' WHERE ' + c.sql : ''}`, c ? c.p : []);
    return r && r.d;
  }
  async function neighbours(day, outlet) {
    const c = outletCond(outlet), extra = c ? ' AND ' + c.sql : '', p = c ? c.p : [];
    const prev = await dbGet(db, `SELECT day FROM news_index WHERE day < ?${extra} ORDER BY day DESC LIMIT 1`, [day, ...p]);
    const next = await dbGet(db, `SELECT day FROM news_index WHERE day > ?${extra} ORDER BY day ASC LIMIT 1`, [day, ...p]);
    return { prev: prev ? prev.day : null, next: next ? next.day : null };
  }

  // p: { day?, from?, to?, outlet?, section?, group?, edition?, kind?, story?, q?, sort?, cursor?, keys? }
  async function list(p = {}) {
    const where = [], params = [];
    let day = null, prev = null, next = null, range = null;
    // A query searches the whole kept window (45 days) unless a range is given (spec §2 п.3, review W2 I2).
    if (p.q && !p.from && !p.to) p = Object.assign({}, p, { from: israelDay(new Date(now() - KEEP_DAYS * 86400000).toISOString()), to: israelDay(new Date(now()).toISOString()) });
    if (p.from || p.to) {
      range = { from: p.from || null, to: p.to || null };
      if (p.from) { where.push('i.day >= ?'); params.push(p.from); }
      if (p.to) { where.push('i.day <= ?'); params.push(p.to); }
    } else {
      const scope = p.outlet || (Array.isArray(p.outlets) ? p.outlets : null);
      day = p.day && DAY.test(p.day) ? p.day : await latestDay(scope);
      if (day) { where.push('i.day = ?'); params.push(day); ({ prev, next } = await neighbours(day, scope)); }
    }
    if (p.outlet) { where.push('i.outlet_id = ?'); params.push(p.outlet); }
    else if (Array.isArray(p.outlets)) { where.push(`i.outlet_id IN (${p.outlets.map(() => '?').join(',') || "''"})`); params.push(...p.outlets); }
    if (p.section) { where.push('i.section = ?'); params.push(p.section); }
    if (p.group) {
      const secs = Object.keys(GROUPS).filter(s => GROUPS[s] === p.group);
      if (p.group === 'society') where.push(`(i.section IS NULL OR i.section NOT IN (${Object.keys(GROUPS).filter(s => GROUPS[s] !== 'society').map(() => '?').join(',')}))`), params.push(...Object.keys(GROUPS).filter(s => GROUPS[s] !== 'society'));
      else { where.push(`i.section IN (${secs.map(() => '?').join(',') || "''"})`); params.push(...secs); }
    }
    if (p.edition) { where.push('i.edition_slot = ?'); params.push(p.edition); }
    if (p.story) { where.push('i.story_key = ?'); params.push(p.story); }
    if (Array.isArray(p.keys)) { where.push(`i.item_key IN (${p.keys.map(() => '?').join(',') || "''"})`); params.push(...p.keys); }
    const match = p.q ? ftsQuery(p.q) : null;
    let from = 'news_index i';
    if (p.q && !match) where.push('0');
    if (match) { from = 'news_index i JOIN news_search s ON s.rowid = i.rid'; where.push('news_search MATCH ?'); params.push(match); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const counts = { learn: 0, slice: 0 };
    for (const r of await dbAll(db, `SELECT i.kind k, COUNT(*) n FROM ${from} ${W} GROUP BY i.kind`, params)) counts[r.k] = r.n;

    const kindWhere = p.kind === 'learn' || p.kind === 'slice' ? (W ? W + ' AND' : 'WHERE') + ' i.kind = ?' : W;
    const kindParams = p.kind === 'learn' || p.kind === 'slice' ? [...params, p.kind] : params;
    const order = p.sort === 'time' ? 'i.published_at IS NULL, i.published_at DESC' : p.sort === 'match' && match ? 'bm25(news_search)' : 'i.fresh_at DESC';
    const offset = p.cursor ? decodeCursor(p.cursor) : 0;
    const rows = await dbAll(db, `SELECT ${OUT.map(c => 'i.' + c).join(', ')} FROM ${from} ${kindWhere} ORDER BY (i.kind = 'learn') DESC, ${order}, i.rid DESC LIMIT ? OFFSET ?`,
      [...kindParams, PAGE + 1, offset]);
    const page = rows.slice(0, PAGE);
    if (cardsFor) {
      const cards = await cardsFor(page.filter(r => r.kind === 'learn').map(r => r.item_key));
      for (const r of page) if (r.kind === 'learn' && cards.get(r.item_key)) r.card = cards.get(r.item_key);
    }
    if (p.q) for (const r of page) { const s = snippetOf(r, p.q, bodyOf ? await bodyOf(r) : []); if (s) r.snippet = s; }
    return { building: !(await isBuilt()), day, prev, next, range, counts, items: page, next_cursor: rows.length > PAGE ? encodeCursor(offset + PAGE) : null, body_search_from: await horizon() };
  }
  return { list };
}

module.exports = { createNewsList, snippetOf, PAGE };
