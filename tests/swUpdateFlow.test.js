"use strict";

// R0 (UI release program 2026-09-25): a new release must reach tabs that already run the app.
// Browser proof: npm run smoke:sw-update (scenarios A–E). These tests pin the contracts the
// smoke found fragile, so a later edit cannot silently undo them.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const indexHtml = read("public/index.html");
const libraryUi = read("public/js/library-ui.js");
const mediatheque = read("public/js/mediatheque-ui.js");

test("Studio defers the update while a draft, cell edit or save is open", () => {
  const start = indexHtml.indexOf("window.v3PrepareForAppUpdate = ");
  const fn = indexHtml.slice(start, indexHtml.indexOf("window.__v3ApplyUpdate = ", start));
  for (const guard of ['mode === "draft"', "_tableEditActiveEditorTd", "_tableEditDebounceTimers", "v3NotesModalIsDirty", "v3SaveMetaSaving"]) {
    assert.ok(fn.includes(guard), "safe point must check " + guard);
  }
  assert.match(fn, /UPDATE_DEFERRED_UNSAVED/);
});

test("Mediatheque re-sends SKIP_WAITING to the current waiting worker (a dropped message must not strand the update)", () => {
  const branch = mediatheque.slice(mediatheque.indexOf("if (action === 'update-app')"), mediatheque.indexOf("if (action === 'copy-input')"));
  assert.match(branch, /getRegistration\(/, "targets registration.waiting at click time");
  assert.match(branch, /setTimeout\(/, "re-sends once if controllerchange has not come");
  assert.match(branch, /else if \(!updateReloading\) \{ updateReloading = true; location\.reload\(\); \}/,
    "nothing waiting means the new worker already controls the page: reload brings its shell");
});

test("every shell polls for a new worker on load, on tab return and periodically", () => {
  for (const [name, src] of [["studio", indexHtml], ["room", libraryUi], ["mediatheque", mediatheque]]) {
    assert.match(src, /\.update\(\)/, name + " calls registration.update()");
    assert.match(src, /visibilitychange[\s\S]{0,200}(check|update)/, name + " re-checks when the tab becomes visible");
  }
});

