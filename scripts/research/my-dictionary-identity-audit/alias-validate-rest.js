#!/usr/bin/env node
"use strict";
// Д9.3 — blind check of the alias audit: every retarget and undo + a seeded sample of the kept aliases.
//   node alias-validate.js sample <alias-audit.json> <dir>   → alias.blind.json + alias.items.json
//   node alias-validate.js score  <dir> <answers.json>        → per verdict: is the alias's target the word? the new target?
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const shuffle = (a, rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function sample(auditPath, dir) {
  const NA = require(path.join(ROOT, "public/js/notes-autogen.js"));
  global.window = { NotesAutoGen: NA };
  const RM = require(path.join(ROOT, "public/js/reader-morph.js"));
  const A = JSON.parse(fs.readFileSync(auditPath, "utf8")).aliases.filter((x) => x.example && x.example.sentence);
  const rnd = mulberry32(20261019);
  const pick = A.filter((x) => x.verdict !== "keep").concat(shuffle(A.filter((x) => x.verdict === "keep"), rnd).slice(0, 100000));
  const items = [];
  for (const x of pick) {
    const al = RM.alignSurfaceNiqqud(x.example.sentence, x.example.sentence_n || ""); let w = 0;
    const toks = RM.tokenize(x.example.sentence), pairs = toks.filter((t) => t.isWord).map((t) => { const a = al[w++] || {}; return [a.surface || t.text, a.niqqud || ""]; });
    const units = (RM.joinSplitWords(toks, pairs) || []).filter((u) => !u.fragment);
    const sk = RM.stripNiqqud(x.from.split("#")[0]);
    const index = units.findIndex((u) => RM.stripNiqqud(u.surface) === sk);
    if (index < 0) continue;
    items.push({ id: "R" + String(items.length + 1).padStart(3, "0"), ...x, tokens: units.map((u) => u.niqqud || u.surface), index, surface: units[index].surface, niqqud: units[index].niqqud });
  }
  const sheet = shuffle(items.map((it) => ({ id: it.id, sentence: it.tokens.join(" "), word: it.tokens[it.index], index: it.index })), rnd);
  fs.writeFileSync(path.join(dir, "alias-rest.items.json"), JSON.stringify(items, null, 1));
  fs.writeFileSync(path.join(dir, "alias-rest.blind.json"), JSON.stringify(sheet, null, 1));
  console.log("items", items.length, JSON.stringify(items.reduce((m, x) => { m[x.verdict] = (m[x.verdict] || 0) + 1; return m; }, {})));
}

function score(dir, answersPath) {
  const S = require("./score.js"), P = S.pealimIndex();
  const UP = { NOUN: "noun", PROPN: "propernoun", ADJ: "adjective", VERB: "verb", AUX: "verb", ADV: "adverb", NUM: "numeral" };
  const kin = (a, b) => a === b || ((a === "noun" || a === "adjective") && (b === "noun" || b === "adjective"));
  const posOf = (key) => { if (/^pid:/.test(key)) return (P.byPid.get(key.slice(4)) || {}).pos || ""; const m = /^dl:[^#]*#(.*)$/.exec(key || ""); return m ? m[1] : ""; };
  const lemmaOf = (key) => /^pid:/.test(key) ? (P.byPid.get(key.slice(4)) || {}).lemma || "" : (/^dl:([^#]*)/.exec(key || "") || [])[1] || "";
  const items = JSON.parse(fs.readFileSync(path.join(dir, "alias-rest.items.json"), "utf8"));
  const ans = new Map(JSON.parse(fs.readFileSync(answersPath, "utf8")).map((a) => [a.id, a]));
  const right = (it, key, a) => {
    if (!key) return a.is_name || a.upos === "PROPN" ? "agree" : "disagree";
    if (a.is_name || a.upos === "PROPN") return posOf(key) === "propernoun" ? "agree" : "disagree";
    const v = S.verdict(P, { key, lemma: lemmaOf(key), surface: it.surface, niqqud: it.niqqud }, a.lemma, a.upos).v;
    if (v !== "agree") return v;
    const kp = posOf(key), up = UP[a.upos] || "";
    return !kp || !up || kin(kp, up) ? "agree" : "disagree";
  };
  const rows = [], by = {};
  for (const it of items) {
    const a = ans.get(it.id) || {};
    const cur = right(it, it.to, a), now = it.verdict === "retarget" ? right(it, it.now, a) : it.verdict === "undo" ? right(it, "", a) : cur;
    rows.push({ ...it, examiner: a.lemma, upos: a.upos, is_name: a.is_name, note: a.note, current: cur, proposed: now });
    const b = by[it.verdict] = by[it.verdict] || { n: 0, currentRight: 0, proposedRight: 0, currentWrong: 0, proposedWrong: 0 };
    b.n++; if (cur === "agree") b.currentRight++; if (cur === "disagree") b.currentWrong++; if (now === "agree") b.proposedRight++; if (now === "disagree") b.proposedWrong++;
  }
  fs.writeFileSync(path.join(dir, "alias-rest.scored.json"), JSON.stringify(rows, null, 1));
  console.log(JSON.stringify(by, null, 1));
}
const [mode, a, b] = process.argv.slice(2);
if (mode === "sample") sample(a, b); else score(a, b);
