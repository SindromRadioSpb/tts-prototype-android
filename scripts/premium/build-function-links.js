#!/usr/bin/env node
"use strict";

// build-function-links.js — extract a compact "function-word → Pealim dict page"
// map from the shipped offline dataset, so the word card can deep-link an
// uninflected function word (adverb/pronoun/conjunction/…) straight to ITS Pealim
// entry instead of a search. Pure offline reindex of the existing gz — no scrape.
//
// Why: the main dict index keeps ONE paradigm per "<plain> <binyan>" key, so a
// function word whose invariant entry lost the key-collision to a content homograph
// (שוב adverb vs noun) is unreachable → its link falls back to search. The losing
// invariant paradigm is still physically present in paradigms[]; we harvest those
// here (kind="invariant" or a function POS) into a tiny word→{id,pos} map.
//
//   node scripts/premium/build-function-links.js
//   → public/data/inflection/pealim-function-links.v1.json

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const GZ = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");
const OUT = path.join(REPO, "public", "data", "inflection", "pealim-function-links.v1.json");

const NIQQUD_RE = /[֑-ׇ]/g;
const sp = (s) => String(s == null ? "" : s).replace(NIQQUD_RE, "").trim();
const FUNCTION_POS = new Set(["adverb", "pronoun", "conjunction", "negation", "interrogative", "numeral", "interjection"]);

(function main() {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(GZ)).toString("utf8"));
  const paradigms = d.paradigms || [];
  const links = Object.create(null);   // plain key → { id, pos }
  const forms = Object.create(null);   // pealim_id → { he, tr, pos } — invariant single-form profile
  let collisions = 0, sources = 0;

  // Deterministic preference when two invariant paradigms map to the same plain key:
  // a dedicated function POS over generic "other"/"invariant", then smaller pealim_id.
  const rank = (p) => (FUNCTION_POS.has(p.pos) ? 2 : (p.kind === "invariant" ? 1 : 0));
  const better = (a, cand) => {
    const ra = rank(a), rc = rank(cand);
    if (rc !== ra) return rc > ra;
    return Number(cand.pealim_id) < Number(a.pealim_id);
  };

  for (const p of paradigms) {
    if (!p || !p.pealim_id) continue;
    // Function words that bear no triliteral root: their Pealim entry is an invariant
    // single-form profile, OR Pealim tags them with a function POS.
    if (!(p.kind === "invariant" || FUNCTION_POS.has(p.pos))) continue;
    sources++;
    const entry = { id: String(p.pealim_id), pos: p.pos || "", _src: p };
    // The invariant single-form profile (vocalized form + stressed translit) so the
    // word card can render the premium profile for function words straight from this
    // tiny file — no need to reload the 3.3MB dict (which is released after OPFS import).
    if (p.form && typeof p.form === "object" && p.form.he && !forms[entry.id]) {
      forms[entry.id] = { he: p.form.he, tr: p.form.translit_html || p.form.translit || "", pos: p.pos || "" };
    }
    // p.form on an invariant paradigm is the form PROFILE object {he,translit,…},
    // not a string — harvest its `.he`, else treat as a plain string (content forms).
    const formKey = (p.form && typeof p.form === "object") ? p.form.he : p.form;
    for (const k of [p.lemma, p.root, formKey]) {
      const kk = sp(k); if (!kk) continue;
      const cur = links[kk];
      if (!cur) { links[kk] = entry; }
      else if (cur._src !== entry._src) { collisions++; if (better(cur._src, entry._src)) links[kk] = entry; }
    }
  }
  // strip internal _src
  const clean = Object.create(null);
  for (const k of Object.keys(links)) clean[k] = { id: links[k].id, pos: links[k].pos };

  const out = {
    format_version: 1,
    source: d.model_version || "pealim-infl-v12",
    generated_from: "paradigms[] invariant/function-POS",
    entry_count: Object.keys(clean).length,
    form_count: Object.keys(forms).length,
    source_paradigms: sources,
    collisions,
    links: clean,
    forms: forms,
  };
  const json = JSON.stringify(out);
  fs.writeFileSync(OUT, json);
  console.log("[function-links] keys:", out.entry_count, "from", sources, "paradigms; collisions:", collisions);
  console.log("[function-links] size:", (json.length / 1024).toFixed(1), "KB →", path.relative(REPO, OUT));
  for (const w of ["שוב", "פה", "אולי", "איך", "מי", "כבר", "אז", "עוד", "בדיוק"]) {
    console.log("  " + w.padEnd(8), JSON.stringify(clean[w] || null));
  }
})();
