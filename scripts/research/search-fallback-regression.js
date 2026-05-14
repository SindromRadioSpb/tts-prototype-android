#!/usr/bin/env node
// scripts/research/search-fallback-regression.js — Hotfix v3.3.3 regression
// guard.
//
// Bug (filed 2026-05-14, hotfix v3.3.3 anchor):
//   Library → Search → "Совпадения в строках" cards rendered "Без названия"
//   for every hit, and the "Перейти к строке" button raised "Невозможно
//   перейти: пустой textId/sentenceId".
//
// Root cause:
//   v3RowsRender + the notes-hit render path read result rows via camelCase
//   keys (r.textId / r.sentenceId / r.title / r.orderIndex / r.he), but
//   public/db/local-db.js#searchSentences (and searchNotes) return raw
//   SQLite columns (r.text_id / r.id / r.text_title / r.order_index /
//   r.he_plain). Field-name mismatch → all those reads were empty strings
//   or NaN.
//
// Fix:
//   Add snake_case fallbacks in the two render sites. This guard test
//   asserts those fallbacks are present and not accidentally removed by
//   future edits (e.g. if someone "cleans up the redundant logic"
//   without realising the function is shared with the LOCAL_MODE path).
//
// Why not a live Playwright smoke?
//   v3RowsRender lives inside the index.html monolith and requires a
//   full app boot (OPFS, db worker, etc.) before it's reachable. The
//   regression we're guarding against is a one-line removal of the
//   fallback, which a source-level check catches cheaply and reliably.

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TARGET = path.join(REPO_ROOT, "public/index.html");

const src = fs.readFileSync(TARGET, "utf8");

// Anti-regression patterns. If ANY of these is missing the test fails,
// meaning either:
//   - someone removed the fallback (regression), OR
//   - someone renamed the variables (then this guard needs updating).
const REQUIRED_PATTERNS = [
  // v3RowsRender (Совпадения в строках)
  { id: "rows-textId",     re: /r\.textId\s*\|\|\s*r\.text_id/,         where: "v3RowsRender" },
  { id: "rows-sentenceId", re: /r\.sentenceId\s*\|\|\s*r\.id\s*\|\|\s*r\.sentence_id/, where: "v3RowsRender" },
  { id: "rows-title",      re: /r\.title\s*\|\|\s*r\.text_title/,       where: "v3RowsRender" },
  { id: "rows-he",         re: /r\.he\s*\|\|\s*r\.he_plain/,            where: "v3RowsRender" },
  // notes-hit render (Совпадения в заметках)
  { id: "notes-sentenceText", re: /r\.sentenceText\s*\|\|\s*r\.he_plain/, where: "v3NotesShowHits" },
  { id: "notes-noteUpdatedAt", re: /r\.noteUpdatedAt\s*\|\|\s*r\.updated_at/, where: "v3NotesShowHits" },
];

let passed = 0, failed = 0;
for (const p of REQUIRED_PATTERNS) {
  if (p.re.test(src)) {
    passed++;
    console.log(`  ✓ ${p.where}: snake_case fallback ${p.id} present`);
  } else {
    failed++;
    console.log(`  ✗ ${p.where}: MISSING fallback ${p.id} — REGRESSION!`);
  }
}

// Additional sanity: the source has at least one literal "Без названия"
// (the fallback when title is genuinely empty). If this disappears, the
// fallback chain may have been replaced with something else.
const FALLBACK_TITLE = /["']Без названия["']/;
if (FALLBACK_TITLE.test(src)) {
  passed++;
  console.log(`  ✓ literal "Без названия" fallback present in render path`);
} else {
  failed++;
  console.log(`  ✗ MISSING literal "Без названия" fallback`);
}

console.log(`\n[search-fallback-regression] ${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
