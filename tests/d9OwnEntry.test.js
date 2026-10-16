'use strict';
// Ф4 · Д9 — the independent identity audit's fixes (docs/planning/word-layer/F4_D9_OWN_ENTRY_SPEC_2026_10_16.md),
// on the REAL Pealim dataset: a form's own entry beats another paradigm's cell (A1), Dicta's dominant reading decides an
// honest homograph (A2) and vetoes A1, the Dicta lexicon's input filter (B), the pre-Д9 reading (noD9), the mark migration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const NA = require('../public/js/notes-autogen.js');
const DLX = require('../public/js/dicta-lexicon.js');
const RM = require('../public/js/reader-morph.js');

const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz'))).toString('utf8'));
const pidMap = new Map();
ds.paradigms.forEach((p) => { if (p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p); });
const maps = NA.buildResolverMaps(ds.paradigms);
const engine = (rows) => ({ NA, maps, pidMap, dictaLex: rows ? DLX.fromRows(rows) : null,
  lookup: (k, b) => { const i = ds.index[k + ' ' + (b || '')]; return i != null ? ds.paradigms[i] : null; } });
const lexRow = (skeleton, lemma, pos, extra) => Object.assign({ skeleton: DLX.skeleton(skeleton), lemma, pos, cls: 'content', prefix: '', niqqud: '', n: 10, alt_n: 0, no_lemma: 0 }, extra || {});
async function key(eng, niq, opts) {
  const s = RM.stripNiqqud(niq), c = await RM.resolveCore(eng, s, niq, opts);
  return { key: RM.statusKeyForCard(NA, c, niq, s), via: c.identityVia || '', label: c.label };
}
global.window = { NotesAutoGen: NA, DictaLexicon: DLX };

test('A1: the form\'s own Pealim entry beats another paradigm\'s cell (no lexicon needed)', async () => {
  const eng = engine(null);
  assert.equal((await key(eng, 'נָחוּשׁ')).key, 'pid:7675');    // «непреклонный», not לחוש «чувствовать»
  assert.equal((await key(eng, 'שְׁנִיָּה')).key, 'pid:8864');   // «секунда», not שני «второй»
  assert.equal((await key(eng, 'הַיּוֹם')).key, 'pid:5998');     // «сегодня» (a cell-less adverb entry), not יום «день»
  assert.equal((await key(eng, 'נָחוּשׁ')).via, 'own-entry');
});

test('A1 is vetoed where Dicta\'s dominant reading is the current one; the Д7/exact readings are untouched', async () => {
  const eng = engine([lexRow('בא', 'בוא', 'verb', { n: 158, alt_n: 1 }), lexRow('צריכה', 'צריך', '', { n: 76 })]);
  assert.equal((await key(eng, 'בָּא')).key, 'pid:28');          // «пришёл», not הבא «следующий»
  assert.equal((await key(eng, 'צְרִיכָה')).key, 'pid:6018');     // «нужна», not «потребление»
  assert.equal((await key(eng, 'כּוֹתֵב')).key, 'pid:1');         // exact — untouched
  assert.deepEqual(await key(eng, 'יַלְדֵי'), { key: 'pid:2650', via: 'form-canonical', label: 'likely' });   // Д7 — untouched
});

test('A2: Dicta\'s dominant reading decides an honest homograph by its EXACT part of speech; without it nothing moves', async () => {
  assert.equal((await key(engine(null), 'מַכּוֹת')).key, 'pid:1201');   // no lexicon: the verb reading stays
  assert.equal((await key(engine([lexRow('מכות', 'מכה', 'noun', { n: 19 })]), 'מַכּוֹת')).key, 'pid:3957');   // «удары»
  // Dicta «noun» חי for חַיִּים: Pealim has no noun «жизнь» — the adjective «живой» is NOT taken (exact part of speech)
  assert.equal((await key(engine([lexRow('בחיים', 'חי', 'noun', { prefix: 'ב', n: 104 })]), 'בַּחַיִּים')).key, 'pid:797');
});

test('A1 sibling: Dicta\'s lemma picks the inflected form of a kindred entry over the headword (טוֹבָה = feminine of טוב)', async () => {
  const eng = engine([lexRow('טובה', 'טוב', 'noun', { n: 58, alt_n: 53 })]);
  assert.equal((await key(eng, 'טוֹבָה')).key, 'pid:5422');   // «хорошая», not טובה «одолжение»
});

test('B: the Dicta lexicon\'s input filter — kindred Pealim entry, vowels decide, acronyms, contractions', async () => {
  const eng = engine([
    lexRow('בבדואים', 'בדואים', 'noun', { prefix: 'ב' }), lexRow('ציון', 'ציון', 'noun'), lexRow('ערבי', 'ערבי', 'noun', { n: 27 }),
    lexRow('בפתח', 'פתח', 'noun', { prefix: 'ב' }), lexRow('צהל', 'צה"ל', ''),
  ]);
  assert.equal((await key(eng, 'בְּבֵדוּאִים')).key, 'pid:5850');            // tsere ~ segol: the entry בדואי
  assert.match((await key(eng, 'צִיּוֹן')).key, /^dl:/);                    // Zion (holam) is not ציון «отметка» (shuruk)
  assert.match((await key(eng, 'עֲרָבִי')).key, /^dl:/);                    // «араб» is not עַרְבֵי «вечера»
  assert.equal((await key(eng, 'בְּפַתַ״ח')).label, 'unknown');               // FATAH is not פתח «вход»
  assert.match((await key(eng, 'צַהַ״ל')).key, /^dl:צה"ל/);                 // an acronym Dicta keeps as one stays a word
  assert.deepEqual(await key(engine(null), 'תָּ׳דּוֹר'), { key: 'pid:4339', via: 'contraction', label: 'likely' });
});

test('noD9 is the reading before Д9 (the migration\'s «before»)', async () => {
  const eng = engine([lexRow('מכות', 'מכה', 'noun', { n: 19 })]);
  assert.equal((await key(eng, 'מַכּוֹת', { noD9: true })).key, 'pid:1201');
  assert.equal((await key(eng, 'נָחוּשׁ', { noD9: true })).key, 'pid:573');
  assert.equal((await key(eng, 'תָּ׳דּוֹר', { noD9: true })).via, '');
});

test('Д9.2: a mark follows the word where ≥ 80 % of the old key\'s places moved; whole moves clear the old key; below 80 % nothing moves', async () => {
  const eng = engine(null);
  const sentences = [];
  for (let i = 0; i < 9; i++) sentences.push({ he_plain: 'נחוש', he_niqqud: 'נָחוּשׁ' });   // pid:573 → pid:7675
  sentences.push({ he_plain: 'חש', he_niqqud: 'חָשׁ' });                                       // stays pid:573 (10 %)
  for (let i = 0; i < 4; i++) sentences.push({ he_plain: 'היום', he_niqqud: 'הַיּוֹם' });     // pid:3061 → 5998 …
  for (let i = 0; i < 6; i++) sentences.push({ he_plain: 'יום', he_niqqud: 'יוֹם' });          // … but 6 places stay: 40 %
  for (let i = 0; i < 3; i++) sentences.push({ he_plain: 'שנייה', he_niqqud: 'שְׁנִיָּה' });   // pid:3398's only places here → whole move
  const marks = new Map([['pid:573', { status: 'known', updated_at: '2026-09-01T00:00:00Z' }], ['pid:3061', { status: 'known', updated_at: '2026-09-01T00:00:00Z' }],
    ['pid:3398', { status: 'l2', updated_at: '2026-09-01T00:00:00Z' }]]);
  const writes = [];
  const ldb = {
    async dbQuery(sql, args) {
      if (/FROM word_status WHERE status != ''/.test(sql)) return Array.from(marks, ([k, v]) => ({ lemma_key: k, status: v.status, updated_at: v.updated_at }));
      if (/FROM sentences/.test(sql)) return args[1] ? [] : sentences;
      if (/FROM word_status WHERE lemma_key = \?/.test(sql)) { const m = marks.get(args[0]); return m ? [m] : []; }
      return [];
    },
    async setWordStatus(k, st) { writes.push([k, st]); },
  };
  const r = await RM.migrateIdentityD9(ldb, { force: true, engine: eng });
  // נָחוּשׁ: 90 % moved — copied, the old key keeps its mark (one place stays); שְׁנִיָּה: every place moved — copied and cleared
  assert.deepEqual(writes, [['pid:7675', 'known'], ['pid:8864', 'l2'], ['pid:3398', '']]);
  assert.equal(r.copied, 2);
  assert.equal(r.cleared, 1);
  assert.equal(r.belowShare, 1);                       // הַיּוֹם: 40 % — the mark on יוֹם stays where it is
});
