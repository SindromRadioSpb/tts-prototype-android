#!/usr/bin/env node
// Atlas P4 · W0 — measures the word layer on the real book data (read-only).
// Usage: node scripts/atlas/word-layer-spike.cjs [dataDir] [outJson]
//   dataDir defaults to data/atlas/a97002 of the main checkout.
// Measures: Hebrew words per section/page/block; where each block → term link sits in the block text
// (exact skeleton / with proclitics / with inflection); the size of a Dicta bake (unique lines, words, chars).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const F = require('../../public/js/corpus-fts.js');

const dataDir = path.resolve(process.argv[2] || path.join(__dirname, '../../../../data/atlas/a97002'));
const outJson = process.argv[3] || null;

const NIQQUD = /[֑-ׇ]/g;
function words(s) {
  return String(s || '').normalize('NFC').replace(NIQQUD, '').replace(/־/g, ' ')
    .match(/[א-ת]+(?:["'׳״][א-ת]+)*["'׳]?/g) || [];
}
const skel = (w) => F.normalizeToken(w) || '';
// the token without up to 3 leading proclitic letters (ו ש ה ב ל מ כ). Every word of a term may carry one:
// a definite construct puts ה on its second word («מחבר המסמרות»).
function proStrip(t) {
  const out = new Set([t]);
  for (let i = 1; i <= 3 && i < t.length - 1; i++) {
    if (/^[ושהבלמכ]+$/.test(t.slice(0, i))) out.add(t.slice(i));
  }
  return out;
}
// a coarse base: plural/construct/feminine endings off (ים ות ת ה י), final letters already folded by normalizeToken
function base(t) { return t.replace(/(ים|ות|יות|ת|ה|י)$/, ''); }

function matchAt(block, lemma, i, level) {
  for (let k = 0; k < lemma.length; k++) {
    const b = block[i + k], l = lemma[k];
    if (b == null) return false;
    if (b === l) continue;
    if (level >= 2 && proStrip(b).has(l)) continue;
    if (level >= 3) {
      const cands = proStrip(b);
      let ok = false;
      for (const c of cands) if (base(c).length >= 2 && base(c) === base(l)) ok = true;
      if (ok) continue;
    }
    return false;
  }
  return true;
}
function locate(blockSk, lemmaSk) {
  for (let level = 1; level <= 3; level++) {
    for (let i = 0; i + lemmaSk.length <= blockSk.length; i++) if (matchAt(blockSk, lemmaSk, i, level)) return { level, at: i };
  }
  return null;
}

const files = fs.readdirSync(path.join(dataDir, 'sections')).filter((f) => f.endsWith('.json')).sort();
const report = { dataDir: path.basename(dataDir), sections: [], totals: {}, terms: {}, bake: {}, unresolvedSample: [], longest: {} };
let allWords = 0, blocksWithHe = 0, blocksAll = 0, maxPage = { words: 0 }, maxBlock = { words: 0 }, maxSection = { words: 0 };
const lines = new Map();  // sha → words
let refs = 0, missingTerm = 0;
const lv = { 1: 0, 2: 0, 3: 0, partial: 0, none: 0 };
const termIds = new Set(), termWords = new Map();
const vocab = new Set();

for (const f of files) {
  const s = JSON.parse(fs.readFileSync(path.join(dataDir, 'sections', f), 'utf8'));
  const terms = s.terms || {};
  let secWords = 0, secBlocks = 0;
  for (const p of s.pages || []) {
    let pageWords = 0;
    for (const it of p.items || []) {
      blocksAll++;
      const text = it.he_niqqud || it.he || '';
      const ws = words(it.he || it.he_niqqud || '');
      if (!ws.length) continue;
      blocksWithHe++; secBlocks++;
      ws.forEach((w) => vocab.add(skel(w)));
      pageWords += ws.length;
      if (ws.length > maxBlock.words) maxBlock = { words: ws.length, id: it.id };
      const plain = String(it.he || '').trim();
      if (plain) lines.set(crypto.createHash('sha256').update(plain).digest('hex'), { w: ws.length, c: plain.length });
      const bsk = ws.map(skel);
      for (const ref of it.terms || []) {
        refs++;
        const id = String(ref).split('#')[0];
        termIds.add(id);
        const t = terms[id];
        if (!t) { missingTerm++; continue; }
        const lsk = words(t.lemma_he || t.niqqud).map(skel);
        termWords.set(id, lsk.length);
        const hit = lsk.length ? locate(bsk, lsk) : null;
        if (hit) lv[hit.level]++;
        else if (lsk.some((l) => bsk.some((b) => matchAt([b], [l], 0, 3)))) lv.partial++;
        else {
          lv.none++;
          if (report.unresolvedSample.length < 40) report.unresolvedSample.push({ block: it.id, term: t.lemma_he, he: plain.slice(0, 90) });
        }
      }
      void text;
    }
    secWords += pageWords;
    if (pageWords > maxPage.words) maxPage = { words: pageWords, section: s.id, page: p.page };
  }
  allWords += secWords;
  if (secWords > maxSection.words) maxSection = { words: secWords, section: s.id };
  report.sections.push({ id: s.id, blocks: secBlocks, words: secWords, terms: Object.keys(terms).length });
}
let bakeWords = 0, bakeChars = 0;
for (const v of lines.values()) { bakeWords += v.w; bakeChars += v.c; }
const multi = Array.from(termWords.values()).filter((n) => n > 1).length;
report.totals = { sections: files.length, blocks: blocksAll, blocksWithHebrew: blocksWithHe, hebrewWords: allWords, distinctSkeletons: vocab.size };
report.longest = { section: maxSection, page: maxPage, block: maxBlock };
report.terms = { refs, distinctTermsReferenced: termIds.size, multiWordTerms: multi, refsWithoutDictionaryEntry: missingTerm,
  located: { exact: lv[1], withProclitic: lv[2], withInflection: lv[3], onlyPartOfTerm: lv.partial, notFound: lv.none },
  locatedShare: refs ? +((lv[1] + lv[2] + lv[3]) / (refs - missingTerm)).toFixed(4) : 0 };
// Dicta bake: one request per unique line; ≤ 2 in flight with ≥ 300 ms pause (O-090) → ≈ 6 lines/s at best,
// a realistic 1.5–2 lines/s with Dicta's own latency.
report.bake = { uniqueLines: lines.size, words: bakeWords, chars: bakeChars,
  hoursAt1_5LinesPerSec: +(lines.size / 1.5 / 3600).toFixed(2), hoursAt0_75LinesPerSec: +(lines.size / 0.75 / 3600).toFixed(2) };

const out = JSON.stringify(report, null, 1);
if (outJson) fs.writeFileSync(outJson, out + '\n');
console.log(JSON.stringify({ totals: report.totals, longest: report.longest, terms: report.terms, bake: report.bake }, null, 1));
