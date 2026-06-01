#!/usr/bin/env node
"use strict";

// ② coverage audit harness. Reads a JSON word-matrix and runs each word through
// the REAL resolver (inflectionGateway → Pealim, cached + rate-limited), then
// checks STRUCTURAL invariants per expected class. Deterministic backbone of the
// multi-agent audit; also the permanent regression net (`smoke:conj:audit`).
//
//   node scripts/premium/conj-audit.js <matrix.json>
//
// Matrix entry: { he, pos?, binyan?, root?, expect, id?, note? }
//   pos     — the Dicta-style POS hint passed to the resolver (verb/noun/
//             adjective/preposition/adverb/pronoun/conjunction/other/…).
//   expect  — verb | verb2voice | noun | adjective | preposition | invariant | none
//   id      — (optional) the Pealim dict id the resolver MUST pick (homographs).
//
// Exit code 0 = all pass, 1 = at least one FAIL, 2 = usage/IO error.

const fs = require("fs");
const path = require("path");
const { inflect } = require("../../db/premium/inflectionGateway");

// Required slot families per expected class (structural invariants).
const REQUIRED = {
  verb:       ["AP-ms", "PERF-3ms", "IMPF-3ms", "INF-L"],
  verb2voice: ["AP-ms", "PERF-3ms", "IMPF-3ms", "INF-L", "passive-AP-ms", "passive-PERF-3ms"],
  noun:       ["s"],                 // + (p OR sc) checked specially
  adjective:  ["ms-a", "fs-a", "mp-a", "fp-a"],
  preposition:["P-1s", "P-3ms"],
};

function checkEntry(e, r) {
  const exp = String(e.expect || "");
  if (exp === "none") {                                  // proper nouns / no Pealim entry
    if (r.ok && r.paradigm && r.paradigm.kind !== "invariant") return "expected NO paradigm, got kind=" + r.paradigm.kind;
    return null;                                         // ok:false or invariant both acceptable
  }
  if (!r.ok || !r.paradigm) return "no paradigm (" + (r.reason || "?") + ")";
  const p = r.paradigm;
  const cells = p.cells || {};
  if (e.id && String(p.pealim_id) !== String(e.id)) return "WRONG entry id=" + p.pealim_id + " (want " + e.id + ")";
  if (exp === "invariant") {
    if (p.kind !== "invariant") return "expected invariant, got kind=" + p.kind + " (content homograph?)";
    if (!p.form || !p.form.he) return "invariant without a form";
    return null;
  }
  const req = REQUIRED[exp];
  if (!req) return "unknown expect=" + exp;
  const missing = req.filter((k) => !(cells[k] && cells[k].he));
  if (missing.length) return "missing slots: " + missing.join(",");
  if (exp === "noun" && !(cells["s"] && (cells["p"] || cells["sc"]))) return "noun without plural/construct";
  return null;
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.error("usage: conj-audit.js <matrix.json>"); process.exit(2); }
  let list;
  try { list = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
  catch (e) { console.error("cannot read matrix:", e.message); process.exit(2); }
  if (!Array.isArray(list)) { console.error("matrix must be a JSON array"); process.exit(2); }

  let pass = 0, fail = 0;
  const fails = [];
  for (const e of list) {
    let r;
    try { r = await inflect(String(e.he || ""), { pos: e.pos, binyan: e.binyan, root: e.root }); }
    catch (err) { r = { ok: false, reason: "throw:" + (err && err.message) }; }
    const problem = checkEntry(e, r);
    if (problem) {
      fail++;
      const got = (r.ok && r.paradigm) ? { kind: r.paradigm.kind, pos: r.paradigm.pos, id: r.paradigm.pealim_id } : { ok: false, reason: r.reason };
      fails.push({ he: e.he, expect: e.expect, posHint: e.pos, note: e.note, problem, got });
      console.log("  ✗ " + e.he + " [" + e.expect + "] — " + problem);
    } else {
      pass++;
      console.log("  ✓ " + e.he + " [" + e.expect + "]");
    }
  }
  console.log("\n[conj-audit] " + pass + "/" + (pass + fail) + " passed; " + fail + " FAIL");
  if (fails.length) console.log("FAILS_JSON " + JSON.stringify(fails));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
