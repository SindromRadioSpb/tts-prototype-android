#!/usr/bin/env node
"use strict";
// Atlas P5 G2 — the atlas additions file: terms found missing while studying, for everyone after a rebuild
// (plan docs/planning/ENGINEERING_ATLAS_P5_TRAINER_PLAN_2026_11_03.md §G2).
//   node scripts/atlas/apply-term-additions.cjs --data=<data/atlas/a97002> [--additions=scripts/atlas/terms/a97002-additions.jsonl] [--check]
// A line is a term of the dots dictionary shape plus `id` and `sections` ([] = every section where it occurs), or
// { id: <atlas term>, add_senses: [...], sections } — a new meaning of a term the atlas has. Places are found by the
// reader's own AtlasWords.locateTerms, so the build and the screen cannot disagree. Run after every rebuild of the
// reader data (build_reader_data.py); the same file twice changes nothing. A line that does not hold is rejected with
// its reason and changes nothing.
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
let RM = null, AW = null, TR = null;
function libs() {
  if (!RM) {
    if (typeof globalThis.window === "undefined") {
      const { parseHTML } = require("linkedom");
      const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
      globalThis.window = window; globalThis.document = document; window.indexedDB = undefined;
    }
    RM = require(path.join(REPO, "public/js/reader-morph.js"));
    AW = require(path.join(REPO, "public/js/atlas-words.js"));
    TR = require(path.join(REPO, "public/js/atlas-train.js"));
  }
  return { RM, AW, TR };
}
const ID = /^[a-z0-9]+:term:[a-z0-9-]+$/;
const clone = (x) => JSON.parse(JSON.stringify(x));
const blocksOf = (s) => (s.pages || []).flatMap((p) => (p.items || []).filter((it) => it && it.type === "block" && String(it.he || "").trim()));

// (sections, lines) → { sections (new objects), rejected: [{ line, id, reason }], report: [{ id, places, sections }] }
function applyAdditions(sectionsIn, lines) {
  const { RM, AW, TR } = libs();
  const sections = clone(sectionsIn || []);
  const atlasTerms = {};
  sections.forEach((s) => Object.keys(s.terms || {}).forEach((id) => { if (!atlasTerms[id]) atlasTerms[id] = s.terms[id]; }));
  const out = { sections, rejected: [], report: [] };
  (lines || []).forEach((raw, i) => {
    const line = String(raw || "").trim();
    if (!line) return;
    const reject = (reason, id) => out.rejected.push({ line: i + 1, id: id || "", reason });
    let x;
    try { x = JSON.parse(line); } catch (_) { reject("json"); return; }
    const id = String((x && x.id) || "");
    if (!ID.test(id)) { reject("id", id); return; }
    const wanted = Array.isArray(x.sections) ? x.sections.map(String) : [];
    const scope = wanted.length ? sections.filter((s) => wanted.includes(s.id)) : sections;
    let term, refs;
    if (Array.isArray(x.add_senses)) {
      const base = atlasTerms[id];
      if (!base) { reject("no-term", id); return; }
      const have = new Set((base.senses || []).map((s) => s.sense));
      const add = x.add_senses.filter((s) => s && s.sense && String(s.ru || "").trim());
      if (!add.length || add.length !== x.add_senses.length) { reject("ru", id); return; }
      if (add.some((s) => have.has(s.sense))) { reject("sense-taken", id); return; }
      term = Object.assign({}, base, { senses: (base.senses || []).concat(add.map((s) => ({ sense: String(s.sense), ru: String(s.ru).trim(), context: String(s.context || "") }))) });
      refs = add.map((s) => id + "#" + s.sense);
    } else {
      const atlasHas = sections.some((s) => (s.terms || {})[id] && (s.terms[id].source !== "additions" || TR.skeletonOf(s.terms[id].lemma_he) !== TR.skeletonOf(x.lemma_he)));
      if (atlasHas) { reject("id-taken", id); return; }
      if (!TR.skeletonOf(x.lemma_he)) { reject("lemma", id); return; }
      const others = {};
      Object.keys(atlasTerms).forEach((k) => { if (k !== id) others[k] = atlasTerms[k]; });
      if (TR.findTermDuplicate(others, x.lemma_he)) { reject("duplicate", id); return; }
      if (x.niqqud && TR.personalTermId("x", x.niqqud) !== TR.personalTermId("x", x.lemma_he)) { reject("niqqud", id); return; }
      const senses = Array.isArray(x.senses) ? x.senses : [];
      if (!senses.length || senses.some((s) => !s || !s.sense || !String(s.ru || "").trim())) { reject("ru", id); return; }
      term = { lemma_he: TR.skeletonOf(x.lemma_he), niqqud: String(x.niqqud || ""), translit: String(x.translit || ""), translit_ru: String(x.translit_ru || ""),
        senses: senses.map((s) => ({ sense: String(s.sense), ru: String(s.ru).trim(), context: String(s.context || "") })), source: "additions" };
      refs = term.senses.map((s) => id + "#" + s.sense);
    }
    // places first: a term without one place in its sections is rejected and nothing is written
    const hits = [];
    scope.forEach((s) => {
      const terms = Object.assign({}, s.terms || {}, { [id]: term });
      blocksOf(s).forEach((it) => {
        const found = AW.locateTerms(it.he, refs, terms, RM).spans;
        if (found.length) hits.push({ s, it, refs: Array.from(new Set(found.map((sp) => sp.id + "#" + sp.sense))) });
      });
    });
    if (!hits.length) { reject("no-place", id); return; }
    const touched = [];
    hits.forEach(({ s, it, refs: r }) => {
      s.terms = Object.assign({}, s.terms || {}, { [id]: term });
      it.terms = Array.isArray(it.terms) ? it.terms.slice() : [];
      r.forEach((ref) => { if (!it.terms.includes(ref)) it.terms.push(ref); });
      if (!touched.includes(s.id)) touched.push(s.id);
    });
    atlasTerms[id] = term;
    out.report.push({ id, places: hits.length, sections: touched });
  });
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
  const data = path.resolve(REPO, opt("data", "data/atlas/a97002"));
  const file = path.resolve(REPO, opt("additions", "scripts/atlas/terms/a97002-additions.jsonl"));
  const check = argv.includes("--check");
  const dir = path.join(data, "sections");
  const names = fs.readdirSync(dir).filter((f) => /\.json$/.test(f)).sort();
  const before = names.map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const r = applyAdditions(before.map((t) => JSON.parse(t)), lines);
  let written = 0;
  r.sections.forEach((s, i) => {
    const text = JSON.stringify(s);
    if (text === JSON.stringify(JSON.parse(before[i]))) return;
    written++;
    if (!check) fs.writeFileSync(path.join(dir, names[i]), text);
  });
  console.log(JSON.stringify({ additions: file, data, check, terms: r.report, rejected: r.rejected, sections_changed: written }, null, 1));
  if (r.rejected.length) process.exitCode = 2;
}

if (require.main === module) main();
module.exports = { applyAdditions };
