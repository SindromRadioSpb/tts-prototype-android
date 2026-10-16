'use strict';
// Ф4 · Д10 — the word at its place (docs/planning/word-layer/F4_D10_PLACE_CONTEXT_SPEC_2026_10_16.md), on the REAL
// Pealim dataset: the sentence's stored Dicta parse picks the homograph (А), the learner's decision beats it (В), a
// decisive offline reading and a moved row are never touched, the scan and the tap key the place identically.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const NA = require('../public/js/notes-autogen.js');
const DLX = require('../public/js/dicta-lexicon.js');
global.window = { NotesAutoGen: NA, DictaLexicon: DLX };
const RM = require('../public/js/reader-morph.js');

const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz'))).toString('utf8'));
const pidMap = new Map();
ds.paradigms.forEach((p) => { if (p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p); });
const eng = { NA, maps: NA.buildResolverMaps(ds.paradigms), pidMap, dictaLex: null,
  lookup: (k, b) => { const i = ds.index[k + ' ' + (b || '')]; return i != null ? ds.paradigms[i] : null; } };

// one sentence: «מַכּוֹת קָשׁוֹת» — Dicta read מכה (noun) and קשה (adjective)
const ROW = { id: 's1', he_plain: 'מכות קשות', he_niqqud: 'מַכּוֹת קָשׁוֹת' };
const DICTA = [{ word: 'מכות', lemma: 'מכה', posDicta: 'noun' }, { word: 'קשות', lemma: 'קשה', posDicta: 'adjective' }];
function install(dec) {
  RM.setPlaceLoader(async (sids) => {
    const m = new Map();
    if (sids.includes('s1')) { const pu = RM.placeUnits(ROW, DICTA); m.set('s1', { sk: pu.sk, at: pu.at, dec: dec || new Map() }); }
    return m;
  });
}
async function keyAt(niq, place) {
  const s = RM.stripNiqqud(niq);
  if (place) await RM.ensurePlaces([place.sid]);
  const c = await RM.resolveCore(eng, s, niq, place ? { place } : undefined);
  return { key: RM.statusKeyForCard(NA, c, niq, s), via: c.identityVia || '', label: c.label };
}

test('А: the sentence\'s stored Dicta parse picks the homograph at THIS place; the spelling elsewhere keeps its reading', async () => {
  install();
  assert.equal((await keyAt('מַכּוֹת')).key, 'pid:1201');                                 // no place: the spelling (verb «бить»)
  assert.deepEqual(await keyAt('מַכּוֹת', { sid: 's1', off: 0 }), { key: 'pid:3957', via: 'dicta-context', label: 'likely' });   // «удары»
  assert.equal((await keyAt('קָשׁוֹת', { sid: 's1', off: 1 })).key, 'pid:4445');          // «трудные», not לקשות
  assert.equal((await keyAt('מַכּוֹת', { sid: 's2', off: 0 })).key, 'pid:1201');          // a sentence without stored data
});

test('А never overrides a decisive reading, and a place whose word moved is not read', async () => {
  install();
  assert.equal((await keyAt('כּוֹתֵב', { sid: 's1', off: 0 })).key, 'pid:1');   // exact; and the place holds another word anyway
  assert.equal((await keyAt('קָשׁוֹת', { sid: 's1', off: 0 })).key, (await keyAt('קָשׁוֹת')).key);   // offset 0 is מכות — not this word
});

test('В: the learner\'s decision for the place beats Dicta — a Pealim entry, or «это имя»', async () => {
  install(new Map([[0, { pid: '1201' }]]));
  assert.equal((await keyAt('מַכּוֹת', { sid: 's1', off: 0 })).key, 'pid:1201');   // the owner chose the verb here
  RM.invalidatePlaces();
  install(new Map([[1, { name: true }]]));
  const n = await keyAt('קָשׁוֹת', { sid: 's1', off: 1 });
  assert.equal(n.label, 'unknown'); assert.equal(n.via, 'owner-name');
});

test('Д8-К4 v2: Dicta lemmatizes אֱלֹהִים «Бог» as אלוה (its convention, not context) — the place keeps אלוהים', async () => {
  const row = { id: 's3', he_plain: 'יראת אלהים', he_niqqud: 'יִרְאַת אֱלֹהִים' };
  const dicta = [{ word: 'יראת', lemma: 'יראה', posDicta: 'noun' }, { word: 'אלהים', lemma: 'אלוה', posDicta: 'noun' }];
  RM.setPlaceLoader(async (sids) => { const m = new Map(); if (sids.includes('s3')) { const pu = RM.placeUnits(row, dicta); m.set('s3', { sk: pu.sk, at: pu.at, dec: new Map() }); } return m; });
  assert.equal((await keyAt('אֱלֹהִים', { sid: 's3', off: 1 })).key, (await keyAt('אֱלֹהִים')).key);
  assert.notEqual((await keyAt('אֱלֹהִים', { sid: 's3', off: 1 })).key, 'pid:6408');
  RM.setPlaceLoader(null);
});

test('the list scan and the tap key a place identically', async () => {
  install();
  const scan = await RM.scanRows([ROW], { engine: eng });
  const tap = await keyAt('מַכּוֹת', { sid: 's1', off: 0 });
  assert.equal(scan.rowKeys[0][0], tap.key);
  assert.equal(scan.rowKeys[0][1], 'pid:4445');
  RM.setPlaceLoader(null);
});
