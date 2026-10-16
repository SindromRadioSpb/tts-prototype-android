#!/usr/bin/env node
"use strict";
// «Мой словарь» identity audit — scoring (protocol: docs/research/my-dictionary-identity-audit/2026-10-16/PROTOCOL.md).
// node score.js <sample.json> <stanza.json> [dicta.json] [human.json] → per-stratum verdicts + Wilson intervals.
// Agreement rule (fixed before the data): an oracle agrees with pid:N when the skeleton of its lemma is a cell of
// paradigm N (or its lemma); «indistinguishable» when it is ALSO a cell of another paradigm of the same part of
// speech; it disagrees when the lemma is a cell of other paradigms only. For dl: keys: the same skeleton, or — verbs,
// whose Dicta lemma is a root — the root's consonants in order inside the oracle's lemma.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;
const skel = (s) => String(s || "").normalize("NFC").replace(NIQQUD, "").replace(/[׳״'"]/g, "");
const finals = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const unfinal = (s) => s.replace(/[ךםןףץ]/g, (c) => finals[c]);
// «loose» = plene/defective spelling neutral: no matres ו/י (after the first letter)
const loose = (s) => { const k = unfinal(skel(s)); return k.length > 1 ? k[0] + k.slice(1).replace(/[וי]/g, "") : k; };
const UPOS = { NOUN: "noun", VERB: "verb", ADJ: "adjective", PROPN: "propernoun", ADV: "adverb", NUM: "numeral", AUX: "verb", PRON: "pronoun", ADP: "preposition" };

function pealim() {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz"))));
  const byPid = new Map(), cellOwners = new Map();
  for (const p of j.paradigms) {
    const pid = String(p.pealim_id), forms = new Set([loose(p.lemma), loose(p.lemma_niqqud)]);
    for (const c of Object.values(p.cells || {})) if (c && c.he) forms.add(loose(c.he));
    // A1: the paradigm's CITATION forms — its lemma, and for a verb the 3ms past (the UD lemma) and the infinitive
    const canon = new Set([loose(p.lemma), loose(p.lemma_niqqud)]);
    for (const k of ["PERF-3ms", "INF-L"]) if (p.cells && p.cells[k] && p.cells[k].he) canon.add(loose(p.cells[k].he));
    byPid.set(pid, { pid, lemma: p.lemma, pos: p.pos, root: p.root, meaning: p.meaning, forms, canon });
    for (const f of forms) { if (!cellOwners.has(f)) cellOwners.set(f, new Set()); cellOwners.get(f).add(pid); }
  }
  return { byPid, cellOwners };
}

function rootInside(root, lemma) {
  const r = unfinal(skel(root)).replace(/[וי]/g, ""), l = unfinal(skel(lemma));
  if (r.length < 2) return false;
  let i = 0;
  for (const ch of l) if (ch === r[i]) i++;
  return i === r.length;
}

// one oracle's verdict on one item: agree | disagree | indistinct | none (the oracle gave nothing usable)
// A2: the oracle did not split the proclitics (its lemma = the whole token: בטעות, בגיל, הביתה) — it abstains
function unsplit(item, lemma, appLemma) {
  const L = loose(lemma), T = loose(item.surface || item.niqqud), A = loose(appLemma);
  if (!A || L !== T || L === A || !L.endsWith(A)) return false;
  return /^[והבכלמש]+$/.test(L.slice(0, L.length - A.length));
}
// A3: a numeral's gender is not its identity (אחד / אחת)
const numKey = (s) => loose(s).replace(/[הת]$/, "");
function verdict(P, item, lemma, upos) {
  if (!lemma) return { v: "none" };
  const L = loose(lemma), pos = UPOS[upos] || "";
  const appLemma = String(item.key || "").startsWith("dl:") ? String(item.key).slice(3).split("#")[0] : item.lemma;
  if (unsplit(item, lemma, appLemma)) return { v: "none", why: "oracle kept proclitics" };
  if (upos === "NUM" && numKey(lemma) === numKey(appLemma)) return { v: "agree", why: "numeral gender" };
  const key = String(item.key || "");
  if (key.startsWith("pid:")) {
    const pid = key.slice(4), own = P.byPid.get(pid);
    if (!own) return { v: "none", why: "pid not in Pealim" };
    const owners = P.cellOwners.get(L) || new Set();
    if (!own.forms.has(L)) {
      if (owners.size) return { v: "disagree", why: "oracle lemma is a form of " + [...owners].slice(0, 3).map((p) => "pid:" + p + " " + (P.byPid.get(p) || {}).lemma).join(", ") };
      return { v: "disagree", why: "oracle lemma not in Pealim", soft: true };
    }
    if (own.canon.has(L)) return { v: "agree", why: "citation form" };
    const rivals = [...owners].filter((p) => p !== pid && (P.byPid.get(p) || {}).pos === own.pos);
    return rivals.length ? { v: "indistinct", why: "also a form of " + rivals.slice(0, 3).map((p) => "pid:" + p).join(",") } : { v: "agree" };
  }
  if (key.startsWith("dl:")) {
    const m = key.slice(3).split("#"), dl = m[0], dpos = m[1] || "";
    const posOk = !dpos || !pos || dpos === pos || (dpos === "verb" && upos === "AUX");
    if (loose(dl) === L) return posOk ? { v: "agree" } : { v: "disagree", why: "pos " + dpos + " vs " + pos };
    if ((dpos === "verb" || upos === "VERB") && rootInside(dl, lemma)) return posOk ? { v: "agree", why: "root" } : { v: "disagree", why: "pos " + dpos + " vs " + pos };
    return { v: "disagree", why: "lemma " + dl + " vs " + skel(lemma) };
  }
  return { v: "none", why: "no key" };
}

// S5/S6 (no key): does the oracle read a Pealim word (missed parse) / a name?
function unparsed(P, item, lemma, upos) {
  if (!lemma) return { v: "none" };
  const owners = P.cellOwners.get(loose(lemma)) || new Set();
  if (upos === "PROPN") return { v: "name" };
  if (owners.size === 1) return { v: "missed-unique", why: "pid:" + [...owners][0] + " " + (P.byPid.get([...owners][0]) || {}).lemma };
  if (owners.size > 1) return { v: "missed-ambiguous" };
  return { v: "not-in-pealim" };
}

function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

function main() {
  const [samplePath, stanzaPath, dictaPath, humanPath, llmPath, llmMapPath] = process.argv.slice(2);
  const S = JSON.parse(fs.readFileSync(samplePath, "utf8"));
  const items = S.items || Object.values(S.sample).flat();
  const st = new Map(JSON.parse(fs.readFileSync(stanzaPath, "utf8")).map((r) => [r.id, r]));
  const dc = dictaPath && fs.existsSync(dictaPath) ? new Map(JSON.parse(fs.readFileSync(dictaPath, "utf8")).map((r) => [r.id, r])) : new Map();
  const hu = humanPath && fs.existsSync(humanPath) ? new Map(JSON.parse(fs.readFileSync(humanPath, "utf8")).map((r) => [r.id, r])) : new Map();
  let llm = new Map();
  if (llmPath && fs.existsSync(llmPath)) {
    const ans = JSON.parse(fs.readFileSync(llmPath, "utf8")), map = new Map(JSON.parse(fs.readFileSync(llmMapPath, "utf8")).map((m) => [m.blind, m.id]));
    llm = new Map(ans.map((a) => [map.get(a.id), a]));
  }
  const P = pealim();
  const rows = [];
  for (const it of items) {
    const s = st.get(it.id) || {}, d = dc.get(it.id) || {};
    const keyed = !!it.key;
    const o1 = keyed ? verdict(P, it, s.stanza_lemma, s.stanza_upos) : unparsed(P, it, s.stanza_lemma, s.stanza_upos);
    const o2 = it.stratum === "S4" || !d.dicta_lemma ? { v: "n/a" } : (keyed ? verdict(P, it, d.dicta_lemma, d.dicta_upos) : unparsed(P, it, d.dicta_lemma, d.dicta_upos));
    const a = llm.get(it.id) || {};
    const o4 = !a.lemma ? { v: "n/a" } : (keyed ? verdict(P, it, a.lemma, a.upos) : unparsed(P, it, a.lemma, a.upos));
    const h = hu.get(it.id);
    rows.push({ ...it, stanza_lemma: s.stanza_lemma || "", stanza_upos: s.stanza_upos || "", o1: o1.v, o1_why: o1.why || "",
      dicta_lemma_ctx: d.dicta_lemma || "", o2: o2.v, o2_why: o2.why || "",
      llm_lemma: a.lemma || "", llm_upos: a.upos || "", llm_name: a.is_name, llm_conf: a.confidence || "", llm_note: a.note || "", o4: o4.v, o4_why: o4.why || "",
      human: h ? h.verdict : "" });
    const last = rows[rows.length - 1], votes = [last.o1, last.o2, last.o4];
    last.agree_votes = votes.filter((v) => v === "agree").length; last.disagree_votes = votes.filter((v) => v === "disagree").length;
    // the vote of the examiners (no human): wrong when disagreements outnumber agreements, right when the reverse, else disputed
    last.vote = last.human ? last.human : last.disagree_votes > last.agree_votes ? "wrong" : last.agree_votes > last.disagree_votes ? "right" : "disputed";
  }
  const strata = ["S1", "S2", "S3", "S4", "S5", "S6"], report = { counts: S.counts, strata: {} };
  for (const k of strata) {
    const r = rows.filter((x) => x.stratum === k), n = r.length;
    const tally = (f) => r.reduce((m, x) => { m[x[f]] = (m[x[f]] || 0) + 1; return m; }, {});
    const out = { n, o1: tally("o1"), o2: tally("o2"), o4: tally("o4"), vote: tally("vote"), human: tally("human") };
    if (k <= "S4") {
      // a key is false when a human says so, else when the independent oracle(s) disagree and none agrees
      const wrong = r.filter((x) => x.vote === "wrong").length;
      const decided = r.filter((x) => x.vote === "wrong" || x.vote === "right").length;
      out.false_key = { k: wrong, n: decided, rate: decided ? wrong / decided : 0, ci95: wilson(wrong, decided) };
    }
    report.strata[k] = out;
  }
  const W = strata.slice(0, 4).reduce((a, k) => a + (S.counts[k] || 0), 0);
  report.weighted_false_key = strata.slice(0, 4).reduce((a, k) => a + (report.strata[k].false_key.rate * (S.counts[k] || 0)) / W, 0);
  return { report, rows };
}

if (require.main === module) {
  const { report, rows } = main();
  const outDir = path.dirname(path.resolve(process.argv[2]));
  fs.writeFileSync(path.join(outDir, "scored.json"), JSON.stringify(rows, null, 1));
  const cols = ["id", "stratum", "surface", "niqqud", "key", "lemma", "pos", "meaning", "stanza_lemma", "stanza_upos", "o1", "o1_why", "dicta_lemma_ctx", "o2", "o2_why", "human", "text_title", "sentence_plain"];
  const esc = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  fs.writeFileSync(path.join(outDir, "scored.csv"), "﻿" + [cols.join(",")].concat(rows.map((r) => cols.map((c) => esc(r[c] == null ? "" : r[c])).join(","))).join("\n"));
  console.log(JSON.stringify(report, null, 1));
}
module.exports = { skel, loose, verdict, unparsed, wilson, rootInside, pealimIndex: pealim };
