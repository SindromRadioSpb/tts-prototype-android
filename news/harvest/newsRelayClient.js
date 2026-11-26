'use strict';
// The home PC's side of the relay (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §6.2): after the
// local poll has read the pages, every ready card of the outlet that the server has not got yet — with its full text
// or without — goes to POST /api/news/relay/batches; a card whose text appeared later goes again as an update.
// A lost reply is retried with the same batch_id (the server answers it once). Photos follow, one PUT each; a photo
// that fails is counted and tried again on the next run (three tries), it never holds back the cards.
const crypto = require('node:crypto');
const { bodyOf } = require('./newsBody');

const BATCH = 250, BATCH_BYTES = 1.5 * 1024 * 1024, PHOTOS_PER_ARTICLE = 8, PHOTO_DAYS = 3, PHOTO_TRIES = 3, PHOTO_PAUSE_MS = 700; // the server takes ≤ 4 MB a batch, ≤ 120 requests a minute
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));

async function ensureTables(db) {
  await exec(db, `CREATE TABLE IF NOT EXISTS relay_sent (url_key TEXT PRIMARY KEY, body_sent INTEGER NOT NULL, sent_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS relay_photos (src TEXT PRIMARY KEY, url_key TEXT NOT NULL, status TEXT NOT NULL, tries INTEGER NOT NULL, at TEXT NOT NULL);`);
}

function itemOf(row) {
  const body = bodyOf(row);
  return { url: row.url, feed_title: row.feed_title, feed_section: row.feed_section, feed_image: row.feed_image, feed_pub_at: row.feed_pub_at, first_seen_at: row.first_seen_at,
    published_at: row.published_at, section: row.section, content_type: row.content_type, title_he: row.title_he, subtitle_he: row.subtitle_he, lead_he: row.lead_he,
    paywalled: row.paywalled, full_ok: row.full_ok, chars: row.chars, images: row.images, reason: row.reason, body };
}

// → { batch_id, accepted, updated, kept, rejected, photos_sent, photos_failed }
async function pushPending({ db, origin, key, outletId, harvestedAt, fetchImpl = globalThis.fetch, photoOf, sleep = ms => new Promise(r => setTimeout(r, ms)), log = () => {},
  maxBatchBytes = BATCH_BYTES, pollOk = true, pollError = null }) {
  await ensureTables(db);
  const auth = { authorization: 'Bearer ' + key };
  const out = { batch_id: null, accepted: 0, updated: 0, kept: 0, rejected: 0, photos_sent: 0, photos_failed: 0 };
  const pending = await all(db, `SELECT i.* FROM news_harvest_items i LEFT JOIN relay_sent s ON s.url_key=i.url_key
    WHERE i.outlet_id=? AND i.status='ready' AND (s.url_key IS NULL OR (s.body_sent=0 AND (i.data_json IS NOT NULL OR i.data_gz IS NOT NULL))) ORDER BY i.first_seen_at`, [outletId]);
  // An hour with nothing new still sends one empty batch: the server learns the PC harvested.
  // Batches by size as well as by count: a backlog of days with full texts must still get through.
  const chunks = [];
  let cur = [], bytes = 0;
  for (const row of pending) {
    const size = Buffer.byteLength(JSON.stringify(itemOf(row)));
    if (cur.length && (cur.length >= BATCH || bytes + size > maxBatchBytes)) { chunks.push(cur); cur = []; bytes = 0; }
    cur.push(row); bytes += size;
  }
  if (cur.length || !chunks.length) chunks.push(cur);
  for (const rows of chunks) {
    const items = rows.map(itemOf);
    const batchId = crypto.createHash('sha256').update(outletId + ':' + harvestedAt + ':' + items.map(x => x.url + ':' + (x.body ? 1 : 0)).sort().join(',')).digest('hex');
    const payload = JSON.stringify({ batch_id: batchId, outlet_id: outletId, harvested_at: harvestedAt, items, ...(pollOk ? {} : { poll_ok: false, poll_error: pollError || 'FEED_FAILED' }) });
    let res = null, lastErr = null;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        const r = await fetchImpl(origin + '/api/news/relay/batches', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: payload });
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok) res = j;
        else if (r.status >= 400 && r.status < 500) throw Object.assign(new Error((j && j.error) || 'HTTP_' + r.status), { final: true });
        else lastErr = new Error((j && j.error) || 'HTTP_' + r.status);
      } catch (e) { if (e.final) throw e; lastErr = e; }
      if (!res && attempt < 2) await sleep(5000 * (attempt + 1));
    }
    if (!res) throw lastErr || new Error('RELAY_FAILED');
    out.batch_id = batchId;
    out.accepted += res.accepted; out.updated += res.updated; out.kept += res.kept; out.rejected += (res.rejected || []).length;
    for (const x of res.rejected || []) log('[relay] refused by the server: ' + x.code + ' ' + x.url);
    const at = new Date().toISOString();
    for (const it of rows) await run(db, `INSERT INTO relay_sent(url_key, body_sent, sent_at) VALUES (?,?,?) ON CONFLICT(url_key) DO UPDATE SET body_sent=excluded.body_sent, sent_at=excluded.sent_at`,
      [it.url_key, bodyOf(it) ? 1 : 0, at]);
  }
  // Photos of the cards the server has with their text (recent ones), not sent yet.
  const since = new Date(Date.now() - PHOTO_DAYS * 86400e3).toISOString();
  const withBody = await all(db, `SELECT i.* FROM news_harvest_items i JOIN relay_sent s ON s.url_key=i.url_key WHERE i.outlet_id=? AND s.body_sent=1 AND i.first_seen_at>=?`, [outletId, since]);
  const tried = new Map((await all(db, 'SELECT src, status, tries FROM relay_photos')).map(r => [r.src, r]));
  for (const row of withBody) {
    const a = bodyOf(row);
    for (const im of ((a && a.images) || []).slice(0, PHOTOS_PER_ARTICLE)) {
      const t = im && im.src && tried.get(im.src);
      if (!im || !im.src || (t && (t.status === 'sent' || t.tries >= PHOTO_TRIES))) continue;
      let ok = false;
      try {
        const bytes = await photoOf(im.src);
        const r = await fetchImpl(origin + '/api/news/relay/photos?outlet=' + encodeURIComponent(outletId) + '&src=' + encodeURIComponent(im.src), { method: 'PUT', headers: { ...auth, 'content-type': 'image/jpeg' }, body: bytes });
        ok = r.ok;
        if (!ok) log('[relay] photo refused: HTTP_' + r.status + ' ' + im.src);
      } catch (e) { log('[relay] photo failed: ' + (e && e.message) + ' ' + im.src); }
      ok ? out.photos_sent++ : out.photos_failed++;
      await run(db, `INSERT INTO relay_photos(src, url_key, status, tries, at) VALUES (?,?,?,1,?) ON CONFLICT(src) DO UPDATE SET status=excluded.status, tries=relay_photos.tries+1, at=excluded.at`,
        [im.src, row.url_key, ok ? 'sent' : 'failed', new Date().toISOString()]);
      tried.set(im.src, { status: ok ? 'sent' : 'failed', tries: ((t && t.tries) || 0) + 1 });
      await sleep(PHOTO_PAUSE_MS);
    }
  }
  return out;
}
module.exports = { pushPending };
