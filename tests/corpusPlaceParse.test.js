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
