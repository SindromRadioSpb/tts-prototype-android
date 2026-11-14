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
