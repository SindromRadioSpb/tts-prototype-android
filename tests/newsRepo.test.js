'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const AdmZip = require('adm-zip');
const C = require('../news/newsPackCore');
const { createNewsRepo } = require('../db/newsRepo');
const { buildNewsSnapshot } = require('../news/newsSnapshot');
const { fixtureArticle, fixturePack, SOURCE, sha256 } = require('./helpers/newsFixture.cjs');

const NOW = Date.parse('2026-11-12T08:00:00+02:00');
const OWNER = { id: 'owner', kind: 'owner' };
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));

async function setup(t, now = NOW) {
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  await exec(db, 'PRAGMA foreign_keys=ON');
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '078_news.sql'), 'utf8'));
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '079_news_manage.sql'), 'utf8'));
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '080_news_images.sql'), 'utf8'));
  t.after(() => new Promise(r => db.close(r)));
  return { db, repo: createNewsRepo({ db, now: () => now }) };
}
const art = (over = {}) => fixtureArticle(over);
const other = n => art({ source: { url: 'https://www.ynet.co.il/news/article/n' + n, canonical_url: 'https://www.ynet.co.il/news/article/n' + n } });

test('valid pack publishes, receipt counts per article', async t => {
  const { repo, db } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([art(), art({ source: { outlet_id: 'nope' } })]));
  assert.equal(r.totals.published, 1); assert.equal(r.totals.rejected, 1);
  assert.equal(r.items.find(i => i.status === 'rejected').code, 'OUTLET_UNKNOWN');
  const row = await get(db, 'SELECT * FROM news_articles');
  assert.equal(row.tier, 'fresh'); assert.equal(row.article_id, C.articleKey('ynet', 'https://www.ynet.co.il/news/article/abc123'));
  assert.equal(JSON.parse(row.body_json).check, undefined);
  assert.equal((await all(db, 'SELECT work_id FROM news_works')).map(w => w.work_id)[0], row.article_id + '.b1');
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_packs')).n, 1);
});
test('same pack twice and concurrent packs with one article give one row', async t => {
  const { repo, db } = await setup(t); const zip = fixturePack([art()]);
  const [a, b] = await Promise.all([repo.ingestPack(OWNER, zip), repo.ingestPack(OWNER, fixturePack([art()]))]);
  assert.equal(a.totals.published + b.totals.published, 1);
  assert.equal(a.totals.duplicate + b.totals.duplicate, 1);
  assert.equal((await repo.ingestPack(OWNER, zip)).totals.duplicate, 1);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_articles')).n, 1);
});
test('higher revision replaces, lower is REVISION_STALE', async t => {
  const { repo, db } = await setup(t);
  await repo.ingestPack(OWNER, fixturePack([art({ revision: 2 })]));
  const before = (await get(db, 'SELECT snapshot_sha256 s FROM news_works')).s;
  const r3 = await repo.ingestPack(OWNER, fixturePack([art({ revision: 3, learning: { title_ru: 'Исправлено' , versions: [{ level: 'B1', rows: [...art().learning.versions[0].rows, { p: 3, he_plain: 'זו שורה חדשה.', ru: 'Новая строка.' }] }] } })]));
  assert.equal(r3.totals.revised, 1);
  assert.notEqual((await get(db, 'SELECT snapshot_sha256 s FROM news_works')).s, before);
  const r1 = await repo.ingestPack(OWNER, fixturePack([art({ revision: 1 })]));
  assert.equal(r1.items[0].code, 'REVISION_STALE');
});
test('older than 72h goes straight to archive, older than 6 months to card', async t => {
  const { repo, db } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([
    art({ source: { published_at: '2026-11-08T07:40:00+02:00', retrieved_at: '2026-11-12T07:00:00+02:00' } }),
    { ...other(2), source: { ...other(2).source, published_at: '2026-01-01T07:40:00+02:00' } },
  ]));
  assert.equal(r.totals.archived, 2);
  assert.deepEqual((await all(db, 'SELECT tier FROM news_articles ORDER BY published_at')).map(x => x.tier), ['card', 'archive']);
  assert.equal((await get(db, "SELECT body_json b FROM news_articles WHERE tier='card'")).b, null);
});
test('overlap 8–15% is flagged, >15% rejected', async t => {
  const { repo } = await setup(t);
  const srcWords = SOURCE.split(/\s+/);
  const copied = srcWords.slice(0, 6).join(' ') + '.'; // 2 copied windows
  const filler = n => Array.from({ length: n }, (_, i) => 'מילה' + 'אבגדהוזחטיכלמנסעפצקרשת'[i % 22]).join(' ') + '.';
  const rows = extra => [{ p: 1, he_plain: copied, ru: 'а' }, { p: 1, he_plain: filler(extra), ru: 'б' }, { p: 2, he_plain: 'סוף.', ru: 'в' }];
  const flagged = await repo.ingestPack(OWNER, fixturePack([art({ learning: { versions: [{ level: 'B1', rows: rows(15) }] } })]));
  assert.equal(flagged.totals.flagged, 1, JSON.stringify(flagged.items));
  const rejected = await repo.ingestPack(OWNER, fixturePack([other(3), { ...other(4), learning: { ...other(4).learning, versions: [{ level: 'B1', rows: rows(1) }] } }]));
  assert.equal(rejected.items.find(i => i.status === 'rejected').code, 'VERBATIM_OVERLAP');
});
test('hostile zip: traversal, absolute path, oversize entry, sha mismatch', async t => {
  const { repo, db } = await setup(t);
  await assert.rejects(repo.ingestPack(OWNER, fixturePack([], { entries: [{ name: '../evil.json', data: '{}', list: true }] })), /PACK_INVALID/);
  await assert.rejects(repo.ingestPack(OWNER, fixturePack([art()], { entries: [{ name: 'articles/x/../../evil.json', data: '{}' }] })), /PACK_INVALID/);
  await assert.rejects(repo.ingestPack(OWNER, fixturePack([], { manifestOver: { articles: [{ path: '/abs/article.json', sha256: 'a'.repeat(64) }] } })), /PACK_INVALID/);
  await assert.rejects(repo.ingestPack(OWNER, Buffer.from('not a zip')), /PACK_INVALID/);
  await assert.rejects(repo.ingestPack(OWNER, fixturePack([art()], { manifestOver: { schema: 'other' } })), /PACK_INVALID/);
  const big = { ...art(), learning: { ...art().learning, padding: 'א'.repeat(600 * 1024) } };
  assert.equal((await repo.ingestPack(OWNER, fixturePack([big]))).items[0].code, 'TOO_LARGE');
  const zip = new AdmZip(fixturePack([art()])); const m = JSON.parse(zip.readAsText('manifest.json'));
  m.articles[0].sha256 = 'b'.repeat(64); zip.updateFile('manifest.json', Buffer.from(JSON.stringify(m)));
  assert.equal((await repo.ingestPack(OWNER, zip.toBuffer())).items[0].code, 'SHA_MISMATCH');
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_articles')).n, 0);
});
test('withdraw removes from feed and logs event', async t => {
  const { repo, db } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([art(), other(5)]));
  const r2 = await repo.ingestPack(OWNER, fixturePack([], { withdraw: [{ outlet_id: 'ynet', canonical_url: 'https://www.ynet.co.il/news/article/abc123/?utm_source=q', reason: 'ошибка' }] }));
  assert.equal(r2.totals.withdrawn, 1);
  const w = await repo.withdrawArticle(OWNER, r.items[1].article_id, 'снято');
  assert.equal(w.tier, 'withdrawn');
  assert.deepEqual((await all(db, 'SELECT DISTINCT tier FROM news_articles')).map(x => x.tier), ['withdrawn']);
  assert.ok((await all(db, "SELECT type FROM news_events")).some(e => e.type === 'withdrawn'));
  const p = await repo.withdrawPack(OWNER, r.pack_id, 'весь пакет');
  assert.equal(p.count, 0);
});
test('snapshot has reader shape and keeps gloss layer', async () => {
  const a = art(); delete a.check;
  const key = 'r' + 'a'.repeat(16) + ':6';
  const layer = { schema: 'word-gloss-ai-layer-v1', rows: [{ order_index: 0, key, model: 'dot', mwe: [], glosses: Array.from({ length: 6 }, () => ({ gloss: 'слово', wrong_hint: false })) }] };
  const { snapshot, snapshot_sha256 } = buildNewsSnapshot(a, a.learning.versions[0], { workId: 'na_x.b1', glossLayer: layer });
  const text = snapshot.library.texts[0];
  assert.equal(text.rows[0].hebrew_plain, a.learning.versions[0].rows[0].he_plain);
  assert.deepEqual(Object.keys(text.rows[0]).sort(), ['edit_meta', 'hebrew_niqqud', 'hebrew_plain', 'order_index', 'russian', 'translit', 'translit_ru']);
  assert.equal(text.rows[1].edit_meta._studio_material.field_meta.he_niqqud.provider, 'dot');
  assert.equal(text.source_meta.news.outlet_id, 'ynet');
  assert.equal(text.word_gloss_ai_layer.schema, 'word-gloss-ai-layer-v1');
  assert.match(snapshot_sha256, /^[0-9a-f]{64}$/);
  assert.equal(text.source_text.split('\n').length, 2);
});
test('rows without niqqud still show Hebrew, and the receipt asks for niqqud', async t => {
  const { repo, db } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([art()]));
  assert.ok(r.items[0].warnings.includes('NIQQUD_MISSING:B1:2'), JSON.stringify(r.items[0].warnings));
  const rows = JSON.parse((await get(db, 'SELECT snapshot_json s FROM news_works')).s).library.texts[0].rows;
  assert.equal(rows[0].hebrew_niqqud, rows[0].hebrew_plain);
  assert.equal(rows[1].hebrew_niqqud, art().learning.versions[0].rows[1].he_niqqud);
});
test('gloss layer file in the pack is bounded and counted', async t => {
  const { repo, db } = await setup(t);
  const a = art(); a.learning.versions[0].word_gloss_ai = 'b1.word-gloss-ai.json';
  a.__files = { 'b1.word-gloss-ai.json': JSON.stringify({ schema: 'word-gloss-ai-layer-v1', rows: [
    { order_index: 0, key: 'r' + 'a'.repeat(16) + ':6', model: 'dot', mwe: [], glosses: Array.from({ length: 6 }, () => ({ gloss: 'слово', wrong_hint: false })) },
    { order_index: 99, key: 'bad', model: 'dot', mwe: [], glosses: [] }] }) };
  const r = await repo.ingestPack(OWNER, fixturePack([a]));
  assert.equal(r.totals.published, 1);
  assert.ok(r.items[0].warnings.some(w => w.startsWith('WORD_GLOSS_REJECTED')));
  const snap = JSON.parse((await get(db, 'SELECT snapshot_json s FROM news_works')).s);
  assert.equal(snap.library.texts[0].word_gloss_ai_layer.rows.length, 1);
});
test('review fix: news transactions share the process-wide transaction lock', async t => {
  const { withTxnLock } = require('../db/txnLock');
  const { repo, db } = await setup(t);
  let release;
  const foreign = withTxnLock(async () => {
    await exec(db, 'BEGIN IMMEDIATE');
    await new Promise(r => { release = r; });
    await exec(db, 'COMMIT');
  });
  await new Promise(r => setImmediate(r));
  const ingest = repo.ingestPack(OWNER, fixturePack([art()]));
  await new Promise(r => setTimeout(r, 30));
  release();
  await foreign;
  assert.equal((await ingest).totals.published, 1);
});
test('review fix: impossible dates are DATE_MISSING, not INTERNAL_ERROR', async t => {
  const { repo } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([art({ source: { published_at: '2026-13-01T00:00:00+02:00' } })]));
  assert.equal(r.items[0].code, 'DATE_MISSING');
});
test('review fix: the reader snapshot carries the normalized https original url', async t => {
  const { repo, db } = await setup(t);
  await repo.ingestPack(OWNER, fixturePack([art({ source: { canonical_url: 'http://www.ynet.co.il/news/article/abc123/?utm_source=x' } })]));
  const snap = JSON.parse((await get(db, 'SELECT snapshot_json s FROM news_works')).s);
  assert.equal(snap.library.texts[0].source_meta.news.canonical_url, 'https://www.ynet.co.il/news/article/abc123');
});

// Owner decision 2026-11-14: originals one-to-one ('OR') with photos from the article, stored by us.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const origRows = () => [{ p: 1, he_plain: SOURCE.split(' ').slice(0, 17).join(' ') + '.', ru: 'Первая часть.' },
  { p: 2, he_plain: SOURCE.split(' ').slice(17).join(' ') + '.', ru: 'Вторая часть.' }];
const original = (over = {}) => art({ learning: { title_he: 'הכנסת אישרה בקריאה ראשונה את תקציב המדינה', subtitle_he: 'הצעת התקציב עברה', subtitle_ru: 'Проект прошёл',
  versions: [{ level: 'OR', rows: origRows() }, art().learning.versions[0]] }, prepared: { method: 'original' },
  images: [{ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg', credit_he: 'צילום: א', caption_he: 'המליאה', caption_ru: 'Пленум' },
    { file: 'img-2.jpg', role: 'inline', after_p: 1, source_url: 'https://ynet-pic1.yit.co.il/p/2.jpg', credit_he: 'צילום: ב' }],
  __files: { 'img-1.jpg': JPEG, 'img-2.jpg': JPEG }, ...over });
test('original + photos: published, verbatim allowed, photos stored and served via the card and snapshot', async t => {
  const { repo, db } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([original()]));
  assert.equal(r.totals.published, 1, JSON.stringify(r.items));
  assert.ok(r.items[0].fidelity > 0.95);
  assert.equal((await all(db, 'SELECT name FROM news_images ORDER BY name')).map(x => x.name).join(','), 'img-1.jpg,img-2.jpg');
  const id = r.items[0].article_id;
  const img = await repo.getImage(id, 'img-1.jpg');
  assert.equal(img.mime, 'image/jpeg'); assert.ok(Buffer.from(img.bytes).equals(JPEG));
  const card = await repo.getCard(id + '.or');
  assert.equal(card.work_id, id + '.or'); assert.deepEqual(card.levels, ['OR', 'B1']);
  assert.match(card.image.stored.url, new RegExp('^/api/news/images/' + id + '/img-1[.]jpg[?]v=[0-9a-f]{12}$'));
  const work = await repo.getWork('ynet', id + '.or');
  const news = work.item.snapshot.library.texts[0].source_meta.news;
  assert.equal(news.original, true); assert.equal(news.subtitle_ru, 'Проект прошёл');
  assert.deepEqual(news.images.map(i => [i.role, i.after_p, i.credit_he]), [['hero', null, 'צילום: א'], ['inline', 1, 'צילום: ב']]);
  assert.equal(work.item.snapshot.library.texts[0].rows[0].hebrew_plain, origRows()[0].he_plain);
});
test('original that is not the source is ORIGINAL_MISMATCH; a missing or fake photo is IMAGE_INVALID', async t => {
  const { repo } = await setup(t);
  const wrong = original({ learning: { versions: [{ level: 'OR', rows: [{ p: 1, he_plain: 'טקסט אחר לגמרי שאין לו שום קשר למאמר המקורי בכלל ועוד מילים.', ru: 'Другое.' }] }] } });
  assert.equal((await repo.ingestPack(OWNER, fixturePack([wrong]))).items[0].code, 'ORIGINAL_MISMATCH');
  assert.equal((await repo.ingestPack(OWNER, fixturePack([original({ __files: { 'img-1.jpg': JPEG } })]))).items[0].code, 'IMAGE_INVALID');
  assert.equal((await repo.ingestPack(OWNER, fixturePack([original({ __files: { 'img-1.jpg': JPEG, 'img-2.jpg': '<svg/>' } })]))).items[0].code, 'IMAGE_INVALID');
});
test('photos leave with the article: card tier and trash purge drop them; getImage hides deleted articles', async t => {
  const { repo, db } = await setup(t);
  const id = (await repo.ingestPack(OWNER, fixturePack([original()]))).items[0].article_id;
  await repo.deleteArticle(OWNER, id, 'x');
  assert.equal(await repo.getImage(id, 'img-1.jpg'), null);
  await repo.runLifecycle(NOW + 31 * 24 * 3600 * 1000);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_images')).n, 0);
  const id2 = (await repo.ingestPack(OWNER, fixturePack([original({ source: { url: 'https://www.ynet.co.il/news/article/n2', canonical_url: 'https://www.ynet.co.il/news/article/n2' } })]))).items[0].article_id;
  await repo.runLifecycle(NOW + 200 * 24 * 3600 * 1000);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_images WHERE article_id=?', [id2])).n, 0);
});
