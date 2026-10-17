'use strict';
// Ф4 · Д8-К4 v2 (К4.3): a corpus work's Dicta facts land in the device's stored parse — bound by the row's hash and
// order, never over an existing parse, never on an edited row, only for the work's own edition.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const RM = require('../public/js/reader-morph.js');
const CPP = require('../public/js/corpus-place-parse.js');

const sha256Hex = async (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const h16 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);
const KEY = 'a'.repeat(64);
const TEXT = { id: 't1', text_key: KEY, source_meta_json: JSON.stringify({ corpus: { byehuda_id: '101' } }) };
const ROWS = [
  { id: 's0', order_index: 0, he_plain: 'מכות קשות', he_niqqud: 'מַכּוֹת קָשׁוֹת' },
  { id: 's1', order_index: 1, he_plain: 'שורה שנערכה', he_niqqud: '' },        // edited on the device: the file has the old text
  { id: 's2', order_index: 2, he_plain: 'יראת אלהים', he_niqqud: 'יִרְאַת אֱלֹהִים' }, // already parsed by the learner
];
const FILE = { v: 1, model: 'dicta-morph-v2', src: { kind: 'by', id: '101', edition: KEY }, missing: 0, rows: [
  [h16('מכות קשות'), 0, [['מכות', 'מכה', [], 'noun', 'מַכּוֹת', '', ''], ['קשות', 'קשה', [], 'adjective', 'קָשׁוֹת', '', '']]],
  [h16('שורה ישנה'), 1, [['שורה', 'שורה', [], 'noun', '', '', ''], ['ישנה', 'ישן', [], 'adjective', '', '', '']]],
  [h16('יראת אלהים'), 2, [['יראת', 'יראה', [], 'noun', '', '', ''], ['אלהים', 'אלוה', [], 'noun', '', '', '']]],
] };

function fakeDb(existing) {
  const morph = new Map(Object.entries(existing || {}));
  return { morph,
    dbQuery: async (sql, p) => {
      if (/COUNT\(\*\) AS n FROM sentence_morph WHERE text_id/.test(sql)) return [{ n: [...morph.values()].filter((m) => m.provider === p[1]).length }];
      if (/FROM sentences s WHERE s.text_id/.test(sql)) return ROWS.slice(p[2], p[2] + p[1]).map((r) => Object.assign({}, r, { has: morph.has(r.id) ? 1 : 0 }));
      throw new Error('unexpected sql ' + sql);
    },
    saveSentenceMorphIfAbsent: async (tid, sid, model, tokens, provider) => { if (!morph.has(sid)) morph.set(sid, { tid, model, tokens, provider }); } };
}
const fetchOf = (body, status) => async (url) => ({ ok: (status || 200) === 200, status: status || 200, url, json: async () => body });

test('the file lands where hash and order match; an edited row and an existing parse are left alone', async () => {
  const db = fakeDb({ s2: { provider: 'dicta-morph', tokens: [] } });
  const urls = [];
  const r = await CPP.apply(TEXT, { db, RM, sha256Hex, fetch: async (u) => { urls.push(u); return fetchOf(FILE)(u); } });
  assert.deepEqual(urls, ['/data/corpus-parse/by/' + KEY + '.json']);
  assert.deepEqual([r.status, r.applied, r.unmatched, r.kept, r.misaligned], ['applied', 1, 1, 1, 0]);
  const s0 = db.morph.get('s0');
  assert.equal(s0.provider, 'corpus-dicta');
  assert.deepEqual(s0.tokens[0], { word: 'מכות', lemma: 'מכה', lemmas: ['מכה'], posDicta: 'noun', niqqud: 'מַכּוֹת', binyan: null, prefix: '', stem: '' });
  assert.equal(db.morph.get('s2').provider, 'dicta-morph');
  // once applied, the next open does not fetch again
  const again = await CPP.apply(TEXT, { db, RM, sha256Hex, fetch: async () => { throw new Error('must not fetch'); } });
  assert.equal(again.status, 'skip');
});

test('a file of another edition is refused; no file is an honest «none»; personal texts are never addressed', async () => {
  const other = Object.assign({}, FILE, { src: { kind: 'by', id: '101', edition: 'b'.repeat(64) } });
  assert.equal((await CPP.apply(TEXT, { db: fakeDb(), RM, sha256Hex, fetch: fetchOf(other) })).status, 'error');
  assert.equal((await CPP.apply(TEXT, { db: fakeDb(), RM, sha256Hex, fetch: fetchOf(null, 404) })).status, 'none');
  assert.equal(CPP.sourceOf({ id: 'p', text_key: KEY, source_meta_json: '{}' }), null);
  const pc = CPP.sourceOf({ id: 'q', source_meta_json: JSON.stringify({ public_corpus: { slug: 'study-songs', public_work_id: 'work-1', snapshot_sha256: 'c'.repeat(64) } }) });
  assert.deepEqual(pc, { kind: 'pc', edition: 'c'.repeat(64), url: '/api/public-corpora/study-songs/works/work-1/parse?snapshot=' + 'c'.repeat(64) });
});

test('applied facts are what the place rule reads: the homograph at its place', async () => {
  const db = fakeDb();
  await CPP.apply(TEXT, { db, RM, sha256Hex, fetch: fetchOf(FILE) });
  const pu = RM.placeUnits(ROWS[0], db.morph.get('s0').tokens);
  assert.equal(pu.at.get(0).lemma, 'מכה');
  assert.equal(pu.at.get(1).posDicta, 'adjective');
});

// O-092: the device cuts an abbreviation at its quote, Dicta keeps it one word; a geresh comes as ׳ or '.
// Real rows of the baked corpus (works 191, 55): the row keeps its facts, a fragment gets no token.
test('a quoted abbreviation does not drop the row: its pieces are covered, the other words keep their facts', () => {
  const tok = (w) => ({ word: w, lemma: w, posDicta: 'noun' });
  const kk = RM.placeUnits({ he_plain: 'אי אפשר לבזבז כ"כ על דברים טפלים', he_niqqud: '' },
    ['אי', 'אפשר', 'לבזבז', 'כ"כ', 'על', 'דברים', 'טפלים'].map(tok));
  const units = kk.sk.filter(Boolean).length;
  assert.equal(kk.at.size + kk.cover.size, units, 'every unit aligned or covered');
  for (const off of kk.cover) assert.ok(!kk.at.has(off), 'a piece never borrows the whole word\'s parse');
  assert.equal([...kk.at.values()].map((t) => t.word).join(' '), 'אי אפשר לבזבז על דברים טפלים');
  const year = RM.placeUnits({ he_plain: 'נאום פתיחה ניסן תרפ"ז', he_niqqud: '' }, ['נאום', 'פתיחה', 'ניסן', 'תרפ"ז'].map(tok));
  assert.equal(year.at.size + year.cover.size, year.sk.filter(Boolean).length);
  const rabbi = RM.placeUnits({ he_plain: 'הנני ר׳ פתחיה', he_niqqud: '' }, ['הנני', "ר'", 'פתחיה'].map(tok));
  assert.equal(rabbi.at.size, 3, 'geresh ׳ and \' are the same word');
  const book = RM.placeUnits({ he_plain: 'להנחיל את התנ"ך לבית הספר', he_niqqud: '' }, ['להנחיל', 'את', 'התנ"ך', 'לבית', 'הספר'].map(tok));
  assert.equal(book.at.get(book.sk.indexOf('לבית')).word, 'לבית', 'the cursor moves past the abbreviation');
});

test('a work applied before the quote fix is applied once more: the dropped quoted rows get their facts', async () => {
  const plain = 'שהוא כ"כ אהב';
  const T = { id: 't9', text_key: 'd'.repeat(64), source_meta_json: JSON.stringify({ corpus: { byehuda_id: '191' } }) };
  const F = { v: 1, model: 'm', src: { kind: 'by', id: '191', edition: 'd'.repeat(64) }, rows: [
    [h16('מכות קשות'), 0, [['מכות', 'מכה', [], 'noun', '', '', ''], ['קשות', 'קשה', [], 'adjective', '', '', '']]],
    [h16(plain), 1, [['שהוא', 'הוא', [], 'pronoun', '', '', ''], ['כ"כ', 'כל כך', [], 'adverb', '', '', ''], ['אהב', 'אהב', [], 'verb', '', '', '']]],
  ] };
  const rows = [{ id: 'a0', order_index: 0, he_plain: 'מכות קשות', he_niqqud: '' }, { id: 'a1', order_index: 1, he_plain: plain, he_niqqud: '' }];
  const morph = new Map([['a0', { provider: 'corpus-dicta' }]]);   // the first apply (ALIGN 1) dropped a1
  const db = { dbQuery: async (sql, p) => {
    if (/COUNT\(\*\) AS n FROM sentence_morph/.test(sql)) return [{ n: [...morph.values()].filter((m) => m.provider === p[1]).length }];
    if (/FROM sentences s WHERE s.text_id/.test(sql)) return rows.slice(p[2], p[2] + p[1]).map((r) => Object.assign({}, r, { has: morph.has(r.id) ? 1 : 0 }));
    throw new Error(sql);
  }, saveSentenceMorphIfAbsent: async (tid, sid, model, tokens, provider) => { if (!morph.has(sid)) morph.set(sid, { tokens, provider }); } };
  const seen = new Set(), done = { has: (id) => seen.has(id), add: (id) => seen.add(id) };
  const r = await CPP.apply(T, { db, RM, sha256Hex, fetch: fetchOf(F), done });
  assert.deepEqual([r.status, r.applied, r.kept, r.misaligned], ['applied', 1, 1, 0]);
  assert.equal(morph.get('a1').provider, 'corpus-dicta');
  assert.ok(seen.has('t9'));
  assert.equal((await CPP.apply(T, { db, RM, sha256Hex, fetch: async () => { throw new Error('must not fetch'); }, done })).status, 'skip');
});

test('a copy of an older edition finds the current file by its work number; rows bind by hash, another work is refused', async () => {
  const OLD = { id: 't9', text_key: 'f'.repeat(64), source_meta_json: TEXT.source_meta_json };
  const urls = [];
  const fetch = async (u) => { urls.push(u); return u.includes('/by-work/') ? fetchOf(FILE)(u) : fetchOf(null, 404)(u); };
  const db = fakeDb({ s2: { provider: 'dicta-morph', tokens: [] } });
  const r = await CPP.apply(OLD, { db, RM, sha256Hex, fetch });
  assert.deepEqual(urls, ['/data/corpus-parse/by/' + 'f'.repeat(64) + '.json', '/data/corpus-parse/by-work/101.json']);
  assert.deepEqual([r.status, r.applied, r.unmatched, r.kept], ['applied', 1, 1, 1]);
  const stranger = Object.assign({}, FILE, { src: { kind: 'by', id: '202', edition: KEY } });
  const r2 = await CPP.apply(OLD, { db: fakeDb(), RM, sha256Hex, fetch: async (u) => (u.includes('/by-work/') ? fetchOf(stranger)(u) : fetchOf(null, 404)(u)) });
  assert.equal(r2.status, 'error');
  const none = await CPP.apply(OLD, { db: fakeDb(), RM, sha256Hex, fetch: fetchOf(null, 404) });
  assert.equal(none.status, 'none');
});
