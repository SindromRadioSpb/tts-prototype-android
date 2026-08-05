'use strict';
// Empirical stats over the owner's real 77-song study corpus (July-23 bundle).
// Goal: per-song row counts and per-column character volume, plus chorus-dedup
// potential — the inputs to an honest Gemini cost model for a 15K-song corpus.
const fs = require('fs');

const d = JSON.parse(fs.readFileSync('library.json', 'utf8'));
const songs = d.texts.filter((t) => /^Position \d+\./.test(t.title || ''));

const norm = (s) => (s || '').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim();

let rows = 0, dedupRows = 0;
const chars = { he: 0, niqqud: 0, translit: 0, translit_ru: 0, ru: 0 };
const perSong = [];
const globalSeen = new Map();
let globalDupRows = 0;

for (const s of songs) {
  const seen = new Set();
  let sRows = 0, sDedup = 0;
  const sChars = { he: 0, niqqud: 0, translit: 0, translit_ru: 0, ru: 0 };
  for (const r of s.rows || []) {
    const he = r.hebrew_plain || '';
    if (!he.trim()) continue;
    sRows++;
    const k = norm(he);
    if (!seen.has(k)) { seen.add(k); sDedup++; }
    // global cross-song dedup
    if (globalSeen.has(k)) globalDupRows++; else globalSeen.set(k, 1);
    sChars.he += he.length;
    sChars.niqqud += (r.hebrew_niqqud || '').length;
    sChars.translit += (r.translit || '').length;
    sChars.translit_ru += (r.translit_ru || '').length;
    sChars.ru += (r.russian || '').length;
  }
  rows += sRows; dedupRows += sDedup;
  for (const k of Object.keys(chars)) chars[k] += sChars[k];
  perSong.push({ title: s.title, rows: sRows, uniq: sDedup, ...sChars });
}

const n = songs.length;
const avg = (x) => (x / n).toFixed(1);
console.log('songs:', n);
console.log('rows total:', rows, '| avg rows/song:', avg(rows));
console.log('unique rows (within-song dedup):', dedupRows, '| chorus repeat rate:', ((1 - dedupRows / rows) * 100).toFixed(1) + '%');
console.log('cross-song duplicate rows:', globalDupRows, '(' + ((globalDupRows / rows) * 100).toFixed(1) + '%)');
console.log('');
console.log('chars TOTAL / avg per song / avg per row:');
for (const k of Object.keys(chars)) {
  console.log('  ' + k.padEnd(12), String(chars[k]).padStart(9), avg(chars[k]).padStart(9), (chars[k] / rows).toFixed(1).padStart(7));
}
const wordsHe = songs.reduce((a, s) => a + (s.rows || []).reduce((b, r) => b + ((r.hebrew_plain || '').trim().split(/\s+/).filter(Boolean).length), 0), 0);
console.log('');
console.log('hebrew words total:', wordsHe, '| avg words/song:', (wordsHe / n).toFixed(1), '| avg words/row:', (wordsHe / rows).toFixed(2));

// distribution
const rr = perSong.map((s) => s.rows).sort((a, b) => a - b);
const pct = (p) => rr[Math.floor((rr.length - 1) * p)];
console.log('rows/song p10/p50/p90/max:', pct(0.1), pct(0.5), pct(0.9), rr[rr.length - 1]);

fs.writeFileSync('song-stats.json', JSON.stringify({ n, rows, dedupRows, globalDupRows, chars, wordsHe, perSong }, null, 1));
