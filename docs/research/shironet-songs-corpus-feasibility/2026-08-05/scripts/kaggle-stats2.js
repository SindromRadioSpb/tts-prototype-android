'use strict';
const fs = require('fs');
const csv = fs.readFileSync('shironet/kaggle.csv', 'utf8').replace(/^﻿/, '');

function parseCsv(s) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* skip */ }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const rows = parseCsv(csv);
const h = rows[0];
const data = rows.slice(1).filter((r) => r.length >= h.length && (r[0] || '').trim());
const iA = h.indexOf('artist'), iS = h.indexOf('songs'), iT = h.indexOf('song'), iWc = h.indexOf('words count');

const BS = String.fromCharCode(92); // backslash
function pyList(s) {
  const out = []; s = s.trim(); if (s[0] !== '[') return out;
  let i = 1;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (s[i] === ']') break;
    const q = s[i];
    if (q !== "'" && q !== '"') break;
    i++;
    let cur = '';
    while (i < s.length) {
      const c = s[i];
      if (c === BS) { cur += s[i + 1]; i += 2; continue; }
      if (c === q) { i++; break; }
      cur += c; i++;
    }
    out.push(cur);
  }
  return out;
}

let tw = 0, tc = 0, declared = 0, mismatch = 0, n = 0;
const vocab = new Map(); const per = []; const artists = new Map();
for (const r of data) {
  const w = pyList(r[iS] || '');
  if (!w.length) continue;
  n++; tw += w.length; per.push(w.length);
  for (const x of w) { tc += x.length; vocab.set(x, (vocab.get(x) || 0) + 1); }
  artists.set(r[iA], (artists.get(r[iA]) || 0) + 1);
  const d = parseInt(r[iWc], 10);
  if (Number.isFinite(d)) { declared += d; if (d !== w.length) mismatch++; }
}
per.sort((a, b) => a - b);
const pq = (q) => per[Math.floor((per.length - 1) * q)];
console.log('songs with lyrics:', n, '| artists:', artists.size);
console.log('recomputed word tokens:', tw, '| declared sum:', declared, '| rows mismatching:', mismatch);
console.log('words/song p10/p50/p90/p99:', pq(0.1), pq(0.5), pq(0.9), pq(0.99), '| avg:', (tw / n).toFixed(1));
console.log('hebrew chars (no spaces):', tc, '| avg chars/word:', (tc / tw).toFixed(2));
console.log('chars incl. single spaces:', tc + tw - n);
console.log('vocabulary (distinct surface forms):', vocab.size);
const hapax = [...vocab.values()].filter((v) => v === 1).length;
console.log('hapax legomena:', hapax, '(' + ((hapax / vocab.size) * 100).toFixed(1) + '% of vocab)');
const cov = [...vocab.entries()].sort((a, b) => b[1] - a[1]);
let acc = 0; const marks = [1000, 3000, 5000, 10000];
for (const m of marks) {
  acc = cov.slice(0, m).reduce((a, x) => a + x[1], 0);
  console.log(`top ${m} forms cover ${(acc / tw * 100).toFixed(1)}% of all tokens`);
}
fs.writeFileSync('kaggle-stats2.json', JSON.stringify({ n, artists: artists.size, tw, tc, vocab: vocab.size, hapax, per: { p10: pq(0.1), p50: pq(0.5), p90: pq(0.9), p99: pq(0.99), avg: tw / n } }, null, 1));
