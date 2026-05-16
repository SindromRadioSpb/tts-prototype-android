#!/usr/bin/env node
// scripts/notes-graph/suggest-fixture-smoke.js — v3.6 Phase 0.
//
// Pins the A2 suggestion CONTRACT before any generator exists. Pure
// Node (no server / Playwright): it independently RE-DERIVES the
// note->note candidate set from the frozen fixture's `notes` +
// `note_links` strictly by the documented `rules`, and asserts it is
// byte-for-byte the frozen `expected_candidates`. Phase 1's generator
// must reproduce exactly this set on this (the user's real) bundle.
//
// Cases:
//   1. Fixture loads + structural integrity (ids, reason_codes,
//      to_kind, all refs resolve, deterministic ordering).
//   2. Independently re-derived candidate set == expected_candidates.
//   3. Exclusions hold: no self; existing note->note links excluded;
//      a note->text link does NOT block a note->note same_text cand.
//   4. No shared_lemma candidates (all j_word distinct — guards
//      against false lemma matches); N5 yields zero candidates.
//   5. Morph-coverage baseline is recorded and = 0 calls for bundle.

"use strict";

const path = require("path");
const fs = require("fs");

const FIX = path.join(__dirname, "__fixtures__", "suggest-bundle-fixture.json");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

const REASON_PRIORITY = ["shared_root", "shared_lemma", "shared_binyan", "same_text"];
const VALID_REASONS = new Set(REASON_PRIORITY);

// Independent re-derivation of the contract (NOT the production
// generator — that is Phase 1). Same rules, written from scratch so
// the fixture cannot "mark its own homework".
function derive(fix) {
  const notes = fix.notes;
  const byId = new Map(notes.map((n) => [n.id, n]));
  // note->note links to exclude (the bundle's only link is note->text,
  // so this stays empty — exactly the case the rule must get right).
  const linkedNoteToNote = new Set();
  for (const l of fix.note_links) {
    if (l.to_kind === "note" && byId.has(l.to_id)) {
      linkedNoteToNote.add(l.from_note_id + "->" + l.to_id);
    }
  }
  const norm = (s) => String(s == null ? "" : s).trim();
  const out = [];
  for (const a of notes) {
    for (const b of notes) {
      if (a.id === b.id) continue;                       // no self
      if (linkedNoteToNote.has(a.id + "->" + b.id)) continue; // existing link
      const checks = [
        ["shared_root",   norm(a.j_root)   && norm(a.j_root)   === norm(b.j_root)   ? norm(a.j_root)   : null],
        ["shared_lemma",  norm(a.j_word)   && norm(a.j_word)   === norm(b.j_word)   ? norm(a.j_word)   : null],
        ["shared_binyan", norm(a.j_binyan) && norm(a.j_binyan) === norm(b.j_binyan) ? norm(a.j_binyan) : null],
        ["same_text",     norm(a.text_id)  && norm(a.text_id)  === norm(b.text_id)  ? norm(a.text_id)  : null],
      ];
      for (const [reason, evidence] of checks) {
        if (evidence != null) {
          out.push({ from: a.id, to: b.id, to_kind: "note",
                     reason_code: reason, evidence: evidence });
        }
      }
    }
  }
  // determinism: from asc, reason priority, to asc
  out.sort((x, y) =>
    x.from.localeCompare(y.from) ||
    REASON_PRIORITY.indexOf(x.reason_code) - REASON_PRIORITY.indexOf(y.reason_code) ||
    x.to.localeCompare(y.to));
  return out;
}

function keyOf(c) {
  return [c.from, c.to, c.to_kind, c.reason_code, c.evidence].join("|");
}

function main() {
  let fix;
  try { fix = JSON.parse(fs.readFileSync(FIX, "utf8")); }
  catch (e) { console.error("[suggest-fixture-smoke] cannot read fixture:", e.message); process.exit(1); }

  const noteIds = new Set(fix.notes.map((n) => n.id));

  // Case 1 — structural integrity.
  const structOk =
    Array.isArray(fix.notes) && fix.notes.length === 5 &&
    Array.isArray(fix.expected_candidates) &&
    fix.expected_candidates.every((c) =>
      noteIds.has(c.from) && noteIds.has(c.to) &&
      c.to_kind === "note" && VALID_REASONS.has(c.reason_code) &&
      typeof c.evidence === "string" && c.evidence.length > 0);
  test("Case 1: fixture structurally sound (5 notes, valid candidate rows)",
       structOk);

  // Case 1b — expected_candidates is itself in the deterministic order.
  const exp = fix.expected_candidates;
  const expSorted = exp.slice().sort((x, y) =>
    x.from.localeCompare(y.from) ||
    REASON_PRIORITY.indexOf(x.reason_code) - REASON_PRIORITY.indexOf(y.reason_code) ||
    x.to.localeCompare(y.to));
  const orderOk = JSON.stringify(exp.map(keyOf)) === JSON.stringify(expSorted.map(keyOf));
  test("Case 1b: expected_candidates already in deterministic order",
       orderOk);

  // Case 2 — independent re-derivation equals the frozen contract.
  const derived = derive(fix);
  const dSet = new Set(derived.map(keyOf));
  const eSet = new Set(exp.map(keyOf));
  const missing = [...eSet].filter((k) => !dSet.has(k));
  const extra = [...dSet].filter((k) => !eSet.has(k));
  test("Case 2: re-derived candidate set == frozen expected_candidates",
       missing.length === 0 && extra.length === 0,
       JSON.stringify({ missing, extra }));

  // Case 3 — exclusions: no self anywhere; the note->text link did NOT
  // suppress N4<->N1/N3 same_text (the rule that originally broke the
  // graph). Verify both directions present.
  const noSelf = exp.every((c) => c.from !== c.to);
  const n4n1 = exp.some((c) => c.from === "N4" && c.to === "N1" && c.reason_code === "same_text");
  const n4n3 = exp.some((c) => c.from === "N4" && c.to === "N3" && c.reason_code === "same_text");
  test("Case 3: no self-pairs; note->text link does not block note->note same_text",
       noSelf && n4n1 && n4n3,
       JSON.stringify({ noSelf, n4n1, n4n3 }));

  // Case 4 — no shared_lemma (all j_word distinct) + N5 isolated.
  const anyLemma = exp.some((c) => c.reason_code === "shared_lemma");
  const n5None = !exp.some((c) => c.from === "N5" || c.to === "N5") &&
                 Array.isArray(fix.expected_no_candidates) &&
                 fix.expected_no_candidates.includes("N5");
  test("Case 4: zero shared_lemma (distinct words) + N5 yields no candidates",
       !anyLemma && n5None,
       JSON.stringify({ anyLemma, n5None }));

  // Case 5 — morph coverage baseline recorded, 0 calls for the bundle.
  const mc = fix.morph_coverage_baseline || {};
  test("Case 5: morph-coverage baseline recorded (0 morph calls for bundle)",
       mc.morph_calls_required_for_bundle === 0 &&
       typeof mc.implication === "string" && mc.implication.length > 0,
       JSON.stringify({ calls: mc.morph_calls_required_for_bundle }));

  console.log(`\n[suggest-fixture-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
