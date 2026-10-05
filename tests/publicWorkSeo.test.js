'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const seoFile = path.join(__dirname, '../public-work-seo.js');
const nodeRequire = createRequire(seoFile), fixtureReferences = new Map();
const fixtureModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(seoFile, 'utf8'), { module: fixtureModule, __dirname: path.dirname(seoFile), Buffer,
  require: name => name === './db/benyehudaLearningRelease' ? { ...nodeRequire(name),
    publishedFile: id => fixtureReferences.get(String(id)) || { name: 'unavailable-fixture.json' } } : nodeRequire(name) });
const seo = fixtureModule.exports;

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-public-work-seo-'));
fs.mkdirSync(path.join(fixtureDir, 'benyehuda', 'works'), { recursive: true });
fs.writeFileSync(path.join(fixtureDir, 'benyehuda', 'works', '85.json'), JSON.stringify({
  library: { texts: [{ corpus: { byehuda_id: '85' }, rows: [{ hebrew_niqqud: 'מַגְבִּיהּ פִּתְחו' }] }] },
}));
fixtureReferences.set('85', { name: '85.json', sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtureDir, 'benyehuda/works/85.json'))).digest('hex') });
test.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

test('a baked work has a stable request URL and readable initial HTML', () => {
  const work = seo.benyehuda('85', fixtureDir);
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
  const xml = seo.sitemap([{ ref: { kind: 'public', slug: 'songs', workId: 'one' } }, { ref: { kind: 'personal', slug: 'private', workId: 'two' } }], fixtureDir);
  assert.match(xml, /corpus_work=85/);
  assert.match(xml, /public_corpus=songs&amp;public_work=one/);
  assert.doesNotMatch(xml, /private/);
});

test('immutable current body wins over a legacy numeric body and validates its hash and identity', () => {
  const id = '3557', key = 'a'.repeat(64), editionId = 'b'.repeat(64);
  const bundle = { library: { texts: [{ text_key: key, corpus: { byehuda_id: id },
    source_meta: { public_learning: { edition_id: editionId } }, rows: [{ hebrew_plain: 'Current <edition>' }] }] } };
  const bytes = Buffer.from(JSON.stringify(bundle)), hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const name = id + '-' + hash.slice(0, 32) + '.json', file = path.join(fixtureDir, 'benyehuda/works', name);
  fs.writeFileSync(path.join(fixtureDir, 'benyehuda/works', id + '.json'), JSON.stringify({ library: { texts: [{ corpus: { byehuda_id: id }, rows: [{ hebrew_plain: 'Earlier' }] }] } }));
  fs.writeFileSync(file, bytes);
  fixtureReferences.set(id, { name, sha256: hash, textKey: key, rows: 1, editionId });
  assert.equal(seo.benyehuda(id, fixtureDir).rows[0].hebrew_plain, 'Current <edition>');
  assert.match(seo.render(seo.benyehuda(id, fixtureDir), seo.canonical({ corpus_work: id })), /Current &lt;edition&gt;/);
  assert.match(seo.sitemap([], fixtureDir), /corpus_work=3557/);
  fixtureReferences.set(id, { name, sha256: hash, textKey: key, rows: 2, editionId });
  assert.throws(() => seo.benyehuda(id, fixtureDir), /identity mismatch/);
  fixtureReferences.set(id, { name, sha256: '0'.repeat(64), textKey: key, rows: 1, editionId });
  assert.throws(() => seo.benyehuda(id, fixtureDir), /checksum mismatch/);
});
