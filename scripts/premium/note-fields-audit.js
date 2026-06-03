#!/usr/bin/env node
"use strict";

// note-fields-audit.js — field-system conformance audit for ② word_study notes.
//
// Reads a library bundle ZIP, opens library/notes_advanced.json, and scores EVERY
// note FIELD (word / niqqud_variant / root / pos / part_of_speech / binyan /
// meaning) against the field-system goals (acceptance criteria, R1–R5). It is the
// measurable metric for "ультимативное соответствие полей целям": run it BEFORE a
// fix to understand the defect classes on concrete examples, and AFTER to confirm a
// gain with no regression. Exit code is non-zero on ANY hard R1 invariant violation
// (this is a regression gate), independent of the soft conformance numbers.
//
//   node scripts/premium/note-fields-audit.js [--zip Library/test-enriched.zip] [--json]
//
// Field-system goals enforced (canon: docs/NOTE_FIELDS_GOALS.md):
//   R1-1  function word (pronoun/prep/conj/adverb/negation/interrog/numeral) → root EMPTY
//   R1-2  non-verb → binyan EMPTY ; verb → binyan ∈ valid set (else honest-empty allowed)
//   R1-3  verb → root NON-empty
//   R1-4  proper noun → root EMPTY, pos="noun" (kind=propernoun), binyan EMPTY
//   KEYS  pos and part_of_speech both present and identical
//   MEAN  content word (verb/noun/adjective) → meaning present (else recoverable|external-limit)
// Hard violations (R1-1..R1-4, key desync) fail the gate; soft gaps (empty meaning,
// noun root==lemma, colloquial spelling) are reported but never fabricated away.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const JSZip = require("../../public/db/jszip.min.js");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = path.join(REPO, ".tmp");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const ZIP_IN = String(arg("zip", path.join(REPO, "Library", "test-enriched.zip")));
const AS_JSON = !!arg("json", false);
const DICT_GZ = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");

const NIQQUD_RE = /[֑-ׇ]/g;          // niqqud + cantillation + meteg
const sp = (s) => String(s == null ? "" : s).replace(NIQQUD_RE, "").trim();
// Hebrew consonant block + maqaf + geresh/gershayim (colloquial ת' contractions
// legitimately carry an ASCII apostrophe or U+05F3 geresh — real corpus forms).
const HEB_VALID_RE = /^[א-ת׳״'"־\s-]+$/;
const FUNCTION_POS = new Set(["adverb", "pronoun", "conjunction", "interjection", "negation", "numeral", "other", "particle", "preposition", "interrogative"]);
const CONTENT_POS = new Set(["verb", "noun", "adjective"]);
const BINYAN_OK = new Set(["paal", "nifal", "piel", "pual", "hifil", "hufal", "hitpael"]);

// ── offline-dict alias index → meaning recoverability cross-check (B0.1 upside) ──
function loadDictMeaningIndex() {
  try {
    const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT_GZ)).toString("utf8"));
    const m = new Map();
    for (const p of d.paradigms || []) {
      if (!p || !p.meaning) continue;
      for (const k of [p.root, p.lemma, p.form]) { const kk = sp(k); if (kk && !m.has(kk)) m.set(kk, p.meaning); }
    }
    return m;
  } catch (_) { return new Map(); }
}

function pct(n, d) { return d ? Math.round((1000 * n) / d) / 10 : 0; }
function sampleList(arr, k) { return arr.slice(0, k).map((x) => x.word + (x.why ? " (" + x.why + ")" : "")); }

(async () => {
  if (!fs.existsSync(ZIP_IN)) { console.error("[fields-audit] no zip:", ZIP_IN); process.exit(2); }
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const advFile = zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json");
  if (!advFile) { console.error("[fields-audit] no notes_advanced.json in zip"); process.exit(2); }
  const adv = JSON.parse(await advFile.async("string"));
  const notes = (adv.notes || []).filter((n) => n.note_type === "word_study");
  const dictMeaning = loadDictMeaningIndex();

  // per-field accumulators
  const F = {
    word: { present: 0, invalid: [], colloquial: [] },
    niqqud_variant: { present: 0, vocalized: 0, sameAsWord: [], bidiMark: [] },
    root: { present: 0, nominalBase: [], borrowedEmpty: 0 },
    pos: { present: 0, empty: [], dist: {} },
    part_of_speech: { present: 0, desync: [] },
    binyan: { present: 0, verbNoBinyan: [], invalidEnum: [] },
    meaning: { present: 0, emptyContent: [], emptyContentRecoverable: 0, emptyFunction: 0, emptyFunctionRecoverable: 0 },
  };
  // hard R1 violations (gate)
  const V = { r1_root_on_function: [], r1_verb_no_root: [], r1_binyan_non_verb: [], r1_propernoun_root: [], key_desync: [] };

  let total = 0, parseErr = 0;
  for (const n of notes) {
    let b; try { b = JSON.parse(n.body_json); } catch (_) { parseErr++; continue; }
    total++;
    const word = b.word || "", niqqud = b.niqqud_variant || "", root = b.root || "";
    const pos = b.pos || "", pp = b.part_of_speech || "", binyan = b.binyan || "", meaning = b.meaning || "";
    const isFunc = FUNCTION_POS.has(pos), isContent = CONTENT_POS.has(pos), isProper = pos === "propernoun" || b.kind === "propernoun";

    // word
    if (word) F.word.present++;
    if (word && !HEB_VALID_RE.test(word)) F.word.invalid.push({ word, why: "non-hebrew" });
    if (/['׳]/.test(word)) F.word.colloquial.push({ word });

    // niqqud_variant (optional)
    if (niqqud) {
      F.niqqud_variant.present++;
      if (sp(niqqud) !== niqqud) F.niqqud_variant.vocalized++;          // carries niqqud → really vocalized
      else if (sp(niqqud) === sp(word)) F.niqqud_variant.sameAsWord.push({ word });
      if (/[‎‏‪-‮]/.test(niqqud)) F.niqqud_variant.bidiMark.push({ word });
    }

    // pos / part_of_speech
    if (pos) F.pos.present++; else F.pos.empty.push({ word });
    F.pos.dist[pos || "(empty)"] = (F.pos.dist[pos || "(empty)"] || 0) + 1;
    if (pp) F.part_of_speech.present++;
    if (pos !== pp) { F.part_of_speech.desync.push({ word, why: pos + "≠" + pp }); V.key_desync.push({ word, pos, pp }); }

    // root
    if (root) F.root.present++;
    // R1-1 function word must have empty root
    if (root && isFunc) V.r1_root_on_function.push({ word, pos, root });
    // R1-3 verb must have root
    if (pos === "verb" && !root) V.r1_verb_no_root.push({ word });
    // R1-4 propernoun must have empty root
    if (root && isProper) V.r1_propernoun_root.push({ word, root });
    // nominal base (R1-gap, not a violation): noun/adj where root==word (lemma stored, not triliteral)
    if (root && (pos === "noun" || pos === "adjective") && sp(root) === sp(word)) F.root.nominalBase.push({ word });
    if (!root && (pos === "noun" || pos === "adjective")) F.root.borrowedEmpty++;

    // binyan
    if (binyan) F.binyan.present++;
    if (binyan && !BINYAN_OK.has(binyan)) F.binyan.invalidEnum.push({ word, why: binyan });
    // R1-2 non-verb must have empty binyan
    if (binyan && pos && pos !== "verb") V.r1_binyan_non_verb.push({ word, pos, binyan });
    if (pos === "verb" && !binyan) F.binyan.verbNoBinyan.push({ word });

    // meaning
    if (meaning) F.meaning.present++;
    else if (isContent) {
      F.meaning.emptyContent.push({ word });
      const cand = [sp(root), sp(word), sp(niqqud)].filter(Boolean);
      if (cand.some((c) => dictMeaning.has(c))) F.meaning.emptyContentRecoverable++;
    } else if (isFunc || isProper) {
      F.meaning.emptyFunction++;
      const cand = [sp(root), sp(word), sp(niqqud)].filter(Boolean);
      if (cand.some((c) => dictMeaning.has(c))) F.meaning.emptyFunctionRecoverable++;
    }
  }

  const verbs = F.pos.dist.verb || 0;
  const nonVerbWithPos = total - (F.pos.dist["(empty)"] || 0) - verbs;
  const conform = {
    word: { present_pct: pct(F.word.present, total), valid_pct: pct(F.word.present - F.word.invalid.length, total), invalid: F.word.invalid.length, colloquial: F.word.colloquial.length },
    niqqud_variant: { present_pct: pct(F.niqqud_variant.present, total), vocalized_pct: pct(F.niqqud_variant.vocalized, total), bidi_marks: F.niqqud_variant.bidiMark.length },
    root: { present_pct: pct(F.root.present, total), nominal_base_rootEqWord: F.root.nominalBase.length, nominal_empty: F.root.borrowedEmpty },
    pos: { present_pct: pct(F.pos.present, total), empty: F.pos.empty.length },
    part_of_speech: { present_pct: pct(F.part_of_speech.present, total), desync: F.part_of_speech.desync.length },
    binyan: { present_of_verbs_pct: pct(F.binyan.present, verbs), verbs_no_binyan: F.binyan.verbNoBinyan.length, invalid_enum: F.binyan.invalidEnum.length },
    meaning: { present_pct: pct(F.meaning.present, total), empty_content: F.meaning.emptyContent.length, empty_content_recoverable: F.meaning.emptyContentRecoverable, empty_function: F.meaning.emptyFunction, empty_function_recoverable: F.meaning.emptyFunctionRecoverable, total_recoverable: F.meaning.emptyContentRecoverable + F.meaning.emptyFunctionRecoverable },
  };
  const hardViolations = V.r1_root_on_function.length + V.r1_verb_no_root.length + V.r1_binyan_non_verb.length + V.r1_propernoun_root.length + V.key_desync.length;

  const out = {
    generated_at: new Date().toISOString(), zip_in: ZIP_IN, notes_total: total, parse_errors: parseErr,
    conformance: conform,
    r1_violations: {
      total: hardViolations,
      root_on_function: V.r1_root_on_function.length, verb_no_root: V.r1_verb_no_root.length,
      binyan_non_verb: V.r1_binyan_non_verb.length, propernoun_root: V.r1_propernoun_root.length,
      key_desync: V.key_desync.length,
    },
    pos_distribution: Object.entries(F.pos.dist).sort((a, b) => b[1] - a[1]),
    examples: {
      word_invalid: sampleList(F.word.invalid, 10), word_colloquial: sampleList(F.word.colloquial, 10),
      pos_empty: sampleList(F.pos.empty, 12), root_nominal_base: sampleList(F.root.nominalBase, 10),
      meaning_empty_content: sampleList(F.meaning.emptyContent, 12), binyan_verb_no_binyan: sampleList(F.binyan.verbNoBinyan, 10),
      r1_root_on_function: sampleList(V.r1_root_on_function, 10), r1_verb_no_root: sampleList(V.r1_verb_no_root, 10),
      r1_binyan_non_verb: sampleList(V.r1_binyan_non_verb, 10), key_desync: sampleList(V.key_desync, 10),
    },
  };

  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, "note-fields-audit.json"), JSON.stringify(out, null, 2));

  if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); }
  else {
    const c = conform;
    console.log("\n[note-fields-audit]", path.basename(ZIP_IN), "—", total, "word_study notes" + (parseErr ? " (" + parseErr + " parse errors)" : ""));
    console.log("─".repeat(64));
    const row = (name, s) => console.log("  " + name.padEnd(16) + s);
    row("word", `present ${c.word.present_pct}% · valid ${c.word.valid_pct}% · invalid ${c.word.invalid} · colloquial(ת') ${c.word.colloquial}`);
    row("niqqud_variant", `present ${c.niqqud_variant.present_pct}% · vocalized ${c.niqqud_variant.vocalized_pct}% · bidi-marks ${c.niqqud_variant.bidi_marks}`);
    row("root", `present ${c.root.present_pct}% · noun root==lemma(R1-gap) ${c.root.nominal_base_rootEqWord} · nominal-empty ${c.root.nominal_empty}`);
    row("pos", `present ${c.pos.present_pct}% · empty ${c.pos.empty}`);
    row("part_of_speech", `present ${c.part_of_speech.present_pct}% · desync-with-pos ${c.part_of_speech.desync}`);
    row("binyan", `of verbs ${c.binyan.present_of_verbs_pct}% · verbs-w/o-binyan ${c.binyan.verbs_no_binyan} · invalid-enum ${c.binyan.invalid_enum}`);
    row("meaning", `present ${c.meaning.present_pct}% · empty-content ${c.meaning.empty_content} · empty-function ${c.meaning.empty_function} · dict-recoverable ${c.meaning.total_recoverable} (→ ~${pct(F.meaning.present + c.meaning.total_recoverable, total)}%)`);
    console.log("─".repeat(64));
    console.log("  R1 hard violations (GATE):", hardViolations,
      `{ root_on_function: ${out.r1_violations.root_on_function}, verb_no_root: ${out.r1_violations.verb_no_root}, binyan_non_verb: ${out.r1_violations.binyan_non_verb}, propernoun_root: ${out.r1_violations.propernoun_root}, key_desync: ${out.r1_violations.key_desync} }`);
    if (out.examples.pos_empty.length) console.log("  pos-empty e.g.:", out.examples.pos_empty.join(", "));
    if (out.examples.meaning_empty_content.length) console.log("  empty-content-meaning e.g.:", out.examples.meaning_empty_content.join(", "));
    console.log("  report → .tmp/note-fields-audit.json");
  }

  // Gate: any hard R1 violation fails. Soft gaps (meaning/root-gap/colloquial) do not.
  process.exit(hardViolations === 0 ? 0 : 1);
})().catch((e) => { console.error("[fields-audit] fatal:", e); process.exit(1); });
