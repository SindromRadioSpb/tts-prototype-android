#!/usr/bin/env node
"use strict";
// Д9 validation: which key is right where the new resolver changed it — the old or the new?
//   node d9-validate.js sample <d9-diff.json> <out-dir>   → d9.blind.json (examiner sheet) + d9.items.json (the key)
//   node d9-validate.js score  <out-dir> <answers.json>   → per rule: new right / old right / neither / undecided
// Types are drawn with probability ∝ their token count inside each rule (seed 20261016).
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const QUOTA = { "own-entry": 40, "dicta-tiebreak": 30, "dicta-pealim": 25, "dicta-confirmed": 15, contraction: 5, "": 5 };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function sample(diffPath, dir) {
  const NA = require(path.join(ROOT, "public/js/notes-autogen.js"));
  global.window = { NotesAutoGen: NA };
  const RM = require(path.join(ROOT, "public/js/reader-morph.js"));
  const D = JSON.parse(fs.readFileSync(diffPath, "utf8")), rnd = mulberry32(Number(process.env.SEED || 20261016)), items = [];
  for (const [via, k] of Object.entries(QUOTA)) {
    let pool = D.changes.filter((c) => c.via === via);
    for (let i = 0; i < k && pool.length; i++) {
      const total = pool.reduce((a, c) => a + c.n, 0); let r = rnd() * total, j = 0;
      while (j < pool.length - 1 && (r -= pool[j].n) > 0) j++;
      const c = pool.splice(j, 1)[0];
      const al = RM.alignSurfaceNiqqud(c.sentence, c.sentence_n || ""); let w = 0;
      const toks = RM.tokenize(c.sentence), pairs = toks.filter((x) => x.isWord).map((x) => { const a = al[w++] || {}; return [a.surface || x.text, a.niqqud || ""]; });
      const units = (RM.joinSplitWords(toks, pairs) || []).filter((u) => !u.fragment);
      const index = units.findIndex((u) => u.surface === c.surface && u.niqqud === c.niqqud);
      if (index < 0) { i--; continue; }
      items.push({ id: "V" + String(items.length + 1).padStart(3, "0"), via, from: c.from, to: c.to, lemmaO: c.lemmaO, lemmaN: c.lemmaN, meanO: c.meanO, meanN: c.meanN,
        n: c.n, surface: c.surface, niqqud: c.niqqud, tokens: units.map((u) => u.niqqud || u.surface), index });
    }
  }
  // the examiner's sheet: shuffled, no keys, no rule
  const sheet = items.map((it) => ({ id: it.id, sentence: it.tokens.join(" "), word: it.tokens[it.index], index: it.index }));
  for (let i = sheet.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sheet[i], sheet[j]] = [sheet[j], sheet[i]]; }
  fs.writeFileSync(path.join(dir, process.env.TAG ? "d9." + process.env.TAG + ".items.json" : "d9.items.json"), JSON.stringify(items, null, 1));
  fs.writeFileSync(path.join(dir, process.env.TAG ? "d9." + process.env.TAG + ".blind.json" : "d9.blind.json"), JSON.stringify(sheet, null, 1));
  console.log("items", items.length);
}

function score(dir, answersPath) {
  const S = require("./score.js"), P = S.pealimIndex();
  const items = JSON.parse(fs.readFileSync(path.join(dir, process.env.TAG ? "d9." + process.env.TAG + ".items.json" : "d9.items.json"), "utf8"));
  const ans = new Map(JSON.parse(fs.readFileSync(answersPath, "utf8")).map((a) => [a.id, a]));
  const keyItem = (it, key, lemma) => ({ key, lemma, surface: it.surface, niqqud: it.niqqud });
  const rows = [], by = {};
  // the part of speech decides between two paradigms that share the lemma (טוב «хороший» ≠ לטוב «быть хорошим»)
  const UP = { NOUN: "noun", PROPN: "noun", ADJ: "adjective", VERB: "verb", AUX: "verb", ADV: "adverb", NUM: "numeral" };
  const kin = (a, b) => a === b || ((a === "noun" || a === "adjective") && (b === "noun" || b === "adjective"));
  const posOf = (key) => { if (/^pid:/.test(key)) return (P.byPid.get(key.slice(4)) || {}).pos || ""; const m = /^dl:[^#]*#(.*)$/.exec(key || ""); return m ? m[1] : ""; };
  const withPos = (v, key, upos) => { if (v !== "agree") return v; const kp = posOf(key), up = UP[upos] || ""; return !kp || !up || kin(kp, up) ? "agree" : "disagree"; };
  for (const it of items) {
    const a = ans.get(it.id) || {};
    const vo = it.from ? withPos(S.verdict(P, keyItem(it, it.from, it.lemmaO), a.lemma, a.upos).v, it.from, a.upos) : (a.is_name ? "agree" : "disagree");
    const vn = it.to && !/#$/.test(it.to) ? withPos(S.verdict(P, keyItem(it, it.to, it.lemmaN), a.lemma, a.upos).v, it.to, a.upos) : ((a.is_name || a.upos === "PROPN" || a.upos === "X") ? "agree" : "disagree");
    const out = vn === "agree" && vo !== "agree" ? "new" : vo === "agree" && vn !== "agree" ? "old" : vn === "agree" && vo === "agree" ? "both" : "neither";
    rows.push({ ...it, examiner: a.lemma, upos: a.upos, conf: a.confidence, note: a.note, old: vo, new: vn, outcome: out });
    const b = by[it.via] = by[it.via] || { n: 0, tokens: 0, new: 0, old: 0, both: 0, neither: 0, newTok: 0, oldTok: 0 };
    b.n++; b.tokens += it.n; b[out]++; if (out === "new") b.newTok += it.n; if (out === "old") b.oldTok += it.n;
  }
  fs.writeFileSync(path.join(dir, process.env.TAG ? "d9." + process.env.TAG + ".scored.json" : "d9.scored.json"), JSON.stringify(rows, null, 1));
  console.log(JSON.stringify(by, null, 1));
  return rows;
}

const [mode, a, b] = process.argv.slice(2);
if (mode === "sample") sample(a, b); else if (mode === "score") score(a, b);
