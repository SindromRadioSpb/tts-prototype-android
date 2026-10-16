#!/usr/bin/env node
"use strict";
// Blind worksheets for the LLM examiner (O4). Nothing the program answered, no stratum, no key goes into them.
//   calibration.blind.json — 200 lexical tokens of the IAHLTwiki test split (seeded), gold kept in calibration.gold.json
//   owner.blind.json       — the 300 sampled words, shuffled, renamed B001…; the map back is owner.blind-map.json
// node make-blind.js <iahltwiki-test.conllu> <audit-dir>
const fs = require("node:fs");
const path = require("node:path");

const [conllu, dir] = process.argv.slice(2);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const LEXICAL = new Set(["NOUN", "VERB", "ADJ", "PROPN", "ADV", "NUM", "AUX"]);

// the gold of a surface token = its first lexical word (the same rule as oracle_stanza.py)
function readConllu(p) {
  const sents = []; let cur = [], mwt = null;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line) { if (cur.length) sents.push(cur); cur = []; mwt = null; continue; }
    if (line.startsWith("#")) continue;
    const c = line.split("\t"), id = c[0];
    if (id.includes(".")) continue;
    if (id.includes("-")) { const [, b] = id.split("-").map(Number); mwt = { form: c[1], end: b, words: [] }; cur.push(mwt); continue; }
    const w = { form: c[1], lemma: c[2], upos: c[3] };
    if (mwt && Number(id) <= mwt.end) { mwt.words.push(w); if (Number(id) === mwt.end) mwt = null; }
    else cur.push({ form: c[1], words: [w] });
  }
  if (cur.length) sents.push(cur);
  return sents;
}
const content = (ws) => ws.find((w) => LEXICAL.has(w.upos)) || ws[ws.length - 1];

const rnd = mulberry32(20261016);
const sents = readConllu(conllu);
const pool = [];
sents.forEach((s, si) => s.forEach((t, ti) => { const g = content(t.words); if (g && LEXICAL.has(g.upos)) pool.push({ si, ti, g }); }));
const picked = shuffle(pool, rnd).slice(0, 200);
const calBlind = [], calGold = [];
picked.forEach((p, i) => {
  const id = "C" + String(i + 1).padStart(3, "0"), s = sents[p.si];
  calBlind.push({ id, sentence: s.map((t) => t.form).join(" "), word: s[p.ti].form, index: p.ti });
  calGold.push({ id, lemma: p.g.lemma, upos: p.g.upos });
});
fs.writeFileSync(path.join(dir, "calibration.blind.json"), JSON.stringify(calBlind, null, 1));
fs.writeFileSync(path.join(dir, "calibration.gold.json"), JSON.stringify(calGold, null, 1));

const S = JSON.parse(fs.readFileSync(path.join(dir, "sample.json"), "utf8"));
const items = shuffle(S.items, rnd);
const blind = [], map = [];
items.forEach((it, i) => {
  const id = "B" + String(i + 1).padStart(3, "0");
  blind.push({ id, sentence: it.tokens_niqqud.join(" "), word: it.tokens_niqqud[it.index] || it.niqqud || it.surface, index: it.index });
  map.push({ blind: id, id: it.id });
});
fs.writeFileSync(path.join(dir, "owner.blind.json"), JSON.stringify(blind, null, 1));
fs.writeFileSync(path.join(dir, "owner.blind-map.json"), JSON.stringify(map, null, 1));
console.log("calibration", calBlind.length, "owner", blind.length);
