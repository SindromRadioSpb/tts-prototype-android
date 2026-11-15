'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const NR = require('../public/js/news-reader');

const WORK = 'na_' + 'a'.repeat(24) + '.b1';
const meta = over => ({ outlet_id: 'ynet', canonical_url: 'https://www.ynet.co.il/news/article/abc', published_at: '2026-11-12T05:40:00.000Z',
  author: 'כתב', section_original_he: 'חדשות', content_type: 'news', prepared: { by: 'dot', prepared_at: '2026-11-12T05:58:00.000Z' }, ...over });

test('parseEntry accepts only a news work id', () => {
  assert.deepEqual(NR.parseEntry('?news=' + WORK + '&from=news'), { workId: WORK, fromNews: true });
  assert.equal(NR.parseEntry('?news=../x'), null);
  assert.equal(NR.parseEntry('?public_corpus=x'), null);
});
test('returnHref stays on /news.html of this origin', () => {
  const o = 'https://linguistpro.example';
  assert.equal(NR.returnHref('?news=' + WORK + '&from=news&return_to=' + encodeURIComponent('/news.html?outlet=ynet'), o), '/news.html?outlet=ynet');
  assert.equal(NR.returnHref('?from=news&return_to=' + encodeURIComponent('https://evil.example/news.html'), o), '/news.html');
  assert.equal(NR.returnHref('?from=news&return_to=' + encodeURIComponent('/library.html'), o), '/news.html');
  assert.equal(NR.returnHref('?news=' + WORK, o), null);
});
test('source plate names the outlet, links the original safely, foot adds provenance', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const head = NR.renderPlate(document, meta(), { place: 'head' });
  assert.match(head.textContent, /Учебный пересказ LinguistPro по материалам ynet/);
  const a = head.querySelector('a');
  assert.equal(a.getAttribute('href'), 'https://www.ynet.co.il/news/article/abc'); assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(head.querySelectorAll('.reader-news-source-note').length, 0);
  const foot = NR.renderPlate(document, meta({ content_type: 'opinion' }), { place: 'foot', withdrawn: true });
  const notes = [...foot.querySelectorAll('.reader-news-source-note')].map(p => p.textContent);
  assert.ok(notes.some(n => n.includes('כתב'))); assert.ok(notes.some(n => n.includes('dot')));
  assert.ok(notes.some(n => /мнений/.test(n))); assert.ok(notes.some(n => /снята/.test(n)));
  const bad = NR.renderPlate(document, meta({ canonical_url: 'javascript:alert(1)' }), {});
  assert.equal(bad.querySelector('a'), null);
});
test('service worker never keeps news works in CacheStorage (the device copy lives in the local DB)', () => {
  const sw = fs.readFileSync(require.resolve('../public/sw.js'), 'utf8');
  const bypass = sw.indexOf('/^\\/api\\/public-corpora\\/news-[a-z0-9]+\\//.test(url.pathname)) return;');
  const branch = sw.indexOf('if (req.method === "GET" && url.pathname.startsWith("/api/public-corpora")) {');
  assert.ok(bypass > 0, 'news bypass present'); assert.ok(bypass < branch, 'bypass runs before the public-corpus cache branch');
});
test('library-ui wires the news entry, return route and plates', () => {
  const src = fs.readFileSync(require.resolve('../public/js/library-ui.js'), 'utf8');
  assert.match(src, /async function openInitialNewsMaterial\(/);
  assert.match(src, /openInitialNewsMaterial\(initialQuery/);
  assert.match(src, /returnRoute === 'news'/);
  assert.match(src, /NewsLocalSweep\.maybeRun\(/);
  const html = fs.readFileSync(require.resolve('../public/library.html'), 'utf8');
  for (const id of ['readerNewsSource', 'readerNewsSourceFoot']) assert.match(html, new RegExp('id="' + id + '"'));
  for (const f of ['news-outlets.js', 'news-reader.js', 'news-local-sweep.js']) assert.match(html, new RegExp('/js/' + f.replace('.', '\\.') + '\\?v='));
});

test('original plate: wording, hero photo with credit + source, subtitle, version switch, gallery; foreign image URLs never render', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const id = 'na_' + 'a'.repeat(24), url = n => '/api/news/images/' + id + '/img-' + n + '.jpg?v=' + 'c'.repeat(12);
  const m = meta({ original: true, level: 'OR', levels: ['OR', 'B1'], subtitle_he: 'כותרת משנה', subtitle_ru: 'Подзаголовок', images: [
    { url: url(1), role: 'hero', credit_he: 'צילום: א', caption_ru: 'Пленум', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg' },
    { url: url(2), role: 'inline', after_p: 1, credit_he: 'צילום: ב', source_url: 'https://ynet-pic1.yit.co.il/p/2.jpg' },
    { url: 'https://evil.example/x.jpg', role: 'inline', source_url: 'https://evil.example/x.jpg' }] });
  const head = NR.renderPlate(document, m, { place: 'head', workId: id + '.or', search: '?news=' + id + '.or&from=news' });
  assert.match(head.textContent, /Текст оригинала: статья ynet/);
  assert.equal(head.querySelector('.reader-news-hero img').getAttribute('src'), url(1));
  assert.match(head.querySelector('.reader-news-credit').textContent, /Фото: א · ynet · источник фото/);
  assert.equal(head.querySelector('.reader-news-credit a').getAttribute('href'), 'https://ynet-pic1.yit.co.il/p/1.jpg');
  assert.equal(head.querySelector('.reader-news-subtitle').textContent, 'כותרת משנה');
  const sw = head.querySelector('.reader-news-versions');
  assert.equal(sw.querySelector('[aria-current]').textContent, 'Оригинал');
  assert.equal(sw.querySelector('a').getAttribute('href'), '/library.html?news=' + id + '.b1&from=news');
  const foot = NR.renderPlate(document, m, { place: 'foot' });
  assert.deepEqual([...foot.querySelectorAll('.reader-news-gallery img')].map(i => i.getAttribute('src')), [url(2)]);
  assert.equal(foot.querySelector('.reader-news-hero'), null);
  assert.equal(NR.renderPlate(document, meta(), { place: 'head' }).querySelector('figure, .reader-news-versions'), null);
});

test('inline photos go into the table after their paragraph row, idempotently, and leave the gallery', () => {
  const id = 'na_' + 'a'.repeat(24), url = n => '/api/news/images/' + id + '/img-' + n + '.jpg?v=' + 'c'.repeat(12);
  const { document } = parseHTML('<html><body><div id="m"><table id="proTable"><tbody>' +
    [0, 1, 2].map(i => '<tr data-row-idx="' + i + '"><td>a</td><td>b</td><td>c</td></tr>').join('') + '</tbody></table></div></body></html>');
  const mount = document.getElementById('m');
  const m = meta({ original: true, images: [{ url: url(1), role: 'hero', source_url: 'https://x.co.il/1.jpg' },
    { url: url(2), role: 'inline', after_row: 1, source_url: 'https://x.co.il/2.jpg' }, { url: url(3), role: 'inline', after_row: 1, source_url: 'https://x.co.il/3.jpg' },
    { url: url(4), role: 'inline', after_row: -1, source_url: 'https://x.co.il/4.jpg' }, { url: url(5), role: 'inline', after_row: null, source_url: 'https://x.co.il/5.jpg' },
    { url: url(6), role: 'inline', after_row: 9, source_url: 'https://x.co.il/6.jpg' }] });
  assert.equal(NR.placeInlineFigures(document, mount, m, {}), 3);
  const order = () => [...mount.querySelectorAll('tbody tr')].map(tr => tr.getAttribute('data-row-idx') || 'f' + tr.getAttribute('data-figure'));
  assert.deepEqual(order(), ['f3', '0', '1', 'f1', 'f2', '2']);
  assert.equal(mount.querySelector('tr.reader-news-figrow td').getAttribute('colspan'), '3');
  assert.equal(NR.placeInlineFigures(document, mount, m, {}), 3);
  assert.deepEqual(order(), ['f3', '0', '1', 'f1', 'f2', '2'], 'second pass changes nothing');
  const foot = NR.renderPlate(document, m, { place: 'foot' });
  assert.deepEqual([...foot.querySelectorAll('.reader-news-gallery img')].map(i => i.getAttribute('src')), [url(5)]);
});
test('head plate folds to its source line; the choice is kept for every article', () => {
  const mem = new Map();
  global.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  try {
    const { document } = parseHTML('<html><body></body></html>');
    const plain = NR.renderPlate(document, meta(), { place: 'head' });
    assert.equal(plain.querySelector('.reader-news-collapse'), null, 'nothing to fold without photo or subtitle');
    const head = NR.renderPlate(document, meta({ original: true, subtitle_he: 'כותרת משנה', subtitle_ru: 'Подзаголовок' }), { place: 'head' });
    const btn = head.querySelector('.reader-news-collapse');
    assert.ok(btn); assert.equal(btn.getAttribute('aria-expanded'), 'true'); assert.ok(!head.classList.contains('is-collapsed'));
    btn.dispatchEvent(new document.defaultView.Event('click'));
    assert.ok(head.classList.contains('is-collapsed')); assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(mem.get(NR.COLLAPSE_KEY), '1');
    const next = NR.renderPlate(document, meta({ original: true, subtitle_he: 'אחר' }), { place: 'head' });
    assert.ok(next.classList.contains('is-collapsed'), 'the next article opens folded');
    next.querySelector('.reader-news-collapse').dispatchEvent(new document.defaultView.Event('click'));
    assert.equal(mem.has(NR.COLLAPSE_KEY), false);
    assert.equal(NR.renderPlate(document, meta({ subtitle_he: 'x' }), { place: 'foot' }).querySelector('.reader-news-collapse'), null);
  } finally { delete global.localStorage; }
});

// ---- B3: the outlet updated the article after we took it (spec §4.4) -----------------------------------
test('plate: the outlet updated the article — a note with what changed and the original link; the foot has none', () => {
  const { document } = require('linkedom').parseHTML('<html><body></body></html>');
  const change = { at: '2026-11-16T13:25:00.000Z', source_updated_at: '2026-11-16T15:20:00+02:00', added: 4, changed: 1, removed: 0, title_changed: true };
  const now = Date.parse('2026-11-16T20:00:00+02:00');
  const head = NR.renderPlate(document, meta({ original: true }), { place: 'head', sourceChange: change, now });
  const note = head.querySelector('.reader-news-changed');
  assert.equal(note.textContent, 'Издание обновило статью в 15:20: +4 абзаца, изменено 1, новый заголовок · Оригинал ↗');
  assert.equal(note.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
  assert.equal(NR.renderPlate(document, meta({ original: true }), { place: 'foot', sourceChange: change }).querySelector('.reader-news-changed'), null);
  const noTime = NR.renderPlate(document, meta({ original: true }), { place: 'head', now, sourceChange: { at: '2026-11-16T13:25:00.000Z', added: 1, changed: 0, removed: 0, title_changed: false } });
  assert.match(noTime.querySelector('.reader-news-changed').textContent, /^Издание обновило статью \(замечено в 15:25\): \+1 абзац ·/);
});
test('card: the latest significant change of the source rides on the card', async t => {
  const { openDb } = require('./helpers/newsDb.cjs');
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await openDb(['084_news_fingerprints.sql']); t.after(() => db.close());
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00') });
  const r = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  const id = r.items[0].article_id;
  assert.equal((await repo.getCard(r.items[0].work_id)).source_change, undefined);
  await new Promise((res, rej) => db.run(`INSERT INTO news_article_changes(article_id, detected_at, source_updated_at, added, changed, removed, title_changed, significant) VALUES (?,?,?,?,?,?,?,1)`,
    [id, '2026-11-12T09:00:00.000Z', null, 2, 0, 0, 1], e => e ? rej(e) : res()));
  assert.deepEqual((await repo.getCard(r.items[0].work_id)).source_change, { at: '2026-11-12T09:00:00.000Z', source_updated_at: null, added: 2, changed: 0, removed: 0, title_changed: true });
});

// ---- C2: the reading signal from the Room (spec §5.7) ---------------------------------------------------
test('reader: open is sent at once, finish when the last row becomes visible (once)', () => {
  const { document } = parseHTML('<html><body><div id="m"><table><tr><td>1</td></tr><tr><td>2</td></tr></table></div></body></html>');
  const sent = [], observers = [];
  class IO { constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); } observe(el) { this.targets.push(el); } disconnect() { this.off = true; } }
  const win = { IntersectionObserver: IO, MutationObserver: class { observe() {} disconnect() {} } };
  const stop = NR.watchReading(win, document.getElementById('m'), 'na_' + 'a'.repeat(24) + '.or', ev => sent.push(ev), { minMs: 0 });
  assert.deepEqual(sent, ['open']);
  const io = observers[0];
  assert.equal(io.targets[0].textContent, '2', 'the last row is watched');
  io.cb([{ isIntersecting: false, target: io.targets[0] }]);
  assert.deepEqual(sent, ['open']);
  io.cb([{ isIntersecting: true, target: io.targets[0] }]);
  io.cb([{ isIntersecting: true, target: io.targets[0] }]);
  assert.deepEqual(sent, ['open', 'finish']);
  assert.equal(io.off, true);
  stop();
  const none = [];
  NR.watchReading({}, document.getElementById('m'), 'na_' + 'a'.repeat(24) + '.or', ev => none.push(ev));
  assert.deepEqual(none, ['open'], 'no IntersectionObserver → no finish, no error');
});
test('plate: «выбрано dot» and the reason in the head', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const head = NR.renderPlate(document, meta({ original: true }), { place: 'head', selected: { selected_by: 'dot', selection_note_ru: 'Про экономику' } });
  assert.equal(head.querySelector('.reader-news-selected').textContent, 'Выбрано dot: Про экономику');
  assert.equal(NR.renderPlate(document, meta({ original: true }), { place: 'foot', selected: { selected_by: 'dot', selection_note_ru: 'x' } }).querySelector('.reader-news-selected'), null);
});
test('reader review: «finish» needs at least 15 s on the article (a short article is not «read» on open)', () => {
  const { document } = parseHTML('<html><body><div id="m"><table><tr><td>1</td></tr></table></div></body></html>');
  const sent = [], timers = [];
  let now = 1000;
  class IO { constructor(cb) { this.cb = cb; this.targets = []; IO.last = this; } observe(el) { this.targets.push(el); } disconnect() {} }
  const win = { IntersectionObserver: IO, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} };
  NR.watchReading(win, document.getElementById('m'), 'na_' + 'a'.repeat(24) + '.or', ev => sent.push(ev), { now: () => now });
  IO.last.cb([{ isIntersecting: true }]);
  assert.deepEqual(sent, ['open'], 'not yet');
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, 15000);
  now += 15000; timers[0].fn();
  assert.deepEqual(sent, ['open', 'finish']);
});
