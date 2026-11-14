'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const O = require('../public/js/news-outlets');
const C = require('../news/newsPackCore');
const { fixtureArticle, SOURCE } = require('./helpers/newsFixture.cjs');
const NOW = Date.parse('2026-11-12T08:00:00+02:00');

test('outletForUrl routes mako news to n12 and rejects foreign hosts', () => {
  assert.equal(O.outletForUrl('https://www.mako.co.il/news-politics/2026_q4/Article-1.htm'), 'n12');
  assert.equal(O.outletForUrl('https://www.mako.co.il/tv-ratings/x'), 'mako');
  assert.equal(O.outletForUrl('https://news.walla.co.il/item/3700000'), 'walla');
  assert.equal(O.outletForUrl('https://ynet.co.il.evil.com/a'), null);
  assert.equal(O.outletForUrl('https://notynet.co.il/a'), null);
  assert.equal(O.OUTLETS.length, 7);
});
test('canonicalizeUrl strips tracking and is stable', () => {
  assert.equal(C.canonicalizeUrl('http://WWW.Ynet.co.il/news/article/abc/?utm_source=x&fbclid=y#top'), 'https://www.ynet.co.il/news/article/abc');
  assert.equal(C.canonicalizeUrl('https://news.walla.co.il/item/1?page=2&utm_medium=z'), 'https://news.walla.co.il/item/1?page=2');
  assert.equal(C.articleKey('ynet', 'https://www.ynet.co.il/news/article/abc'), C.articleKey('ynet', C.canonicalizeUrl('https://www.ynet.co.il/news/article/abc/')));
  assert.match(C.articleKey('ynet', 'https://www.ynet.co.il/x'), /^na_[0-9a-f]{24}$/);
});
test('normalizeHebrewText removes niqqud, final letters and punctuation', () => {
  assert.equal(C.normalizeHebrewText('שָׁלוֹם, עוֹלָם!'), 'שלומ עולמ');
  assert.equal(C.normalizeHebrewText('רה״מ — אמר'), 'רה"מ אמר');
});
test('shingles: 16-hex, unique, none for short text', () => {
  const s = C.shingles(SOURCE);
  assert.ok(s.length > 10); assert.ok(s.every(x => /^[0-9a-f]{16}$/.test(x)));
  assert.equal(new Set(s).size, s.length);
  assert.deepEqual(C.shingles('ארבע מילים בלבד כאן'), []);
});
test('overlapRatio ignores quoted spans and detects copying', () => {
  const src = 'הכנסת אישרה אתמול בלילה את תקציב המדינה בקריאה ראשונה אחרי דיון ארוך';
  assert.ok(C.overlapRatio([src], C.shingles(src)) > 0.9);
  assert.equal(C.overlapRatio(['לדבריו "הכנסת אישרה אתמול בלילה את תקציב המדינה"'], C.shingles(src)), 0);
  assert.equal(C.overlapRatio(['ראש הממשלה אמר שרה"מ לא יגיע היום לדיון בכנסת'], C.shingles(src)), 0);
  assert.equal(C.overlapRatio([], C.shingles(src)), 0);
});
test('articleOverlap of the fixture is low', () => {
  assert.ok(C.articleOverlap(fixtureArticle()) < 0.08);
});
test('validateArticle: required fields, clock skew, image scheme', () => {
  const a = fixtureArticle();
  assert.deepEqual(C.validateArticle(a, { now: NOW }), { ok: true, warnings: [] });
  const src = over => ({ ...a, source: { ...a.source, ...over } });
  assert.equal(C.validateArticle(src({ published_at: '2026-11-12T07:40:00' }), { now: NOW }).code, 'DATE_MISSING');
  assert.equal(C.validateArticle(src({ published_at: '2026-11-12T08:09:00+02:00' }), { now: NOW }).ok, true);
  assert.equal(C.validateArticle(src({ published_at: '2026-11-12T08:30:00+02:00' }), { now: NOW }).code, 'DATE_IN_FUTURE');
  assert.equal(C.validateArticle({ ...a, image: { mode: 'source_link', url: 'javascript:alert(1)' } }, { now: NOW }).code, 'IMAGE_INVALID');
  assert.equal(C.validateArticle({ ...a, image: { mode: 'source_link', url: 'http://x.co.il/a.jpg' } }, { now: NOW }).code, 'IMAGE_INVALID');
  assert.equal(C.validateArticle({ ...a, image: { mode: 'licensed', file: 'image.jpg' } }, { now: NOW }).code, 'IMAGE_LICENSE_MISSING');
  assert.equal(C.validateArticle({ ...a, image: { mode: 'none' } }, { now: NOW }).ok, true);
  assert.equal(C.validateArticle({ ...a, learning: { ...a.learning, title_he: a.source.original_title_he } }, { now: NOW }).code, 'TITLE_COPIES_ORIGINAL');
  assert.equal(C.validateArticle(src({ url: 'https://evil.com/x', canonical_url: 'https://evil.com/x' }), { now: NOW }).code, 'URL_DOMAIN_MISMATCH');
  assert.equal(C.validateArticle(src({ outlet_id: 'cnn' }), { now: NOW }).code, 'OUTLET_UNKNOWN');
  assert.equal(C.validateArticle({ ...a, learning: { ...a.learning, versions: [{ level: 'B1', rows: a.learning.versions[0].rows.slice(0, 2) }] } }, { now: NOW }).code, 'ROWS_OUT_OF_RANGE');
  assert.equal(C.validateArticle({ ...a, learning: { ...a.learning, title_ru: '' } }, { now: NOW }).code, 'TRANSLATION_MISSING');
  assert.equal(C.validateArticle({ ...a, learning: { ...a.learning, title_he: 'Budget' } }, { now: NOW }).code, 'HEBREW_MISSING');
  assert.equal(C.validateArticle({ ...a, check: undefined }, { now: NOW }).code, 'CHECK_MISSING');
  assert.equal(C.validateArticle({ ...a, revision: 0 }, { now: NOW }).code, 'SCHEMA_INVALID');
  assert.equal(C.validateArticle(src({ original_title_he: 'א'.repeat(301) }), { now: NOW }).code, 'SCHEMA_INVALID');
  assert.deepEqual(C.validateArticle({ ...a, extra_field: 1 }, { now: NOW }).warnings, ['UNKNOWN_FIELD:extra_field']);
});

// Owner decision 2026-11-14: the 'OR' version carries the original text one-to-one, with photos.
const originalRows = () => [{ p: 1, he_plain: SOURCE.split(' ').slice(0, 17).join(' ') + '.', ru: 'Первая часть.' },
  { p: 2, he_plain: SOURCE.split(' ').slice(17).join(' ') + '.', ru: 'Вторая часть.' }];
const withOriginal = (over = {}) => fixtureArticle({ learning: { title_he: 'הכנסת אישרה בקריאה ראשונה את תקציב המדינה',
  versions: [{ level: 'OR', rows: originalRows() }, fixtureArticle().learning.versions[0]] }, prepared: { method: 'original' }, ...over });
test('OR version: verbatim is allowed, the original title may be kept, short rows are fine', () => {
  const a = withOriginal();
  assert.deepEqual(C.validateArticle(a, { now: NOW }), { ok: true, warnings: [] });
  assert.ok(C.articleOverlap(a) < 0.08, 'overlap counts paraphrase versions only');
  assert.ok(C.articleFidelity(a) > 0.95);
  assert.equal(C.articleFidelity(fixtureArticle()), null);
});
test('OR version: fidelity drops when the text is not the source', () => {
  const a = withOriginal(); a.learning.versions[0].rows = [{ p: 1, he_plain: 'טקסט אחר לגמרי שאין לו שום קשר למאמר המקורי בכלל.', ru: 'Другое.' }];
  assert.ok(C.articleFidelity(a) < 0.1);
});
test('paraphrase-only article still may not copy the title', () => {
  const a = fixtureArticle({ learning: { title_he: 'הכנסת אישרה בקריאה ראשונה את תקציב המדינה' } });
  assert.equal(C.validateArticle(a, { now: NOW }).code, 'TITLE_COPIES_ORIGINAL');
});
test('images[]: hero + inline with credit and source are valid; bad entries are IMAGE_INVALID', () => {
  const img = (o = {}) => ({ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg', credit_he: 'צילום: א', caption_he: 'כיתוב', caption_ru: 'Подпись', ...o });
  const ok = withOriginal({ images: [img(), img({ file: 'img-2.webp', role: 'inline', after_p: 1 })] });
  assert.equal(C.validateArticle(ok, { now: NOW }).ok, true);
  for (const images of [[img(), img({ file: 'img-2.jpg' })], [img({ file: '../x.jpg' })], [img({ source_url: 'http://x/a.jpg' })], [img(), img()],
    [img({ role: 'banner' })], [img({ after_p: -1 })], Array.from({ length: 13 }, (_, i) => img({ file: 'img-' + i + '.jpg', role: 'inline' }))])
    assert.equal(C.validateArticle(withOriginal({ images }), { now: NOW }).code, 'IMAGE_INVALID');
});
