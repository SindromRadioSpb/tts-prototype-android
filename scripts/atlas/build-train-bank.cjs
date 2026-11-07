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
const AW = require('../../public/js/atlas-words.js');

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
  const addText = (id, text) => { const key = norm(text); if (!id || !key) return; if (!seen.has(key)) seen.set(key, new Set()); seen.get(key).add(id); };
  sections.forEach(s => (s.pages || []).forEach(p => {
    (p.items || []).forEach(it => { if (it && it.type === 'block') addText(it.id, it.he || it.he_raw); });
    if (atlasId !== 'a97001') return;
    (p.tables || []).forEach(t => (t.cells || []).forEach(c => {
      if ((c.parts || []).length) c.parts.forEach(part => addText(part.id, part.he || part.he_raw));
      else addText(c.id || t.id + ':cell:' + c.row + ':' + c.col, c.he);
    }));
    (p.figures || []).forEach(f => {
      addText(f.id, f.caption_he || f.he);
      [...(f.labels || []), ...(f.regions || [])].forEach(label => addText(label.id, label.he || label.label_he || label.text_he));
    });
  }));
  const items = [];
  sections.forEach((s) => {
    if (SKIP_SECTIONS[s.id]) return;
    (s.pages || []).forEach((p) => {
      const formulas = (p.items || []).filter((it) => it && it.type === "formula").map((it) => it.id);
      (p.items || []).forEach((it) => {
        // The find trainer must respect the same editorial/learning holds as
        // word cards and term queues. Keep duplicate detection above over all
        // visible source text: an ineligible duplicate still makes the answer
        // ambiguous, even though it must never become a question itself.
        const semanticKind = KINDS[it.kind] || (atlasId === "a97001" && it.find_training_eligible === true && ["paragraph", "definition", "definition_item", "rule"].includes(it.kind));
        if (!AW.learningItem(it, "source_find") || it.type !== "block" || !semanticKind || !String(it.he || "").trim()) return;
        const n = wordCount(it.he);
        if (n < MIN_WORDS || n > MAX_WORDS) return;
        if (seen.get(norm(it.he)) && seen.get(norm(it.he)).size > 1) return;
        items.push({ id: "find:" + it.id, sid: s.id, page: p.page, block: it.id, he: String(it.he).replace(NIQQUD, "").trim(),
          formulas: formulas, terms: Array.isArray(it.terms) ? it.terms.slice() : [], kind: "book", learning_target: "source_text_location", source_notice: it.source_limit_note || (s.activation && s.activation.learning_mode === "scoped" ? "Это цитата из источника. Проверяется её местоположение, а не научная точность или нормативное написание." : null) });
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
        senses: [], sections: [], places: {}, ...(t.study_note ? {study_note:t.study_note} : {}),
        ...(t.definition_refs ? {definition_refs:t.definition_refs.slice()} : {}),
        ...(t.reading_status ? {reading_status:t.reading_status} : {}) });
      if (atlasId === 'a97001') {
        // Keep legacy lexical fields stable for existing callers, but make their
        // first-section selection explicit. A scope-aware caller must select the
        // matching variant instead of silently presenting another section's form.
        out.canonical_selection = 'legacy_first_section_with_scoped_variants';
        const clone = value => JSON.parse(JSON.stringify(value));
        const refs = out.definition_refs || [];
        (t.definition_refs || []).forEach(ref => { if (!refs.includes(ref)) refs.push(ref); });
        if (refs.length) out.definition_refs = refs;
        const sourceRefs = [];
        const held = [];
        const approvedContextRefs = new Set();
        const scan = value => {
          if (Array.isArray(value)) { value.forEach(scan); return; }
          if (!value || typeof value !== 'object') return;
          if (value.id && Array.isArray(value.terms) && value.terms.some(ref => String(ref).split('#')[0] === id)) {
            if (!sourceRefs.includes(value.id)) sourceRefs.push(value.id);
            if (value.term_context_eligible === true && (value.term_context_refs || []).some(ref => String(ref).split('#')[0] === id)) approvedContextRefs.add(value.id);
            if ((value.term_context_eligible === true ? !(value.term_context_refs || []).some(ref => String(ref).split('#')[0] === id) : value.training_eligible === false || (value.structure && value.structure.training_eligible === false)) ||
                (Array.isArray(value.projection_held_terms) && value.projection_held_terms.includes(id))) {
              if (!held.includes(value.id)) held.push(value.id);
            }
          }
          Object.values(value).forEach(scan);
        };
        scan(s.pages || []);
        (t.source_refs || []).forEach(ref => { if (!sourceRefs.includes(ref)) sourceRefs.push(ref); });
        const nativeCandidates = ((s.term_projection || {}).native_scoped_candidates || {})[id];
        const evidence = (s.term_projection || {}).reviewed_evidence || (s.term_projection || {}).evidence || {};
        const sourceCandidates = [];
        const candidateEvidence = nativeCandidates ? { [id]: nativeCandidates } : evidence;
        Object.keys(candidateEvidence).filter(key => key.split('#')[0] === id).forEach(key => {
          (Array.isArray(candidateEvidence[key]) ? candidateEvidence[key] : []).forEach(candidate => {
            sourceCandidates.push(clone(candidate));
            (candidate.occurrences || []).forEach(occurrence => {
              const ref = occurrence.source_ref || occurrence.block;
              if (ref && !sourceRefs.includes(ref)) sourceRefs.push(ref);
            });
          });
        });
        const explicitHeld = new Set((s.term_projection || {}).held_source_ids || []);
        sourceRefs.forEach(ref => { if (explicitHeld.has(ref) && !approvedContextRefs.has(ref) && !held.includes(ref)) held.push(ref); });
        const variant = { sid: s.id, canonical: clone(t), source_refs: sourceRefs,
          definition_refs: (t.definition_refs || []).slice(), held_source_ids: held,
          hold_reasons: (t.projection_hold_reasons || []).slice() };
        if (sourceCandidates.length) variant.source_candidates = sourceCandidates;
        variant.source_candidates_are_native = !!nativeCandidates;
        variant.training_eligible = t.training_eligible !== false && !(s.activation && s.activation.release_gate === 'blocked');
        (out.scoped_variants || (out.scoped_variants = [])).push(variant);
        if (out.scoped_variants.every(v => v.training_eligible === false)) out.training_eligible = false;
        else delete out.training_eligible;
        ((s.term_projection || {}).semantic_corrections || []).filter(c => c.term_id === id && c.old && c.new && c.old.sense !== c.new.sense).forEach(c => {
          const retired = out.retired_sense_sources || (out.retired_sense_sources = []);
          (c.source_targets || []).forEach(ref => {
            if (!retired.some(x => x.sid === s.id && x.source_ref === ref && x.old_sense === c.old.sense))
              retired.push({ sid: s.id, source_ref: ref, old_sense: c.old.sense, new_sense: c.new.sense });
          });
        });
        const heldSources = out.held_sources || (out.held_sources = []);
        held.forEach(ref => {
          if (!heldSources.some(x => x.sid === s.id && x.source_ref === ref))
            heldSources.push({ sid: s.id, source_ref: ref, reasons: variant.hold_reasons.slice() });
        });
        out.has_scoped_variants = out.scoped_variants.some(v =>
          ['lemma_he','niqqud','translit','translit_ru'].some(key => String(v.canonical[key] || '') !== String(out[key] || '')) ||
          (v.canonical.senses || []).some(sn => out.senses.some(old => old.sense === sn.sense && old.ru !== (sn.ru || ''))));
      }
      if (!out.sections.includes(s.id)) out.sections.push(s.id);
      (t.senses || []).forEach((sn) => { if (sn && sn.sense && !out.senses.some((x) => x.sense === sn.sense)) out.senses.push({ sense: sn.sense, ru: sn.ru || "" }); });
    });
    // Contents remain navigation. A separately reviewed, exactly source-bound
    // front-matter term may be a target; ordinary headings gain no permission.
    const learningItems = atlasId === 'a97001' ? AW.sectionItems(s, s.activation && s.activation.learning_mode === 'scoped' ? 'term_context' : undefined)
      : (s.pages || []).flatMap(p => (p.items || []).map(it => Object.assign({page:p.page},it)));
    learningItems.forEach((it) => (it && Array.isArray(it.terms) ? it.terms : []).forEach((ref) => {
      const i = String(ref).lastIndexOf("#"), id = String(ref).slice(0, i), sense = String(ref).slice(i + 1);
      if (atlasId === 'a97001' && s.id === 's00-front') {
        const canonical = (s.terms || {})[id];
        if (!canonical || canonical.training_eligible === false || canonical.learning_eligibility?.lexical?.allowed !== true || !(canonical.source_refs || []).includes(it.id)) return;
      }
      if (terms[id]) {
        const place = { sid: s.id, page: it.page, block: it.id };
        if (!terms[id].places[sense]) terms[id].places[sense] = place;
        if (atlasId === 'a97001') {
          const occurrences = terms[id].occurrences || (terms[id].occurrences = {});
          (occurrences[sense] || (occurrences[sense] = [])).push(place);
        }
      }
    }));
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
