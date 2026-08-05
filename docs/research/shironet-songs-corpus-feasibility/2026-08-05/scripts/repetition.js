'use strict';
// How much of the corpus is repeated material (choruses within a song, and
// recycled phrases across songs)? Drives the cache-hit / dedup discount.
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
    else if (c === '\r') { } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const BS = String.fromCharCode(92);
function pyList(s) {
  const out = []; s = s.trim(); if (s[0] !== '[') return out; let i = 1;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (s[i] === ']') break;
    const q = s[i]; if (q !== "'" && q !== '"') break; i++;
    let cur = '';
    while (i < s.length) { const c = s[i]; if (c === BS) { cur += s[i + 1]; i += 2; continue; } if (c === q) { i++; break; } cur += c; i++; }
    out.push(cur);
  }
  return out;
}
const rows = parseCsv(csv); const h = rows[0];
const data = rows.slice(1).filter((r) => r.length >= h.length && (r[0] || '').trim());
const iS = h.indexOf('songs');

const K = 7; // shingle length ~ one sung line
let totalSh = 0, dupInSong = 0, dupCross = 0;
const globalSh = new Set();
for (const r of data) {
  const w = pyList(r[iS] || '');
  if (w.length < K) continue;
  const local = new Set();
  for (let i = 0; i + K <= w.length; i++) {
    const s = w.slice(i, i + K).join(' ');
    totalSh++;
    if (local.has(s)) { dupInSong++; continue; }
    local.add(s);
    if (globalSh.has(s)) dupCross++; else globalSh.add(s);
  }
}
console.log(`${K}-word shingles: ${totalSh}`);
console.log('repeated INSIDE the same song (chorus):', dupInSong, '=', (dupInSong / totalSh * 100).toFixed(1) + '%');
console.log('first-seen-elsewhere ACROSS songs:', dupCross, '=', (dupCross / totalSh * 100).toFixed(1) + '%');
console.log('unique shingles:', globalSh.size, '=', (globalSh.size / totalSh * 100).toFixed(1) + '%');
