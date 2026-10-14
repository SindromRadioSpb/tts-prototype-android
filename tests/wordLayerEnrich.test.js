'use strict';
// Слой слов, шаг 1 (docs/planning/word-layer/QUALITY_GAP_ANALYSIS_2026_10_11.md): офлайн-обогащение
// нерешённых чтений. Служебное слово за приставками, лексикализованные наречия, поиск формы без
// букв-помощниц (ктив мале/хасер) — только однозначный. Д7.1 (2026-10-14): шаг 3 (одна клетка Pealim) стал разбором
// слова в resolveCore — ключ статуса такой формы теперь лемма (тест ниже); шаги 1–2 по-прежнему только показ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const NA = require('../public/js/notes-autogen.js');
const RM = require('../public/js/reader-morph.js');
const WG = require('../public/js/word-gloss.js');

const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz'))).toString('utf8'));
const pidMap = new Map();
ds.paradigms.forEach((p) => { if (p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p); });
const eng = { NA, maps: NA.buildResolverMaps(ds.paradigms), pidMap, lookup: (k, b) => { const i = ds.index[k + ' ' + (b || '')]; return i != null ? ds.paradigms[i] : null; } };
async function gloss(niq) {
  const s = RM.stripNiqqud(niq);
  const card = RM.enrichReading(eng, await RM.resolveCore(eng, s, niq), s, niq);
  return { card, g: WG.composeGloss(card, niq) };
}

test('canonForm ignores matres lectionis but keeps vowels', () => {
  assert.equal(RM.canonForm('עַכְשָׁיו'), RM.canonForm('עַכְשָׁו'));
  assert.equal(RM.canonForm('הוֹלֵךְ'), RM.canonForm('הֹלֵךְ'));
  assert.equal(RM.canonForm('כּוּלָּנוּ'), RM.canonForm('כֻּלָּנוּ'));
  assert.notEqual(RM.canonForm('כָּתַב'), RM.canonForm('כְּתֹב'));
});

test('a closed-class word behind proclitics is glossed with its prefix', async () => {
  assert.equal((await gloss('וְאָז')).g.text, 'и + тогда');
  assert.match((await gloss('שֶׁזֶּה')).g.text, /^что \+ это/);
  assert.match((await gloss('בְּכָל')).g.text, /^в \+ каждый/);
});

test('no false proclitic split on short or mis-vowelled words', async () => {
  const bach = await gloss('בָּאךְ');                 // «Бах», not ב + אך «но»
  assert.doesNotMatch(bach.g.text || '', /но, лишь/);
  const hits = await gloss('וּמַכָּה');                // «и бьёт», not ו + מ + כה
  assert.doesNotMatch(hits.g.text || '', /так, столь/);
});

test('the question ה is not read as the article, and a likely reading is not overridden', async () => {
  const r = await gloss('הַאִם');
  assert.doesNotMatch(r.g.text, /если/);
});

test('lexicalised adverbs and ktiv male/haser spelling', async () => {
  assert.equal((await gloss('בֶּאֱמֶת')).g.text, 'действительно');
  assert.equal((await gloss('עַכְשָׁו')).g.text, 'сейчас');
  const fam = await gloss('לַמִּשְׁפָּחָה');
  assert.match(fam.g.text, /^к \+ /);
  assert.match(fam.g.text, /семь/);
  assert.equal(fam.card.channel, 'form-canonical');
});

test('enrichment never changes an already exact reading', async () => {
  const s = 'כָּתְבָה';
  const base = await RM.resolveCore(eng, RM.stripNiqqud(s), s);
  assert.equal(base.label, 'exact');
  assert.equal(RM.enrichReading(eng, base, RM.stripNiqqud(s), s), base);
});

test('a proper name reads as a name, not as a gap', () => {
  const g = WG.composeGloss({ label: 'unknown', gateVia: 'name', functionWord: true, meaning: '' }, 'יִשְׂרָאֵל');
  assert.equal(g.label, 'name');
  assert.ok(g.text.length > 0);
});


// Д7.1 (owner 2026-10-14): a form that is a cell of ONE Pealim paradigm is that lemma — for the key too
test('resolveCore: a single-paradigm form keys to its lemma; names and ambiguous forms stay unparsed; exact is untouched', async () => {
  const key = async (niq) => { const s = RM.stripNiqqud(niq); const c = await RM.resolveCore(eng, s, niq); return { label: c.label, via: c.identityVia || '', key: RM.statusKeyForCard(NA, c, niq, s) }; };
  assert.deepEqual(await key('יַלְדֵי'), { label: 'likely', via: 'form-canonical', key: 'pid:2650' });
  assert.equal((await key('שִׁירֵי')).key, 'pid:4337');
  assert.equal((await key('וְהַשּׁוּעָל')).key, 'pid:7738');
  assert.equal((await key('תִשְּׁכַח')).key, 'pid:36');
  const name = await key('אַלְפְרִיד');
  assert.equal(name.label, 'unknown'); assert.equal(name.key, 'אלפריד#');
  assert.equal((await key('הָיָתָה')).label, 'guessed', 'no single paradigm → no identity claim');
  const ex = await key('כָּתַב');
  assert.equal(ex.label, 'exact'); assert.equal(ex.via, ''); assert.equal(ex.key, 'pid:1');
});
