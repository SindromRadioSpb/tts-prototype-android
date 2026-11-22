'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const sqlite3 = require('sqlite3'), express = require('express'), AdmZip = require('adm-zip'), sharp = require('sharp');
const { createNewsRepo } = require('../db/newsRepo');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');
const { createNewsEditorAuth } = require('../news/newsEditorAuth');
const { mountNewsRoutes } = require('../news/newsRoutes');
const { buildPack } = require('../scripts/news/build-pack');
const C = require('../news/newsPackCore');
const { studyRows, glossFor } = require('./helpers/newsFixture.cjs');

const NOW = Date.parse('2026-11-20T19:30:00+02:00');
const ED = 'ne_' + '4'.repeat(18), DAY = '2026-11-20', STORY = DAY + '-library';
const SOURCE_TIME = '2026-11-20T08:30:00+02:00';
const PHOTO = 'https://ynet-pic1.yit.co.il/picserver5/example.jpg';
const URL = 'https://www.ynet.co.il/news/article/example';
const KEY = C.articleKey('ynet', URL);
const title = 'הספרייה בשכונה פותחת אולם קריאה חדש';
const paragraphs = ['חברי הקהילה מצאו מקום לקריאה משותפת ביום שישי. התושבים מוזמנים להביא ספרים לכל הגילים.',
  'הספרייה בשכונה פותחת אולם קריאה חדש השבוע. התקיימה פגישה עם צוות המרכז העירוני שנבחר לפרויקט.'];
const iso = ms => new Date(ms).toISOString();
const sql = (db, mode, query, params = []) => new Promise((resolve, reject) => {
  const cb = function (e, r) { if (e) reject(e); else resolve(r === undefined ? this : r); };
  if (mode === 'exec') db.exec(query, cb); else db[mode](query, params, cb);
});

async function harness(t, { closed = true, paywalled = false, full = true, photo = true, images = [{ src: PHOTO, role: 'hero', credit_he: 'דוגמה' }], servePhoto = null, outletId = 'ynet', sourceUrl = URL } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-archive-order-')), dir = path.join(dataDir, 'news-harvest');
  fs.mkdirSync(path.join(dir, 'photo-cache'), { recursive: true });
  let fakeImage;
  if (photo || servePhoto) {
    fakeImage = await sharp({ create: { width: 600, height: 400, channels: 3, background: 'blue' } }).jpeg().toBuffer();
    if (photo) fs.writeFileSync(path.join(dir, 'photo-cache', C.sha256(PHOTO).slice(0, 32) + '.jpg'), fakeImage);
  }
  const db = new sqlite3.Database(':memory:'), exec = query => sql(db, 'exec', query);
  const run = (query, p) => sql(db, 'run', query, p), all = (query, p) => sql(db, 'all', query, p);
  t.after(() => new Promise(resolve => db.close(() => { fs.rmSync(dataDir, { recursive: true, force: true }); resolve(); })));
  for (const name of fs.readdirSync(path.join(__dirname, '../migrations')).filter(f => /^(07[89]|08\d|09\d)_news.*\.sql$/.test(f)).sort())
    await exec(fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8'));
  const itemKey = C.articleKey(outletId, sourceUrl);
  const article = { title_he: title, url: sourceUrl, canonical_url: sourceUrl, published_at: SOURCE_TIME, section_original_he: 'חדשות', section: 'local',
    content_type: 'news', paywalled, paragraphs, images };
  await run(`INSERT INTO news_harvest_items(url_key, canonical_key, url, outlet_id, first_seen_at, status, title_he, published_at,
    story_key, full_ok, paywalled, data_json, edition_id, overview_state) VALUES(?,?,?,?,?,'ready',?,?,?,?,?,?,?,'done')`,
    [itemKey, itemKey, sourceUrl, outletId, iso(Date.parse(SOURCE_TIME)), title, SOURCE_TIME, STORY, full ? 1 : 0, paywalled ? 1 : 0, JSON.stringify(article), ED]);
  const filename = 'original-edition.zip';
  const candidate = { item_key: itemKey, story_key: STORY, outlet_id: outletId, url: sourceUrl, title_he: title, paywalled, full_ok: full, images: images.length };
  const catalog = { edition_id: ED, day: DAY, slot: 'midday', items: [candidate] };
  const overview = { ...catalog, items: undefined, stories: [{ story_key: STORY, items: [{ ...candidate, published_at: SOURCE_TIME }] }] };
  const zip = new AdmZip();
  zip.addFile('candidates.json', Buffer.from(JSON.stringify(catalog)));
  zip.addFile('overview.json', Buffer.from(JSON.stringify(overview)));
  zip.writeZip(path.join(dir, filename));
  await run(`INSERT INTO news_editions(edition_id, day, slot, trigger, status, cutoff_at, cut_at, closed_at, file_name, report_json)
    VALUES(?, ?, 'midday','schedule','published',?,?,?,?,?)`,
    [ED, DAY, iso(NOW - 6 * 3600e3), iso(NOW - 6 * 3600e3), closed ? iso(NOW - 3600e3) : null, filename,
      JSON.stringify({ overview_keys: [itemKey] })]);
  await run(`INSERT INTO news_overview_items(item_key,day,story_key,edition_id,outlet_id,url,published_at,title_he,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`, [itemKey, DAY, STORY, ED, outletId, sourceUrl, SOURCE_TIME, title, iso(NOW), iso(NOW)]);
  let now = NOW, fetches = 0;
  const harvester = createNewsHarvester({ db, dataDir, delayMs: 0, sources: [], now: () => now, fetchImpl: async (url, opts) => {
    fetches++;
    if (!servePhoto || opts.redirect !== 'error' || url === sourceUrl) throw new Error('article or unrestricted network forbidden for order');
    return servePhoto(url, fakeImage);
  } });
  const repo = createNewsRepo({ db, now: () => now }), auth = createNewsEditorAuth({ db, now: () => now });
  let scheduledAccounting = 0;
  repo.setEditionListener(args => { scheduledAccounting++; return harvester.accountPack(args); });
  const audits = [], app = express();
  mountNewsRoutes(app, { repo, harvester, editorAuth: auth, packLimitPerHour: 50, audit: (...args) => audits.push(args),
    resolveUser: req => req.headers.cookie === 'owner=yes' ? { user: { role: 'owner', id: 'owner' }, session: { csrf: 'owner-csrf' } } : null });
  const server = await new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { key } = await auth.createEditor('owner', 'dot'), second = (await auth.createEditor('owner', 'other')).key;
  const POST = async (route, body, headers) => fetch('http://127.0.0.1:' + server.address().port + route, { method: 'POST', body, headers });
  const order = (body = { item_key: itemKey, note_ru: 'Выбор владельца' }, h = { authorization: 'Bearer ' + key }) =>
    POST('/api/news/editor/editions/' + ED + '/archive-order', JSON.stringify(body), { 'content-type': 'application/json', ...h });
  const ingest = (bytes, k = key) => POST('/api/news/editor/packs', bytes, { 'content-type': 'application/zip', authorization: 'Bearer ' + k }).then(async r => ({
    status: r.status, ...(await r.json()),
  }));
  const prep = async response => {
    const bytes = Buffer.from(await response.arrayBuffer()), z = new AdmZip(bytes), m = JSON.parse(z.readAsText('archive-order.json'));
    const folder = path.join(dataDir, 'work');
    z.extractAllTo(folder, true);
    const draftFile = path.join(folder, m.draft), draft = JSON.parse(fs.readFileSync(draftFile));
    draft.learning.title_ru = 'Открытие читального зала';
    draft.learning.summary_ru = 'В библиотеке появился новый зал.';
    for (const r of draft.learning.versions[0].rows) r.ru = 'Учебный перевод предложения.';
    draft.learning.versions[0].rows = studyRows(draft.learning.versions[0].rows);
    draft.learning.versions[0].word_gloss_ai = 'gloss.json';
    fs.writeFileSync(path.join(folder, 'gloss.json'), glossFor(draft.learning.versions[0].rows));
    fs.writeFileSync(draftFile, JSON.stringify(draft));
    const pack = await buildPack(folder, { now });
    assert.equal(pack.ok, true, JSON.stringify(pack));
    return { bytes, z, m, folder, draft, draftFile, packed: fs.readFileSync(pack.written) };
  };
  const snapshot = async () => JSON.stringify(await Promise.all([
    all('SELECT * FROM news_editions ORDER BY edition_id'), all('SELECT * FROM news_overview_items ORDER BY item_key'),
    all('SELECT * FROM news_settings ORDER BY key'), harvester.nextEdition(), harvester.status(),
    Promise.resolve(C.sha256(fs.readFileSync(path.join(dir, filename)))),
  ]));
  return { db, dir, all, run, harvester, order, ingest, prep, snapshot, key, second, audits, advance: ms => { now += ms; },
    fetches: () => fetches, scheduledAccounting: () => scheduledAccounting };
}

function changePack(bytes, editManifest, editArticle, editZip) {
  const zip = new AdmZip(bytes), m = JSON.parse(zip.readAsText('manifest.json'));
  if (editArticle) {
    const p = m.articles[0].path, a = JSON.parse(zip.readAsText(p));
    editArticle(a);
    const body = Buffer.from(JSON.stringify(a));
    zip.updateFile(p, body); m.articles[0].sha256 = C.sha256(body);
  }
  if (editManifest) editManifest(m);
  if (editZip) editZip(zip);
  zip.updateFile('manifest.json', Buffer.from(JSON.stringify(m)));
  return zip.toBuffer();
}

test('closed archive: editor auth → exact order ZIP → standard tool → published article without re-accounting or refetch', async t => {
  const s = await harness(t), before = await s.snapshot();
  assert.equal((await s.order(undefined, {})).status, 401);
  assert.equal((await s.order(undefined, { cookie: 'owner=yes' })).status, 403);
  const response = await s.order();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const { bytes, m, packed } = await s.prep(response);
  assert.equal(m.parent_edition_id, ED); assert.equal(m.day, DAY); assert.equal(m.item_key, KEY);
  assert.equal(m.images['img-1.jpg'].length, 64);
  const retry = await s.order();
  assert.deepEqual(Buffer.from(await retry.arrayBuffer()), bytes);
  assert.equal((await s.order(undefined, { authorization: 'Bearer ' + s.second })).status, 409);
  assert.equal(await s.snapshot(), before);
  const unauthorized = await s.ingest(packed, s.second);
  assert.equal(unauthorized.receipt.items[0].code, 'ARCHIVE_ORDER_UNKNOWN');
  const wrongDate = await s.ingest(changePack(packed, null, a => { a.source.published_at = '2026-11-20T09:30:00+02:00'; }));
  assert.equal(wrongDate.receipt.items[0].code, 'ARCHIVE_SOURCE_CHANGED');
  const wrongRows = await s.ingest(changePack(packed, null, a => { a.learning.versions[0].rows[0].p = 2; }));
  assert.equal(wrongRows.receipt.items[0].code, 'ARCHIVE_SOURCE_CHANGED');
  const wrongPhoto = await s.ingest(changePack(packed, null, null, z => {
    const e = z.getEntries().find(e => e.entryName.endsWith('/img-1.jpg'));
    const b = e.getData(); b[40] ^= 1; z.updateFile(e.entryName, b);
  }));
  assert.equal(wrongPhoto.receipt.items[0].code, 'ARCHIVE_SOURCE_CHANGED');
  assert.equal((await s.ingest(changePack(packed, m => { m.edition_id = ED; }))).detail, 'ARCHIVE_ORDER_SCOPE');
  assert.equal((await s.ingest(changePack(packed, m => { delete m.archive_order_id; }))).receipt.items[0].code, 'ARCHIVE_ORDER_REQUIRED');
  const posted = await s.ingest(packed);
  assert.equal(posted.receipt.totals.published, 1, JSON.stringify(posted)); assert.equal(posted.receipt.overview, undefined);
  assert.equal(posted.receipt.items[0].article_id, KEY);
  const record = (await s.all('SELECT * FROM news_articles'))[0], provenance = JSON.parse(record.provenance_json);
  assert.equal(record.story_key, STORY); assert.equal(record.published_at, iso(Date.parse(SOURCE_TIME)));
  assert.equal(provenance.parent_edition_id, ED); assert.equal(provenance.archive_order_id, m.order_id);
  assert.equal(provenance.selection_note_ru, 'Выбор владельца');
  const retryUpload = (await s.ingest(packed)).receipt;
  assert.equal(retryUpload.totals.duplicate, 1); assert.equal(retryUpload.items[0].work_id, posted.receipt.items[0].work_id);
  assert.equal((await s.ingest(changePack(packed, m => { m.pack_id = crypto.randomUUID(); }))).receipt.items[0].code, 'ALREADY_TAKEN');
  assert.equal((await s.order()).status, 409);
  assert.equal(await s.snapshot(), before); assert.equal(s.scheduledAccounting(), 0); assert.equal(s.fetches(), 0);
  assert.ok(s.audits.some(a => a[0] === 'news_archive_order' && a[2].order_id === m.order_id));
});

test('closed archive: exact candidate, nonpaywall body, source freshness, and normal live extras route', async t => {
  const live = await harness(t, { closed: false }), closed = await harness(t, { photo: false });
  const code = async r => (await (await r).json()).error;
  assert.equal(await code(live.order()), 'EDITION_NOT_CLOSED');
  assert.equal(await code(closed.order({})), 'UNKNOWN_ITEM');
  assert.equal(await code(closed.order({ item_key: 'na_' + '0'.repeat(24), note_ru: 'Изучение' })), 'NOT_A_CANDIDATE');
  assert.equal(await code(closed.order({ item_key: KEY, note_ru: '' })), 'NOTE_REQUIRED');
  await closed.run("UPDATE news_harvest_items SET paywalled=1 WHERE url_key=?", [KEY]);
  assert.equal(await code(closed.order()), 'PAYWALL');
  await closed.run("UPDATE news_harvest_items SET paywalled=0,main_state='drafted' WHERE url_key=?", [KEY]);
  assert.equal(await code(closed.order()), 'ALREADY_TAKEN');
  await closed.run("UPDATE news_harvest_items SET main_state='none',data_json=NULL WHERE url_key=?", [KEY]);
  assert.equal(await code(closed.order()), 'SOURCES_EXPIRED');
  assert.equal((await closed.all('SELECT COUNT(*) AS n FROM news_archive_orders'))[0].n, 0);
  const open = await live.harvester.orderExtras(ED, [{ item_key: KEY, note_ru: 'Изучение' }]);
  assert.ok(open.buffer.length);
  assert.equal((await live.all('SELECT extras_count FROM news_editions WHERE edition_id = ?', [ED]))[0].extras_count, 1);
});

test('closed archive: exact actor retries, expiry, and a source without photos never triggers network', async t => {
  const s = await harness(t, { photo: false, images: [] });
  const rs = await Promise.all([s.order(), s.order()]);
  const first = await s.prep(rs[0]), same = Buffer.from(await rs[1].arrayBuffer());
  assert.deepEqual(first.bytes, same); assert.deepEqual(first.m.images, {});
  s.advance(6 * 3600e3 + 1000);
  assert.equal((await s.ingest(first.packed)).receipt.items[0].code, 'ARCHIVE_ORDER_EXPIRED');
  const second = await s.prep(await s.order());
  assert.notEqual(second.m.order_id, first.m.order_id);
  assert.equal((await s.ingest(first.packed)).receipt.items[0].code, 'ARCHIVE_ORDER_UNKNOWN');
  s.advance(46 * 86400000); // the full text is kept 45 days (findability W3)
  const expired = await s.order();
  assert.equal(expired.status, 410); assert.equal((await expired.json()).error, 'SOURCES_EXPIRED');
  assert.equal(s.fetches(), 0);
});

test('closed archive: a photo that cannot be fetched is left out with its reason; the text and the other photos ship and publish (2026-11-22)', async t => {
  const images = Array.from({ length: 12 }, (_, i) => ({ src: 'https://images.maariv.co.il/image/upload/example-' + i + '.jpg',
    role: i ? 'inline' : 'hero', ...(i ? { after_p: 1 } : {}), credit_he: 'דוגמה' }));
  const s = await harness(t, { photo: false, images, outletId: 'maariv', sourceUrl: 'https://www.maariv.co.il/culture/music/article-1000000',
    servePhoto: async (url, jpeg) => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /image/upload/', { status: 200 });
    assert.ok(images.some(x => x.src === url));
    if (url === images[3].src) return new Response(null, { status: 404 });
    return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
  } });
  const res = await s.order();
  assert.equal(res.status, 200, 'a missing photo does not block the order');
  const { m, draft, packed, z } = await s.prep(res);
  assert.equal(Object.keys(m.images).length, 11);
  assert.deepEqual(draft.images.map(x => x.source_url), images.filter((_, i) => i !== 3).map(x => x.src));
  for (const im of draft.images) assert.equal(C.sha256(z.getEntry('maariv-archive-01/' + im.file).getData()), m.images[im.file]);
  assert.deepEqual(m.photos_missing, [{ source_url: images[3].src, reason: 'HTTP_404' }]);
  assert.ok(draft.learning.versions[0].rows.length > 0, 'the full text is in the draft');
  assert.equal((await s.ingest(packed)).receipt.totals.published, 1);
});

test('closed archive: a captured URL outside the image CDN or forbidden by robots is never fetched; the order ships without it and publishes', async t => {
  const bad = await harness(t, { photo: false, images: [{ src: URL, role: 'hero' }] });
  const res = await bad.order();
  assert.equal(res.status, 200); assert.equal(bad.fetches(), 0);
  const a = await bad.prep(res);
  assert.deepEqual(a.m.images, {}); assert.deepEqual(a.draft.images, []);
  assert.deepEqual(a.m.photos_missing, [{ source_url: URL, reason: 'ARCHIVE_IMAGE_HOST' }]);
  assert.equal((await bad.ingest(a.packed)).receipt.totals.published, 1);
  const blocked = await harness(t, { photo: false, servePhoto: url => {
    assert.ok(url.endsWith('/robots.txt'));
    return new Response('User-agent: *\nDisallow: /picserver5/');
  } });
  const r2 = await blocked.order();
  assert.equal(r2.status, 200); assert.equal(blocked.fetches(), 1);
  assert.equal((await blocked.prep(r2)).m.photos_missing[0].reason, 'ROBOTS');
});

test('walla: photos on image-resizer-walla.walla.cloud are an allowed archive image host (bug 2026-11-22)', () => {
  const { canFetchArchiveImage } = require('../news/harvest/newsHarvestSources');
  assert.equal(canFetchArchiveImage('walla', 'https://image-resizer-walla.walla.cloud/image/2026/11/3/images/1795277288099_walla-media-picture_601x457.webp'), true);
  assert.equal(canFetchArchiveImage('walla', 'http://image-resizer-walla.walla.cloud/x.webp'), false);
  assert.equal(canFetchArchiveImage('walla', 'https://evil.walla.cloud.example.com/x.webp'), false);
  assert.equal(canFetchArchiveImage('ynet', 'https://image-resizer-walla.walla.cloud/x.webp'), false);
});

test('closed archive: a reserved candidate does not get drafted in a later collection or re-leased', async t => {
  const s = await harness(t, { photo: false, images: [] });
  assert.equal((await s.order()).status, 200);
  await s.run("UPDATE news_harvest_items SET overview_state='todo' WHERE url_key=?", [KEY]);
  const next = await s.harvester.runOnce();
  assert.equal(next.articles, 0); assert.equal(next.overview_items, 1, 'still allowed in a normal overview');
  const file = await s.harvester.downloadEdition(next.edition_id, { lease: false });
  const zip = new AdmZip(file.path);
  assert.deepEqual(JSON.parse(zip.readAsText('candidates.json')).items, []);
  const [source] = await s.all('SELECT main_state, main_edition_id, lease_until FROM news_harvest_items WHERE url_key=?', [KEY]);
  assert.deepEqual(source, { main_state: 'none', main_edition_id: null, lease_until: null });
});

test('closed archive: waiting on a cold CDN does not lock the collector', async t => {
  let release, signal;
  const arrived = new Promise(resolve => { signal = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const s = await harness(t, { photo: false, servePhoto: async (url, jpeg) => {
    if (url.endsWith('/robots.txt')) return new Response(null, { status: 404 });
    signal(); await waiting;
    return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
  } });
  const order = s.order();
  try {
    await arrived;
    assert.equal(s.harvester.isRunning(), false);
    assert.equal((await s.harvester.runOnce()).status, 'skipped');
  } finally { release(); }
  assert.equal((await order).status, 200);
});

test('closed archive: a 5-day-old article is ordered from its compressed body (findability W3)', async t => {
  const s = await harness(t, { photo: false, images: [] });
  s.advance(5 * 86400000);
  await s.harvester.cleanup();
  const [row] = await s.all('SELECT data_json, data_gz FROM news_harvest_items WHERE url_key = ?', [KEY]);
  assert.equal(row.data_json, null); assert.ok(row.data_gz);
  const r = await s.order();
  assert.equal(r.status, 200, await r.clone().text());
  const z = new AdmZip(Buffer.from(await r.arrayBuffer())), m = JSON.parse(z.readAsText('archive-order.json'));
  assert.ok(JSON.parse(z.readAsText(m.draft)).learning.versions[0].rows.length > 0);
});

test('owner order: dot takes it 20 days later (no edition archive needed), publishes, the order closes (findability W5)', async t => {
  const s = await harness(t, { photo: false, images: [] });
  const { createOwnerOrders } = require('../news/newsOwnerOrders');
  const orders = createOwnerOrders({ db: s.db, now: () => Date.parse(SOURCE_TIME) + 20 * 86400000 });
  s.advance(20 * 86400000);
  await s.run("DELETE FROM news_editions"); // the edition archive is long gone
  const [o] = (await orders.orderArticle({ id: 'owner', kind: 'owner' }, { item_key: KEY, note_ru: 'Заказ владельца' })).created;
  const editor = (await s.all("SELECT editor_id FROM news_editors LIMIT 1"))[0];
  const actor = { id: 'editor:' + (editor ? editor.editor_id : 'x'), kind: 'editor' };
  const built = await s.harvester.orderForOwner(o, actor);
  assert.match(built.order_id, /^nso_[0-9a-f]{32}$/);
  const z = new AdmZip(built.buffer), m = JSON.parse(z.readAsText('archive-order.json'));
  assert.equal(m.item_key, KEY);
  assert.ok(JSON.parse(z.readAsText(m.draft)).learning.versions[0].rows.length > 0);
  const again = await s.harvester.orderForOwner(o, actor);
  assert.equal(again.order_id, built.order_id, 'taking it again gives the same draft');
});
test('owner order: a main article dot dropped can still be ordered by the owner (review W5 I2)', async t => {
  const s = await harness(t, { photo: false, images: [] });
  await s.run("UPDATE news_harvest_items SET main_state='dropped' WHERE url_key=?", [KEY]);
  const editor = (await s.all("SELECT editor_id FROM news_editors LIMIT 1"))[0];
  const built = await s.harvester.orderForOwner({ item_key: KEY, note_ru: 'Заказ' }, { id: 'editor:' + editor.editor_id, kind: 'editor' });
  assert.match(built.order_id, /^nso_/);
});
