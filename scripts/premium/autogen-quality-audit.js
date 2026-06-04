#!/usr/bin/env node
"use strict";

// autogen-quality-audit.js — Stage 1.3 quality GATE for the ②-note autogen engine.
//
// Runs the SHARED resolver core (public/js/notes-autogen.js) over a bundle's full
// sentence_morph (the real engine output, independent of any reference notes) and
// reports: meaning% / root% / confidence distribution / status split / dedup
// collisions, and the R1 hard-invariant tally. Mirrors note-fields-audit's gate
// contract: exit 1 on ANY R1 violation. Sibling to autogen-parity-smoke.js (which
// diffs vs build-notes); this one is an absolute-quality check.
//
//   node scripts/premium/autogen-quality-audit.js [--zip Library/test-enriched-lean.zip] [--gate]

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const JSZip = require("../../public/db/jszip.min.js");
const NA = require("../../public/js/notes-autogen.js");

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 ? (process.argv[i + 1] && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : true) : def; }
const ZIP_IN = path.resolve(REPO, String(arg("zip", "Library/test-enriched-lean.zip")));
const GZ = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");
const GATE = !!arg("gate", false);
const log = (...a) => console.log("[autogen-quality]", ...a);

function idxLookup(ds, key, binyan) {
  if (!key) return null;
  const i = ds.index[String(key) + " " + String(binyan || "")];
  return (i != null && ds.paradigms[i]) ? ds.paradigms[i] : null;
}

(async () => {
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(GZ)).toString("utf8"));
  const maps = NA.buildResolverMaps(ds.paradigms);
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const advFile = zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json");
  if (!advFile) { console.error("no notes_advanced.json in zip"); process.exit(2); }
  const adv = JSON.parse(await advFile.async("string"));
  const morph = adv.sentence_morph || [];
  log("dataset paradigms", ds.paradigms.length, "| sentence_morph entries", morph.length);

  // mirror the orchestrator: every token → unit (+occurrence) → resolve → candidate.
  const items = [];
  for (const sm of morph) {
    const sid = String(sm.sentence_id), tid = String(sm.text_id || "");
    const toks = sm.tokens || [];
    for (let off = 0; off < toks.length; off++) {
      const unit = NA.dictaTokenToUnit(toks[off]);
      if (!unit) continue;
      const base = await NA.pickBaseParadigm(unit, (k, b) => idxLookup(ds, k, b));
      const resolved = NA.resolveContentUnit(maps, unit, base);
      // function-word pid (PealimFunctionLinks) is browser-only; the audit measures
      // the offline content+meaning quality, so it is intentionally omitted here.
      items.push({ unit, resolved, occurrences: [{ text_id: tid, sentence_id: sid, word_offset: off, surface: unit.sampleWord }] });
    }
  }
  const candidates = NA.buildCandidates(items);
  const stats = NA.summarize(candidates);

  // R1 hard invariants on the emitted candidate bodies.
  const FN = NA.FUNCTION_POS;
  let r1_funcRoot = 0, r1_verbEmpty = 0, r1_nonverbBinyan = 0, r1_properRoot = 0;
  const conf = { "≥0.9": 0, "0.8–0.9": 0, "0.6–0.8": 0, "<0.6": 0 };
  for (const c of candidates) {
    const b = c.body;
    if (FN.has(b.pos) && b.root) r1_funcRoot++;
    if (b.pos === "verb" && !b.root) r1_verbEmpty++;
    if (b.pos !== "verb" && b.binyan) r1_nonverbBinyan++;
    const x = c.confidence;
    if (x >= 0.9) conf["≥0.9"]++; else if (x >= 0.8) conf["0.8–0.9"]++; else if (x >= 0.6) conf["0.6–0.8"]++; else conf["<0.6"]++;
  }

  // dedup collisions: a key whose contributing units disagree on a non-empty meaning
  // or root → the canonical merge may have fused two senses (homograph leak).
  const byKey = new Map();
  for (const it of items) {
    const body = NA.assembleBody(it.unit, it.resolved);
    const key = NA.dedupKey(body);
    let g = byKey.get(key); if (!g) { g = { meanings: new Set(), roots: new Set() }; byKey.set(key, g); }
    if (body.meaning) g.meanings.add(body.meaning);
    if (body.root) g.roots.add(body.root);
  }
  let collisions = 0; const collSample = [];
  for (const [key, g] of byKey) {
    if (g.meanings.size > 1 || g.roots.size > 1) { collisions++; if (collSample.length < 15) collSample.push({ key, meanings: [...g.meanings].slice(0, 3), roots: [...g.roots] }); }
  }

  const r1Total = r1_funcRoot + r1_verbEmpty + r1_nonverbBinyan + r1_properRoot;
  log("────────────────────────────────────────────────");
  log("candidates", candidates.length, "(from", items.length, "units) | distinct units", stats.distinct_units || byKey.size);
  log("meaning rate", stats.meaning_rate + "% | root rate", stats.root_rate + "%");
  log("status", JSON.stringify(stats.by_status));
  log("confidence", JSON.stringify(conf));
  log("dedup collisions (homograph-merge risk):", collisions);
  if (collSample.length) collSample.forEach((c) => log("   ", JSON.stringify(c)));
  log("R1 hard violations (GATE):", r1Total, JSON.stringify({ root_on_function: r1_funcRoot, verb_no_root: r1_verbEmpty, binyan_non_verb: r1_nonverbBinyan, propernoun_root: r1_properRoot }));
  log("────────────────────────────────────────────────");
  log(r1Total === 0 ? "PASS (0 R1 violations)" : "FAIL (R1 violations present)");
  if (GATE && r1Total > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
