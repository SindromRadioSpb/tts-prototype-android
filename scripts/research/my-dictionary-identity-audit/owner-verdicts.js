#!/usr/bin/env node
"use strict";
// O3 — the owner's blind answers → verdict per item. A chosen lemma counts for the program by the SAME rule as the
// examiners (score.js verdict: a citation form of the key's paradigm, e.g. 3ms past for a Pealim infinitive);
// «и» (name / foreign word) is against any ordinary-word key; «?» is no verdict.
// node owner-verdicts.js <audit-dir> <answers.txt>
const fs = require("node:fs"), path = require("node:path");
const zlib = require("node:zlib");
const score = require("./score.js");
const [dir, answersPath] = process.argv.slice(2);
const key = JSON.parse(fs.readFileSync(path.join(dir, "owner-sheet.key.json"), "utf8"));
const rows = new Map(JSON.parse(fs.readFileSync(path.join(dir, "scored.json"), "utf8")).map((r) => [r.id, r]));
const ans = new Map(fs.readFileSync(answersPath, "utf8").trim().split(/\s+/).map((t) => { const m = /^(\d+)(.*)$/.exec(t); return [Number(m[1]), m[2]]; }));
const P = score.pealimIndex();
const POSU = { "сущ.": "NOUN", "глагол": "VERB", "прил.": "ADJ", "нареч.": "ADV", "имя": "PROPN", "числ.": "NUM", "мест.": "PRON", "предлог": "ADP" };
const out = [];
for (const k of key) {
  const a = ans.get(k.no) || "-", it = rows.get(k.id);
  let verdict = "unknown", chosen = null;
  if (a === "и") verdict = String(it.pos) === "propernoun" ? "right" : "wrong";
  else if (a.startsWith("д:")) { chosen = { lemma: a.slice(2), pos: "" }; }
  else if (a !== "?" && a !== "-") chosen = k.options.find((o) => o.letter === a) || null;
  if (chosen) {
    // the owner saw the program's option among the others: choosing another one rejects it — unless the chosen lemma
    // is the SAME word's citation form (3ms past ↔ the Pealim infinitive). Paradigm-cell matching is not enough here:
    // חלקה is a cell of חלק «smooth» but the owner meant חלאקה «first haircut» (sheet №42).
    const appOffered = k.options.some((o) => (o.who || []).includes("app"));
    const pid = String(it.key || "").startsWith("pid:") ? String(it.key).slice(4) : "";
    const own = pid ? P.byPid.get(pid) : null;
    if ((chosen.who || []).includes("app")) verdict = "right";
    else if (own && own.canon.has(score.loose(chosen.lemma))) verdict = "right";
    else if (appOffered) verdict = "wrong";
    else { const v = score.verdict(P, it, chosen.lemma, POSU[chosen.pos] || ""); verdict = v.v === "agree" ? "right" : v.v === "disagree" ? "wrong" : "unknown"; }
  }
  out.push({ id: k.id, no: k.no, answer: a, chosen: chosen ? chosen.lemma : "", control: k.control, examiners_vote: k.vote, verdict });
}
fs.writeFileSync(path.join(dir, "owner.verdicts.json"), JSON.stringify(out, null, 1));
const t = (f) => out.reduce((m, x) => { const kk = f(x); m[kk] = (m[kk] || 0) + 1; return m; }, {});
console.log("all", JSON.stringify(t((x) => x.verdict)));
console.log("by examiners' vote → owner", JSON.stringify(t((x) => x.examiners_vote + "→" + x.verdict)));
