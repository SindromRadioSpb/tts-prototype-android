'use strict';
// News section storage (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §9–§10).
// A pack is read in memory only (never extracted to disk); every article is checked and written
// on its own, and one queue serializes ingests so two packs carrying one article cannot both publish it.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const AdmZip = require('adm-zip');
const C = require('../news/newsPackCore');
const Outlets = require('../public/js/news-outlets');
const { buildNewsSnapshot, workIdFor } = require('../news/newsSnapshot');
const { wordGlossLayerReport } = require('../publication/materialArchive');
const { withTxnLock } = require('./txnLock');

const LIMITS = { packBytes: 50 * 1024 * 1024, articles: 1000, article: 256 * 1024, image: 1024 * 1024, gloss: 4 * 1024 * 1024, manifest: 1024 * 1024, total: 400 * 1024 * 1024 };
const FRESH_MS = 72 * 3600 * 1000, ARCHIVE_MS = 183 * 24 * 3600 * 1000;
const REJECT_OVER = 0.15, FLAG_OVER = 0.08;
const ENTRY = /^articles\/([a-z0-9-]{1,64})\/([A-Za-z0-9_-][A-Za-z0-9._-]{0,80})$/;
const DIR_ENTRY = /^articles\/([a-z0-9-]{1,64}\/)?$/;
const TOTAL_KEYS = ['published', 'archived', 'revised', 'duplicate', 'flagged', 'withdrawn', 'rejected'];

class NewsError extends Error { constructor(code, status = 400, detail) { super(code); this.code = code; this.status = status; this.detail = detail; } }
const fail = (code, status, detail) => { throw new NewsError(code, status, detail); };
const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbExec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
const newId = prefix => prefix + crypto.randomBytes(12).toString('hex');

function tierFor(publishedMs, nowMs) {
  const age = nowMs - publishedMs;
  return age <= FRESH_MS ? 'fresh' : age <= ARCHIVE_MS ? 'archive' : 'card';
}

// Reads one entry's bytes with a hard output cap: the declared size of a zip entry is not trusted.
function readEntry(entry, limit) {
  const h = entry.header;
  if (h.size > limit || h.compressedSize > limit) return null;
  const raw = entry.getCompressedData();
  if (h.method === 0) return raw.length > limit ? null : raw;
  if (h.method !== 8) return null;
  try { return zlib.inflateRawSync(raw, { maxOutputLength: limit }); } catch (_) { return null; }
}

function openPack(zipBuffer) {
  if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length > LIMITS.packBytes) fail('PACK_INVALID', 400, 'TOO_LARGE');
  let zip;
  try { zip = new AdmZip(zipBuffer); } catch (_) { fail('PACK_INVALID', 400, 'NOT_ZIP'); }
  let entries;
  try { entries = zip.getEntries(); } catch (_) { fail('PACK_INVALID', 400, 'NOT_ZIP'); }
  const byName = new Map();
  let total = 0;
  for (const e of entries) {
    const name = e.entryName;
    if (name === 'manifest.json' || name === 'README.txt' || DIR_ENTRY.test(name)) { /* allowed */ }
    else { const m = name.match(ENTRY); if (!m || m[2] === '.' || m[2] === '..' || m[2].includes('..')) fail('PACK_INVALID', 400, 'ENTRY_NAME'); }
    if (byName.has(name)) fail('PACK_INVALID', 400, 'ENTRY_DUPLICATE');
    total += e.header.size;
    if (total > LIMITS.total) fail('PACK_INVALID', 400, 'TOO_LARGE');
    byName.set(name, e);
  }
  const me = byName.get('manifest.json');
  const mb = me && readEntry(me, LIMITS.manifest);
  if (!mb) fail('PACK_INVALID', 400, 'MANIFEST_MISSING');
  let manifest;
  try { manifest = JSON.parse(mb.toString('utf8').replace(/^﻿/, '')); } catch (_) { fail('PACK_INVALID', 400, 'MANIFEST_JSON'); }
  if (!manifest || manifest.schema !== 'linguistpro-news-pack' || manifest.schema_version !== 1
    || !/^[0-9a-f-]{36}$/i.test(String(manifest.pack_id || '')) || !manifest.producer || typeof manifest.producer.name !== 'string'
    || !Array.isArray(manifest.articles) || (manifest.withdraw != null && !Array.isArray(manifest.withdraw))) fail('PACK_INVALID', 400, 'MANIFEST_SCHEMA');
  if (manifest.articles.length > LIMITS.articles) fail('PACK_INVALID', 400, 'TOO_MANY_ARTICLES');
  const seen = new Set();
  for (const a of manifest.articles) {
    const m = a && typeof a.path === 'string' && a.path.match(ENTRY);
    if (!m || m[2] !== 'article.json' || seen.has(a.path) || !/^[0-9a-f]{64}$/.test(String(a.sha256 || ''))) fail('PACK_INVALID', 400, 'MANIFEST_ARTICLE_PATH');
    seen.add(a.path);
  }
  return { manifest, byName };
}

function createNewsRepo({ db, now = () => Date.now() } = {}) {
  if (!db) fail('DB_NOT_AVAILABLE', 503);
  const nowMs = () => { const v = now(); return typeof v === 'number' ? v : Date.parse(v); };
  const iso = () => new Date(nowMs()).toISOString();
  let queue = Promise.resolve();
  const serialize = task => { const r = queue.then(task, task); queue = r.catch(() => {}); return r; };
  // Every explicit transaction on the shared connection goes through the process-wide lock (db/txnLock.js).
  const transaction = task => withTxnLock(async () => {
    await dbExec(db, 'BEGIN IMMEDIATE');
    try { const r = await task(); await dbExec(db, 'COMMIT'); return r; }
    catch (e) { try { await dbExec(db, 'ROLLBACK'); } catch (_) {} throw e; }
  });
  const event = (actor, type, { packId = null, articleId = null, detail = {} } = {}) => dbRun(db,
    'INSERT INTO news_events(event_id,at,actor_id,pack_id,article_id,type,detail_json) VALUES(?,?,?,?,?,?,?)',
    [newId('ne_'), iso(), String(actor.id), packId, articleId, type, JSON.stringify(detail)]);

  async function ingestArticle(actor, manifest, ref, byName) {
    const item = { path: ref.path, status: 'rejected' };
    const dir = ref.path.slice(0, -'article.json'.length);
    const entry = byName.get(ref.path);
    if (!entry) return { ...item, code: 'SCHEMA_INVALID' };
    if (entry.header.size > LIMITS.article) return { ...item, code: 'TOO_LARGE' };
    const bytes = readEntry(entry, LIMITS.article);
    if (!bytes) return { ...item, code: 'TOO_LARGE' };
    if (C.sha256(bytes) !== ref.sha256) return { ...item, code: 'SHA_MISMATCH' };
    let article;
    try { article = JSON.parse(bytes.toString('utf8').replace(/^﻿/, '')); } catch (_) { return { ...item, code: 'SCHEMA_INVALID' }; }
    const v = C.validateArticle(article, { now: nowMs() });
    if (!v.ok) return { ...item, code: v.code };
    const warnings = [...v.warnings];
    const overlap = C.articleOverlap(article);
    if (overlap > REJECT_OVER) return { ...item, code: 'VERBATIM_OVERLAP', overlap };
    if (article.image.mode === 'licensed') {
      const img = byName.get(dir + article.image.file);
      if (!img || !readEntry(img, LIMITS.image)) return { ...item, code: 'IMAGE_INVALID' };
      warnings.push('IMAGE_LICENSED_NOT_STORED_V1');
    }
    for (const version of article.learning.versions) {
      const missing = version.rows.filter(r => !r.he_niqqud).length;
      if (missing) warnings.push('NIQQUD_MISSING:' + version.level + ':' + missing);
    }
    const glossLayers = [];
    for (const version of article.learning.versions) {
      let layer = null;
      if (version.word_gloss_ai) {
        const ge = byName.get(dir + version.word_gloss_ai), gb = ge && readEntry(ge, LIMITS.gloss);
        let parsed = null;
        try { parsed = gb ? JSON.parse(gb.toString('utf8')) : null; } catch (_) { parsed = null; }
        const report = wordGlossLayerReport(parsed, version.rows.length);
        layer = report.layer;
        if (!parsed) warnings.push('WORD_GLOSS_UNREADABLE:' + version.level);
        else if (report.rejected.length) warnings.push('WORD_GLOSS_REJECTED:' + version.level + ':' + report.rejected.length);
      }
      glossLayers.push(layer);
    }
    const canonical = C.canonicalizeUrl(article.source.canonical_url);
    const articleId = C.articleKey(article.source.outlet_id, canonical);
    const publishedMs = Date.parse(article.source.published_at);
    const tier = tierFor(publishedMs, nowMs());
    const flagged = overlap > FLAG_OVER;
    const result = { ...item, article_id: articleId, overlap: Math.round(overlap * 1000) / 1000, warnings };
    return transaction(async () => {
      const existing = await dbGet(db, 'SELECT revision FROM news_articles WHERE article_id=?', [articleId]);
      if (existing && article.revision === existing.revision) return { ...result, status: 'duplicate' };
      if (existing && article.revision < existing.revision) return { ...result, status: 'rejected', code: 'REVISION_STALE' };
      const body = { ...article }; delete body.check;
      const s = article.source, l = article.learning, t = iso();
      const provenance = { prepared: article.prepared, quality: article.quality || null, producer: manifest.producer, pack_id: manifest.pack_id, uploaded_by: String(actor.id), paywalled: !!s.paywalled, url: s.url };
      const values = [s.outlet_id, canonical, article.revision, s.section, s.section_original_he, s.content_type, new Date(publishedMs).toISOString(),
        new Date(Date.parse(s.retrieved_at)).toISOString(), l.title_he, l.title_ru, l.summary_ru, C.normalizeHebrewText(l.title_he + ' ' + l.title_ru).toLowerCase(),
        s.original_title_he, s.author || null, l.story_key || null, l.sensitive.heavy ? 1 : 0, JSON.stringify(l.versions.map(x => x.level)),
        JSON.stringify(article.image), JSON.stringify(provenance), tier === 'card' ? null : JSON.stringify(body), tier, overlap, flagged ? 1 : 0, manifest.pack_id, t];
      if (existing) {
        await dbRun(db, `UPDATE news_articles SET outlet_id=?,canonical_url=?,revision=?,section=?,section_original_he=?,content_type=?,published_at=?,retrieved_at=?,
          title_he=?,title_ru=?,summary_ru=?,title_norm=?,original_title_he=?,author=?,story_key=?,heavy=?,levels_json=?,image_json=?,provenance_json=?,body_json=?,
          tier=?,overlap=?,flagged=?,pack_id=?,updated_at=?,withdrawn_reason=NULL WHERE article_id=?`, [...values, articleId]);
        await dbRun(db, 'DELETE FROM news_works WHERE article_id=?', [articleId]);
      } else {
        await dbRun(db, `INSERT INTO news_articles(outlet_id,canonical_url,revision,section,section_original_he,content_type,published_at,retrieved_at,
          title_he,title_ru,summary_ru,title_norm,original_title_he,author,story_key,heavy,levels_json,image_json,provenance_json,body_json,tier,overlap,flagged,pack_id,updated_at,
          article_id,created_at) VALUES(${Array(27).fill('?').join(',')})`, [...values, articleId, t]);
      }
      const works = [];
      if (tier !== 'card') for (const [i, version] of l.versions.entries()) {
        const workId = workIdFor(articleId, version.level);
        const { snapshot, snapshot_sha256 } = buildNewsSnapshot(body, version, { workId, glossLayer: glossLayers[i] });
        await dbRun(db, 'INSERT INTO news_works(work_id,article_id,level,position_no,snapshot_json,snapshot_sha256) VALUES(?,?,?,?,?,?)',
          [workId, articleId, version.level, i + 1, JSON.stringify(snapshot), snapshot_sha256]);
        works.push(workId);
      }
      const status = existing ? 'revised' : tier === 'fresh' ? 'published' : 'archived';
      await event(actor, status, { packId: manifest.pack_id, articleId, detail: { revision: article.revision, tier, overlap: result.overlap, flagged } });
      return { ...result, status, work_id: works[0] || null, flagged };
    });
  }

  async function withdrawByKey(actor, articleId, reason, packId = null) {
    return transaction(async () => {
      const row = await dbGet(db, 'SELECT tier FROM news_articles WHERE article_id=?', [articleId]);
      if (!row) return null;
      if (row.tier === 'withdrawn') return 'already';
      await dbRun(db, "UPDATE news_articles SET tier='withdrawn', withdrawn_reason=?, body_json=NULL, updated_at=? WHERE article_id=?", [String(reason || '').slice(0, 500), iso(), articleId]);
      await dbRun(db, 'DELETE FROM news_works WHERE article_id=?', [articleId]);
      await event(actor, 'withdrawn', { packId, articleId, detail: { reason: String(reason || '').slice(0, 500) } });
      return 'withdrawn';
    });
  }

  function ingestPack(actor, zipBuffer) {
    return serialize(async () => {
      const { manifest, byName } = openPack(zipBuffer);
      const items = [], warnings = [];
      for (const ref of manifest.articles) {
        let r;
        try { r = await ingestArticle(actor, manifest, ref, byName); }
        catch (e) { r = { path: ref.path, status: 'rejected', code: 'INTERNAL_ERROR' }; warnings.push('INTERNAL_ERROR:' + ref.path + ':' + String(e && e.message || e).slice(0, 200)); }
        items.push(r);
      }
      for (const w of manifest.withdraw || []) {
        const r = { path: 'withdraw', status: 'rejected' };
        try {
          if (!w || !Outlets.byId(w.outlet_id)) { items.push({ ...r, code: 'OUTLET_UNKNOWN' }); continue; }
          const articleId = C.articleKey(w.outlet_id, C.canonicalizeUrl(w.canonical_url));
          const done = await withdrawByKey(actor, articleId, w.reason, manifest.pack_id);
          items.push(done ? { ...r, article_id: articleId, status: done === 'already' ? 'duplicate' : 'withdrawn' } : { ...r, article_id: articleId, code: 'NOT_FOUND' });
        } catch (_) { items.push({ ...r, code: 'SCHEMA_INVALID' }); }
      }
      const totals = Object.fromEntries(TOTAL_KEYS.map(k => [k, 0]));
      for (const i of items) { totals[i.status] = (totals[i.status] || 0) + 1; if (i.flagged) totals.flagged++; }
      const receipt = { pack_id: manifest.pack_id, totals, items, warnings };
      await dbRun(db, `INSERT INTO news_packs(pack_id,uploaded_by,uploaded_at,producer_json,receipt_json) VALUES(?,?,?,?,?)
        ON CONFLICT(pack_id) DO UPDATE SET uploaded_by=excluded.uploaded_by, uploaded_at=excluded.uploaded_at, receipt_json=excluded.receipt_json`,
        [manifest.pack_id, String(actor.id), iso(), JSON.stringify(manifest.producer), JSON.stringify(receipt)]);
      return receipt;
    });
  }

  function withdrawArticle(actor, articleId, reason) {
    return serialize(async () => {
      if (!/^na_[0-9a-f]{24}$/.test(String(articleId || ''))) fail('NEWS_NOT_FOUND', 404);
      const done = await withdrawByKey(actor, articleId, reason);
      if (!done) fail('NEWS_NOT_FOUND', 404);
      return { article_id: articleId, tier: 'withdrawn' };
    });
  }
  function withdrawPack(actor, packId, reason) {
    return serialize(async () => {
      const rows = await dbAll(db, "SELECT article_id FROM news_articles WHERE pack_id=? AND tier<>'withdrawn'", [String(packId || '')]);
      for (const r of rows) await withdrawByKey(actor, r.article_id, reason, String(packId));
      return { count: rows.length };
    });
  }

  function toCard(row, work) {
    const readable = (row.tier === 'fresh' || row.tier === 'archive') && !!work;
    const prov = JSON.parse(row.provenance_json);
    return {
      article_id: row.article_id, work_id: readable ? work.work_id : null, snapshot_sha256: readable ? work.snapshot_sha256 : null,
      outlet_id: row.outlet_id, section: row.section, section_original_he: row.section_original_he, content_type: row.content_type,
      published_at: row.published_at, title_he: row.title_he, title_ru: row.title_ru, summary_ru: row.summary_ru, author: row.author,
      levels: JSON.parse(row.levels_json), image: JSON.parse(row.image_json), heavy: !!row.heavy, story_key: row.story_key,
      tier: row.tier, readable, original_url: row.canonical_url, prepared_by: prov.prepared && prov.prepared.by || null,
    };
  }
  async function firstWorks(articleIds) {
    if (!articleIds.length) return new Map();
    const rows = await dbAll(db, `SELECT work_id, article_id, snapshot_sha256 FROM news_works WHERE position_no=1 AND article_id IN (${articleIds.map(() => '?').join(',')})`, articleIds);
    return new Map(rows.map(r => [r.article_id, r]));
  }
  const CARD_COLS = 'article_id,outlet_id,canonical_url,section,section_original_he,content_type,published_at,title_he,title_ru,summary_ru,author,levels_json,image_json,heavy,story_key,tier,provenance_json';
  const encodeCursor = row => Buffer.from(JSON.stringify([row.published_at, row.article_id])).toString('base64url');
  function decodeCursor(c) {
    try { const v = JSON.parse(Buffer.from(String(c), 'base64url').toString('utf8')); if (Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'string')) return v; } catch (_) {}
    fail('NEWS_CURSOR_INVALID', 400);
  }
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  async function listFeed({ outlet_id, section, tier = 'fresh', q, from, to, cursor, limit = 30, no_heavy = false } = {}) {
    if (!Outlets.byId(outlet_id)) fail('OUTLET_UNKNOWN', 404);
    const where = ['outlet_id=?'], params = [outlet_id];
    // Freshness follows published_at, not only the stored tier: the hourly job may not have run yet.
    const freshCut = new Date(nowMs() - FRESH_MS).toISOString();
    if (tier === 'fresh') { where.push("tier='fresh' AND published_at>=?"); params.push(freshCut); }
    else if (tier === 'archive') { where.push("(tier IN ('archive','card') OR (tier='fresh' AND published_at<?))"); params.push(freshCut); }
    else fail('NEWS_TIER_INVALID', 400);
    if (section) { if (!C.SECTIONS.includes(section)) fail('NEWS_SECTION_INVALID', 400); where.push('section=?'); params.push(section); }
    if (no_heavy) where.push('heavy=0');
    const needle = q ? C.normalizeHebrewText(String(q).slice(0, 200)).toLowerCase() : '';
    if (needle) { where.push("title_norm LIKE ? ESCAPE '\\'"); params.push('%' + needle.replace(/[\\%_]/g, ch => '\\' + ch) + '%'); }
    if (from) { if (!DAY.test(from)) fail('NEWS_DATE_INVALID', 400); where.push('published_at>=?'); params.push(from + 'T00:00:00.000Z'); }
    if (to) { if (!DAY.test(to)) fail('NEWS_DATE_INVALID', 400); where.push('published_at<?'); params.push(new Date(Date.parse(to + 'T00:00:00.000Z') + 86400000).toISOString()); }
    if (cursor) { const [p, id] = decodeCursor(cursor); where.push('(published_at<? OR (published_at=? AND article_id<?))'); params.push(p, p, id); }
    const n = Math.max(1, Math.min(50, Math.trunc(Number(limit)) || 30));
    const rows = await dbAll(db, `SELECT ${CARD_COLS} FROM news_articles WHERE ${where.join(' AND ')} ORDER BY published_at DESC, article_id DESC LIMIT ?`, [...params, n + 1]);
    const page = rows.slice(0, n), works = await firstWorks(page.map(r => r.article_id));
    return { items: page.map(r => toCard(r, works.get(r.article_id))), next_cursor: rows.length > n ? encodeCursor(page[page.length - 1]) : null };
  }
  async function getCard(workId) {
    const m = String(workId || '').match(/^(na_[0-9a-f]{24})\.[a-z0-9]{2}$/);
    if (!m) return null;
    const row = await dbGet(db, `SELECT ${CARD_COLS} FROM news_articles WHERE article_id=?`, [m[1]]);
    if (!row) return null;
    // A withdrawn article shows the public nothing (spec §10); the reader only needs to know it is withdrawn.
    if (row.tier === 'withdrawn') return { article_id: row.article_id, tier: 'withdrawn', readable: false };
    const work = await dbGet(db, 'SELECT work_id, snapshot_sha256 FROM news_works WHERE work_id=?', [workId]);
    const card = toCard(row, work);
    if (work) { card.work_id = work.work_id; card.snapshot_sha256 = work.snapshot_sha256; }
    return card;
  }
  async function getWork(outletId, workId) {
    const row = await dbGet(db, `SELECT w.work_id, w.position_no, w.snapshot_json, w.snapshot_sha256, a.title_he, a.published_at, a.outlet_id
      FROM news_works w JOIN news_articles a ON a.article_id=w.article_id WHERE w.work_id=? AND a.outlet_id=? AND a.tier IN ('fresh','archive')`, [String(workId || ''), String(outletId || '')]);
    if (!row) fail('NEWS_NOT_FOUND', 404);
    const outlet = Outlets.byId(row.outlet_id), slug = 'news-' + row.outlet_id;
    return {
      corpus: { corpus_id: slug, slug, title: outlet.name_latin, description: '' },
      edition: { edition_id: slug, edition_number: 1, manifest_sha256: row.snapshot_sha256, item_count: 1, asset_count: 0, asset_missing: 0, package_complete: true, published_at: row.published_at },
      item: { public_work_id: row.work_id, position_no: row.position_no, title: row.title_he, creator: outlet.name_latin, snapshot: JSON.parse(row.snapshot_json),
        snapshot_sha256: row.snapshot_sha256, public_read_allowed: 1, public_stream_allowed: 0, package_download_allowed: 0, asset_missing: 0, package_complete: 1,
        expected_audio_count: 0, included_audio_count: 0 },
      assets: [], field_evidence: null,
    };
  }
  async function listOutlets() {
    const counts = await dbAll(db, "SELECT outlet_id, section, COUNT(*) n, MAX(published_at) latest FROM news_articles WHERE tier='fresh' AND published_at>=? GROUP BY outlet_id, section", [new Date(nowMs() - FRESH_MS).toISOString()]);
    return Outlets.OUTLETS.map(o => {
      const mine = counts.filter(c => c.outlet_id === o.id);
      return { outlet_id: o.id, fresh_count: mine.reduce((s, c) => s + c.n, 0), latest_at: mine.reduce((m, c) => (c.latest > m ? c.latest : m), '') || null,
        sections: mine.map(c => ({ section: c.section, count: c.n })).sort((a, b) => b.count - a.count) };
    });
  }
  function runLifecycle(atMs = nowMs()) {
    return serialize(() => transaction(async () => {
      const freshCut = new Date(atMs - FRESH_MS).toISOString(), cardCut = new Date(atMs - ARCHIVE_MS).toISOString(), t = new Date(atMs).toISOString();
      const toCardRows = await dbAll(db, "SELECT article_id FROM news_articles WHERE tier IN ('fresh','archive') AND published_at<?", [cardCut]);
      for (const r of toCardRows) await dbRun(db, 'DELETE FROM news_works WHERE article_id=?', [r.article_id]);
      const card = await dbRun(db, "UPDATE news_articles SET tier='card', body_json=NULL, updated_at=? WHERE tier IN ('fresh','archive') AND published_at<?", [t, cardCut]);
      const arch = await dbRun(db, "UPDATE news_articles SET tier='archive', updated_at=? WHERE tier='fresh' AND published_at<?", [t, freshCut]);
      const result = { to_archive: arch.changes, to_card: card.changes };
      if (result.to_archive || result.to_card) await event({ id: 'system' }, 'lifecycle', { detail: result });
      return result;
    }));
  }
  async function journal({ limit = 20 } = {}) {
    const n = Math.max(1, Math.min(100, Math.trunc(Number(limit)) || 20));
    const packs = await dbAll(db, 'SELECT pack_id, uploaded_by, uploaded_at, producer_json, receipt_json FROM news_packs ORDER BY uploaded_at DESC LIMIT ?', [n]);
    const events = await dbAll(db, 'SELECT at, actor_id, pack_id, article_id, type, detail_json FROM news_events ORDER BY at DESC LIMIT ?', [n * 5]);
    return {
      packs: packs.map(p => { const r = JSON.parse(p.receipt_json); return { pack_id: p.pack_id, uploaded_by: p.uploaded_by, uploaded_at: p.uploaded_at, producer: JSON.parse(p.producer_json), totals: r.totals, receipt: r }; }),
      events: events.map(e => ({ ...e, detail: JSON.parse(e.detail_json), detail_json: undefined })),
    };
  }

  return { ingestPack, withdrawArticle, withdrawPack, listFeed, getCard, getWork, listOutlets, runLifecycle, journal, _db: db, _iso: iso, _nowMs: nowMs, _serialize: serialize, _transaction: transaction, _event: event };
}

module.exports = { createNewsRepo, NewsError, tierFor, LIMITS, FRESH_MS, ARCHIVE_MS, dbGet, dbAll, dbRun };
