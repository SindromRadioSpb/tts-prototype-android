'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const AdmZip = require('adm-zip');
const C = require('../news/newsPackCore');
const { buildPack } = require('../scripts/news/build-pack');
const { fixtureArticle, SOURCE, sha256 } = require('./helpers/newsFixture.cjs');
const NOW = Date.parse('2026-11-12T08:00:00+02:00');

function draft(over) { const a = fixtureArticle(over); delete a.check; return a; }
function draftDir(t, drafts, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-news-draft-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  drafts.forEach((d, i) => fs.writeFileSync(path.join(dir, `ynet-${i + 1}.draft.json`), JSON.stringify(d)));
  for (const [name, data] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), data);
  return dir;
}
const articleEntries = zip => zip.getEntries().filter(e => e.entryName.endsWith('article.json'));

test('buildPack strips source_text_he and computes check', async t => {
  const dir = draftDir(t, [{ ...draft(), source_text_he: SOURCE }]);
  const r = await buildPack(dir, { producer: 'dot', now: NOW });
  assert.equal(r.ok, true);
  const zip = new AdmZip(r.written);
  const a = JSON.parse(zip.readAsText(articleEntries(zip)[0]));
  assert.equal('source_text_he' in a, false);
  assert.equal(a.check.source_word_count, SOURCE.split(/\s+/).length);
  assert.deepEqual(a.check.source_shingles, C.shingles(SOURCE));
  const m = JSON.parse(zip.readAsText('manifest.json'));
  assert.equal(m.schema, 'linguistpro-news-pack'); assert.equal(m.schema_version, 1);
  assert.equal(m.producer.name, 'dot'); assert.equal(m.articles.length, 1);
  assert.equal(m.articles[0].sha256, sha256(zip.readFile(m.articles[0].path)));
  assert.ok(!zip.getEntries().some(e => zip.readAsText(e).includes(SOURCE.slice(0, 40))));
});
test('buildPack reports per-file errors and still packs the good ones', async t => {
  const copied = draft({ learning: { versions: [{ level: 'B1', rows: [{ he_plain: SOURCE, ru: 'x' }, { he_plain: 'שורה שנייה כאן.', ru: 'y' }, { he_plain: 'שורה שלישית כאן.', ru: 'z' }] }] } });
  const dir = draftDir(t, [{ ...draft(), source_text_he: SOURCE }, { ...copied, source_text_he: SOURCE }, { ...draft(), source_text_he: '' }]);
  const r = await buildPack(dir, { now: NOW });
  assert.deepEqual(r.articles.map(x => x.code || 'ok').sort(), ['CHECK_MISSING', 'VERBATIM_OVERLAP', 'ok']);
  assert.equal(articleEntries(new AdmZip(r.written)).length, 1);
});
test('gloss layer file travels with its article', async t => {
  const d = { ...draft(), source_text_he: SOURCE };
  d.learning.versions[0].word_gloss_ai = 'b1.word-gloss-ai.json';
  const dir = draftDir(t, [d], { 'b1.word-gloss-ai.json': JSON.stringify({ schema: 'word-gloss-ai-layer-v1', rows: [] }) });
  const zip = new AdmZip((await buildPack(dir, { now: NOW })).written);
  assert.ok(zip.getEntries().some(e => /^articles\/[a-z0-9-]+\/b1\.word-gloss-ai\.json$/.test(e.entryName)));
});
test('--check-only writes nothing; empty result is not ok', async t => {
  const r = await buildPack(draftDir(t, [{ ...draft(), source_text_he: SOURCE }]), { checkOnly: true, now: NOW });
  assert.equal(r.written, undefined); assert.equal(r.ok, true);
  const bad = await buildPack(draftDir(t, [{ ...draft(), source_text_he: '' }]), { now: NOW });
  assert.equal(bad.ok, false); assert.equal(bad.written, undefined);
});

test('buildPack packs an original (OR) with its photos and reports fidelity', async t => {
  const rows = [{ p: 1, he_plain: SOURCE.split(' ').slice(0, 17).join(' ') + '.', ru: 'Первая часть.' }, { p: 2, he_plain: SOURCE.split(' ').slice(17).join(' ') + '.', ru: 'Вторая часть.' }];
  const orig = draft({ learning: { versions: [{ level: 'OR', rows }] }, prepared: { method: 'original' },
    images: [{ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg', credit_he: 'צילום: א' }] });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
  const r = await buildPack(draftDir(t, [{ ...orig, source_text_he: SOURCE }], { 'img-1.jpg': jpeg }), { now: NOW });
  assert.equal(r.ok, true, JSON.stringify(r.articles)); assert.ok(r.articles[0].fidelity > 0.95);
  const zip = new AdmZip(r.written);
  assert.ok(zip.getEntries().some(e => /\/img-1\.jpg$/.test(e.entryName)));
  // Two articles, each with its own img-1.jpg in a folder named after the draft.
  const two = draftDir(t, [{ ...orig, source_text_he: SOURCE }, { ...orig, source: { ...orig.source, url: 'https://www.ynet.co.il/news/article/z2', canonical_url: 'https://www.ynet.co.il/news/article/z2' }, source_text_he: SOURCE }]);
  for (const [n, fill] of [[1, 1], [2, 2]]) { fs.mkdirSync(path.join(two, 'ynet-' + n)); fs.writeFileSync(path.join(two, 'ynet-' + n, 'img-1.jpg'), Buffer.concat([jpeg, Buffer.alloc(8, fill)])); }
  const z2 = new AdmZip((await buildPack(two, { now: NOW })).written);
  const imgs = z2.getEntries().filter(e => e.entryName.endsWith('img-1.jpg')).map(e => e.getData().at(-1));
  assert.deepEqual(imgs.sort(), [1, 2]);
  const big = await buildPack(draftDir(t, [{ ...orig, source_text_he: SOURCE }], { 'img-1.jpg': Buffer.alloc(700 * 1024) }), { now: NOW, checkOnly: true });
  assert.equal(big.articles[0].code, 'TOO_LARGE');
  const wrong = draft({ learning: { versions: [{ level: 'OR', rows: [{ p: 1, he_plain: 'טקסט אחר לגמרי שאין לו שום קשר למאמר המקורי בכלל.', ru: 'x' }] }] } });
  assert.equal((await buildPack(draftDir(t, [{ ...wrong, source_text_he: SOURCE }]), { now: NOW, checkOnly: true })).articles[0].code, 'ORIGINAL_MISMATCH');
});
