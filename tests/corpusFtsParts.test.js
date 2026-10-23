'use strict';
// Full-text hits in works made of parts: the index lists, per word, the parts that hold it ('#'+skeleton).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/corpus-fts.js');

// encode {ord: [part indices]} the way the builder does (delta ord, count, delta positions)
const enc = (m) => { const flat = []; let w = 0; for (const [ord, ps] of Object.entries(m).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0])) { flat.push(ord - w); w = ord; flat.push(ps.length); let p = 0; for (const x of ps) { flat.push(x - p); p = x; } } return flat; };

test('partsWith lists the parts holding every query word, and nothing for a single-text work', async () => {
  C._resetForTest();
  C._setManifestForTest({ schema: 2, positions: true, sharded_letters: [], bucket_files: {}, work_parts: { 7: { work_id: '58052', toc_sha256: 'x', parts: 5 } } });
  const sk = (w) => C.normalizeToken(w);
  const a = sk('שלום'), b = sk('בית');
  C._setBucketForTest(C.shardKeyFor(a), { [a]: C.decodePositions(enc({ 7: [3] })), ['#' + a]: C.decodePositions(enc({ 7: [0, 2, 4] })) });
  C._setBucketForTest(C.shardKeyFor(b), { [b]: C.decodePositions(enc({ 7: [9] })), ['#' + b]: C.decodePositions(enc({ 7: [2, 3, 4], 9: [1] })) });
  assert.deepEqual((await C.partsWith('שלום', 7)).parts, [0, 2, 4]);
  assert.deepEqual((await C.partsWith('שָׁלוֹם בַּיִת', 7)).parts, [2, 4], 'both words, niqqud ignored');
  assert.equal((await C.partsWith('שלום', 7)).work_id, '58052');
  assert.equal(await C.partsWith('בית', 9), null, 'no part postings without work_parts in the manifest');
  assert.deepEqual((await C.partsWith('ספר', 7)).parts, [], 'an unknown word holds no part');
  C._resetForTest();
});
