// tests/importModalDismissGuard.test.js — a stray click must not throw away work in flight.
//
// Owner-live 2026-09-18: a local ASR run of a 508 MB file was killed by a click that landed
// just outside the Import dialog. The backdrop was wired straight to StudioImport.close():
//
//   <div class="v3-modal-backdrop" onclick="StudioImport.close()"></div>
//
// so the accidental path and the deliberate one were the same path, and the long, GPU-bound
// job it was holding died without a word. The deliberate exits (the Close button, "Отменить
// local job", "Отменить media job") stay exactly as they were - only the stray click is
// refused, and only while something is actually running.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const SI = require(path.join(root, "public/js/studio-import.js"));
const studio = fs.readFileSync(path.join(root, "public/js/studio-import.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

test("the dialog reports whether it is holding work", () => {
  assert.equal(typeof SI.isBusy, "function", "busy state must be readable, not implicit");
  assert.equal(SI.isBusy(), false, "an idle dialog is not busy");
});

test("the backdrop has its own guarded entry, separate from the deliberate close", () => {
  assert.equal(typeof SI.closeFromBackdrop, "function");
});

test("the import dialog's backdrop no longer calls the unguarded close", () => {
  const start = html.indexOf('id="v3ImportModal"');
  assert.ok(start > 0, "the import dialog must exist");
  const markup = html.slice(start, start + 600);
  assert.match(markup, /v3-modal-backdrop[^>]*onclick="StudioImport\.closeFromBackdrop\(\)"/,
    "the backdrop must route through the guard");
  assert.doesNotMatch(markup, /v3-modal-backdrop[^>]*onclick="StudioImport\.close\(\)"/,
    "the stray-click path must not be the deliberate path");
});

test("the deliberate exits are untouched", () => {
  const start = html.indexOf('id="v3ImportModal"');
  const markup = html.slice(start, start + 1200);
  assert.match(markup, /<button[^>]*onclick="StudioImport\.close\(\)"/,
    "the Close button still closes the dialog outright");
});

test("the guard refuses only while busy, and says why", () => {
  const start = studio.indexOf("function closeFromBackdrop");
  assert.ok(start > 0);
  const body = studio.slice(start, start + 500);
  assert.match(body, /isBusy\(\)/, "the guard consults the busy state");
  assert.match(body, /studio\.import\.dismissBlocked/, "and names what it refused");
  assert.match(body, /return/, "a busy dialog stays open");
});

test("the refusal message exists in every locale", () => {
  for (const locale of ["ru", "en", "he"]) {
    const source = fs.readFileSync(path.join(root, "public/i18n/locales", `${locale}.js`), "utf8");
    assert.match(source, /dismissBlocked:\s*"[^"]{20,}"/,
      `${locale} is missing studio.import.dismissBlocked`);
  }
});
