'use strict';
// Offloading archived days to the owner's PC and bringing them back
// (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsRepo } = require('../db/newsRepo');
const { createNewsOffload } = require('../news/newsOffload');
const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');

const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const OWNER = { id: 'owner', kind: 'owner' };

async function setup(t, { freeBytes = 50e9 } = {}) {
  const db = await openDb(['084_news_fingerprints.sql', '085_news_reading.sql', '086_news_offloads.sql']);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-off-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const clock = { now: Date.parse('2026-11-12T08:00:00+02:00') };
  const repo = createNewsRepo({ db, now: () => clock.now });
  const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#abc' } }).jpeg().toBuffer();
  const mk = n => fixtureArticle({ source: { url: 'https://www.ynet.co.il/news/article/d' + n, canonical_url: 'https://www.ynet.co.il/news/article/d' + n },
    images: [{ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/' + n + '.jpg' }], __files: { 'img-1.jpg': jpeg } });
  const r = await repo.ingestPack(OWNER, fixturePack([mk(1), mk(2)]));
  const ids = r.items.map(i => i.article_id), works = r.items.map(i => i.work_id);
  clock.now = Date.parse('2026-11-20T08:00:00+02:00'); // the day is in the archive now
  await repo.runLifecycle(clock.now);
  const off = createNewsOffload({ db, repo, dataDir, now: () => clock.now, statfs: () => ({ bavail: freeBytes / 4096, bsize: 4096, blocks: 38e9 / 4096 }) });
  return { db, repo, off, ids, works, clock, jpeg };
}

test('export → release: the day leaves photos and bodies, cards and overview rows stay', async t => {
  const { db, repo, off, ids, works } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  assert.equal(x.articles, 2); assert.equal(x.photos, 2); assert.equal(x.sha256, sha(x.buf));
  const zip = new AdmZip(x.buf), m = JSON.parse(zip.readAsText('manifest.json'));
  assert.equal(m.schema, 'linguistpro-news-offload'); assert.equal(m.day, '2026-11-12');
  assert.ok(zip.getEntry('articles/' + ids[0] + '/img-1.jpg'));
  assert.ok(zip.getEntry('articles/' + ids[0] + '/works/' + works[0] + '.json'));
  const r = await off.release('2026-11-12', x.sha256);
  assert.deepEqual(r, { day: '2026-11-12', articles: 2, photos: 2 });
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_images'))[0].n, 0);
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_works'))[0].n, 0);
  const card = await repo.getCard(works[0]);
  assert.equal(card.readable, false); assert.equal(card.offloaded, true); assert.equal(card.title_ru, 'Бюджет прошёл первое чтение');
  await assert.rejects(repo.getWork('ynet', works[0]), e => e.code === 'NEWS_OFFLOADED' && e.status === 410);
});
test('release: wrong sha256 deletes nothing', async t => {
  const { db, off } = await setup(t);
  await off.exportDay('2026-11-12');
  await assert.rejects(off.release('2026-11-12', '0'.repeat(64)), e => e.code === 'OFFLOAD_SHA_MISMATCH');
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_images'))[0].n, 2);
});
test('release without export is refused', async t => {
  const { off } = await setup(t);
  await assert.rejects(off.release('2026-11-12', '0'.repeat(64)), e => e.code === 'OFFLOAD_NOT_EXPORTED');
});
test('restore: the owner brings the day back, articles open again with the same work ids', async t => {
  const { db, repo, off, works } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await off.release('2026-11-12', x.sha256);
  const r = await off.restore(OWNER, x.buf);
  assert.deepEqual(r, { day: '2026-11-12', restored: 2, duplicate: 0, missing: 0 });
  const work = await repo.getWork('ynet', works[0]);
  assert.equal(work.item.public_work_id, works[0]);
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_images'))[0].n, 2);
  assert.equal((await repo.getCard(works[0])).offloaded, undefined);
  assert.deepEqual(await off.restore(OWNER, x.buf), { day: '2026-11-12', restored: 0, duplicate: 2, missing: 0 }, 'a second restore is duplicate');
  assert.equal((await all(db, "SELECT state FROM news_offloads"))[0].state, 'restored');
});
test('restore: an editor key cannot restore; a damaged archive is refused', async t => {
  const { off } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await assert.rejects(off.restore({ id: 'e', kind: 'editor' }, x.buf), e => e.code === 'RESTORE_OWNER_ONLY');
  const zip = new AdmZip(x.buf), m = JSON.parse(zip.readAsText('manifest.json'));
  zip.updateFile('articles/' + m.articles[0].article_id + '/img-1.jpg', Buffer.from('not the photo'));
  await off.release('2026-11-12', x.sha256);
  await assert.rejects(off.restore(OWNER, zip.toBuffer()), e => e.code === 'OFFLOAD_DAMAGED');
});
test('storage: low when free + db free pages < 2 GB; suggest takes the oldest archived days', async t => {
  const { off } = await setup(t, { freeBytes: 1.5e9 });
  const s = await off.storage();
  assert.equal(s.low, true);
  assert.deepEqual(s.suggest.days, ['2026-11-12']);
  assert.ok(s.suggest.bytes > 0);
  assert.equal(s.by_month[0].month, '2026-11'); assert.ok(s.by_month[0].photos > 0);
  const ok = await (await setup(t, { freeBytes: 10e9 })).off.storage();
  assert.equal(ok.low, false);
});
test('a fresh day is not offered and cannot be exported', async t => {
  const { off, clock } = await setup(t);
  clock.now = Date.parse('2026-11-13T08:00:00+02:00');
  assert.deepEqual((await off.storage()).suggest.days, []);
  await assert.rejects(off.exportDay('2026-11-12'), e => e.code === 'OFFLOAD_DAY_NOT_ARCHIVED');
});

test('routes: owner-only storage, export with sha header, release, restore', async t => {
  const express = require('express');
  const { mountNewsRoutes } = require('../news/newsRoutes');
  const { off, repo } = await setup(t);
  const app = express();
  const resolveUser = async req => String(req.headers.cookie || '').includes('owner') ? { user: { id: 'o', role: 'owner' }, session: { csrf: 'c' } } : null;
  const editorAuth = { resolve: async req => String(req.headers.cookie || '').includes('editor') ? { id: 'e', kind: 'editor', via: 'key' } : null };
  mountNewsRoutes(app, { repo, editorAuth, resolveUser, offload: off });
  const s = await new Promise(r => { const x = app.listen(0, () => r(x)); });
  t.after(() => new Promise(r => s.close(r)));
  const base = 'http://127.0.0.1:' + s.address().port, owner = { cookie: 'lp=owner' }, w = { cookie: 'lp=owner', 'x-lp-csrf': 'c' };
  assert.equal((await fetch(base + '/api/news/editor/storage', { headers: { cookie: 'lp=editor' } })).status, 403);
  const st = await (await fetch(base + '/api/news/editor/storage', { headers: owner })).json();
  assert.deepEqual(st.suggest.days, ['2026-11-12']);
  const x = await fetch(base + '/api/news/editor/offload/2026-11-12', { headers: owner });
  assert.equal(x.status, 200);
  const buf = Buffer.from(await x.arrayBuffer());
  assert.equal(x.headers.get('x-pack-sha256'), sha(buf));
  assert.equal((await fetch(base + '/api/news/editor/offload/2026-11-12/release', { method: 'POST', headers: { ...w, 'content-type': 'application/json' }, body: JSON.stringify({ sha256: '0'.repeat(64) }) })).status, 409);
  assert.equal((await fetch(base + '/api/news/editor/offload/2026-11-12/release', { method: 'POST', headers: { ...w, 'content-type': 'application/json' }, body: JSON.stringify({ sha256: sha(buf) }) })).status, 200);
  const back = await fetch(base + '/api/news/editor/offload/restore', { method: 'POST', headers: { ...w, 'content-type': 'application/zip' }, body: buf });
  assert.equal(back.status, 200); assert.equal((await back.json()).restored, 2);
});

test('script: offloads the suggested days into a folder and brings them back', async t => {
  const express = require('express');
  const { mountNewsRoutes } = require('../news/newsRoutes');
  const script = require('../scripts/news/offload');
  const { off, repo, db, works } = await setup(t);
  const app = express();
  const resolveUser = async req => String(req.headers.cookie || '').includes('owner') ? { user: { id: 'o', role: 'owner' }, session: { csrf: 'c' } } : null;
  mountNewsRoutes(app, { repo, editorAuth: { resolve: async () => null }, resolveUser, offload: off });
  const s = await new Promise(r => { const x = app.listen(0, () => r(x)); });
  t.after(() => new Promise(r => s.close(r)));
  const base = 'http://127.0.0.1:' + s.address().port, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-off-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await script.offload({ base, cookie: 'lp=owner', csrf: 'c', dir });
  assert.deepEqual(r, { done: ['2026-11-12'], failed: [] });
  assert.ok(fs.existsSync(path.join(dir, 'news-2026-11-12.lpnews-archive.zip')));
  assert.ok(fs.existsSync(path.join(dir, 'ПРОЧТИ.txt')));
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_images'))[0].n, 0);
  const back = await script.restore({ base, cookie: 'lp=owner', csrf: 'c', dir });
  assert.deepEqual(back, { done: ['2026-11-12'], failed: [] });
  assert.equal((await repo.getWork('ynet', works[0])).item.public_work_id, works[0]);
});
