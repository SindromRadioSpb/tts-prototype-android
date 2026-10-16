#!/usr/bin/env node
"use strict";
// Д10 — which is right at a place where context changes the key: the current key, A (the sentence's Dicta parse), Б (the
// word layer's AI translation)? node ctx-score.js <dir> <answers.json>
const fs = require("node:fs"), path = require("node:path");
const S = require("./score.js"), P = S.pealimIndex();
const UP = { NOUN: "noun", ADJ: "adjective", VERB: "verb", AUX: "verb", ADV: "adverb", NUM: "numeral", PROPN: "propernoun" };
const kin = (a, b) => a === b || ((a === "noun" || a === "adjective") && (b === "noun" || b === "adjective"));
const [dir, answersPath] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(path.join(dir, "ctx.items.json"), "utf8"));
const ans = new Map(JSON.parse(fs.readFileSync(answersPath, "utf8")).map((a) => [a.id, a]));
function right(it, key, a) {
  if (!key || !/^pid:/.test(key)) return "n/a";
  const par = P.byPid.get(key.slice(4)) || {};
  const v = S.verdict(P, { key, lemma: par.lemma, surface: it.surface, niqqud: it.niqqud }, a.lemma, a.upos).v;
  if (v !== "agree") return v === "indistinct" ? "agree" : v;   // a homograph the lemma cannot split is decided by the part of speech
  const up = UP[a.upos] || "";
  return !up || kin(par.pos || "", up) ? "agree" : "disagree";
}
const rows = [], by = {};
for (const it of items) {
  const a = ans.get(it.id) || {};
  const cur = right(it, it.key, a), A = it.aPick ? right(it, "pid:" + it.aPick, a) : "n/a", B = it.bPick ? right(it, "pid:" + it.bPick, a) : "n/a";
  rows.push({ id: it.id, src: it.src, niqqud: it.niqqud, key: it.key, aPick: it.aPick, bPick: it.bPick, examiner: a.lemma, upos: a.upos, note: a.note, cur, A, B });
  for (const [rule, pick, v] of [["A", it.aPick, A], ["B", it.bPick, B]]) {
    if (!pick || "pid:" + pick === it.key) continue;   // only the places where the rule CHANGES the key
    const k = it.src + "|" + rule, b = by[k] = by[k] || { changes: 0, ruleRight: 0, curRight: 0, both: 0, neither: 0 };
    b.changes++;
    if (v === "agree" && cur !== "agree") b.ruleRight++; else if (cur === "agree" && v !== "agree") b.curRight++; else if (v === "agree") b.both++; else b.neither++;
  }
}
fs.writeFileSync(path.join(dir, "ctx.scored.json"), JSON.stringify(rows, null, 1));
console.log(JSON.stringify(by, null, 1));
