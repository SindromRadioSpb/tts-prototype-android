'use strict';
// C14 from the home PC (spec 2026-11-26 §6; plan W2 Tasks 7–9). Article texts here are synthetic.
const test = require('node:test'), assert = require('node:assert/strict');
const { openDb } = require('./helpers/newsDb.cjs');
const { createRelayAuth } = require('../news/newsRelayAuth');
const { createNewsEditorAuth } = require('../news/newsEditorAuth');

const reqWith = key => ({ headers: { authorization: 'Bearer ' + key } });

// ---- Task 7: relay keys ------------------------------------------------------------------------------
test('issued key resolves once stored as hash', async () => {
  const db = await openDb();
  const auth = createRelayAuth({ db, now: () => Date.parse('2026-11-26T08:00:00Z') });
  const { key_id, key } = await auth.issue('home PC', 'owner');
  assert.match(key, /^lpr_[A-Za-z0-9_-]{43}$/);
  const row = await new Promise((res, rej) => db.get('SELECT * FROM news_relay_keys WHERE key_id=?', [key_id], (e, r) => e ? rej(e) : res(r)));
  assert.notEqual(row.key_sha256, key); assert.ok(!JSON.stringify(row).includes(key));
  assert.deepEqual(await auth.resolve(reqWith(key)), { key_id });
  const list = await auth.list();
  assert.equal(list.length, 1); assert.equal(list[0].last_used_at, '2026-11-26T08:00:00.000Z'); assert.ok(!('key_sha256' in list[0]));
  assert.equal(await auth.resolve(reqWith('lpr_' + 'x'.repeat(43))), null);
  assert.equal(await auth.resolve({ headers: {} }), null);
});
test('revoked key no longer resolves', async () => {
  const auth = createRelayAuth({ db: await openDb() });
  const { key_id, key } = await auth.issue('home PC', 'owner');
  assert.deepEqual(await auth.revoke(key_id, 'owner'), { key_id, revoked: true });
  assert.equal(await auth.resolve(reqWith(key)), null);
});
test('editor key is not a relay key and vice versa', async () => {
  const db = await openDb();
  const relay = createRelayAuth({ db }), editors = createNewsEditorAuth({ db });
  const { key: editorKey } = await editors.createEditor('owner', 'dot');
  const { key: relayKey } = await relay.issue('home PC', 'owner');
  assert.equal(await relay.resolve(reqWith(editorKey)), null);
  assert.equal(await editors.resolve(reqWith(relayKey)), null);
});

// ---- routes: keys are the owner's; the intake takes only a relay key -------------------------------------
const express = require('express');
const { createNewsRepo } = require('../db/newsRepo');
const { createOutletState } = require('../db/newsOutletState');
const { mountNewsRoutes } = require('../news/newsRoutes');
const OWNER_COOKIE = 'lp_session=owner-session', OWNER_CSRF = 'owner-csrf';
const ownerHeaders = { cookie: OWNER_COOKIE, 'x-lp-csrf': OWNER_CSRF };
async function routesSetup(t, { relayIntake = null, db = null, now = () => Date.parse('2026-11-26T08:00:00Z') } = {}) {
  db = db || await openDb();
  const repo = createNewsRepo({ db, now }), editorAuth = createNewsEditorAuth({ db, now }), relayAuth = createRelayAuth({ db, now });
  const app = express(), audits = [];
  const resolveUser = async req => String(req.headers.cookie || '').includes(OWNER_COOKIE) ? { user: { id: 'owner', role: 'owner' }, session: { csrf: OWNER_CSRF } } : null;
  mountNewsRoutes(app, { repo, editorAuth, resolveUser, audit: (...a) => audits.push(a), outletState: createOutletState({ db, now }), relayAuth, relayIntake });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => r())));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, url, { headers = {}, json, body } = {}) => fetch(base + url, { method, headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : body }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { db, call, audits, relayAuth, editorAuth, base };
}
test('only the owner issues, lists and revokes relay keys', async t => {
  const { call, editorAuth, audits } = await routesSetup(t);
  const { key: editorKey } = await editorAuth.createEditor('owner', 'dot');
  assert.equal((await call('POST', '/api/news/editor/relay-keys', { json: { label: 'x' }, headers: { authorization: 'Bearer ' + editorKey } })).status, 403);
  assert.equal((await call('POST', '/api/news/editor/relay-keys', { json: { label: 'x' }, headers: { cookie: OWNER_COOKIE } })).status, 403, 'CSRF');
  const made = await call('POST', '/api/news/editor/relay-keys', { json: { label: 'Домашний ПК' }, headers: ownerHeaders });
  assert.equal(made.status, 200); assert.match(made.body.key, /^lpr_/);
  const list = await call('GET', '/api/news/editor/relay-keys', { headers: ownerHeaders });
  assert.equal(list.body.keys.length, 1); assert.equal(list.body.keys[0].label, 'Домашний ПК'); assert.ok(!('key' in list.body.keys[0]));
  const rv = await call('POST', '/api/news/editor/relay-keys/' + made.body.key_id + '/revoke', { json: {}, headers: ownerHeaders });
  assert.equal(rv.status, 200); assert.equal(rv.body.revoked, true);
  assert.ok(audits.some(a => a[0] === 'news_relay_key_created') && audits.some(a => a[0] === 'news_relay_key_revoked'));
});

// ---- Task 8: the server takes the home PC's harvest (dot's acceptance, spec §6.4) ----------------------
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const sharp = require('sharp');
const { createRelayIntake } = require('../news/newsRelayIntake');
const { pilotBatch, relayItem } = require('./helpers/newsRelayFixture.cjs');
const { hasBody, bodyOf } = require('../news/harvest/newsBody');
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
async function intakeSetup({ db = null, now = () => Date.parse('2026-11-26T04:00:00Z') } = {}) {
  db = db || await openDb();
  const outletState = createOutletState({ db, now }), photos = new Map(), refreshed = [];
  const intake = createRelayIntake({ db, outletState, index: { refresh: async keys => { refreshed.push(...keys); } }, storePhoto: (src, bytes) => { photos.set(src, bytes); }, now });
  return { db, outletState, intake, photos, refreshed };
}
const c14Rows = db => all(db, "SELECT * FROM news_harvest_items WHERE outlet_id='c14' ORDER BY url");

test('pilot import gives 10 cards, 9 bodies, 1 NO_BODY', async () => {
  const { db, intake, refreshed, outletState } = await intakeSetup();
  const r = await intake.accept('nrk_1', pilotBatch());
  assert.deepEqual([r.accepted, r.updated, r.kept, r.rejected.length], [10, 0, 0, 0]);
  const rows = await c14Rows(db);
  assert.equal(rows.length, 10);
  assert.equal(rows.filter(hasBody).length, 9);
  assert.deepEqual(rows.filter(x => !hasBody(x)).map(x => x.reason), ['NO_BODY']);
  assert.ok(rows.every(x => x.status === 'ready'));
  assert.equal(bodyOf(rows[0]).paragraphs.length, 3);
  assert.equal(refreshed.length, 10);
  assert.equal((await outletState.get('c14')).last_ok_at, '2026-11-26T03:34:19.000Z');
});
test('same batch twice', async () => {
  const { db, intake } = await intakeSetup();
  const a = await intake.accept('nrk_1', pilotBatch()), b = await intake.accept('nrk_1', pilotBatch());
  assert.deepEqual(b, a);
  assert.equal((await c14Rows(db)).length, 10);
});
test('old batch keeps freshness: restart, another outlet and a late old batch do not make c14 fresh', async () => {
  const db = await openDb();
  const first = await intakeSetup({ db });
  await first.intake.accept('nrk_1', pilotBatch({ harvestedAt: '2026-11-26T03:34:19.000Z' }));
  // A server restart: a new intake on the same database; another outlet's harvest; then an older batch arrives late.
  const second = await intakeSetup({ db, now: () => Date.parse('2026-11-26T09:00:00Z') });
  await second.outletState.recordPoll('ynet', { okAt: '2026-11-26T08:55:00.000Z' });
  const old = pilotBatch({ harvestedAt: '2026-11-26T01:00:00.000Z' });
  old.items = [relayItem(42, { harvestedAt: '2026-11-26T01:00:00.000Z' })]; old.batch_id = 'f'.repeat(64);
  const r = await second.intake.accept('nrk_1', old);
  assert.equal(r.accepted, 1);
  assert.equal((await second.outletState.get('c14')).last_ok_at, '2026-11-26T03:34:19.000Z');
});
test('body only grows', async () => {
  const { db, intake } = await intakeSetup();
  const noBody = pilotBatch(); noBody.items = [relayItem(1, { body: false })]; noBody.batch_id = 'a'.repeat(64);
  await intake.accept('nrk_1', noBody);
  const withBody = pilotBatch(); withBody.items = [relayItem(1)]; withBody.batch_id = 'b'.repeat(64);
  const r = await intake.accept('nrk_1', withBody);
  assert.equal(r.updated, 1);
  assert.ok(hasBody((await c14Rows(db))[0]));
  const again = pilotBatch(); again.items = [relayItem(1, { body: false })]; again.batch_id = 'c'.repeat(64);
  const r2 = await intake.accept('nrk_1', again);
  assert.equal(r2.kept, 1);
  const row = (await c14Rows(db))[0];
  assert.ok(hasBody(row), 'a later card without a body never erases the text'); assert.equal(row.full_ok, 1);
});
test('foreign url rejected per item', async () => {
  const { db, intake } = await intakeSetup();
  const b = pilotBatch();
  b.items[0] = { ...b.items[0], url: 'https://www.ynet.co.il/news/article/abc' };
  const r = await intake.accept('nrk_1', b);
  assert.equal(r.accepted, 9);
  assert.deepEqual(r.rejected, [{ url: 'https://www.ynet.co.il/news/article/abc', code: 'URL_OUTLET_MISMATCH' }]);
  assert.equal((await all(db, "SELECT 1 FROM news_harvest_items WHERE outlet_id='ynet'")).length, 0);
});
test('a batch for an outlet the server harvests itself, or switched off, is refused', async () => {
  const { intake, outletState } = await intakeSetup();
  const b = pilotBatch(); b.outlet_id = 'ynet';
  await assert.rejects(intake.accept('nrk_1', b), e => e.code === 'NOT_HOME_PC' && e.status === 409);
  await outletState.setEnabled('c14', false, 'owner');
  await assert.rejects(intake.accept('nrk_1', pilotBatch()), e => e.code === 'NOT_HOME_PC');
});
test('bad batches: id, size, future time', async () => {
  const { intake } = await intakeSetup();
  await assert.rejects(intake.accept('nrk_1', { ...pilotBatch(), batch_id: 'x' }), e => e.code === 'BAD_BATCH');
  const big = pilotBatch(); big.items = Array.from({ length: 301 }, (_, i) => relayItem(i));
  await assert.rejects(intake.accept('nrk_1', big), e => e.code === 'BAD_BATCH');
  await assert.rejects(intake.accept('nrk_1', pilotBatch({ harvestedAt: '2026-11-26T05:00:00.000Z' })), e => e.code === 'BAD_HARVESTED_AT');
});
// ---- review W2: the body is rebuilt, never stored as sent -------------------------------------------------
test('body is rebuilt: foreign photos dropped, malformed fields coerced, foreign canonical ignored', async () => {
  const { db, intake } = await intakeSetup();
  const b = pilotBatch();
  b.items[0].body = { ...b.items[0].body, images: [{ src: 'http://10.0.0.5/latest/meta-data' }, { src: 'https://www.c14.co.il/wp-content/uploads/2026/11/ok.jpg', role: 'hero' }],
    canonical_url: 'https://www.ynet.co.il/news/article/x', evil: '<script>' };
  b.items[1].body = { paragraphs: [], images: 'nope' };
  b.items[2].body = { ...b.items[2].body, paragraphs: Array.from({ length: 5000 }, () => 'א'.repeat(100)) };
  await intake.accept('nrk_1', b);
  const rows = await c14Rows(db);
  const byUrl = new Map(rows.map(r => [r.url, r]));
  const a0 = bodyOf(byUrl.get(b.items[0].url));
  assert.deepEqual(a0.images.map(i => i.src), ['https://www.c14.co.il/wp-content/uploads/2026/11/ok.jpg']);
  assert.equal(a0.canonical_url, b.items[0].url); assert.equal(a0.evil, undefined);
  const a1 = bodyOf(byUrl.get(b.items[1].url));
  assert.deepEqual(a1.images, []); assert.deepEqual(a1.paragraphs, []);
  assert.equal(byUrl.get(b.items[1].url).full_ok, 0, 'an empty text is not a full text');
  assert.ok(JSON.stringify(bodyOf(byUrl.get(b.items[2].url)).paragraphs).length <= 210 * 1024);
});
test('a poll that failed on the PC does not make c14 fresh', async () => {
  const { intake, outletState } = await intakeSetup();
  const b = pilotBatch(); b.poll_ok = false; b.poll_error = 'BOT_CHALLENGE:HTTP_403';
  await intake.accept('nrk_1', b);
  const st = await outletState.get('c14');
  assert.equal(st.last_ok_at, null); assert.match(st.last_error, /^PC:BOT_CHALLENGE/);
});
test('a card the server left queued becomes ready from the PC, even without text', async () => {
  const { db, intake } = await intakeSetup();
  const it = relayItem(5, { body: false }), key = require('../news/newsPackCore').articleKey('c14', require('../news/newsPackCore').canonicalizeUrl(it.url));
  await new Promise((res, rej) => db.run(`INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status) VALUES (?,?,?,?,'queued')`, [key, 'c14', it.url, '2026-11-26T02:00:00.000Z'], e => e ? rej(e) : res()));
  const b = pilotBatch(); b.items = [it]; b.batch_id = 'd'.repeat(64);
  const r = await intake.accept('nrk_1', b);
  assert.equal(r.updated, 1);
  const row = (await c14Rows(db))[0];
  assert.equal(row.status, 'ready'); assert.equal(row.reason, 'NO_BODY'); assert.equal(row.title_he, it.title_he);
});
test('a daily byte quota per key stops a flood', async () => {
  const s2 = await intakeSetup();
  const small = createRelayIntake({ db: s2.db, outletState: s2.outletState, storePhoto: () => {}, quotaBytes: 5000 });
  await assert.rejects(small.accept('nrk_1', pilotBatch()), e => e.code === 'RELAY_QUOTA' && e.status === 429);
});
test('edition build picks relayed cards', async t => {
  const { db, intake } = await intakeSetup({ now: () => Date.parse('2026-11-26T04:00:00Z') });
  await intake.accept('nrk_1', pilotBatch());
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-relay-ed-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const { createNewsHarvester } = require('../news/harvest/newsHarvest');
  const h = createNewsHarvester({ db, dataDir, sources: [], delayMs: 0, now: () => Date.parse('2026-11-26T04:00:00Z'), fetchImpl: async () => new Response('nf', { status: 404 }) });
  assert.equal((await h.pending()).outlets.c14, 10);
  const r = await h.runOnce({ trigger: 'manual' });
  assert.equal(r.report.outlets.c14.items, 10);
});
test('photos: only a recorded photo of this outlet, a whole JPEG', async () => {
  const { intake, photos } = await intakeSetup();
  await intake.accept('nrk_1', pilotBatch());
  const jpeg = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#557799' } }).jpeg().toBuffer();
  const src = 'https://www.c14.co.il/wp-content/uploads/2026/11/photo-1.jpg';
  assert.deepEqual(await intake.putPhoto('nrk_1', 'c14', src, jpeg), { ok: true });
  assert.ok(photos.get(src).equals(jpeg));
  await assert.rejects(intake.putPhoto('nrk_1', 'c14', 'https://evil.example/x.jpg', jpeg), e => e.code === 'PHOTO_REJECTED');
  await assert.rejects(intake.putPhoto('nrk_1', 'c14', 'https://www.c14.co.il/article/1809901/photo-1.jpg', jpeg), e => e.code === 'PHOTO_REJECTED');
  await assert.rejects(intake.putPhoto('nrk_1', 'c14', 'https://www.c14.co.il/wp-content/uploads/2026/11/not-in-any-article.jpg', jpeg), e => e.code === 'PHOTO_REJECTED');
  await assert.rejects(intake.putPhoto('nrk_1', 'c14', src, jpeg.subarray(0, 500)), e => e.code === 'PHOTO_REJECTED');
});
// ---- Task 9: the home PC pushes its harvest ------------------------------------------------------------
const { pushPending } = require('../news/harvest/newsRelayClient');
async function pcDbWithPilot() {
  const pc = await openDb();
  for (const it of pilotBatch().items) {
    const key = require('../news/newsPackCore').articleKey('c14', require('../news/newsPackCore').canonicalizeUrl(it.url));
    await new Promise((res, rej) => pc.run(`INSERT INTO news_harvest_items(url_key, outlet_id, url, feed_title, first_seen_at, status, reason, published_at, section, content_type, title_he, subtitle_he, lead_he, full_ok, chars, images, data_json)
      VALUES (?,?,?,?,?,'ready',?,?,?,?,?,?,?,?,?,?,?)`, [key, 'c14', it.url, it.feed_title, it.first_seen_at, it.reason, it.published_at, it.section, it.content_type, it.title_he, it.subtitle_he, it.lead_he, it.full_ok, it.chars, it.images, it.body ? JSON.stringify(it.body) : null], e => e ? rej(e) : res()));
  }
  await new Promise((res, rej) => pc.run(`INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status) VALUES ('na_${'9'.repeat(24)}','c14','https://www.c14.co.il/article/1809999/','2026-11-26T03:30:00.000Z','queued')`, e => e ? rej(e) : res()));
  return pc;
}
async function relayServer(t, { dropFirstReply = false } = {}) {
  const clock = () => Date.parse('2026-11-26T06:00:00Z');
  const server = await intakeSetup({ now: clock });
  const r = await routesSetup(t, { relayIntake: server.intake, db: server.db, now: clock });
  const { key } = await r.relayAuth.issue('home PC', 'owner');
  let dropped = false;
  const fetchImpl = async (url, opts) => {
    const res = await fetch(url, opts);
    if (dropFirstReply && !dropped && url.includes('/relay/batches')) { dropped = true; throw new Error('socket hang up'); } // the server got it, the PC never heard back
    return res;
  };
  return { ...server, ...r, key, fetchImpl };
}
const jpegBytes = () => sharp({ create: { width: 800, height: 500, channels: 3, background: '#557799' } }).jpeg().toBuffer();

test('all ready rows go, with and without body', async t => {
  const s = await relayServer(t), pc = await pcDbWithPilot(), jpeg = await jpegBytes();
  const r = await pushPending({ db: pc, origin: s.base, key: s.key, outletId: 'c14', harvestedAt: '2026-11-26T03:34:19.000Z', fetchImpl: s.fetchImpl, photoOf: async () => jpeg, sleep: async () => {} });
  assert.deepEqual([r.accepted, r.updated, r.rejected, r.photos_sent, r.photos_failed], [10, 0, 0, 9, 0]);
  const rows = await c14Rows(s.db);
  assert.equal(rows.length, 10, 'the queued page stays on the PC');
  assert.equal(rows.filter(hasBody).length, 9);
  assert.equal(s.photos.size, 9);
});
test('lost response → same batch_id, no duplicates', async t => {
  const s = await relayServer(t, { dropFirstReply: true }), pc = await pcDbWithPilot();
  const r = await pushPending({ db: pc, origin: s.base, key: s.key, outletId: 'c14', harvestedAt: '2026-11-26T03:34:19.000Z', fetchImpl: s.fetchImpl, photoOf: async () => { throw new Error('skip'); }, sleep: async () => {} });
  assert.equal(r.accepted, 10, 'the retry got the stored answer of the first delivery');
  assert.equal((await c14Rows(s.db)).length, 10);
  assert.equal((await all(s.db, 'SELECT COUNT(*) n FROM news_relay_batches'))[0].n, 1);
});
test('second run sends only the rest', async t => {
  const s = await relayServer(t), pc = await pcDbWithPilot(), jpeg = await jpegBytes();
  const opts = { db: pc, origin: s.base, key: s.key, outletId: 'c14', harvestedAt: '2026-11-26T03:34:19.000Z', fetchImpl: s.fetchImpl, photoOf: async () => jpeg, sleep: async () => {} };
  await pushPending(opts);
  const again = await pushPending({ ...opts, harvestedAt: '2026-11-26T04:34:19.000Z' });
  assert.deepEqual([again.accepted, again.updated, again.photos_sent], [0, 0, 0]);
  assert.equal((await s.outletState.get('c14')).last_ok_at, '2026-11-26T04:34:19.000Z', 'an hour with no new articles still says the PC harvested');
  // The NO_BODY card gets its text on the PC later: only that one goes, as an update.
  const k = (await all(pc, "SELECT url_key FROM news_harvest_items WHERE reason='NO_BODY'"))[0].url_key;
  await new Promise((res, rej) => pc.run("UPDATE news_harvest_items SET data_json=?, full_ok=1, reason=NULL WHERE url_key=?", [JSON.stringify(relayItem(5).body), k], e => e ? rej(e) : res()));
  const third = await pushPending({ ...opts, harvestedAt: '2026-11-26T05:34:19.000Z' });
  assert.deepEqual([third.accepted, third.updated], [0, 1]);
});
test('a big backlog goes in several batches under the byte cap', async t => {
  const s = await relayServer(t), pc = await pcDbWithPilot();
  const r = await pushPending({ db: pc, origin: s.base, key: s.key, outletId: 'c14', harvestedAt: '2026-11-26T03:34:19.000Z', fetchImpl: s.fetchImpl, photoOf: async () => { throw new Error('skip'); }, sleep: async () => {}, maxBatchBytes: 2500 });
  assert.equal(r.accepted, 10);
  assert.ok((await all(s.db, 'SELECT COUNT(*) n FROM news_relay_batches'))[0].n >= 3, 'split by size, not by count');
});
test('a poll that failed on the PC is sent as an error, not as a harvest', async t => {
  const s = await relayServer(t), pc = await pcDbWithPilot();
  await pushPending({ db: pc, origin: s.base, key: s.key, outletId: 'c14', harvestedAt: '2026-11-26T03:34:19.000Z', fetchImpl: s.fetchImpl, photoOf: async () => { throw new Error('skip'); }, sleep: async () => {},
    pollOk: false, pollError: 'BOT_CHALLENGE:HTTP_403' });
  const st = await s.outletState.get('c14');
  assert.equal(st.last_ok_at, null); assert.match(st.last_error, /PC:BOT_CHALLENGE/);
});
test('photo failure counted, cards still sent', async t => {
  const s = await relayServer(t), pc = await pcDbWithPilot(), jpeg = await jpegBytes();
  let n = 0;
  const r = await pushPending({ db: pc, origin: s.base, key: s.key, outletId: 'c14', harvestedAt: '2026-11-26T03:34:19.000Z', fetchImpl: s.fetchImpl, photoOf: async () => { if (n++ % 2) throw new Error('HTTP_404'); return jpeg; }, sleep: async () => {} });
  assert.equal(r.accepted, 10); assert.equal(r.photos_sent + r.photos_failed, 9); assert.ok(r.photos_failed > 0);
});
test('a stored relay photo is what the edition build reads from the cache', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-relay-photo-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const { createNewsHarvester } = require('../news/harvest/newsHarvest');
  const h = createNewsHarvester({ db: await openDb(), dataDir, sources: [] });
  const jpeg = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#557799' } }).jpeg().toBuffer();
  const src = 'https://www.c14.co.il/wp-content/uploads/2026/11/photo-3.jpg';
  assert.equal(h.cachedPhotoBytes(src), null);
  h.storeCachedPhoto(src, jpeg);
  assert.ok(h.cachedPhotoBytes(src).equals(jpeg));
});
test('relay key required (401) on the intake routes', async t => {
  const { db, intake } = await intakeSetup();
  const { call, relayAuth, editorAuth } = await routesSetup(t, { relayIntake: intake, db });
  const { key: editorKey } = await editorAuth.createEditor('owner', 'dot');
  assert.equal((await call('POST', '/api/news/relay/batches', { json: pilotBatch() })).status, 401);
  assert.equal((await call('POST', '/api/news/relay/batches', { json: pilotBatch(), headers: { authorization: 'Bearer ' + editorKey } })).status, 401);
  const { key } = await relayAuth.issue('home PC', 'owner');
  const ok = await call('POST', '/api/news/relay/batches', { json: pilotBatch(), headers: { authorization: 'Bearer ' + key } });
  assert.equal(ok.status, 200); assert.equal(ok.body.accepted, 10);
  const jpeg = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#557799' } }).jpeg().toBuffer();
  const src = 'https://www.c14.co.il/wp-content/uploads/2026/11/photo-2.jpg';
  const put = await call('PUT', '/api/news/relay/photos?outlet=c14&src=' + encodeURIComponent(src), { body: jpeg, headers: { authorization: 'Bearer ' + key, 'content-type': 'image/jpeg' } });
  assert.equal(put.status, 200);
  assert.equal((await call('PUT', '/api/news/relay/photos?outlet=c14&src=' + encodeURIComponent(src), { body: jpeg, headers: { 'content-type': 'image/jpeg' } })).status, 401);
});

// ---- O-175: outlets whose Cloudflare closes the server's address go through the home PC too -------------
test('migration 098 moves the five 403-to-server outlets to the home PC, nothing else', async () => {
  const db = await openDb();
  const rows = await all(db, "SELECT outlet_id, route, enabled FROM news_outlet_state WHERE route='home_pc' ORDER BY outlet_id");
  assert.deepEqual(rows.map(r => r.outlet_id), ['c14', 'colbo', 'geektime', 'haipo', 'hayadan', 'kolhair']);
  assert.ok(rows.every(r => r.enabled === 1));
  const srv = await all(db, "SELECT outlet_id FROM news_outlet_state WHERE outlet_id IN ('kikar','news08','hkn') AND route='server'");
  assert.equal(srv.length, 3);
});
test('a generic outlet relayed by the PC keeps photos from its own domains only', () => {
  const { canFetchArchiveImage } = require('../news/harvest/newsHarvestSources');
  assert.equal(canFetchArchiveImage('haipo', 'https://haipo.co.il/wp-content/uploads/2026/11/a.jpg'), true);
  assert.equal(canFetchArchiveImage('geektime', 'https://cdn.geektime.co.il/wp-content/uploads/2026/11/a.jpg'), true);
  assert.equal(canFetchArchiveImage('haipo', 'https://cdn.geektime.co.il/wp-content/uploads/a.jpg'), false, 'another outlet');
  assert.equal(canFetchArchiveImage('haipo', 'http://haipo.co.il/wp-content/uploads/a.jpg'), false);
  assert.equal(canFetchArchiveImage('haipo', 'https://haipo.co.il.evil.example/a.jpg'), false);
  assert.equal(canFetchArchiveImage('haipo', 'https://u:p@haipo.co.il/a.jpg'), false);
  assert.equal(canFetchArchiveImage('ynet', 'https://www.ynet.co.il/a.jpg'), false, 'a curated outlet keeps its list');
});
test('the daily quota is per key and outlet: one PC can hand in several outlets', async () => {
  const s2 = await intakeSetup();
  const size = Buffer.byteLength(JSON.stringify(pilotBatch().items));
  const small = createRelayIntake({ db: s2.db, outletState: s2.outletState, storePhoto: () => {}, quotaBytes: size + 100, now: () => Date.parse('2026-11-26T04:00:00Z') });
  await small.accept('nrk_1', pilotBatch());
  const other = pilotBatch(); other.outlet_id = 'haipo'; other.batch_id = 'e'.repeat(64);
  other.items = other.items.map(it => ({ ...it, url: it.url.replace('https://www.c14.co.il/article/', 'https://haipo.co.il/') }));
  const r = await small.accept('nrk_1', other);
  assert.equal(r.accepted + r.rejected.length, 10, 'the second outlet has its own day');
  const third = pilotBatch({ harvestedAt: '2026-11-26T03:40:00.000Z' }); third.batch_id = 'f'.repeat(64);
  await assert.rejects(small.accept('nrk_1', third), e => e.code === 'RELAY_QUOTA');
});
