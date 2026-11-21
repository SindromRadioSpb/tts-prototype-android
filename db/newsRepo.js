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
const { createOverviewItems } = require('./newsOverviewItems');
const { fingerprintOf, paragraphsOfRows } = require('../news/newsFingerprint');
const { ARCHIVE_ORDER_ID, archiveDraftHash } = require('../news/newsArchiveOrder');

const LIMITS = { packBytes: 50 * 1024 * 1024, articles: 1000, article: 1024 * 1024, image: 1024 * 1024, newsImage: 600 * 1024, gloss: 4 * 1024 * 1024, manifest: 1024 * 1024, overview: 8 * 1024 * 1024, total: 400 * 1024 * 1024 };
const FRESH_MS = 72 * 3600 * 1000, ARCHIVE_MS = 183 * 24 * 3600 * 1000, TRASH_MS = 30 * 24 * 3600 * 1000, PHOTO_MS = 61 * 24 * 3600 * 1000;
const REJECT_OVER = 0.15, FLAG_OVER = 0.08;
// 'OR' version (the original one-to-one): below 50% of its 5-word windows found in the source it is
// not this article; below 85% it was edited or cut and the receipt says so.
const FIDELITY_REJECT = 0.5, FIDELITY_WARN = 0.85;
function imageMime(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
const imageUrl = (articleId, name, sha) => '/api/news/images/' + articleId + '/' + name + '?v=' + sha.slice(0, 12);
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
    if (name === 'manifest.json' || name === 'README.txt' || name === 'overview.json' || DIR_ENTRY.test(name)) { /* allowed */ }
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
  if (Object.hasOwn(manifest, 'archive_order_id') && (
    typeof manifest.archive_order_id !== 'string' || !ARCHIVE_ORDER_ID.test(manifest.archive_order_id)
    || manifest.articles.length !== 1 || manifest.edition_id != null || manifest.overview != null
    || manifest.withdraw != null || manifest.rejected != null || byName.has('overview.json')))
    fail('PACK_INVALID', 400, 'ARCHIVE_ORDER_SCOPE');
  const seen = new Set();
  for (const a of manifest.articles) {
    const m = a && typeof a.path === 'string' && a.path.match(ENTRY);
    if (!m || m[2] !== 'article.json' || seen.has(a.path) || !/^[0-9a-f]{64}$/.test(String(a.sha256 || ''))) fail('PACK_INVALID', 400, 'MANIFEST_ARTICLE_PATH');
    seen.add(a.path);
  }
  return { manifest, byName };
}

function createNewsRepo({ db, now = () => Date.now(), index = { refresh: async () => ({}) } } = {}) {
  if (!db) fail('DB_NOT_AVAILABLE', 503);
  const nowMs = () => { const v = now(); return typeof v === 'number' ? v : Date.parse(v); };
  const iso = () => new Date(nowMs()).toISOString();
  let queue = Promise.resolve();
  // The news index follows every change of a study article (findability spec §7.1); a failure never fails the write.
  const touch = keys => index.refresh((keys || []).filter(Boolean)).catch(e => console.warn('[news-index] refresh failed:', e && e.message));
  const overviewItems = createOverviewItems({ db, now, index });
  let editionListener = null;
  const setEditionListener = fn => { editionListener = typeof fn === 'function' ? fn : null; };
  // Since migration 083 «Обзор дня» is kept by article; before it, one body per day.
  let byRows = null;
  const hasRows = async () => byRows != null ? byRows : (byRows = !!(await dbGet(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_overview_items'")));
  let byOffload = null; // migration 086: days offloaded to the owner's PC
  const hasOffload = async () => byOffload != null ? byOffload : (byOffload = !!(await dbGet(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_offloads'")));
  let byPrints = null; // migration 084: fingerprints of the original
  const hasPrints = async () => byPrints != null ? byPrints : (byPrints = !!(await dbGet(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_article_fingerprints'")));
  let byArchiveOrders = null;
  const hasArchiveOrders = async () => byArchiveOrders != null ? byArchiveOrders : (byArchiveOrders = !!(await dbGet(db,
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='news_archive_orders'")));
  async function archiveOrderFor(id, actor) {
    if (!(await hasArchiveOrders())) return null;
    return dbGet(db, `SELECT * FROM news_archive_orders WHERE order_id=? AND actor_kind=? AND actor_id=?`,
      [id, actor.kind || '', String(actor.id)]);
  }
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
    let archiveOrder = null;
    if (manifest.archive_order_id) {
      archiveOrder = await archiveOrderFor(manifest.archive_order_id, actor);
      if (!archiveOrder) return { ...item, code: 'ARCHIVE_ORDER_UNKNOWN' };
      if (!archiveOrder.emitted_pack_id && archiveOrder.expires_at <= iso()) return { ...item, code: 'ARCHIVE_ORDER_EXPIRED' };
      const original = article.learning.versions.find(C.isOriginal);
      if (!original || article.source.paywalled || article.revision !== 1) return { ...item, code: 'ARCHIVE_SOURCE_CHANGED' };
      // Do not trust caller-provided shingle lists in this path. The OR layer is required
      // and compared byte-for-byte below (only derived study layers may differ).
      const raw = original.rows.map(r => r.he_plain).join(' ');
      article.check = { source_shingles: C.shingles(raw), source_word_count: raw.split(/\s+/).length };
    }
    const overlap = C.articleOverlap(article);
    if (overlap > REJECT_OVER) return { ...item, code: 'VERBATIM_OVERLAP', overlap };
    const fidelity = C.articleFidelity(article);
    if (fidelity != null && fidelity < FIDELITY_REJECT) return { ...item, code: 'ORIGINAL_MISMATCH', fidelity: Math.round(fidelity * 1000) / 1000 };
    if (fidelity != null && fidelity < FIDELITY_WARN) warnings.push('FIDELITY_LOW:' + Math.round(fidelity * 100));
    const photos = [];
    for (const im of article.images || []) {
      const ie = byName.get(dir + im.file), ib = ie && readEntry(ie, LIMITS.newsImage);
      const mime = ib && imageMime(ib);
      if (!mime) return { ...item, code: ie && !ib ? 'TOO_LARGE' : 'IMAGE_INVALID', image: im.file };
      photos.push({ name: im.file, mime, sha256: C.sha256(ib), bytes: ib });
    }
    if (article.image.mode === 'licensed') {
      const img = byName.get(dir + article.image.file);
      if (!img || !readEntry(img, LIMITS.image)) return { ...item, code: 'IMAGE_INVALID' };
      warnings.push('IMAGE_LICENSED_NOT_STORED_V1');
    }
    for (const version of article.learning.versions) {
      if (C.isOriginal(version)) continue;
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
    if (archiveOrder && (articleId !== archiveOrder.article_id
      || archiveDraftHash(article, Object.fromEntries(photos.map(p => [p.name, p.sha256]))) !== archiveOrder.draft_sha256))
      return { ...item, code: 'ARCHIVE_SOURCE_CHANGED' };
    // Checks before publishing (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.8).
    const orIndex = article.learning.versions.findIndex(C.isOriginal);
    const study = orIndex >= 0 ? C.checkStudyLayers(article, { glossLayer: glossLayers[orIndex] }) : [];
    if (study.length) return { ...item, article_id: articleId, code: 'STUDY_LAYER_INVALID', detail: study };
    // «выбрано dot» only for an article dot actually ordered (spec §5.6); otherwise the label is dropped.
    let selected = archiveOrder ? { selected_by: 'dot', selection_note_ru: archiveOrder.note_ru } : null;
    if (archiveOrder) Object.assign(article.learning, selected);
    else if (article.learning.selected_by === 'dot') {
      let o = await dbGet(db, "SELECT selection_note_ru FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND selected_by='dot' LIMIT 1", [articleId, articleId]).catch(() => null);
      // A later revision of an article dot chose keeps the label after the harvest rows are pruned (45 days).
      if (!o) { const prev = await dbGet(db, 'SELECT provenance_json FROM news_articles WHERE article_id=?', [articleId]); let pv = null; try { pv = prev && JSON.parse(prev.provenance_json); } catch (_) {} if (pv && pv.selected_by === 'dot') o = { selection_note_ru: pv.selection_note_ru || '' }; }
      if (o) selected = { selected_by: 'dot', selection_note_ru: String(article.learning.selection_note_ru || o.selection_note_ru || '').slice(0, 200) };
      else warnings.push('SELECTED_BY_UNVERIFIED');
    }
    if (!selected) { delete article.learning.selected_by; delete article.learning.selection_note_ru; }
    if (manifest.edition_id && photos.length) {
      const h = await dbGet(db, 'SELECT draft_images_json FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND draft_images_json IS NOT NULL', [articleId, articleId]).catch(() => null);
      let want = null; try { want = h && JSON.parse(h.draft_images_json); } catch (_) { want = null; }
      const changed = want && photos.find(ph => want[ph.name] && want[ph.name] !== ph.sha256);
      if (changed) return { ...item, article_id: articleId, code: 'IMAGE_CHANGED', image: changed.name };
    }
    const publishedMs = Date.parse(article.source.published_at);
    const tier = tierFor(publishedMs, nowMs());
    const flagged = overlap > FLAG_OVER;
    const result = { ...item, article_id: articleId, overlap: Math.round(overlap * 1000) / 1000, warnings };
    if (fidelity != null) result.fidelity = Math.round(fidelity * 1000) / 1000;
    const shaOf = new Map(photos.map(ph => [ph.name, ph.sha256]));
    const images = (article.images || []).map(im => ({ ...im, url: imageUrl(articleId, im.file, shaOf.get(im.file)) }));
    const hero = images.find(im => im.role === 'hero');
    const imageJson = hero ? { ...article.image, stored: { url: hero.url, credit_he: hero.credit_he || null, caption_he: hero.caption_he || null,
      caption_ru: hero.caption_ru || null, alt_he: hero.alt_he || null, alt_ru: hero.alt_ru || null, source_url: hero.source_url } } : article.image;
    return transaction(async () => {
      const existing = await dbGet(db, 'SELECT revision FROM news_articles WHERE article_id=?', [articleId]);
      if (archiveOrder) {
        // An expired order can't win after a replacement; already emitted orders cannot revise.
        const current = await archiveOrderFor(manifest.archive_order_id, actor);
        if (!current || current.draft_sha256 !== archiveOrder.draft_sha256) return { ...result, code: 'ARCHIVE_ORDER_UNKNOWN' };
        if (current.emitted_pack_id === manifest.pack_id && existing) {
          const work = await dbGet(db, `SELECT w.work_id FROM news_works w JOIN news_articles a ON a.article_id=w.article_id
            WHERE w.article_id=? AND w.position_no=1 AND a.tier IN ('fresh','archive')`, [articleId]);
          return { ...result, status: 'duplicate', work_id: work ? work.work_id : null };
        }
        if (existing || current.emitted_pack_id) return { ...result, code: 'ALREADY_TAKEN' };
        if (current.expires_at <= iso()) return { ...result, code: 'ARCHIVE_ORDER_EXPIRED' };
        const row = await dbGet(db, 'SELECT main_state, lease_until, paywalled FROM news_harvest_items WHERE url_key=?', [current.url_key]);
        if (!row) return { ...result, code: 'ARCHIVE_ORDER_EXPIRED' };
        if (row.paywalled) return { ...result, code: 'PAYWALL' };
        if (row.main_state !== 'none' || (row.lease_until && row.lease_until > iso())) return { ...result, code: 'ALREADY_TAKEN' };
      } else if (await hasArchiveOrders()) {
        const reserved = await dbGet(db, `SELECT 1 FROM news_archive_orders WHERE article_id=? AND expires_at>? AND emitted_pack_id IS NULL`, [articleId, iso()]);
        if (reserved) return { ...result, code: 'ARCHIVE_ORDER_REQUIRED' };
      }
      if (existing && article.revision === existing.revision) return { ...result, status: 'duplicate' };
      if (existing && article.revision < existing.revision) return { ...result, status: 'rejected', code: 'REVISION_STALE' };
      const body = { ...article }; delete body.check;
      if (images.length) body.images = images;
      const s = article.source, l = article.learning, t = iso();
      const provenance = { prepared: article.prepared, quality: article.quality || null, producer: manifest.producer, pack_id: manifest.pack_id, uploaded_by: String(actor.id), paywalled: !!s.paywalled, url: s.url,
        ...(selected || {}), ...(archiveOrder ? { archive_order_id: archiveOrder.order_id, parent_edition_id: archiveOrder.edition_id } : {}) };
      const values = [s.outlet_id, canonical, article.revision, s.section, s.section_original_he, s.content_type, new Date(publishedMs).toISOString(),
        new Date(Date.parse(s.retrieved_at)).toISOString(), l.title_he, l.title_ru, l.summary_ru, C.normalizeHebrewText(l.title_he + ' ' + l.title_ru).toLowerCase(),
        s.original_title_he, s.author || null, l.story_key || null, l.sensitive.heavy ? 1 : 0, JSON.stringify(l.versions.map(x => x.level)),
        JSON.stringify(imageJson), JSON.stringify(provenance), tier === 'card' ? null : JSON.stringify(body), tier, overlap, flagged ? 1 : 0, manifest.pack_id, t];
      if (existing) {
        await dbRun(db, `UPDATE news_articles SET outlet_id=?,canonical_url=?,revision=?,section=?,section_original_he=?,content_type=?,published_at=?,retrieved_at=?,
          title_he=?,title_ru=?,summary_ru=?,title_norm=?,original_title_he=?,author=?,story_key=?,heavy=?,levels_json=?,image_json=?,provenance_json=?,body_json=?,
          tier=?,overlap=?,flagged=?,pack_id=?,updated_at=?,withdrawn_reason=NULL WHERE article_id=?`, [...values, articleId]);
        await dbRun(db, 'DELETE FROM news_works WHERE article_id=?', [articleId]);
        if (await hasOffload()) await dbRun(db, 'UPDATE news_articles SET offloaded_day=NULL WHERE article_id=?', [articleId]); // a new revision is here again
      } else {
        await dbRun(db, `INSERT INTO news_articles(outlet_id,canonical_url,revision,section,section_original_he,content_type,published_at,retrieved_at,
          title_he,title_ru,summary_ru,title_norm,original_title_he,author,story_key,heavy,levels_json,image_json,provenance_json,body_json,tier,overlap,flagged,pack_id,updated_at,
          article_id,created_at) VALUES(${Array(27).fill('?').join(',')})`, [...values, articleId, t]);
      }
      // The original's fingerprint (title + each paragraph): a later re-check sees what the outlet changed.
      const orv = l.versions.find(C.isOriginal);
      if (orv && await hasPrints()) {
        // The outlet's own title (dot may shorten the study title); cut like the harvester cuts it.
        const fp = fingerprintOf(String(s.original_title_he || l.title_he).slice(0, 300), paragraphsOfRows(orv.rows));
        await dbRun(db, `INSERT INTO news_article_fingerprints(article_id, url, title_hash, para_hashes_json, created_at) VALUES (?,?,?,?,?)
          ON CONFLICT(article_id) DO UPDATE SET url=excluded.url, title_hash=excluded.title_hash, para_hashes_json=excluded.para_hashes_json, last_seen_json=NULL, created_at=excluded.created_at`,
          [articleId, canonical, fp.title_hash, JSON.stringify(fp.para_hashes), t]);
      }
      await dbRun(db, 'DELETE FROM news_images WHERE article_id=?', [articleId]);
      if (tier !== 'card') for (const ph of photos)
        await dbRun(db, 'INSERT INTO news_images(article_id,name,mime,sha256,bytes,created_at) VALUES(?,?,?,?,?,?)', [articleId, ph.name, ph.mime, ph.sha256, ph.bytes, t]);
      const works = [];
      if (tier !== 'card') for (const [i, version] of l.versions.entries()) {
        const workId = workIdFor(articleId, version.level);
        const { snapshot, snapshot_sha256 } = buildNewsSnapshot(body, version, { workId, glossLayer: glossLayers[i] });
        await dbRun(db, 'INSERT INTO news_works(work_id,article_id,level,position_no,snapshot_json,snapshot_sha256) VALUES(?,?,?,?,?,?)',
          [workId, articleId, version.level, i + 1, JSON.stringify(snapshot), snapshot_sha256]);
        works.push(workId);
      }
      const status = existing ? 'revised' : tier === 'fresh' ? 'published' : 'archived';
      if (archiveOrder) {
        await dbRun(db, 'UPDATE news_archive_orders SET emitted_pack_id=? WHERE order_id=?', [manifest.pack_id, archiveOrder.order_id]);
        // Existing main-state dedup, without linking to or re-accounting the old edition.
        await dbRun(db, "UPDATE news_harvest_items SET main_state='published' WHERE url_key=? AND main_state='none'", [archiveOrder.url_key]);
      }
      await event(actor, status, { packId: manifest.pack_id, articleId, detail: { revision: article.revision, tier, overlap: result.overlap, flagged,
        ...(archiveOrder ? { archive_order_id: archiveOrder.order_id, parent_edition_id: archiveOrder.edition_id } : {}) } });
      return { ...result, status, work_id: works[0] || null, flagged };
    });
  }

  async function withdrawByKey(actor, articleId, reason, packId = null) {
    return transaction(async () => {
      const row = await dbGet(db, 'SELECT tier FROM news_articles WHERE article_id=?', [articleId]);
      if (!row) return null;
      if (row.tier === 'withdrawn') return 'already';
      // «Удалить» = 30-day trash: hidden from everyone, body and works kept so «Восстановить» works.
      await dbRun(db, "UPDATE news_articles SET tier='withdrawn', withdrawn_reason=?, deleted_at=?, updated_at=? WHERE article_id=?", [String(reason || '').slice(0, 500), iso(), iso(), articleId]);
      await touch([articleId]);
      await event(actor, 'withdrawn', { packId, articleId, detail: { reason: String(reason || '').slice(0, 500) } });
      return 'withdrawn';
    });
  }

  // «Обзор дня» (§17): one per day; a later pack for the same day replaces it.
  async function ingestOverview(manifest, byName) {
    const ref = manifest.overview, entry = ref && ref.path === 'overview.json' && byName.get('overview.json');
    const buf = entry && readEntry(entry, LIMITS.overview);
    if (!buf) return { status: 'rejected', code: entry ? 'TOO_LARGE' : 'NOT_FOUND' };
    if (!/^[0-9a-f]{64}$/.test(String(ref.sha256 || '')) || C.sha256(buf) !== ref.sha256) return { status: 'rejected', code: 'SHA_MISMATCH' };
    let o; try { o = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (_) { return { status: 'rejected', code: 'OVERVIEW_INVALID' }; }
    const v = C.validateOverview(o);
    if (!v.ok) return { status: 'rejected', code: v.code };
    if (await hasRows()) {
      const u = await overviewItems.upsert(o, { packId: manifest.pack_id });
      return { status: 'published', day: o.day, stories: v.stories, items: v.items, warnings: v.warnings, inserted: u.inserted, updated: u.updated };
    }
    const t = iso(), body = { day: o.day, created_at: o.created_at || null, stories: o.stories };
    await dbRun(db, `INSERT INTO news_overviews(day, pack_id, body_json, stories, items, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(day) DO UPDATE SET pack_id=excluded.pack_id, body_json=excluded.body_json, stories=excluded.stories, items=excluded.items, updated_at=excluded.updated_at`,
      [o.day, manifest.pack_id, JSON.stringify(body), v.stories, v.items, t, t]);
    return { status: 'published', day: o.day, stories: v.stories, items: v.items, warnings: v.warnings };
  }
  // → { day, prev, next, stories:[{ story_key, main, items:[{…, work_id? }]}] } or null. An item links to
  // its full study article while that one is readable (feed or archive).
  async function getOverview(day) {
    if (await hasRows()) return overviewItems.day(day);
    const row = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? await dbGet(db, 'SELECT * FROM news_overviews WHERE day=?', [day])
      : await dbGet(db, 'SELECT * FROM news_overviews ORDER BY day DESC LIMIT 1');
    if (!row) return null;
    const body = JSON.parse(row.body_json);
    const keys = new Map();
    for (const s of body.stories) for (const it of s.items) { try { keys.set(C.articleKey(it.outlet_id, C.canonicalizeUrl(it.url)), it); } catch (_) {} }
    const ids = [...keys.keys()];
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400);
      const works = await dbAll(db, `SELECT w.article_id, w.work_id FROM news_works w JOIN news_articles a ON a.article_id=w.article_id
        WHERE w.position_no=1 AND a.tier IN ('fresh','archive') AND w.article_id IN (${part.map(() => '?').join(',')})`, part);
      for (const w of works) keys.get(w.article_id).work_id = w.work_id;
    }
    const prev = await dbGet(db, 'SELECT day FROM news_overviews WHERE day<? ORDER BY day DESC LIMIT 1', [row.day]);
    const next = await dbGet(db, 'SELECT day FROM news_overviews WHERE day>? ORDER BY day ASC LIMIT 1', [row.day]);
    return { day: row.day, prev: prev ? prev.day : null, next: next ? next.day : null, updated_at: row.updated_at, stories: body.stories };
  }

  function ingestPack(actor, zipBuffer) {
    return serialize(async () => {
      const { manifest, byName } = openPack(zipBuffer);
      const items = [], warnings = [];
      for (const ref of manifest.articles) {
        let r;
        try { r = await ingestArticle(actor, manifest, ref, byName); }
        catch (e) { r = { path: ref.path, status: 'rejected', code: 'INTERNAL_ERROR' }; warnings.push('INTERNAL_ERROR:' + ref.path + ':' + String(e && e.message || e).slice(0, 200)); }
        // An article refused before its key was known still names its source (the edition counts the attempt).
        if (!r.article_id && manifest.edition_id) {
          try { const a = JSON.parse(readEntry(byName.get(ref.path), LIMITS.article).toString('utf8')); r.article_key = C.articleKey(a.source.outlet_id, C.canonicalizeUrl(a.source.canonical_url)); } catch (_) {}
        }
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
      const receipt = { pack_id: manifest.pack_id, totals, items, warnings,
        ...(manifest.archive_order_id ? { archive_order_id: manifest.archive_order_id } : {}) };
      if (manifest.overview) receipt.overview = await ingestOverview(manifest, byName);
      // Editions (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.3): the harvester counts what was published.
      if (manifest.edition_id && editionListener) {
        try {
          await editionListener({ edition_id: String(manifest.edition_id), items: items.map(i => ({ status: i.status, code: i.code, article_id: i.article_id || i.article_key })),
            rejected: Array.isArray(manifest.rejected) ? manifest.rejected.slice(0, 1000) : [], overview: !!(receipt.overview && receipt.overview.status === 'published') });
        } catch (e) { warnings.push('EDITION_ACCOUNTING:' + String(e && e.message || e).slice(0, 200)); }
      }
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
    const image = JSON.parse(row.image_json);
    if (!readable && image && image.stored) delete image.stored;   // a card keeps no stored photos (§10)
    if (image && image.stored && Date.parse(row.published_at) < nowMs() - PHOTO_MS) delete image.stored;   // photos live 2 months (§17)
    return {
      article_id: row.article_id, work_id: readable ? work.work_id : null, snapshot_sha256: readable ? work.snapshot_sha256 : null,
      outlet_id: row.outlet_id, section: row.section, section_original_he: row.section_original_he, content_type: row.content_type,
      published_at: row.published_at, title_he: row.title_he, title_ru: row.title_ru, summary_ru: row.summary_ru, author: row.author,
      levels: JSON.parse(row.levels_json), image, heavy: !!row.heavy, story_key: row.story_key,
      tier: row.tier, readable, original_url: row.canonical_url, prepared_by: prov.prepared && prov.prepared.by || null,
      ...(prov.selected_by === 'dot' ? { selected_by: 'dot', selection_note_ru: prov.selection_note_ru || '' } : {}),
    };
  }
  async function firstWorks(articleIds) {
    if (!articleIds.length) return new Map();
    const rows = await dbAll(db, `SELECT work_id, article_id, snapshot_sha256 FROM news_works WHERE position_no=1 AND article_id IN (${articleIds.map(() => '?').join(',')})`, articleIds);
    return new Map(rows.map(r => [r.article_id, r]));
  }
  // Cards of study articles for the one feed (findability spec §7.2): article id → card, alive tiers only.
  async function cardsFor(articleIds) {
    const ids = [...new Set((articleIds || []).filter(id => ARTICLE_KEY.test(String(id))))], out = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const part = ids.slice(i, i + 200);
      const rows = await dbAll(db, `SELECT ${CARD_COLS} FROM news_articles WHERE tier IN ('fresh','archive','card') AND article_id IN (${part.map(() => '?').join(',')})`, part);
      const works = await firstWorks(rows.map(r => r.article_id));
      for (const r of rows) out.set(r.article_id, toCard(r, works.get(r.article_id)));
    }
    return out;
  }
  const ARTICLE_KEY = /^na_[0-9a-f]{24}$/;
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
    if (await hasOffload()) { const o = await dbGet(db, 'SELECT offloaded_day FROM news_articles WHERE article_id=?', [row.article_id]); if (o && o.offloaded_day && row.tier === 'archive') { card.offloaded = true; card.readable = false; card.work_id = null; } }
    if (work) { card.work_id = work.work_id; card.snapshot_sha256 = work.snapshot_sha256; }
    // The outlet updated the article after we took it (migration 084): the latest significant change.
    if (await hasPrints()) {
      const ch = await dbGet(db, `SELECT c.*, f.created_at fp_at FROM news_article_changes c LEFT JOIN news_article_fingerprints f ON f.article_id=c.article_id
        WHERE c.article_id=? AND c.significant=1 AND (f.created_at IS NULL OR c.detected_at > f.created_at) ORDER BY c.detected_at DESC, c.id DESC LIMIT 1`, [row.article_id]);
      // The outlet's modification time only when it is later than our copy; otherwise only when we noticed it.
      const outletTime = ch && ch.source_updated_at && ch.fp_at && Date.parse(ch.source_updated_at) > Date.parse(ch.fp_at) ? ch.source_updated_at : null;
      if (ch) card.source_change = { at: ch.detected_at, source_updated_at: outletTime, added: ch.added, changed: ch.changed, removed: ch.removed, title_changed: !!ch.title_changed };
    }
    return card;
  }
  async function getWork(outletId, workId) {
    const row = await dbGet(db, `SELECT w.work_id, w.position_no, w.snapshot_json, w.snapshot_sha256, a.title_he, a.published_at, a.outlet_id
      FROM news_works w JOIN news_articles a ON a.article_id=w.article_id WHERE w.work_id=? AND a.outlet_id=? AND a.tier IN ('fresh','archive')`, [String(workId || ''), String(outletId || '')]);
    if (!row) {
      // Offloaded to the owner's PC (§5.11): the article exists, its material is in the owner's archive.
      const m = String(workId || '').match(/^(na_[0-9a-f]{24})\./);
      if (m && await hasOffload()) { const o = await dbGet(db, 'SELECT offloaded_day FROM news_articles WHERE article_id=? AND outlet_id=?', [m[1], String(outletId || '')]); if (o && o.offloaded_day) fail('NEWS_OFFLOADED', 410); }
      fail('NEWS_NOT_FOUND', 404);
    }
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
  // A stored article photo, only while the article itself is readable (fresh or archive).
  async function getImage(articleId, name) {
    if (!ARTICLE_ID.test(String(articleId || '')) || !C.IMAGE_FILE.test(String(name || ''))) return null;
    return dbGet(db, `SELECT i.mime, i.sha256, i.bytes FROM news_images i JOIN news_articles a ON a.article_id=i.article_id
      WHERE i.article_id=? AND i.name=? AND a.tier IN ('fresh','archive')`, [articleId, name]);
  }
  async function listOutlets() {
    const counts = await dbAll(db, "SELECT outlet_id, section, COUNT(*) n, MAX(published_at) latest FROM news_articles WHERE tier='fresh' AND published_at>=? GROUP BY outlet_id, section", [new Date(nowMs() - FRESH_MS).toISOString()]);
    return Outlets.OUTLETS.map(o => {
      const mine = counts.filter(c => c.outlet_id === o.id);
      return { outlet_id: o.id, fresh_count: mine.reduce((s, c) => s + c.n, 0), latest_at: mine.reduce((m, c) => (c.latest > m ? c.latest : m), '') || null,
        sections: mine.map(c => ({ section: c.section, count: c.n })).sort((a, b) => b.count - a.count) };
    });
  }
  let carded = [];
  function runLifecycle(atMs = nowMs()) {
    return serialize(() => transaction(async () => {
      const freshCut = new Date(atMs - FRESH_MS).toISOString(), cardCut = new Date(atMs - ARCHIVE_MS).toISOString(), t = new Date(atMs).toISOString();
      const toCardRows = await dbAll(db, "SELECT article_id FROM news_articles WHERE tier IN ('fresh','archive') AND published_at<?", [cardCut]);
      carded = toCardRows.map(r => r.article_id);
      for (const r of toCardRows) { await dbRun(db, 'DELETE FROM news_works WHERE article_id=?', [r.article_id]); await dbRun(db, 'DELETE FROM news_images WHERE article_id=?', [r.article_id]); }
      const card = await dbRun(db, "UPDATE news_articles SET tier='card', body_json=NULL, updated_at=? WHERE tier IN ('fresh','archive') AND published_at<?", [t, cardCut]);
      // An offloaded article that became a card has nothing left to bring back (§5.11).
      if (await hasOffload()) await dbRun(db, "UPDATE news_articles SET offloaded_day=NULL WHERE tier='card' AND offloaded_day IS NOT NULL");
      const arch = await dbRun(db, "UPDATE news_articles SET tier='archive', updated_at=? WHERE tier='fresh' AND published_at<?", [t, freshCut]);
      const purgeCut = new Date(atMs - TRASH_MS).toISOString();
      await dbRun(db, "DELETE FROM news_images WHERE article_id IN (SELECT article_id FROM news_articles WHERE tier='withdrawn' AND COALESCE(deleted_at, updated_at)<?)", [purgeCut]);
      const purged = await dbRun(db, "DELETE FROM news_articles WHERE tier='withdrawn' AND COALESCE(deleted_at, updated_at)<?", [purgeCut]);
      // Photos live 2 months, not the whole archive half-year: ~20 full articles a day would not fit the disk (§17).
      const photos = await dbRun(db, 'DELETE FROM news_images WHERE article_id IN (SELECT article_id FROM news_articles WHERE published_at<?)', [new Date(atMs - PHOTO_MS).toISOString()]);
      try { await dbRun(db, 'DELETE FROM news_overviews WHERE day<?', [new Date(atMs - ARCHIVE_MS).toISOString().slice(0, 10)]); } catch (_) { /* before migration 082 */ }
      const result = { to_archive: arch.changes, to_card: card.changes, purged: purged.changes, photos_removed: photos.changes };
      if (result.to_archive || result.to_card || result.purged || result.photos_removed) await event({ id: 'system' }, 'lifecycle', { detail: result });
      return result;
    }));
  }
  // ---- «В архив» / «Вернуть в ленту» / «Удалить» / «Восстановить» (owner decision 2026-11-13) ----
  const ARTICLE_ID = /^na_[0-9a-f]{24}$/;
  async function rowFor(articleId) {
    if (!ARTICLE_ID.test(String(articleId || ''))) fail('NEWS_NOT_FOUND', 404);
    const row = await dbGet(db, 'SELECT article_id, tier, published_at, deleted_at, body_json FROM news_articles WHERE article_id=?', [articleId]);
    if (!row) fail('NEWS_NOT_FOUND', 404);
    return row;
  }
  const purgeAt = deletedAt => new Date(Date.parse(deletedAt) + TRASH_MS).toISOString();
  function archiveArticle(actor, articleId) {
    return serialize(() => transaction(async () => {
      const row = await rowFor(articleId);
      if (row.tier === 'withdrawn') fail('NEWS_DELETED', 409);
      if (row.tier === 'fresh') {
        await dbRun(db, "UPDATE news_articles SET tier='archive', updated_at=? WHERE article_id=?", [iso(), articleId]);
        await event(actor, 'archived', { articleId });
      }
      return { article_id: articleId, tier: row.tier === 'fresh' ? 'archive' : row.tier };
    }));
  }
  function unarchiveArticle(actor, articleId) {
    return serialize(() => transaction(async () => {
      const row = await rowFor(articleId);
      if (row.tier === 'fresh') return { article_id: articleId, tier: 'fresh' };
      if (row.tier !== 'archive') fail(row.tier === 'withdrawn' ? 'NEWS_DELETED' : 'NEWS_TOO_OLD_FOR_FEED', 409);
      if (nowMs() - Date.parse(row.published_at) > FRESH_MS) fail('NEWS_TOO_OLD_FOR_FEED', 409);
      await dbRun(db, "UPDATE news_articles SET tier='fresh', updated_at=? WHERE article_id=?", [iso(), articleId]);
      await event(actor, 'unarchived', { articleId });
      return { article_id: articleId, tier: 'fresh' };
    }));
  }
  function deleteArticle(actor, articleId, reason) {
    return serialize(async () => {
      await rowFor(articleId);
      await withdrawByKey(actor, articleId, reason);
      const row = await rowFor(articleId);
      return { article_id: articleId, tier: 'withdrawn', purge_at: purgeAt(row.deleted_at || iso()) };
    });
  }
  function restoreArticle(actor, articleId) {
    return serialize(() => transaction(async () => {
      const row = await rowFor(articleId);
      if (row.tier !== 'withdrawn') return { article_id: articleId, tier: row.tier };
      const tier = tierFor(Date.parse(row.published_at), nowMs());
      if (tier === 'card') {
        await dbRun(db, 'DELETE FROM news_works WHERE article_id=?', [articleId]);
        await dbRun(db, 'DELETE FROM news_images WHERE article_id=?', [articleId]);
        await dbRun(db, "UPDATE news_articles SET tier='card', body_json=NULL, deleted_at=NULL, withdrawn_reason=NULL, updated_at=? WHERE article_id=?", [iso(), articleId]);
      } else {
        await dbRun(db, 'UPDATE news_articles SET tier=?, deleted_at=NULL, withdrawn_reason=NULL, updated_at=? WHERE article_id=?', [tier, iso(), articleId]);
      }
      await event(actor, 'restored', { articleId, detail: { tier } });
      return { article_id: articleId, tier };
    }));
  }
  async function listForEditor({ view = 'feed', outlet_id, q, cursor, limit = 30 } = {}) {
    const where = [], params = [], freshCut = new Date(nowMs() - FRESH_MS).toISOString();
    if (view === 'feed') { where.push("tier='fresh' AND published_at>=?"); params.push(freshCut); }
    else if (view === 'archive') { where.push("(tier IN ('archive','card') OR (tier='fresh' AND published_at<?))"); params.push(freshCut); }
    else if (view === 'deleted') where.push("tier='withdrawn'");
    else fail('NEWS_VIEW_INVALID', 400);
    if (outlet_id) { if (!Outlets.byId(outlet_id)) fail('OUTLET_UNKNOWN', 404); where.push('outlet_id=?'); params.push(outlet_id); }
    const needle = q ? C.normalizeHebrewText(String(q).slice(0, 200)).toLowerCase() : '';
    if (needle) { where.push("title_norm LIKE ? ESCAPE '\\'"); params.push('%' + needle.replace(/[\\%_]/g, ch => '\\' + ch) + '%'); }
    if (cursor) { const [p, id] = decodeCursor(cursor); where.push('(published_at<? OR (published_at=? AND article_id<?))'); params.push(p, p, id); }
    const n = Math.max(1, Math.min(50, Math.trunc(Number(limit)) || 30));
    const rows = await dbAll(db, `SELECT ${CARD_COLS}, deleted_at FROM news_articles WHERE ${where.join(' AND ')} ORDER BY published_at DESC, article_id DESC LIMIT ?`, [...params, n + 1]);
    const page = rows.slice(0, n), works = await firstWorks(page.map(r => r.article_id));
    return { items: page.map(r => {
      const card = toCard(r, works.get(r.article_id));
      if (r.tier === 'withdrawn') { card.deleted_at = r.deleted_at; card.purge_at = purgeAt(r.deleted_at || new Date(nowMs()).toISOString()); }
      card.can_return_to_feed = card.tier === 'archive' && nowMs() - Date.parse(r.published_at) <= FRESH_MS;
      return card;
    }), next_cursor: rows.length > n ? encodeCursor(page[page.length - 1]) : null };
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

  const after = (fn, keysOf) => async (...args) => { const r = await fn(...args); await touch(keysOf(r, args)); return r; };
  const ingestPackIndexed = after(ingestPack, r => (r.items || []).map(i => i.article_id));
  const restoreIndexed = after(restoreArticle, (r, a) => [a[1]]);
  const lifecycleIndexed = after(runLifecycle, () => { const k = carded; carded = []; return k; });
  return { setEditionListener, ingestPack: ingestPackIndexed, getOverview, getImage, withdrawArticle, withdrawPack, listFeed, getCard, getWork, listOutlets, cardsFor, runLifecycle: lifecycleIndexed, journal, archiveArticle, unarchiveArticle, deleteArticle, restoreArticle: restoreIndexed, listForEditor, _db: db, _iso: iso, _nowMs: nowMs, _serialize: serialize, _transaction: transaction, _event: event };
}

module.exports = { createNewsRepo, NewsError, tierFor, LIMITS, FRESH_MS, ARCHIVE_MS, dbGet, dbAll, dbRun };
