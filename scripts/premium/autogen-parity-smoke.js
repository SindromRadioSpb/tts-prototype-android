#!/usr/bin/env node
"use strict";

// autogen-parity-smoke.js — Stage 1.2 verification gate for the ②-note autogen engine.
//
// Proves the SHARED resolver core (public/js/notes-autogen.js) reproduces the offline
// pipeline's output (scripts/premium/build-notes-from-bundle.js) BY SHARED CODE, not by
// driving a browser. It loads the persisted build-notes reference (an enriched bundle's
// library/notes_advanced.json + its sentence_morph), re-derives each note from its Dicta
// token via the core's `dictaTokenToUnit`, resolves it through the core (base paradigm
// looked up exactly as the client's getLemmaInflection does — the gz `index`), and diffs
// the decisive fields {root, meaning, pealim_id} against the reference.
//
//   node scripts/premium/autogen-parity-smoke.js [--zip Library/test-enriched-lean.zip]
//     [--limit N] [--show 25] [--gate]
//
// Decisive-channel mismatch (root / pealim_id / meaning-presence) = a bug. The residual
// base-pick difference (offline inflect() scorer vs the client's index lookup) shows up
// on the non-form-first cases and is reported separately. Function words / proper nouns
// are counted but excluded from the content-parity gate (the client layers a function-
// links profile the offline content pipeline never emitted).

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const JSZip = require("../../public/db/jszip.min.js");
const NA = require("../../public/js/notes-autogen.js");

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 ? (process.argv[i + 1] && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : true) : def; }
const ZIP_IN = path.resolve(REPO, String(arg("zip", "Library/test-enriched-lean.zip")));
const GZ = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");
const LIMIT = Number(arg("limit", 0)) || 0;
const SHOW = Number(arg("show", 25)) || 25;
const GATE = !!arg("gate", false);

const log = (...a) => console.log("[parity]", ...a);
const CONTENT = new Set(["verb", "noun", "adjective"]);

// Client getLemmaInflection equivalent: the OPFS rows were bulk-imported from the gz
// `index` (key = "<lemma|root> <binyan>"), so an index hit IS what getLemmaInflection
// returns. Identical read path → faithful client substitution.
function idxLookup(ds, key, binyan) {
  if (!key) return null;
  const i = ds.index[String(key) + " " + String(binyan || "")];
  return (i != null && ds.paradigms[i]) ? ds.paradigms[i] : null;
}

(async () => {
  log("dataset", path.relative(REPO, GZ));
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(GZ)).toString("utf8"));
  if (!ds || !ds.index || !Array.isArray(ds.paradigms)) { console.error("malformed dataset"); process.exit(2); }
  const maps = NA.buildResolverMaps(ds.paradigms);
  log("paradigms", ds.paradigms.length, "| maps: alias", maps.alias.size, "cell", maps.cell.size, "formIdx", maps.formIdx.size, "rootAlias", maps.rootAlias.size);

  log("reference", path.relative(REPO, ZIP_IN));
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const advFile = zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json");
  if (!advFile) { console.error("no notes_advanced.json in zip"); process.exit(2); }
  const adv = JSON.parse(await advFile.async("string"));
  const refNotes = (adv.notes || []).filter((n) => n.note_type === "word_study");
  const sidTokens = new Map();
  for (const sm of (adv.sentence_morph || [])) sidTokens.set(String(sm.sentence_id), sm.tokens || []);
  log("ref word_study notes", refNotes.length, "| sentence_morph entries", sidTokens.size);

  const notes = LIMIT ? refNotes.slice(0, LIMIT) : refNotes;
  const norm = NA.stripNiqqud;
  let content = 0, fnOrProper = 0, missingTok = 0, skipped = 0;
  let rootMatch = 0, meanPresMatch = 0, meanExactMatch = 0, pidMatch = 0;
  const rootMis = [], pidMis = [], meanMis = [];

  for (const note of notes) {
    let ref; try { ref = JSON.parse(note.body_json); } catch (_) { continue; }
    const tid = String(note.target_id || "");
    const ci = tid.lastIndexOf(":");
    const sid = ci >= 0 ? tid.slice(0, ci) : tid;
    const off = ci >= 0 ? Number(tid.slice(ci + 1)) : NaN;
    const toks = sidTokens.get(String(sid));
    if (!toks || !Number.isInteger(off) || !toks[off]) { missingTok++; continue; }
    const unit = NA.dictaTokenToUnit(toks[off]);
    if (!unit) { skipped++; continue; }
    if (!CONTENT.has(unit.pos)) { fnOrProper++; continue; }   // content-parity only
    content++;

    const base = await NA.pickBaseParadigm(unit, (k, b) => idxLookup(ds, k, b));
    const resolved = NA.resolveContentUnit(maps, unit, base);
    const body = NA.assembleBody(unit, resolved);

    const rOK = norm(body.root || "") === norm(ref.root || "");
    if (rOK) rootMatch++; else if (rootMis.length < SHOW) rootMis.push({ word: ref.word, pos: unit.pos, got: body.root, want: ref.root, binyan: unit.binyan });

    const gotMean = !!body.meaning, wantMean = !!ref.meaning;
    if (gotMean === wantMean) meanPresMatch++; else if (meanMis.length < SHOW) meanMis.push({ word: ref.word, pos: unit.pos, got: body.meaning || "∅", want: ref.meaning || "∅" });
    if (gotMean && wantMean && body.meaning === ref.meaning) meanExactMatch++;

    const gotPid = String(body.pealim_id || ""), wantPid = String(ref.pealim_id || "");
    if (gotPid === wantPid) pidMatch++; else if (pidMis.length < SHOW) pidMis.push({ word: ref.word, pos: unit.pos, got: gotPid || "∅", want: wantPid || "∅", ch: resolved.channel });
  }

  const pct = (n) => content ? (Math.round(1000 * n / content) / 10) + "%" : "n/a";
  const bothMean = notes.length ? null : null;
  log("─────────────────────────────────────────────");
  log("compared content notes:", content, "| function/proper (excluded):", fnOrProper, "| missing token:", missingTok, "| skipped:", skipped);
  log("root match:           ", rootMatch, "/", content, "(" + pct(rootMatch) + ")");
  log("meaning presence:     ", meanPresMatch, "/", content, "(" + pct(meanPresMatch) + ")");
  log("meaning exact:        ", meanExactMatch, "/", content, "(" + pct(meanExactMatch) + ")");
  log("pealim_id match:      ", pidMatch, "/", content, "(" + pct(pidMatch) + ")");
  if (rootMis.length) { log("─ root mismatches (sample) ─"); rootMis.forEach((m) => log("  ", JSON.stringify(m))); }
  if (pidMis.length) { log("─ pealim_id mismatches (sample) ─"); pidMis.forEach((m) => log("  ", JSON.stringify(m))); }
  if (meanMis.length) { log("─ meaning-presence mismatches (sample) ─"); meanMis.forEach((m) => log("  ", JSON.stringify(m))); }

  // gate thresholds — decisive channels must hold. Base-pick (inflect vs index) drift is
  // tolerated within margin; a real port regression collapses these well below.
  const rootRate = content ? rootMatch / content : 1;
  const pidRate = content ? pidMatch / content : 1;
  const meanRate = content ? meanPresMatch / content : 1;
  const pass = rootRate >= 0.97 && pidRate >= 0.95 && meanRate >= 0.97;
  log("─────────────────────────────────────────────");
  log(pass ? "PASS" : "FAIL", "(thresholds: root≥97% pid≥95% meaning-presence≥97%)");
  if (GATE && !pass) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
