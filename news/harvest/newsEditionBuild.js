'use strict';
// One edition's archive for dot (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.1–§5.4).
// Takes what is not published yet and not leased by an edition dot is working on: new articles for
// «Обзор дня», the edition's main articles (new events and developments), the drafts carried over from
// earlier editions (with the reason in rework/ when the last try was refused).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const Outlets = require('../../public/js/news-outlets');
const C = require('../newsPackCore');
const { israelIso } = require('./newsExtract');
const { selectEdition, GROUPS } = require('./newsStories');
const { ACTIVE_MS } = require('./newsStoryStore');

const ORDER = ['politics', 'security', 'society', 'economy', 'world', 'culture', 'opinion'];
const OVERVIEW_WINDOW_MS = 72 * 3600e3; // bodies are kept 3 days
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const iso = ms => new Date(ms).toISOString();
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const groupOf = section => GROUPS[section] || 'society';
const parse = s => { try { return JSON.parse(s || 'null'); } catch (_) { return null; } };
const itemKeyOf = (outletId, url) => { try { return C.articleKey(outletId, C.canonicalizeUrl(url)); } catch (_) { return null; } };
// The page's canonical address: the same key the published article gets, so the site links them.
function canonicalOf(row) { const a = parse(row.data_json); if (a && a.canonical_url && Outlets.outletForUrl(a.canonical_url) === row.outlet_id) return a.canonical_url; return row.url; }
const memberOf = r => ({ id: r.url_key, row: r, outlet_id: r.outlet_id, section: r.section || 'news', title: r.title_he || r.feed_title || '',
  text: [r.subtitle_he, r.lead_he].filter(Boolean).join(' '), at: Date.parse(r.published_at || r.first_seen_at) || 0,
  full_ok: !!r.full_ok && !!r.data_json, paywalled: r.paywalled ? 1 : 0, images: r.images, chars: r.chars });

// One draft with its photos into the zip (used by the edition build and by dot's extra orders).
async function makeDraft({ zip, row, a, folder, storyKey, photo, draftOf, retrievedAt, imagesPerArticle, strictPhotos = false, sleep = async () => {} }) {
  const files = [], shas = {};
  for (const im of a.images.slice(0, imagesPerArticle)) {
    try {
      const bytes = await photo(im.src), file = 'img-' + (files.length + 1) + '.jpg';
      zip.addFile(folder + '/' + file, bytes);
      files.push({ ...im, file, source_url: im.src }); shas[file] = sha(bytes);
    } catch (err) { if (strictPhotos) throw err; /* ordinary editions can keep an article without a missing photo */ }
    await sleep();
  }
  if (files.length && !files.some(f => f.role === 'hero')) files[0] = { ...files[0], role: 'hero' };
  const draft = draftOf(a, { outletId: row.outlet_id, images: files, retrievedAt, storyKey });
  if (row.selected_by) Object.assign(draft.learning, { selected_by: row.selected_by, selection_note_ru: row.selection_note_ru || '' });
  zip.addFile(folder + '.draft.json', Buffer.from(JSON.stringify(draft, null, 1)));
  return { draft, shas, files };
}

async function buildEdition({ db, stories, editionId, day, slot, schedule, nowMs, photo, dir, draftOf, readme, limits, log = () => {}, sleep = async () => {}, extraFiles = {} }) {
  const now = nowMs, retrievedAt = israelIso(now), L = limits;
  // 1. New articles join their stories.
  const fresh = await dbAll(db, `SELECT * FROM news_harvest_items WHERE status='ready' AND story_key IS NULL AND first_seen_at >= ? ORDER BY first_seen_at`, [iso(now - OVERVIEW_WINDOW_MS)]);
  const assignable = fresh.map(memberOf).filter(m => m.title);
  if (assignable.length) {
    const keys = await stories.assign(assignable, { day });
    for (const m of assignable) { const k = keys.get(m.id); if (k) { await dbRun(db, 'UPDATE news_harvest_items SET story_key=? WHERE url_key=?', [k, m.id]); m.row.story_key = k; } }
  }
  // 2. What this edition carries: not yet in a published overview, not leased by an edition in work.
  const free = `(lease_until IS NULL OR lease_until < ?)`;
  // An older row comes back only when the outlet changed its title (it is already in «Обзор дня»).
  const knownRow = `(url_key IN (SELECT item_key FROM news_overview_items) OR canonical_key IN (SELECT item_key FROM news_overview_items))`;
  const rows = (await dbAll(db, `SELECT * FROM news_harvest_items WHERE status='ready' AND story_key IS NOT NULL AND overview_state IN ('todo','sent') AND ${free}
    AND (first_seen_at >= ? OR (overview_state='todo' AND ${knownRow})) ORDER BY first_seen_at`,
    [iso(now), iso(now - OVERVIEW_WINDOW_MS)]).catch(() => dbAll(db, `SELECT * FROM news_harvest_items WHERE status='ready' AND story_key IS NOT NULL AND overview_state IN ('todo','sent') AND ${free} AND first_seen_at >= ? ORDER BY first_seen_at`,
    [iso(now), iso(now - OVERVIEW_WINDOW_MS)]))).filter(r => r.title_he || r.feed_title);
  const carried = await dbAll(db, `SELECT * FROM news_harvest_items WHERE main_state='drafted' AND ${free} AND main_attempts < ? ORDER BY first_seen_at`, [iso(now), schedule.maxAttempts]);
  // 3. Main articles of the edition.
  const active = await stories.activeSince(now - ACTIVE_MS);
  const full = new Map(active.filter(s => s.full_at).map(s => [s.story_key, { full_outlets: s.full_outlets, full_title_he: s.full_title_he }]));
  const storyRow = new Map(active.map(s => [s.story_key, s]));
  const byStory = new Map();
  const reserved = new Set((await dbAll(db, `SELECT url_key FROM news_archive_orders
    WHERE expires_at>? AND emitted_pack_id IS NULL`, [iso(now)]).catch(() => [])).map(r => r.url_key));
  for (const r of rows) {
    if (r.main_state !== 'none' || reserved.has(r.url_key)) continue;
    if (!byStory.has(r.story_key)) byStory.set(r.story_key, { id: r.story_key, members: [] });
    byStory.get(r.story_key).members.push(memberOf(r));
  }
  for (const s of byStory.values()) { const sr = storyRow.get(s.id); if (sr) s.outlets_total = JSON.parse(sr.outlets_json || '[]').length; }
  const conf = schedule.slots[slot] || schedule.slots.midday;
  const picks = selectEdition([...byStory.values()], { slot: slot === 'extra' ? 'midday' : slot, main: conf.main, full })
    .sort((a, b) => slot === 'morning' ? (ORDER.indexOf(a.group) - ORDER.indexOf(b.group)) : 0);

  const zip = new AdmZip(), main = [], rework = [], draftOfKey = new Map();
  let n = 0, images = 0;
  async function addDraft(row, { kind, storyKey }) {
    const a = parse(row.data_json);
    if (!a) { await dbRun(db, `UPDATE news_harvest_items SET main_state='dropped', main_reason='NO_BODY' WHERE url_key=?`, [row.url_key]); return; }
    n++;
    const base = row.outlet_id + '-' + String(n).padStart(4, '0'), folder = (row.main_reason ? 'rework/' : '') + base;
    const { draft, shas, files } = await makeDraft({ zip, row, a, folder, storyKey, photo, draftOf, retrievedAt, imagesPerArticle: L.imagesPerArticle, sleep });
    images += files.length;
    draftOfKey.set(row.url_key, folder + '.draft.json');
    const entry = { draft: folder + '.draft.json', story_key: storyKey, kind, outlet_id: row.outlet_id, title_he: a.title_he, url: a.canonical_url,
      published_at: a.published_at, rows: draft.learning.versions[0].rows.length, images: shas, warnings: draft.quality.warnings };
    if (row.main_reason) rework.push({ ...entry, reason: row.main_reason, attempts: row.main_attempts }); else main.push(entry);
    // Guarded: a pack ingested while the photos were fetched may have published it meanwhile.
    await dbRun(db, `UPDATE news_harvest_items SET main_state='drafted', main_edition_id=?, draft_images_json=? WHERE url_key=? AND main_state IN ('none','drafted')`, [editionId, JSON.stringify(shas), row.url_key]);
    log('[news-edition] ' + folder + ' ' + String(a.title_he).slice(0, 60));
  }
  for (const row of carried) await addDraft(row, { kind: 'carried', storyKey: row.story_key });
  for (const p of picks) {
    await addDraft(p.pick.row, { kind: p.kind, storyKey: p.story.id });
    // The story now has its article: a later edition takes it only as a development.
    await stories.markFull(p.story.id, { outlets: p.outlets, title_he: p.pick.row.title_he, at: now });
  }

  // 4. «Обзор дня» v2: only rows that need translation.
  const overviewStories = new Map();
  for (const r of rows) {
    if (!overviewStories.has(r.story_key)) overviewStories.set(r.story_key, []);
    overviewStories.get(r.story_key).push(memberOf(r));
  }
  const drafted = new Set([...draftOfKey.keys()]);
  // A row already in «Обзор дня» comes back only because the outlet changed its title: dot translates the new one.
  const known = new Set();
  const keysOf = rows.map(r => itemKeyOf(r.outlet_id, canonicalOf(r))).filter(Boolean);
  for (let i = 0; i < keysOf.length; i += 400) {
    const part = keysOf.slice(i, i + 400);
    for (const x of await dbAll(db, `SELECT item_key FROM news_overview_items WHERE item_key IN (${part.map(() => '?').join(',')})`, part).catch(() => [])) known.add(x.item_key);
  }
  const rank = s => { const i = picks.findIndex(p => p.story.id === s.key); return i >= 0 ? i : 1e6; };
  const ordered = [...overviewStories.entries()].map(([key, ms]) => ({ key, ms })).sort((a, b) => (rank(a) - rank(b))
    || (new Set(b.ms.map(m => m.outlet_id)).size - new Set(a.ms.map(m => m.outlet_id)).size) || (Math.max(...b.ms.map(m => m.at)) - Math.max(...a.ms.map(m => m.at))));
  const overview = { schema: 'linguistpro-news-overview', schema_version: 2, edition_id: editionId, day, slot, created_at: retrievedAt,
    stories: ordered.map(({ key, ms }) => {
      const sr = storyRow.get(key);
      return { story_key: key, main: ms.some(m => drafted.has(m.id)) || !!(sr && sr.full_at), ...(sr && sr.first_day < day ? { continued: true } : {}),
        ...(sr && sr.full_title_ru ? { context_title_ru: sr.full_title_ru } : {}),
        items: ms.sort((a, b) => b.at - a.at).map(m => { const url = canonicalOf(m.row); return { item_key: itemKeyOf(m.outlet_id, url), outlet_id: m.outlet_id, url,
          published_at: m.row.published_at || m.row.feed_pub_at || null, section: m.section, title_he: m.title, title_ru: '',
          ...(m.row.subtitle_he ? { subtitle_he: m.row.subtitle_he, subtitle_ru: '' } : {}), ...(m.row.lead_he ? { lead_he: m.row.lead_he, lead_ru: '' } : {}),
          ...(m.row.paywalled ? { paywalled: true } : {}), ...(drafted.has(m.id) ? { draft: draftOfKey.get(m.id) } : {}), ...(known.has(itemKeyOf(m.outlet_id, url)) ? { changed: true } : {}) }; }) };
    }) };
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map(r => r.url_key);
    await dbRun(db, `UPDATE news_harvest_items SET overview_state='sent', edition_id=COALESCE(edition_id, ?) WHERE overview_state<>'done' AND url_key IN (${ids.map(() => '?').join(',')})`, [editionId, ...ids]);
  }

  // 5. The archive.
  const report = { day, slot, items: rows.length, stories: overviewStories.size, main: main.length, rework: rework.length, outlets: {},
    overview_keys: rows.map(r => r.url_key), main_keys: [...draftOfKey.keys()] };
  for (const r of rows) { const o = report.outlets[r.outlet_id] = report.outlets[r.outlet_id] || { items: 0, main: 0 }; o.items++; if (drafted.has(r.url_key)) o.main++; }
  // For dot's own choice (spec §4.5): the edition's articles nobody picked for the full treatment.
  const candidates = { edition_id: editionId, day, slot, items: rows.filter(r => r.main_state === 'none' && !reserved.has(r.url_key) && !drafted.has(r.url_key)).map(r => {
    const m = memberOf(r), url = canonicalOf(r);
    return { item_key: itemKeyOf(r.outlet_id, url), story_key: r.story_key, outlet_id: r.outlet_id, section: m.section, title_he: m.title, lead_he: r.lead_he || null,
      full_ok: m.full_ok, paywalled: !!r.paywalled, images: r.images || 0, url };
  }) };
  let fileName = null, bytes = 0;
  if (rows.length || draftOfKey.size) {
    zip.addFile('overview.json', Buffer.from(JSON.stringify(overview, null, 1)));
    zip.addFile('candidates.json', Buffer.from(JSON.stringify(candidates, null, 1)));
    for (const [name, text] of Object.entries(extraFiles)) zip.addFile(name, Buffer.from(String(text)));
    zip.addFile('README-dot.md', Buffer.from(readme));
    zip.addFile('harvest.json', Buffer.from(JSON.stringify({ schema: 'linguistpro-news-harvest', schema_version: 3, edition_id: editionId, day, slot, created_at: retrievedAt,
      items: rows.length, stories: overviewStories.size, main, rework, outlets: report.outlets }, null, 1)));
    fs.mkdirSync(dir, { recursive: true });
    fileName = `news-edition-${day}-${slot}-${editionId.slice(-6)}.zip`;
    const buf = zip.toBuffer();
    fs.writeFileSync(path.join(dir, fileName + '.part'), buf);
    fs.renameSync(path.join(dir, fileName + '.part'), path.join(dir, fileName));
    bytes = buf.length;
  }
  return { edition_id: editionId, main: main.length, rework: rework.length, articles: main.length + rework.length, images, overview_items: rows.length,
    stories: overviewStories.size, file_name: fileName, bytes, report };
}

module.exports = { buildEdition, makeDraft, itemKeyOf };
