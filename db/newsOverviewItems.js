'use strict';
// «Обзор дня» kept by article (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.4): each
// edition's pack adds rows and fills translations, nothing is ever removed; a day is assembled from its
// rows. Days before 3.11.894 are read from news_overviews (one body per day).
const C = require('../news/newsPackCore');

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const keyOf = it => { try { return C.articleKey(it.outlet_id, C.canonicalizeUrl(it.url)); } catch (_) { return null; } };
const filled = v => typeof v === 'string' && v.trim() ? v : null;
const parse = s => { try { return JSON.parse(s || 'null'); } catch (_) { return null; } };

// Freshness of an article (findability spec §6): its latest known time — changed by the outlet, its
// edition, or its publication. A story is as fresh as its freshest article.
const ms = v => Date.parse(v || '') || 0;
function freshness(it) { return Math.max(ms(it.changed_at), ms(it.edition_published_at), ms(it.published_at)); }
// Stories with a study article first, then freshness, then the number of outlets; inside a story the
// study articles first, then freshness. The rubric is a filter, never an order.
function sortStories(list) {
  const outlets = s => new Set(s.items.map(x => x.outlet_id)).size;
  const fresh = s => Math.max(0, ...s.items.map(freshness));
  for (const s of list) {
    s.items.sort((a, b) => (!!b.work_id - !!a.work_id) || (freshness(b) - freshness(a)));
    s.main = s.items.some(x => x.work_id);
  }
  return list.sort((a, b) => (b.main - a.main) || (fresh(b) - fresh(a)) || (outlets(b) - outlets(a)));
}

function createOverviewItems({ db, now = () => Date.now(), index = null }) {
  const iso = () => new Date(now()).toISOString();

  // o: a validated overview (v1 or v2) → { inserted, updated, kept }.
  async function upsert(o, { packId = null } = {}) {
    let inserted = 0, updated = 0, kept = 0;
    const edition = o.schema_version === 2 ? o.edition_id || null : null, t = iso(), done = [];
    for (const s of o.stories) for (const it of s.items) {
      const key = keyOf(it);
      if (!key) continue;
      done.push(key);
      const prev = await dbGet(db, 'SELECT item_key FROM news_overview_items WHERE item_key=?', [key]);
      if (!prev) {
        await dbRun(db, `INSERT INTO news_overview_items(item_key, day, story_key, edition_id, outlet_id, url, published_at, section, title_he, title_ru, subtitle_he, subtitle_ru,
          lead_he, lead_ru, paywalled, pack_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [key, o.day, s.story_key, edition, it.outlet_id, it.url, it.published_at || null, it.section || null, it.title_he, filled(it.title_ru), it.subtitle_he || null, filled(it.subtitle_ru),
            it.lead_he || null, filled(it.lead_ru), it.paywalled ? 1 : 0, packId, t, t]);
        inserted++;
        continue;
      }
      // A later pack fills translations; empty values never overwrite; a changed title (the outlet
      // updated the article) comes with its new Hebrew and translation.
      const r = await dbRun(db, `UPDATE news_overview_items SET title_ru=COALESCE(?, title_ru), subtitle_ru=COALESCE(?, subtitle_ru), lead_ru=COALESCE(?, lead_ru),
        title_he=CASE WHEN ? IS NOT NULL THEN ? ELSE title_he END, pack_id=?, updated_at=? WHERE item_key=?
        AND (COALESCE(?, title_ru) IS NOT title_ru OR COALESCE(?, subtitle_ru) IS NOT subtitle_ru OR COALESCE(?, lead_ru) IS NOT lead_ru OR (? IS NOT NULL AND ? IS NOT title_he))`,
        [filled(it.title_ru), filled(it.subtitle_ru), filled(it.lead_ru), it.changed ? it.title_he : null, it.title_he, packId, t, key,
          filled(it.title_ru), filled(it.subtitle_ru), filled(it.lead_ru), it.changed ? it.title_he : null, it.title_he]);
      if (r.changes) updated++; else kept++;
    }
    for (let i = 0; i < done.length; i += 200) {
      const part = done.slice(i, i + 200), q = part.map(() => '?').join(',');
      // A main draft still in work keeps its lease: dot may upload the overview before the articles.
      await dbRun(db, `UPDATE news_harvest_items SET overview_state='done', lease_until=CASE WHEN main_state='drafted' THEN lease_until ELSE NULL END
        WHERE url_key IN (${q}) OR canonical_key IN (${q})`, [...part, ...part]).catch(() => {});
    }
    if (index && done.length) await index.refresh(done).catch(e => console.warn('[news-index] refresh failed:', e && e.message));
    return { inserted, updated, kept };
  }

  async function days(day) {
    const q = (op, dir) => `SELECT day FROM (SELECT day FROM news_overview_items UNION SELECT day FROM news_overviews) WHERE day ${op} ? ORDER BY day ${dir} LIMIT 1`;
    const prev = await dbGet(db, q('<', 'DESC'), [day]), next = await dbGet(db, q('>', 'ASC'), [day]);
    return { prev: prev ? prev.day : null, next: next ? next.day : null };
  }
  async function linkWorks(byKey) {
    const ids = [...byKey.keys()];
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400);
      const works = await dbAll(db, `SELECT w.article_id, w.work_id FROM news_works w JOIN news_articles a ON a.article_id=w.article_id
        WHERE w.position_no=1 AND a.tier IN ('fresh','archive') AND w.article_id IN (${part.map(() => '?').join(',')})`, part);
      for (const w of works) for (const it of byKey.get(w.article_id)) it.work_id = w.work_id;
    }
  }

  async function linkSelected(byKey) {
    const ids = [...byKey.keys()];
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400), q = part.map(() => '?').join(',');
      const rows = await dbAll(db, `SELECT url_key, canonical_key, selected_by FROM news_harvest_items WHERE selected_by IS NOT NULL AND (url_key IN (${q}) OR canonical_key IN (${q}))`, [...part, ...part]).catch(() => []);
      for (const r of rows) for (const k of [r.url_key, r.canonical_key]) for (const it of byKey.get(k) || []) it.selected_by = r.selected_by;
    }
  }
  // → { day, prev, next, updated_at, editions:[{ edition_id, slot, published_at, target_ready_at }], stories:[{ story_key, main, continued?, items }] } | null
  async function day(wanted) {
    const valid = wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted);
    let d = valid ? wanted : null;
    if (!d) {
      const latest = await dbGet(db, 'SELECT MAX(day) day FROM (SELECT day FROM news_overview_items UNION SELECT day FROM news_overviews)');
      d = latest && latest.day;
      if (!d) return null;
    }
    const rows = await dbAll(db, `SELECT i.*, e.slot edition_slot, e.published_at edition_published_at FROM news_overview_items i
      LEFT JOIN news_editions e ON e.edition_id = i.edition_id WHERE i.day=?`, [d]);
    if (!rows.length) {
      const old = await dbGet(db, 'SELECT * FROM news_overviews WHERE day=?', [d]);
      if (!old) return null;
      const body = JSON.parse(old.body_json), byKey = new Map();
      for (const s of body.stories) for (const it of s.items) { const k = keyOf(it); if (k) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(it); } }
      await linkWorks(byKey); await linkSelected(byKey);
      return { day: d, ...(await days(d)), updated_at: old.updated_at, editions: [], stories: sortStories(body.stories) };
    }
    // The day of the release: its morning overview was stored the old way (one body) — merged, rows win.
    const old = await dbGet(db, 'SELECT body_json FROM news_overviews WHERE day=?', [d]);
    if (old) {
      const have = new Set(rows.map(r => r.item_key));
      for (const s of (parse(old.body_json) || { stories: [] }).stories || []) for (const it of s.items || []) {
        const k = keyOf(it);
        if (!k || have.has(k)) continue;
        have.add(k);
        rows.push({ item_key: k, story_key: s.story_key, outlet_id: it.outlet_id, url: it.url, published_at: it.published_at || null, section: it.section || null, title_he: it.title_he,
          title_ru: it.title_ru || null, subtitle_he: it.subtitle_he || null, subtitle_ru: it.subtitle_ru || null, lead_he: it.lead_he || null, lead_ru: it.lead_ru || null,
          paywalled: it.paywalled ? 1 : 0, edition_slot: null, edition_published_at: null, changed_at: null, updated_at: '' });
      }
    }
    const editions = await dbAll(db, `SELECT edition_id, slot, published_at, target_ready_at FROM news_editions WHERE day=? AND published_at IS NOT NULL ORDER BY published_at`, [d]);
    const stories = new Map(), byKey = new Map();
    for (const r of rows) {
      const it = { item_key: r.item_key, outlet_id: r.outlet_id, url: r.url, published_at: r.published_at, section: r.section, title_he: r.title_he, title_ru: r.title_ru || '',
        ...(r.subtitle_he ? { subtitle_he: r.subtitle_he, subtitle_ru: r.subtitle_ru || '' } : {}), ...(r.lead_he ? { lead_he: r.lead_he, lead_ru: r.lead_ru || '' } : {}),
        ...(r.paywalled ? { paywalled: true } : {}), edition_slot: r.edition_slot || null, edition_published_at: r.edition_published_at || null,
        ...(r.changed_at ? { changed_at: r.changed_at } : {}) };
      if (!stories.has(r.story_key)) stories.set(r.story_key, []);
      stories.get(r.story_key).push(it);
      if (!byKey.has(r.item_key)) byKey.set(r.item_key, []);
      byKey.get(r.item_key).push(it);
    }
    await linkWorks(byKey); await linkSelected(byKey);
    const keys = [...stories.keys()];
    const firstDay = new Map();
    for (let i = 0; i < keys.length; i += 400) {
      const part = keys.slice(i, i + 400);
      for (const s of await dbAll(db, `SELECT story_key, first_day FROM news_stories WHERE story_key IN (${part.map(() => '?').join(',')})`, part)) firstDay.set(s.story_key, s.first_day);
    }
    const list = sortStories(keys.map(k => ({ story_key: k, ...(firstDay.get(k) && firstDay.get(k) < d ? { continued: true } : {}), items: stories.get(k) })));
    const updated = rows.reduce((m, r) => r.updated_at > m ? r.updated_at : m, '');
    return { day: d, ...(await days(d)), updated_at: updated, editions, stories: list };
  }
  return { upsert, day };
}

module.exports = { createOverviewItems, freshness, sortStories };
