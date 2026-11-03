#!/usr/bin/env node
"use strict";
// P5 G0 — measurements for the trainer plan (no release): terms, find-in-book bank, symbol questions, stage-1 density.
//   node scripts/atlas/trainer-spike.cjs --data=<dir with sections/ and context-ai/> [--out=<report.json>]
const fs = require("fs");
const path = require("path");
const { parseHTML } = require("linkedom");

const REPO = path.resolve(__dirname, "..", "..");
const argv = process.argv.slice(2);
const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
const DATA = path.resolve(REPO, opt("data", "data/atlas/a97002"));

const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
global.window = window; global.document = document; window.indexedDB = undefined;
const RM = window.ReaderMorph = require(path.join(REPO, "public/js/reader-morph.js"));
const AW = require(path.join(REPO, "public/js/atlas-words.js"));

const NIQQUD = /[֑-ׇ]/g;
const norm = (s) => String(s || "").replace(NIQQUD, "").replace(/[^א-ת0-9a-zA-Z]+/g, " ").trim();
const sections = fs.readdirSync(path.join(DATA, "sections")).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(DATA, "sections", f), "utf8")));

// 1. Terms
const terms = {}, termSections = {}, refsBySense = {};
for (const s of sections) {
  Object.assign(terms, s.terms || {});
  for (const p of s.pages) for (const it of p.items || []) for (const ref of it.terms || []) {
    refsBySense[ref] = (refsBySense[ref] || 0) + 1;
    (termSections[ref] = termSections[ref] || new Set()).add(s.id);
  }
}
const senses = [];
for (const [id, t] of Object.entries(terms)) for (const sn of t.senses || []) senses.push({ ref: id + "#" + sn.sense, id, t, sn });
let located = 0; const placeBySense = {};
for (const s of sections) {
  const ctx = AW.sectionContext("a97002", s, RM);
  for (const p of s.pages) for (const it of p.items || []) {
    if (it.type !== "block" || !(it.terms || []).length) continue;
    const loc = ctx.located(it.id);
    const spans = loc && loc.he && loc.he.spans || [];
    for (const sp of spans) { const r = sp.ref || (sp.id + "#" + sp.sense); placeBySense[r] = (placeBySense[r] || 0) + 1; }
  }
}
located = senses.filter((x) => placeBySense[x.ref]).length;
const byLemma = {};
for (const x of senses) (byLemma[norm(x.t.lemma_he)] = byLemma[norm(x.t.lemma_he)] || new Set()).add(x.sn.ru);
const conflicts = Object.entries(byLemma).filter(([, v]) => v.size > 1).map(([k, v]) => ({ lemma: k, ru: [...v] }));
const termReport = {
  unique_terms: Object.keys(terms).length, senses: senses.length,
  multiword: Object.values(terms).filter((t) => /\s/.test(String(t.lemma_he).trim())).length,
  senses_with_block_ref: senses.filter((x) => refsBySense[x.ref]).length,
  senses_with_place: located,
  senses_without_niqqud: senses.filter((x) => !x.t.niqqud).length,
  senses_in_many_sections: senses.filter((x) => termSections[x.ref] && termSections[x.ref].size > 1).length,
  lemma_with_several_meanings: conflicts.length, lemma_conflict_sample: conflicts.slice(0, 8),
};

// 2. Find-in-book bank
const seen = new Map();
for (const s of sections) for (const p of s.pages) for (const it of p.items || []) {
  if (it.type !== "block") continue;
  const k = norm(it.he || it.he_raw);
  if (k) seen.set(k, (seen.get(k) || 0) + 1);
}
const bankBySection = {}; let candidates = 0, dup = 0, bank = 0, withFormula = 0;
for (const s of sections) {
  bankBySection[s.id] = 0;
  for (const p of s.pages) {
    const hasFormula = (p.items || []).some((i) => i.type === "formula");
    for (const it of p.items || []) {
      if (it.type !== "block" || !/^(prose|list_item)$/.test(it.kind) || !it.he) continue;
      const n = norm(it.he).split(/\s+/).filter(Boolean).length;
      if (n < 6 || n > 30 || !(it.terms || []).length) continue;
      candidates++;
      if (seen.get(norm(it.he)) > 1) { dup++; continue; }
      bank++; bankBySection[s.id]++; if (hasFormula) withFormula++;
    }
  }
}
const thin = Object.entries(bankBySection).filter(([, n]) => n < 10).map(([k, n]) => k + ":" + n);

// 3. Symbol questions
let formulasWithVars = 0, eligible = 0, needsReview = 0, withDistractors = 0, symbolsAsked = 0, symbolsWithUnit = 0;
for (const s of sections) {
  const all = [];
  for (const p of s.pages) for (const it of p.items || []) if (it.type === "formula") all.push(it);
  const meanings = new Set(), units = new Set();
  for (const f of all) for (const v of f.vars || []) { if (v.ru) meanings.add(v.ru); if (v.unit) units.add(v.unit); }
  for (const f of all) {
    const vars = (f.vars || []).filter((v) => v.ru);
    if ((f.vars || []).length) formulasWithVars++;
    if (vars.length < 2) continue;
    if (f.status && /needs_review/.test(JSON.stringify(f.status))) { needsReview++; continue; }
    eligible++;
    const ok = vars.every((v) => [...meanings].filter((m) => m !== v.ru).length >= 3);
    if (ok) withDistractors++;
    symbolsAsked += vars.length; symbolsWithUnit += vars.filter((v) => v.unit).length;
  }
}

// 4. Stage-1 density with an empty profile: every word is unknown → share of words that have a gloss
let words = 0, glossed = 0, rows = 0, mweWords = 0, layerSections = 0;
for (const s of sections) {
  const f = path.join(DATA, "context-ai", s.id + ".json");
  if (!fs.existsSync(f)) continue;
  layerSections++;
  for (const r of JSON.parse(fs.readFileSync(f, "utf8")).rows || []) {
    rows++; words += (r.glosses || []).length; glossed += (r.glosses || []).filter((g) => g && g.gloss).length;
    for (const m of r.mwe || []) mweWords += m.to - m.from + 1;
  }
}

const report = { data: DATA, terms: termReport,
  find: { candidates, duplicates_excluded: dup, bank, on_page_with_formula: withFormula, sections_under_10: thin },
  symbols: { formulas_with_vars: formulasWithVars, eligible, needs_review_excluded: needsReview, with_3_distractors_each: withDistractors, symbols: symbolsAsked, symbols_with_unit: symbolsWithUnit },
  stage1: { sections_with_layer: layerSections, rows, words, glossed, mwe_words: mweWords } };
const out = opt("out", "");
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
