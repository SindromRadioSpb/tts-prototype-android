#!/usr/bin/env node
// scripts/quiz/bank-validate-smoke.js — v3.3.5 Calibrated Quiz item bank smoke.
//
// 8 cases per PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §13 bank smoke:
//   1. Bank has exactly 20 items
//   2. CEFR distribution matches 4/4/5/4/3
//   3. All items have non-empty prompt_he/prompt_ru/prompt_en
//   4. All items have 4 options with unique ids
//   5. All correct_option_id references resolve to an option
//   6. All difficulty_logit are finite numbers in [-4, 4]
//   7. CEFR bands cover [0, 100] without gaps/overlaps
//   8. JSON parses + matches schema invariants (exit 0 from validator)
//
// Pure Node — no Playwright, no server spawn. Reads the canonical bank
// JSON, runs the validator script via spawnSync, and additionally
// performs the 8 invariants directly so a corrupted validator does not
// silently pass.
//
// Exit:
//   0 — all 8 cases green
//   1 — at least one case failed

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BANK_PATH = path.join(REPO_ROOT, "public/quiz/ulpan_diagnostic_v1.json");
const VALIDATOR = path.join(REPO_ROOT, "scripts/quiz/validate-bank.js");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

function main() {
  if (!fs.existsSync(BANK_PATH)) {
    console.error("[bank-smoke] bank not found:", BANK_PATH);
    process.exit(1);
  }
  let bank = null;
  try { bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf8")); }
  catch (e) {
    console.error("[bank-smoke] parse failed:", e.message);
    process.exit(1);
  }

  // 1. Exactly 20 items.
  test("bank has exactly 20 items",
       Array.isArray(bank.items) && bank.items.length === 20,
       "got " + (bank.items && bank.items.length));

  // 2. CEFR distribution 4/4/5/4/3.
  const counts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  for (const it of bank.items || []) {
    if (counts[it.cefr_level] !== undefined) counts[it.cefr_level]++;
  }
  const distOk = counts.A1 === 4 && counts.A2 === 4 && counts.B1 === 5 &&
                 counts.B2 === 4 && counts.C1 === 3;
  test("CEFR distribution = 4/4/5/4/3",
       distOk,
       `got A1=${counts.A1}/A2=${counts.A2}/B1=${counts.B1}/B2=${counts.B2}/C1=${counts.C1}`);

  // 3. All items have non-empty prompts in all 3 locales.
  const promptOk = (bank.items || []).every((it) =>
    typeof it.prompt_he === "string" && it.prompt_he.trim() &&
    typeof it.prompt_ru === "string" && it.prompt_ru.trim() &&
    typeof it.prompt_en === "string" && it.prompt_en.trim());
  test("all items have non-empty prompt_he/prompt_ru/prompt_en",
       promptOk);

  // 4. All items have 4 options with unique ids a/b/c/d.
  const optsOk = (bank.items || []).every((it) => {
    if (!Array.isArray(it.options) || it.options.length !== 4) return false;
    const ids = it.options.map((o) => o && o.id).sort().join(",");
    return ids === "a,b,c,d";
  });
  test("all items have 4 options with unique ids {a,b,c,d}", optsOk);

  // 5. All correct_option_id values resolve to a real option.
  const correctOk = (bank.items || []).every((it) =>
    it.options.some((o) => o.id === it.correct_option_id));
  test("all correct_option_id values resolve to an option", correctOk);

  // 6. All difficulty_logit are finite numbers in [-4, 4].
  const logitOk = (bank.items || []).every((it) =>
    typeof it.difficulty_logit === "number" &&
    Number.isFinite(it.difficulty_logit) &&
    it.difficulty_logit >= -4 && it.difficulty_logit <= 4);
  test("all difficulty_logit are finite numbers in [-4, 4]", logitOk);

  // 7. CEFR bands cover [0, 100] without gaps/overlaps.
  const bands = (bank.scoring && bank.scoring.cefr_bands) || [];
  const sorted = bands.slice().sort((a, b) => a.lower - b.lower);
  let coverOk = sorted.length === 5 &&
                sorted[0].lower === 0 &&
                sorted[sorted.length - 1].upper === 100;
  for (let i = 1; coverOk && i < sorted.length; i++) {
    if (sorted[i].lower !== sorted[i - 1].upper + 1) coverOk = false;
  }
  test("scoring.cefr_bands cover [0, 100] without gaps/overlaps", coverOk);

  // 8. Validator script exits 0.
  const r = spawnSync(process.execPath, [VALIDATOR, BANK_PATH], { encoding: "utf8" });
  test("scripts/quiz/validate-bank.js exits 0 on this bank",
       r.status === 0,
       "exit=" + r.status + " stderr=" + (r.stderr || "").slice(0, 200));

  console.log(`\n[bank-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) main();
