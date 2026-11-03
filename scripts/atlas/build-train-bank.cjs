#!/usr/bin/env node
"use strict";
// Atlas P5 G4 — the bank of «Найди в книге» (plan docs/planning/ENGINEERING_ATLAS_P5_TRAINER_PLAN_2026_11_03.md §G4).
//   node scripts/atlas/build-train-bank.cjs --data=<data/atlas/a97002> [--out=<data>/train/find.json]
// A question is a fragment of the book as printed (plain Hebrew, no pointing): a paragraph, a list item or a figure
// caption of 5–35 words; its answer is where it stands (section, page) — taken from the data, never from a model.
// A text that occurs twice in the book is not asked (both answers would be right); the title pages are not asked.
// The bank records the sha256 of every section file it was built from; rebuild it after every rebuild of the reader
// data (build_reader_data.py, apply-term-additions.cjs). Exam tasks of the owner join the same file later (kind 'exam').
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..", "..");
const SCHEMA = "linguistpro.atlas-train-find.1.0.0";
const KINDS = { prose: 1, list_item: 1, caption: 1 };
const MIN_WORDS = 5, MAX_WORDS = 35;
const SKIP_SECTIONS = { "s00-front": 1 };
const NIQQUD = /[֑-ׇ]/g;
const norm = (s) => String(s || "").replace(NIQQUD, "").replace(/[^א-ת0-9a-zA-Z]+/g, " ").trim();
const wordCount = (s) => norm(s).split(" ").filter((w) => /[א-ת]/.test(w)).length;

// (sections, { sid: sha256 of the section file }, atlasId) → the bank object
function buildFindBank(sections, shas, atlasId) {
  const seen = new Map();
  sections.forEach((s) => (s.pages || []).forEach((p) => (p.items || []).forEach((it) => {
    if (it && it.type === "block") { const k = norm(it.he || it.he_raw); if (k) seen.set(k, (seen.get(k) || 0) + 1); }
  })));
  const items = [];
  sections.forEach((s) => {
    if (SKIP_SECTIONS[s.id]) return;
    (s.pages || []).forEach((p) => {
      const formulas = (p.items || []).filter((it) => it && it.type === "formula").map((it) => it.id);
      (p.items || []).forEach((it) => {
        if (!it || it.type !== "block" || !KINDS[it.kind] || !String(it.he || "").trim()) return;
        const n = wordCount(it.he);
        if (n < MIN_WORDS || n > MAX_WORDS) return;
        if (seen.get(norm(it.he)) > 1) return;
        items.push({ id: "find:" + it.id, sid: s.id, page: p.page, block: it.id, he: String(it.he).replace(NIQQUD, "").trim(),
          formulas: formulas, terms: Array.isArray(it.terms) ? it.terms.slice() : [], kind: "book" });
      });
    });
  });
  const built = {};
  sections.forEach((s) => { built[s.id] = (shas && shas[s.id]) || ""; });
  return { schema: SCHEMA, atlas_id: String(atlasId || ""), built_from: { sections: built }, items: items };
}

// The terms of the whole atlas in one small file (train/terms.json): the atlas-wide review queue shows a due term of
// any section without loading every section. places[sense] = the first place of the sense in book order.
const TERMS_SCHEMA = "linguistpro.atlas-train-terms.1.0.0";
function buildTermsIndex(sections, atlasId) {
  const terms = {};
  sections.forEach((s) => {
    Object.keys(s.terms || {}).forEach((id) => {
      const t = s.terms[id];
      const out = terms[id] || (terms[id] = { lemma_he: t.lemma_he || "", niqqud: t.niqqud || "", translit: t.translit || "", translit_ru: t.translit_ru || "",
        senses: [], sections: [], places: {} });
      if (!out.sections.includes(s.id)) out.sections.push(s.id);
      (t.senses || []).forEach((sn) => { if (sn && sn.sense && !out.senses.some((x) => x.sense === sn.sense)) out.senses.push({ sense: sn.sense, ru: sn.ru || "" }); });
    });
    (s.pages || []).forEach((p) => (p.items || []).forEach((it) => (it && Array.isArray(it.terms) ? it.terms : []).forEach((ref) => {
      const i = String(ref).lastIndexOf("#"), id = String(ref).slice(0, i), sense = String(ref).slice(i + 1);
      if (terms[id] && !terms[id].places[sense]) terms[id].places[sense] = { sid: s.id, page: p.page, block: it.id };
    })));
  });
  return { schema: TERMS_SCHEMA, atlas_id: String(atlasId || ""), terms };
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
  const data = path.resolve(REPO, opt("data", "data/atlas/a97002"));
  const out = path.resolve(opt("out", path.join(data, "train", "find.json")));
  const dir = path.join(data, "sections");
  const names = fs.readdirSync(dir).filter((f) => /\.json$/.test(f)).sort();
  const shas = {}, sections = names.map((f) => {
    const buf = fs.readFileSync(path.join(dir, f));
    const s = JSON.parse(buf.toString("utf8"));
    shas[s.id] = crypto.createHash("sha256").update(buf).digest("hex");
    return s;
  });
  const bank = buildFindBank(sections, shas, sections[0] && sections[0].atlas_id);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(bank));
  const termsOut = path.join(path.dirname(out), "terms.json");
  const ix = buildTermsIndex(sections, sections[0] && sections[0].atlas_id);
  fs.writeFileSync(termsOut, JSON.stringify(ix));
  const per = {};
  bank.items.forEach((x) => { per[x.sid] = (per[x.sid] || 0) + 1; });
  console.log(JSON.stringify({ out, items: bank.items.length, per_section: per, bytes: fs.statSync(out).size,
    terms: { out: termsOut, terms: Object.keys(ix.terms).length, bytes: fs.statSync(termsOut).size } }, null, 1));
}

if (require.main === module) main();
module.exports = { buildFindBank, buildTermsIndex, SCHEMA, TERMS_SCHEMA };
