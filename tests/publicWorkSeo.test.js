'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const seo = require('../public-work-seo');

test('a baked work has a stable request URL and readable initial HTML', () => {
  const work = seo.benyehuda('85', path.join(__dirname, '..', '.nonexistent-data'));
  assert.ok(work);
  const url = seo.canonical({ corpus_work: '85' });
  const html = seo.render(work, url);
  assert.match(html, /<title>מַגְבִּיהּ/);
  assert.match(html, /rel="canonical" href="https:\/\/linguistpro\.kolosei\.com\/library\.html\?corpus_work=85"/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /מַגְבִּיהּ פִּתְחו/);
  assert.doesNotMatch(html, /<script type="application\/ld\+json">[^<]*<\/script[^>]*><\/script>/);
});

test('unpublished or invalid Ben-Yehuda ids have no public page', () => {
  assert.equal(seo.benyehuda('../85', path.join(__dirname, '..', 'data')), null);
  assert.equal(seo.benyehuda('99999999', path.join(__dirname, '..', 'data')), null);
});

test('publication projection requires public read permission', () => {
  const payload = { corpus: { title: 'Study songs' }, item: { public_read_allowed: 1,
    snapshot: { library: { texts: [{ title: 'Song <one>', rows: [{ hebrew_plain: 'שלום' }] }] } } } };
  const work = seo.published(payload);
  assert.equal(work.title, 'Song <one>');
  const html = seo.render(work, seo.canonical({ public_corpus: 'songs', public_work: 'one' }));
  assert.match(html, /Song &lt;one&gt;/);
  assert.match(html, /public_corpus=songs&amp;public_work=one/);
  payload.item.public_read_allowed = 0;
  assert.equal(seo.published(payload), null);
});

test('sitemap lists only existing baked files and published media', () => {
  const xml = seo.sitemap([{ ref: { kind: 'public', slug: 'songs', workId: 'one' } }, { ref: { kind: 'personal', slug: 'private', workId: 'two' } }], path.join(__dirname, '..', '.nonexistent-data'));
  assert.match(xml, /corpus_work=85/);
  assert.match(xml, /public_corpus=songs&amp;public_work=one/);
  assert.doesNotMatch(xml, /private/);
});
