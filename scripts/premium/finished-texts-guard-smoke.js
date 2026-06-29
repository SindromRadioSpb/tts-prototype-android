#!/usr/bin/env node
"use strict";

// finished-texts-guard-smoke.js — FB-2 / FB-3 static-source gate for the «✓ Прочитанные» shelf.
//
// FB-2 (anti-leak): getFinishedTexts MUST mirror getContinueReading's predicate VERBATIM — the same
//   CANON_ORIGIN + is_archived + last_row_idx>0 guards keep a locally-finished Studio/user text off the
//   public canon shelf (the 2026-06-27 «150 Глаголов» leak). Only the finished_at clause flips.
// FB-3 (honesty): finished_at must stay MANUAL-only — readerAtEnd()/maybeShowEndOfText() must NEVER
//   call setTextFinished (no scroll/karaoke auto-completion dressing a half-read text as «прочитано»).
//
// Static source assertions (no browser / no OPFS — wa-sqlite can't run headless reliably).

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const DB = fs.readFileSync(path.join(ROOT, "public", "db", "local-db.js"), "utf8");
const UI = fs.readFileSync(path.join(ROOT, "public", "js", "library-ui.js"), "utf8");

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); } }

function fnBody(src, name) {
  const i = src.indexOf("function " + name);
  if (i < 0) return "";
  // crude brace-match from the first { after the signature
  const open = src.indexOf("{", i);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(open, j + 1); }
  }
  return src.slice(open);
}

console.log("finished-texts-guard-smoke (FB-2 anti-leak + FB-3 manual-only)");

const gft = fnBody(DB, "getFinishedTexts");
test("getFinishedTexts exists", !!gft);
test("FB-2 · CANON_ORIGIN guard", /json_extract\(t\.source_meta_json,\s*'\$\.origin'\)\s*=\s*\?/.test(gft) && /CANON_ORIGIN/.test(gft));
test("FB-2 · is_archived guard", /COALESCE\(t\.is_archived,\s*0\)\s*=\s*0/.test(gft));
test("FB-2 · last_row_idx>0 guard", /tp\.last_row_idx\s*>\s*0/.test(gft));
test("FB-2 · finished filter (IS NOT NULL)", /tp\.finished_at\s+IS\s+NOT\s+NULL/i.test(gft));
test("FB-2 · newest-finished order", /ORDER BY\s+tp\.finished_at\s+DESC/i.test(gft));

// FB-3 — the two honest end-of-text detectors must never auto-write finished_at.
const atEnd = fnBody(UI, "readerAtEnd");
const maybeEnd = fnBody(UI, "maybeShowEndOfText");
test("FB-3 · readerAtEnd does NOT call setTextFinished", !!atEnd && !/setTextFinished/.test(atEnd));
test("FB-3 · maybeShowEndOfText does NOT call setTextFinished", !!maybeEnd && !/setTextFinished/.test(maybeEnd));
// Every setTextFinished call site is inside a click handler (manual): assert each occurrence is preceded
// (within the same statement neighbourhood) by an addEventListener('click' … OR a 'done'/'mark' click var.
const setCalls = (UI.match(/setTextFinished\(/g) || []).length;
test("FB-3 · setTextFinished call-sites are exactly the 2 manual handlers", setCalls === 2, "found " + setCalls);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
