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
  const db = await openDb(['084_news_fingerprints.sql', '085_news_reading.sql', '086_news_offloads.sql', '087_news_offload_manifest.sql']);
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
  const x = await fetch(base + '/api/news/editor/offload/2026-11-12', { method: 'POST', headers: w });
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
  assert.ok(fs.readdirSync(dir).some(n => /^news-2026-11-12-[0-9a-f]{12}\.lpnews-archive\.zip$/.test(n)));
  assert.ok(fs.existsSync(path.join(dir, 'ПРОЧТИ.txt')));
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_images'))[0].n, 0);
  const back = await script.restore({ base, cookie: 'lp=owner', csrf: 'c', dir });
  assert.deepEqual(back, { done: ['2026-11-12'], already: [], failed: [] });
  assert.equal((await repo.getWork('ynet', works[0])).item.public_work_id, works[0]);
});

// ---- D review fixes ------------------------------------------------------------------------------------
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
test('review: a released day is never exported again (the only copy on the PC is not replaced)', async t => {
  const { db, off, ids } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await off.release('2026-11-12', x.sha256);
  // an article of that day comes back from the trash: a row of a released day with its body
  await run(db, "UPDATE news_articles SET offloaded_day=NULL, body_json='{}' WHERE article_id=?", [ids[0]]);
  await assert.rejects(off.exportDay('2026-11-12'), e => e.code === 'OFFLOAD_DAY_RELEASED');
  assert.deepEqual((await off.storage()).suggest.days, []);
});
test('review: release frees only what the archive holds, as it was exported', async t => {
  const { db, off, ids } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await run(db, 'UPDATE news_articles SET body_json=? WHERE article_id=?', [JSON.stringify({ revised: true }), ids[1]]); // changed after the export
  const r = await off.release('2026-11-12', x.sha256);
  assert.deepEqual(r, { day: '2026-11-12', articles: 1, photos: 1, skipped: 1 });
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_images WHERE article_id=?', [ids[1]]))[0].n, 1, 'the changed article keeps its photos');
});
test('review: restore skips an article revised after the offload and one that became a card', async t => {
  const { db, off, ids } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await off.release('2026-11-12', x.sha256);
  await run(db, 'UPDATE news_articles SET body_json=?, offloaded_day=NULL WHERE article_id=?', [JSON.stringify({ fresh: 1 }), ids[0]]); // a newer revision came in
  await run(db, "UPDATE news_articles SET tier='card' WHERE article_id=?", [ids[1]]);
  const r = await off.restore(OWNER, x.buf);
  assert.deepEqual(r, { day: '2026-11-12', restored: 0, duplicate: 1, missing: 0, expired: 1 });
  assert.equal((await all(db, 'SELECT body_json FROM news_articles WHERE article_id=?', [ids[0]]))[0].body_json, JSON.stringify({ fresh: 1 }));
});
test('review: lifecycle turning an offloaded article into a card clears the offload mark', async t => {
  const { repo, off, works, clock } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await off.release('2026-11-12', x.sha256);
  clock.now = Date.parse('2027-06-01T08:00:00+03:00');
  await repo.runLifecycle(clock.now);
  const card = await repo.getCard(works[0]);
  assert.equal(card.tier, 'card'); assert.equal(card.offloaded, undefined);
});
test('review: a new revision of an offloaded article is readable again', async t => {
  const { repo, off, works, jpeg } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await off.release('2026-11-12', x.sha256);
  await repo.ingestPack(OWNER, fixturePack([fixtureArticle({ revision: 2, source: { url: 'https://www.ynet.co.il/news/article/d1', canonical_url: 'https://www.ynet.co.il/news/article/d1' },
    images: [{ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg' }], __files: { 'img-1.jpg': jpeg } })]));
  const card = await repo.getCard(works[0]);
  assert.equal(card.offloaded, undefined); assert.equal(card.readable, true);
});
test('review: low is about the disk itself; a statfs error is not «low»; photos are stored, not deflated', async t => {
  const a = await setup(t, { freeBytes: 1.5e9 });
  assert.equal((await a.off.storage()).low, true);
  const broken = createNewsOffload({ db: a.db, repo: a.repo, dataDir: os.tmpdir(), now: () => a.clock.now, statfs: () => { throw new Error('no statfs'); } });
  const st = await broken.storage();
  assert.equal(st.low, false); assert.equal(st.disk, null);
  const x = await a.off.exportDay('2026-11-12');
  const img = new AdmZip(x.buf).getEntries().find(e => e.entryName.endsWith('.jpg'));
  assert.equal(img.header.method, 0);
});
test('review: the restore route refuses strangers before reading the body', async t => {
  const express = require('express');
  const { mountNewsRoutes } = require('../news/newsRoutes');
  const { off, repo } = await setup(t);
  const http = require('node:http');
  const app = express();
  mountNewsRoutes(app, { repo, editorAuth: { resolve: async () => null }, resolveUser: async () => null, offload: off });
  const s = await new Promise(r => { const x = app.listen(0, () => r(x)); });
  t.after(() => new Promise(r => { s.closeAllConnections && s.closeAllConnections(); s.close(r); }));
  // 100 MB announced, 1 KB sent: a body parser in front would wait for the rest; the owner check answers at once.
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: s.address().port, path: '/api/news/editor/offload/restore', method: 'POST',
      headers: { 'content-type': 'application/zip', 'content-length': String(100 * 1024 * 1024) } }, res => { resolve(res.statusCode); req.destroy(); });
    req.on('error', () => {});
    req.write(Buffer.alloc(1024));
    setTimeout(() => reject(new Error('no answer before the body')), 3000);
  });
  assert.equal(status, 401);
});

// ---- 897 debt, part D ------------------------------------------------------------------------------------
test('debt D: restore checks the day of each article and that works belong to it', async t => {
  const { db, off, ids } = await setup(t);
  const x = await off.exportDay('2026-11-12');
  await off.release('2026-11-12', x.sha256);
  await run(db, "UPDATE news_articles SET offloaded_day='2026-11-01' WHERE article_id=?", [ids[0]]);
  const r = await off.restore(OWNER, x.buf);
  assert.deepEqual(r, { day: '2026-11-12', restored: 1, duplicate: 0, missing: 0, mismatch: 1 });
  const zip = new AdmZip(x.buf), m = JSON.parse(zip.readAsText('manifest.json'));
  m.articles[1].works[0].work_id = ids[0] + '.b1';
  zip.updateFile('manifest.json', Buffer.from(JSON.stringify(m)));
  await assert.rejects(off.restore(OWNER, zip.toBuffer()), e => e.code === 'OFFLOAD_DAMAGED');
});
test('debt D: the export is a POST with CSRF (a GET changes nothing)', async t => {
  const express = require('express');
  const { mountNewsRoutes } = require('../news/newsRoutes');
  const { off, repo, db } = await setup(t);
  const app = express();
  const resolveUser = async req => String(req.headers.cookie || '').includes('owner') ? { user: { id: 'o', role: 'owner' }, session: { csrf: 'c' } } : null;
  mountNewsRoutes(app, { repo, editorAuth: { resolve: async () => null }, resolveUser, offload: off });
  const s = await new Promise(r => { const x = app.listen(0, () => r(x)); });
  t.after(() => new Promise(r => s.close(r)));
  const base = 'http://127.0.0.1:' + s.address().port;
  assert.equal((await fetch(base + '/api/news/editor/offload/2026-11-12', { headers: { cookie: 'lp=owner' } })).status, 404);
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_offloads'))[0].n, 0);
  assert.equal((await fetch(base + '/api/news/editor/offload/2026-11-12', { method: 'POST', headers: { cookie: 'lp=owner' } })).status, 403);
  const ok = await fetch(base + '/api/news/editor/offload/2026-11-12', { method: 'POST', headers: { cookie: 'lp=owner', 'x-lp-csrf': 'c' } });
  assert.equal(ok.status, 200); assert.ok(ok.headers.get('x-pack-sha256'));
});
test('debt D: restore brings back the overview rows of the day that are missing', async t => {
  const { db, off } = await setup(t);
  await run(db, `INSERT INTO news_overview_items(item_key, day, story_key, outlet_id, url, title_he, created_at, updated_at) VALUES ('na_${'c'.repeat(24)}','2026-11-12','S','ynet','https://www.ynet.co.il/news/article/c','כותרת','t','t')`);
  const x = await off.exportDay('2026-11-12');
  await off.release('2026-11-12', x.sha256);
  await run(db, 'DELETE FROM news_overview_items');
  await off.restore(OWNER, x.buf);
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM news_overview_items'))[0].n, 1);
});
test('debt D: suggestions prefer days that still hold photos and skip days about to become cards', async t => {
  const { db, off, clock, ids } = await setup(t);
  // a second, older day without photos, 5 days before it becomes a card
  await run(db, "UPDATE news_articles SET published_at='2026-05-30T07:40:00.000Z' WHERE article_id=?", [ids[1]]);
  await run(db, 'DELETE FROM news_images WHERE article_id=?', [ids[1]]);
  clock.now = Date.parse('2026-11-25T08:00:00+02:00');
  const st = await off.storage();
  assert.deepEqual(st.suggest.days, ['2026-11-12']);
});
