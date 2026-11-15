'use strict';
// Checks before publishing (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.8): the study
// layers of the OR version are filled, the photos are the harvested ones; a broken article is left out
// and listed, the others are packed and published.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const C = require('../news/newsPackCore');
const { buildPack } = require('../scripts/news/build-pack');

const SRC = ['ראש הממשלה נאם הערב בכנסת ואמר כי הממשלה תמשיך לפעול.', 'הוא הוסיף כי המצב קשה ופנה לאופוזיציה בבקשה לשתף פעולה.'];
const NIQ = ['רֹאשׁ הַמֶּמְשָׁלָה נָאַם הָעֶרֶב בַּכְּנֶסֶת וְאָמַר כִּי הַמֶּמְשָׁלָה תַּמְשִׁיךְ לִפְעֹל.', 'הוּא הוֹסִיף כִּי הַמַּצָּב קָשֶׁה וּפָנָה לָאוֹפּוֹזִיצְיָה בְּבַקָּשָׁה לְשַׁתֵּף פְּעֻלָּה.'];
const words = s => s.split(/\s+/).filter(Boolean).length;
const layerFor = rows => ({ schema: 'word-gloss-ai-layer-v1', rows: rows.map((r, i) => ({ order_index: i, key: 'k' + i + ':' + words(r.he_plain), model: 'dot',
  glosses: Array.from({ length: words(r.he_plain) }, () => ({ gloss: 'слово' })), mwe: [] })) });
function orArticle(url = 'https://www.ynet.co.il/news/article/abc123') {
  const rows = SRC.map((he, i) => ({ p: i + 1, he_plain: he, he_niqqud: NIQ[i], translit: 'rosh', translit_ru: 'рош', ru: 'Перевод строки ' + (i + 1) }));
  return {
    revision: 1,
    source: { outlet_id: 'ynet', url, canonical_url: url, section_original_he: 'חדשות', section: 'politics', content_type: 'news',
      published_at: '2026-11-16T07:40:00+02:00', updated_at: null, retrieved_at: '2026-11-16T07:55:00+02:00', author: 'כתב', original_title_he: 'נתניהו נאם בכנסת', paywalled: false, language: 'he' },
    image: { mode: 'none' }, images: [],
    learning: { title_he: 'נתניהו נאם בכנסת', title_ru: 'Нетаньяху выступил', summary_ru: 'О чём.', versions: [{ level: 'OR', rows, word_gloss_ai: 'or.word-gloss-ai.json' }], sensitive: { heavy: false, kinds: [] } },
    prepared: { method: 'original', by: 'linguistpro-harvester', prepared_at: '2026-11-16T07:55:00+02:00' },
    quality: { warnings: [] }, source_text_he: SRC.join('\n\n'),
  };
}
function writeDraft(dir, name, draft, layer = layerFor(draft.learning.versions[0].rows), files = {}) {
  fs.writeFileSync(path.join(dir, name + '.draft.json'), JSON.stringify(draft));
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  if (layer) fs.writeFileSync(path.join(dir, name, 'or.word-gloss-ai.json'), JSON.stringify(layer));
  for (const [f, b] of Object.entries(files)) fs.writeFileSync(path.join(dir, name, f), b);
}
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-study-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('checkStudyLayers: empty ru, translit, niqqud word mismatch, gloss coverage', () => {
  const a = orArticle();
  assert.deepEqual(C.checkStudyLayers(a, { glossLayer: layerFor(a.learning.versions[0].rows) }), []);
  const b = orArticle(), rows = b.learning.versions[0].rows;
  rows[0].ru = ''; rows[1].translit_ru = ''; rows[1].he_niqqud = 'הוּא הוֹסִיף';
  assert.deepEqual(C.checkStudyLayers(b, { glossLayer: { schema: 'word-gloss-ai-layer-v1', rows: layerFor(rows).rows.slice(0, 1) } }),
    ['RU_MISSING:1', 'TRANSLIT_MISSING:1', 'NIQQUD_WORDS:1', 'GLOSS_COVERAGE:50']);
  const c = orArticle(); c.learning.versions[0].rows[0].he_niqqud = NIQ[0].replace('רֹאשׁ', 'rosh');
  assert.deepEqual(C.checkStudyLayers(c, { glossLayer: null }), ['NIQQUD_WORDS:1', 'GLOSS_MISSING']);
  // Dicta-style spelling without the helper letters is the same word: not an error.
  const d = orArticle(); d.learning.versions[0].rows[0].he_plain = 'היא הייתה שם.'; d.learning.versions[0].rows[0].he_niqqud = 'הִיא הָיְתָה שָׁם.';
  assert.deepEqual(C.checkStudyLayers(d, { glossLayer: layerFor(d.learning.versions[0].rows) }), []);
  // A paraphrase level (B1) is not checked here.
  const e = orArticle(); e.learning.versions[0].level = 'B1'; e.learning.versions[0].rows[0].ru = '';
  assert.deepEqual(C.checkStudyLayers(e, { glossLayer: null }), []);
});
test('build-pack: a broken draft is left out and listed in manifest.rejected; the rest is packed', async t => {
  const dir = tmp(t);
  writeDraft(dir, 'ynet-0001', orArticle());
  const bad = orArticle('https://www.ynet.co.il/news/article/bad1'); bad.learning.versions[0].rows[0].translit_ru = '';
  writeDraft(dir, 'ynet-0002', bad);
  const r = await buildPack(dir, { now: Date.parse('2026-11-16T08:00:00+02:00'), out: path.join(dir, 'p.lpnews.zip') });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.articles.map(a => [a.file, a.ok, a.code || null]), [['ynet-0001.draft.json', true, null], ['ynet-0002.draft.json', false, 'STUDY_LAYER_INVALID']]);
  const m = JSON.parse(new AdmZip(r.written).readAsText('manifest.json'));
  assert.equal(m.articles.length, 1);
  assert.deepEqual(m.rejected, [{ outlet_id: 'ynet', canonical_url: 'https://www.ynet.co.il/news/article/bad1', code: 'STUDY_LAYER_INVALID', detail: ['TRANSLIT_MISSING:1'] }]);
});
test('build-pack: rework/ drafts are packed, harvest.json gives edition_id, a changed photo is refused', async t => {
  const dir = tmp(t), jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#abc' } }).jpeg().toBuffer();
  const other = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#cba' } }).jpeg().toBuffer();
  const withPhoto = url => { const a = orArticle(url); a.images = [{ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg' }]; a.image = { mode: 'source_link', url: 'https://ynet-pic1.yit.co.il/p/1.jpg' }; return a; };
  writeDraft(dir, 'ynet-0001', withPhoto('https://www.ynet.co.il/news/article/p1'), undefined, { 'img-1.jpg': jpeg });
  fs.mkdirSync(path.join(dir, 'rework'));
  writeDraft(path.join(dir, 'rework'), 'ynet-0002', withPhoto('https://www.ynet.co.il/news/article/p2'), undefined, { 'img-1.jpg': other });
  const sha = b => crypto.createHash('sha256').update(b).digest('hex');
  fs.writeFileSync(path.join(dir, 'harvest.json'), JSON.stringify({ schema: 'linguistpro-news-harvest', schema_version: 3, edition_id: 'ne_' + 'c'.repeat(18),
    main: [{ draft: 'ynet-0001.draft.json', images: { 'img-1.jpg': sha(jpeg) } }], rework: [{ draft: 'rework/ynet-0002.draft.json', images: { 'img-1.jpg': sha(jpeg) }, reason: 'SKIPPED' }] }));
  const r = await buildPack(dir, { now: Date.parse('2026-11-16T08:00:00+02:00'), out: path.join(dir, 'p.lpnews.zip') });
  assert.deepEqual(r.articles.map(a => [a.file, a.code || null]), [['rework/ynet-0002.draft.json', 'IMAGE_CHANGED'], ['ynet-0001.draft.json', null]]);
  const m = JSON.parse(new AdmZip(r.written).readAsText('manifest.json'));
  assert.equal(m.edition_id, 'ne_' + 'c'.repeat(18));
  assert.equal(m.rejected[0].code, 'IMAGE_CHANGED');
});
test('server: STUDY_LAYER_INVALID rejects one article and publishes the others', async t => {
  const { openDb } = require('./helpers/newsDb.cjs');
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await openDb(); t.after(() => db.close());
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-16T08:00:00+02:00') });
  const pack = a => { const x = { ...a }; const src = x.source_text_he; delete x.source_text_he; x.check = { source_shingles: C.shingles(src), source_word_count: src.split(/\s+/).length };
    return { ...x, __files: { 'or.word-gloss-ai.json': JSON.stringify(layerFor(a.learning.versions[0].rows)) } }; };
  const bad = orArticle('https://www.ynet.co.il/news/article/bad1'); bad.learning.versions[0].rows[1].translit = '';
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([pack(orArticle()), pack(bad)]));
  assert.equal(receipt.totals.published, 1, JSON.stringify(receipt.items));
  assert.equal(receipt.totals.rejected, 1);
  const rej = receipt.items.find(i => i.status === 'rejected');
  assert.equal(rej.code, 'STUDY_LAYER_INVALID'); assert.deepEqual(rej.detail, ['TRANSLIT_MISSING:1']);
});
