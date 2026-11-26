'use strict';
// The home PC's harvest of an outlet closed to the server (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §6).
// The PC runs the same harvester and hands in every ready card of news_harvest_items — with the full text and
// without — right after the page is read, before any edition is made; the server writes them into the same
// table, so the ordinary edition build, «Обзор дня», search and dot's packs take them with no path of their own.
// One answer per batch_id (a resend after a lost reply changes nothing); a body is only ever added, never
// erased; the outlet is fresh only by the time the PC harvested, never by the time a batch arrived.
const Outlets = require('../public/js/news-outlets');
const C = require('./newsPackCore');
const { NewsError, dbGet, dbRun } = require('../db/newsRepo');
const { canFetchArchiveImage } = require('./harvest/newsHarvestSources');
const { bodyOf } = require('./harvest/newsBody');

const MAX_ITEMS = 300, MAX_PHOTO = 600 * 1024, FUTURE_SLACK_MS = 5 * 60e3, MAX_TEXT = 200 * 1024, MAX_IMAGES = 12, PHOTO_DAYS = 3;
const QUOTA_BYTES = 300 * 1024 * 1024; // a day per key: a leaked key cannot fill the disk
const str = (v, max) => typeof v === 'string' && v.trim() ? v.slice(0, max) : null;
const isoOf = v => { const t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : null; };
const keyOf = (outletId, url) => { try { return C.articleKey(outletId, C.canonicalizeUrl(url)); } catch (_) { return null; } };
const wholeJpeg = b => Buffer.isBuffer(b) && b.length > 1000 && b.length <= MAX_PHOTO && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
const likeEscape = s => s.replace(/[%_\\]/g, m => '\\' + m);

// The article as the harvester makes it (newsExtract.js), rebuilt field by field: nothing the PC sends is stored
// as sent. Photos only from the outlet's own photo hosts (the edition build fetches them); the canonical address
// only on the outlet's site; the text capped.
function cleanBody(raw, outletId, url) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.paragraphs)) return null;
  const paragraphs = [];
  let size = 0;
  for (const p of raw.paragraphs) {
    if (typeof p !== 'string' || !p.trim()) continue;
    if (size + p.length > MAX_TEXT) break;
    paragraphs.push(p); size += p.length;
  }
  const images = (Array.isArray(raw.images) ? raw.images : []).filter(im => im && typeof im.src === 'string' && canFetchArchiveImage(outletId, im.src)).slice(0, MAX_IMAGES)
    .map(im => ({ src: im.src, role: im.role === 'hero' ? 'hero' : 'inline', ...(Number.isInteger(im.after_p) && im.after_p >= 0 ? { after_p: im.after_p } : {}),
      caption_he: str(im.caption_he, 400) || '', credit_he: str(im.credit_he, 400) || '', alt_he: str(im.alt_he, 400) || '' }));
  const canonical = typeof raw.canonical_url === 'string' && Outlets.outletForUrl(raw.canonical_url) === outletId ? raw.canonical_url : url;
  return { url, canonical_url: canonical, title_he: str(raw.title_he, 500) || '', subtitle_he: str(raw.subtitle_he, 600) || '', author: str(raw.author, 300),
    published_at: str(raw.published_at, 40), updated_at: str(raw.updated_at, 40), section_original_he: str(raw.section_original_he, 100), section: str(raw.section, 40) || 'news',
    content_type: raw.content_type === 'opinion' ? 'opinion' : 'news', paywalled: !!raw.paywalled, paragraphs, images };
}

function createRelayIntake({ db, outletState, index = { refresh: async () => {} }, storePhoto, now = () => Date.now(), quotaBytes = QUOTA_BYTES }) {
  const iso = () => new Date(now()).toISOString();
  // key_id + outlet → { day, bytes }: one PC harvests several outlets, each has its own day (a restart forgets it).
  const used = new Map();
  function charge(keyId, bytes) {
    const day = iso().slice(0, 10), u = used.get(keyId);
    const cur = u && u.day === day ? u : { day, bytes: 0 };
    if (cur.bytes + bytes > quotaBytes) throw new NewsError('RELAY_QUOTA', 429);
    cur.bytes += bytes; used.set(keyId, cur);
  }

  async function homeOutlet(outletId) {
    const st = typeof outletId === 'string' ? await outletState.get(outletId) : null;
    if (!st || !st.enabled || st.route !== 'home_pc') throw new NewsError('NOT_HOME_PC', 409);
    return st;
  }

  async function accept(keyId, batch) {
    const b = batch || {};
    if (!/^[0-9a-f]{64}$/.test(String(b.batch_id || '')) || !Array.isArray(b.items) || b.items.length > MAX_ITEMS) throw new NewsError('BAD_BATCH', 400);
    const done = await dbGet(db, 'SELECT result_json FROM news_relay_batches WHERE batch_id=?', [b.batch_id]);
    if (done) return JSON.parse(done.result_json);
    await homeOutlet(b.outlet_id);
    const harvestedAt = isoOf(b.harvested_at);
    if (!harvestedAt || Date.parse(harvestedAt) > now() + FUTURE_SLACK_MS) throw new NewsError('BAD_HARVESTED_AT', 400);
    charge(String(keyId) + '|' + b.outlet_id, Buffer.byteLength(JSON.stringify(b.items)));

    const result = { batch_id: b.batch_id, accepted: 0, updated: 0, kept: 0, rejected: [] }, touched = [];
    const nowIso = iso();
    for (const it of b.items) {
      const url = it && typeof it.url === 'string' ? it.url : '';
      if (Outlets.outletForUrl(url) !== b.outlet_id) { result.rejected.push({ url: url.slice(0, 300), code: 'URL_OUTLET_MISMATCH' }); continue; }
      const key = keyOf(b.outlet_id, url);
      if (!key) { result.rejected.push({ url: url.slice(0, 300), code: 'BAD_URL' }); continue; }
      const article = cleanBody(it.body, b.outlet_id, url);
      const body = article ? JSON.stringify(article) : null;
      const fullText = !!(article && article.paragraphs.length && it.full_ok);
      const firstSeen = isoOf(it.first_seen_at);
      const f = { feedTitle: str(it.feed_title, 500), feedSection: str(it.feed_section, 100), feedImage: str(it.feed_image, 1000), feedPub: isoOf(it.feed_pub_at),
        firstSeen: firstSeen && firstSeen < nowIso ? firstSeen : nowIso, reason: str(it.reason, 60), published: isoOf(it.published_at), section: str(it.section, 40),
        contentType: str(it.content_type, 40), title: str(it.title_he, 500), subtitle: str(it.subtitle_he, 1000), lead: str(it.lead_he, 2000), paywalled: it.paywalled ? 1 : 0,
        fullOk: fullText ? 1 : 0, chars: article ? article.paragraphs.join(' ').length : 0, images: article ? article.images.length : 0 };
      const canonical = article ? keyOf(b.outlet_id, article.canonical_url) : null;
      const cur = await dbGet(db, 'SELECT url_key, data_json, data_gz, status FROM news_harvest_items WHERE url_key=?', [key]);
      if (!cur) {
        // A page whose canonical address is already in the slice under another key is the same article.
        if (canonical && canonical !== key && await dbGet(db, 'SELECT 1 FROM news_harvest_items WHERE url_key=? OR canonical_key=?', [canonical, canonical])) { result.kept++; continue; }
        await dbRun(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, feed_title, feed_section, feed_image, feed_pub_at, first_seen_at, status, reason,
          published_at, section, content_type, title_he, subtitle_he, lead_he, paywalled, full_ok, chars, images, data_json, canonical_key, run_id)
          VALUES (?,?,?,?,?,?,?,?,'ready',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [key, b.outlet_id, url, f.feedTitle, f.feedSection, f.feedImage, f.feedPub, f.firstSeen, f.reason, f.published, f.section, f.contentType, f.title, f.subtitle, f.lead,
          f.paywalled, f.fullOk, f.chars, f.images, body, canonical, 'relay:' + b.batch_id.slice(0, 12)]);
        result.accepted++; touched.push(key);
      } else if (body && !cur.data_json && !cur.data_gz) {
        // The text only grows: a card that came without it gets it; the first-seen time stays.
        await dbRun(db, `UPDATE news_harvest_items SET status='ready', reason=?, published_at=COALESCE(?, published_at), section=?, content_type=?, title_he=?, subtitle_he=?, lead_he=?,
          paywalled=?, full_ok=?, chars=?, images=?, data_json=?, canonical_key=COALESCE(?, canonical_key) WHERE url_key=?`,
        [f.reason, f.published, f.section, f.contentType, f.title, f.subtitle, f.lead, f.paywalled, f.fullOk, f.chars, f.images, body, canonical, key]);
        result.updated++; touched.push(key);
      } else if (cur.status !== 'ready') {
        // A card the server queued before the outlet moved to the PC (it never reads that page now): the PC's card makes it ready.
        await dbRun(db, `UPDATE news_harvest_items SET status='ready', reason=?, published_at=COALESCE(?, published_at), section=COALESCE(?, section), content_type=COALESCE(?, content_type),
          title_he=COALESCE(?, title_he), feed_title=COALESCE(feed_title, ?) WHERE url_key=?`, [f.reason, f.published, f.section, f.contentType, f.title, f.feedTitle, key]);
        result.updated++; touched.push(key);
      } else result.kept++;
    }
    if (touched.length) await Promise.resolve(index.refresh(touched)).catch(() => {});
    // Fresh by the PC's harvest time only: an older batch delivered late never moves it (recordPoll never goes back).
    // A poll that failed on the PC (its feeds closed, no network) is an error, never a harvest.
    await outletState.recordPoll(b.outlet_id, b.poll_ok === false ? { error: 'PC:' + (str(b.poll_error, 200) || 'FEED_FAILED') } : { okAt: harvestedAt });
    await dbRun(db, 'INSERT OR IGNORE INTO news_relay_batches(batch_id, key_id, outlet_id, harvested_at, received_at, result_json) VALUES (?,?,?,?,?,?)',
      [b.batch_id, String(keyId), b.outlet_id, harvestedAt, nowIso, JSON.stringify(result)]);
    return result;
  }

  // A photo the PC fetched for a recent card it handed in: only an address recorded in that outlet's article body.
  async function putPhoto(keyId, outletId, src, bytes) {
    await homeOutlet(outletId);
    if (typeof src !== 'string' || src.length > 1000 || !canFetchArchiveImage(outletId, src) || !wholeJpeg(bytes)) throw new NewsError('PHOTO_REJECTED', 400);
    charge(String(keyId) + '|' + outletId, bytes.length);
    const since = new Date(now() - PHOTO_DAYS * 86400e3).toISOString();
    const rows = await new Promise((res, rej) => db.all("SELECT data_json FROM news_harvest_items WHERE outlet_id=? AND first_seen_at>=? AND data_json LIKE ? ESCAPE '\\' LIMIT 50",
      [outletId, since, '%' + likeEscape(src) + '%'], (e, r) => e ? rej(e) : res(r || [])));
    const known = rows.some(r => { const a = bodyOf(r); return a && Array.isArray(a.images) && a.images.some(im => im && im.src === src); });
    if (!known) throw new NewsError('PHOTO_REJECTED', 400);
    await storePhoto(src, bytes);
    return { ok: true };
  }
  return { accept, putPhoto };
}
module.exports = { createRelayIntake, MAX_PHOTO };
