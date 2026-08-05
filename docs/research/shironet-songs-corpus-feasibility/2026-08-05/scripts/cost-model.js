'use strict';
// Cost model: measured token rates (owner's real song tables, counted by the
// live Gemini countTokens endpoint) projected onto the measured Kaggle volume.
const fs = require('fs');
const path = require('path');

// ---- 1. measured token rates, per Hebrew SOURCE word -----------------------
const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'library.json'), 'utf8'));
const songs = d.texts.filter((t) => /^Position \d+\./.test(t.title || ''));
const sample = [];
for (let i = 0; i < 12; i++) sample.push(songs[Math.floor((i * songs.length) / 12)]);
let sampleWords = 0;
for (const s of sample) {
  for (const r of s.rows || []) {
    const he = (r.hebrew_plain || '').trim();
    if (he) sampleWords += he.split(/\s+/).filter(Boolean).length;
  }
}
const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'token-measure.json'), 'utf8')).agg;
const rate = {
  in_he: m.he / sampleWords,
  out_niqqud: m.niqqud / sampleWords,
  out_translit: m.translit / sampleWords,
  out_ru: m.ru / sampleWords,
  out_jsonFull: m.jsonFull / sampleWords,
  out_slim: m.jsonSlim / sampleWords,
};
console.log('sample: 12 songs,', sampleWords, 'Hebrew words');
console.log('measured tokens per Hebrew source word:');
for (const [k, v] of Object.entries(rate)) console.log('  ' + k.padEnd(14), v.toFixed(2));

// ---- 2. measured corpus volume --------------------------------------------
const K = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'kaggle-stats2.json'), 'utf8'));
const WORDS = K.tw;          // 1,660,224 Hebrew word tokens
const SONGS = K.n;           // 14,543 songs with lyrics
const DEDUP = 0.218;         // measured exact 7-gram redundancy (8.3% in-song + 13.5% cross-song)
console.log(`\ncorpus: ${SONGS} songs, ${WORDS.toLocaleString('en-US')} Hebrew words, redundancy ${(DEDUP * 100).toFixed(1)}%`);

// ---- 3. price sheet (ai.google.dev/gemini-api/docs/pricing, Aug 2026) ------
const PRICE = {
  'flash-lite': { in: 0.10, out: 0.40 },
  'flash': { in: 0.30, out: 2.50 },
  'pro': { in: 1.25, out: 10.00 },
};
const M = 1e6;
const RETRY = 1.12;        // JSON-parse failures / truncation retries observed in this codebase
const PROMPT_OVERHEAD = 260; // tokens of instruction per request

function cost(model, inTok, outTok, batch) {
  const p = PRICE[model];
  const c = (inTok / M) * p.in + (outTok / M) * p.out;
  return batch ? c / 2 : c;
}

const scenarios = [
  { id: 'A', name: 'as-is legacy prompt (segments[] + he + niqqud + translit + ru)', outRate: rate.out_jsonFull, dedup: false, perReq: 1 },
  { id: 'B', name: 'slim format (niqqud|translit|ru, no echo, no JSON keys)', outRate: rate.out_slim, dedup: false, perReq: 8 },
  { id: 'B+', name: 'slim + line-level dedup cache', outRate: rate.out_slim, dedup: true, perReq: 8 },
  { id: 'C', name: 'RU only (niqqud=Dicta, translit=local, both free)', outRate: rate.out_ru, dedup: false, perReq: 8 },
  { id: 'C+', name: 'RU only + dedup cache', outRate: rate.out_ru, dedup: true, perReq: 8 },
];

console.log('\n' + '='.repeat(104));
console.log('scenario'.padEnd(52) + 'out tok'.padStart(10) + '  ' + ['lite', 'flash', 'pro'].map((x) => x.padStart(9)).join('') + '   flash·batch');
console.log('='.repeat(104));
const table = [];
for (const s of scenarios) {
  const words = WORDS * (s.dedup ? (1 - DEDUP) : 1);
  const reqs = Math.ceil(SONGS / s.perReq);
  const inTok = (words * rate.in_he + reqs * PROMPT_OVERHEAD) * RETRY;
  const outTok = words * s.outRate * RETRY;
  const row = {
    id: s.id, name: s.name, inTok, outTok,
    lite: cost('flash-lite', inTok, outTok, false),
    flash: cost('flash', inTok, outTok, false),
    pro: cost('pro', inTok, outTok, false),
    flashBatch: cost('flash', inTok, outTok, true),
    proBatch: cost('pro', inTok, outTok, true),
  };
  table.push(row);
  console.log(
    (s.id + '. ' + s.name).slice(0, 51).padEnd(52) +
    (outTok / M).toFixed(1).padStart(8) + 'M  ' +
    ['lite', 'flash', 'pro'].map((k) => ('$' + row[k].toFixed(0)).padStart(9)).join('') +
    ('  $' + row.flashBatch.toFixed(0)).padStart(14)
  );
}
console.log('='.repeat(104));
console.log('input tokens are ~' + ((table[0].inTok) / M).toFixed(1) + 'M in every scenario (the Hebrew source), so output dominates.');
console.log('\nRU-only with the STRONGEST model, batch:  $' + table[4].proBatch.toFixed(0) + '  (pro, dedup, 50% batch discount)');
fs.writeFileSync(path.join(process.cwd(), 'cost-model.json'), JSON.stringify({ rate, WORDS, SONGS, DEDUP, RETRY, table }, null, 1));
