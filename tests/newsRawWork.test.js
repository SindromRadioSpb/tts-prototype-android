'use strict';
// «Читать оригинал» (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.8, §7.2).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const express = require('express');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');
const { mountNewsRoutes } = require('../news/newsRoutes');
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const NOW = Date.parse('2026-11-21T12:00:00Z');
const KEY = 'na_' + 'f'.repeat(24), SRC = 'https://ynet-pic1.yit.co.il/picserver6/crop_images/2026/a.jpg';
const ART = { url: 'https://www.ynet.co.il/news/article/raw1', canonical_url: 'https://www.ynet.co.il/news/article/raw1', title_he: 'הכותרת המקורית', subtitle_he: 'כותרת משנה',
  published_at: '2026-11-21T09:00:00+02:00', section: 'politics', section_original_he: 'חדשות', content_type: 'news', author: 'כתב', paywalled: false,
  paragraphs: ['המשפט הראשון. המשפט השני.', 'פסקה שנייה.'], images: [{ src: SRC, role: 'hero', credit_he: 'צילום: א' }, { src: SRC + '?2', role: 'inline', after_p: 1 }] };

async function setup(t, { body = true, cached = true } = {}) {
  const db = await openDb(), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-raw-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  await run(db, `INSERT INTO news_harvest_items(url_key, canonical_key, outlet_id, url, first_seen_at, status, title_he, full_ok, data_json, story_key) VALUES (?,?,?,?,?,'ready',?,1,?,?)`,
    [KEY, KEY, 'ynet', ART.url, new Date(NOW - 3600e3).toISOString(), ART.title_he, body ? JSON.stringify(ART) : null, 'S1']);
  if (cached) {
    const dir = path.join(dataDir, 'news-harvest', 'photo-cache'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, crypto.createHash('sha256').update(SRC).digest('hex').slice(0, 32) + '.jpg'), Buffer.from('JPEGDATA'));
  }
  return { db, h: createNewsHarvester({ db, dataDir, now: () => NOW, fetchImpl: async () => { throw new Error('offline'); } }) };
}

test('raw work is built from a slice body: rows one per sentence, no translation, cached photo inline', async t => {
  const { h } = await setup(t);
  const w = await h.rawWork('ynet', KEY + '.rw');
  const text = w.item.snapshot.library.texts[0];
  assert.deepEqual(text.rows.map(r => r.hebrew_plain), ['המשפט הראשון.', 'המשפט השני.', 'פסקה שנייה.']);
  assert.ok(text.rows.every(r => r.russian === ''));
  assert.equal(text.source_meta.news.original, true); assert.equal(text.source_meta.news.raw, true);
  const imgs = text.source_meta.news.images;
  assert.equal(imgs.length, 1, 'only the cached photo is shown');
  assert.equal(imgs[0].url.split('?')[0], '/api/news/images/' + KEY + '/img-1.jpg');
  assert.match(imgs[0].url, /\?v=[0-9a-f]{12}$/);
  assert.match(w.item.snapshot_sha256, /^[0-9a-f]{64}$/); assert.equal(w.item.public_work_id, KEY + '.rw');
});
test('raw work 404 after body expiry', async t => {
  const { h } = await setup(t, { body: false });
  await assert.rejects(h.rawWork('ynet', KEY + '.rw'), e => e.status === 404);
  await assert.rejects(h.rawWork('walla', KEY + '.rw'), e => e.status === 404, 'another outlet');
});
test('raw work image served from photo cache within 3 days', async t => {
  const { h } = await setup(t);
  const img = await h.rawImage(KEY, 'img-1.jpg');
  assert.equal(Buffer.from(img.bytes).toString(), 'JPEGDATA'); assert.equal(img.mime, 'image/jpeg');
  assert.equal(await h.rawImage(KEY, 'img-2.jpg'), null, 'not cached');
});
test('routes: /works/<key>.rw and its photo answer from the harvester', async t => {
  const { h } = await setup(t);
  const app = express();
  mountNewsRoutes(app, { repo: { getWork: async () => { throw Object.assign(new Error('x'), { status: 404 }); }, getImage: async () => null }, harvester: h,
    editorAuth: { resolve: async () => null }, resolveUser: async () => null });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const w = await fetch(base + '/api/public-corpora/news-ynet/works/' + KEY + '.rw');
  assert.equal(w.status, 200); assert.equal((await w.json()).item.public_work_id, KEY + '.rw');
  const i = await fetch(base + '/api/news/images/' + KEY + '/img-1.jpg');
  assert.equal(i.status, 200); assert.equal(Buffer.from(await i.arrayBuffer()).toString(), 'JPEGDATA');
});
test('routes: the Room asks feed?work=<key>.rw and gets a readable card of the raw original', async t => {
  const { h } = await setup(t);
  const app = express();
  mountNewsRoutes(app, { repo: { getCard: async () => null }, harvester: h, editorAuth: { resolve: async () => null }, resolveUser: async () => null });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/news/feed?work=' + KEY + '.rw');
  assert.equal(r.status, 200);
  const { card } = await r.json();
  assert.deepEqual([card.readable, card.work_id, card.outlet_id, card.raw], [true, KEY + '.rw', 'ynet', true]);
  assert.match(card.snapshot_sha256, /^[0-9a-f]{64}$/);
});
test('raw: a paywalled teaser is not an original and its body is not searched (review W3 I2)', async t => {
  const { db, h } = await setup(t);
  await run(db, 'UPDATE news_harvest_items SET paywalled=1 WHERE url_key=?', [KEY]);
  await assert.rejects(h.rawWork('ynet', KEY + '.rw'), e => e.status === 404);
  const { createNewsIndex } = require('../db/newsIndex');
  await createNewsIndex({ db, now: () => NOW }).refresh([KEY]);
  const r = await new Promise((res, rej) => db.get('SELECT body_until FROM news_index WHERE item_key=?', [KEY], (e, x) => e ? rej(e) : res(x)));
  assert.equal(r.body_until, null);
  const hits = await new Promise((res, rej) => db.all("SELECT rowid FROM news_search WHERE news_search MATCH ?", ['"פסקה"*'], (e, x) => e ? rej(e) : res(x)));
  assert.equal(hits.length, 0, 'body words of a paywalled teaser are not indexed');
});
test('routes: an expired raw original answers 404, not 500 (review W3 I3)', async t => {
  const { h } = await setup(t, { body: false });
  const app = express();
  mountNewsRoutes(app, { repo: { getCard: async () => null, getWork: async () => null, getImage: async () => null }, harvester: h, editorAuth: { resolve: async () => null }, resolveUser: async () => null });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/public-corpora/news-ynet/works/' + KEY + '.rw');
  assert.equal(r.status, 404);
});
