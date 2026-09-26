"use strict";

// O-020: a first visit waited for the canon import (25 of 28 s headless) before the Room showed
// anything, although the default «Библиотека» home is built from the corpus catalog. On a cold
// profile the home renders first; the canon imports in the background.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ui = fs.readFileSync(path.join(__dirname, "..", "public/js/library-ui.js"), "utf8").replace(/\r\n/g, "\n");
const fnSource = (name) => {
  const start = ui.search(new RegExp("(async )?function " + name + "[(]"));
  assert.ok(start >= 0, name);
  let depth = 0, i = ui.indexOf("{", start);
  for (; i < ui.length; i++) { if (ui[i] === "{") depth++; else if (ui[i] === "}" && --depth === 0) break; }
  return ui.slice(start, i + 1);
};

test("a cold profile with a corpus catalog does not wait for the canon import", () => {
  assert.match(fnSource("canonImportLikelyNeeded"), /localStorage\.getItem\(CANON_VERSION_KEY\)[\s\S]*< CANON_BUNDLE_VERSION/);
  const boot = ui.slice(ui.indexOf("const corpusCatalogLoad = loadCorpusCatalog();"), ui.indexOf("await loadPublicCorpora();"));
  assert.match(boot, /if \(canonImportLikelyNeeded\(\) && !initialPresentation\)/);
  assert.match(boot, /_canonPending = true;/);
  assert.match(boot, /autoImportCanon\(\{ quiet: true \}\)[\s\S]{0,80}await loadData\(\)/);
  assert.match(boot, /finally \{[\s\S]{0,120}_canonPending = false;[\s\S]{0,120}activeTrack !== 'corpus'[\s\S]{0,40}renderTrack\(\)/);
  assert.match(boot, /if \(!canonInBackground\) \{\s*await autoImportCanon\(\);[^\n]*\n\s*await loadData\(\);\s*\}/);
});

test("the background import stays quiet over the home; shelf tabs wait on a skeleton", () => {
  const imp = fnSource("autoImportCanon");
  assert.match(imp, /async function autoImportCanon\(opts\)/);
  assert.match(imp, /if \(!\(opts && opts\.quiet\)\) showState\('room\.state\.publishing', '📥'\);/);
  assert.match(fnSource("renderTrack"), /if \(_canonPending\) \{ showState\('room\.state\.publishing', '📥'\); return; \}/);
});

// Measured: opening a text while the background import ran failed for good — the DB worker
// answered «cannot start a transaction within a transaction» and the reader stayed on «Не удалось
// загрузить библиотеку». Room writes now wait for the import; the import itself uses the raw DB.
test("Room DB writes wait for the background canon import", () => {
  assert.match(ui, /import \* as localDbRaw from '\/db\/local-db\.js\?v=\d+';/);
  assert.match(ui, /const localDb = new Proxy\(localDbRaw, \{/);
  assert.match(ui, /ROOM_DB_WRITES\.has\(key\)[\s\S]{0,200}_canonPending && _canonReadyPromise[\s\S]{0,120}_canonReadyPromise\.then\(/);
  for (const m of ["importBundle", "setProgress", "setWordStatus", "addBookmark", "putLearningCompassIngredients", "appendReviewLog", "touchOpened"]) {
    const set = ui.slice(ui.indexOf("const ROOM_DB_WRITES = new Set(["), ui.indexOf("]);", ui.indexOf("const ROOM_DB_WRITES = new Set([")));
    assert.ok(set.includes("'" + m + "'"), m);
  }
  const imp = ui.slice(ui.search(/async function autoImportCanon\(opts\)/), ui.search(/async function autoImportCanon\(opts\)/) + 4000);
  assert.match(imp, /localDbRaw\.importBundle\(/);
  assert.match(imp, /localDbRaw\.reconcileAudioLinks\(/);
  assert.match(ui, /_canonReadyPromise = \(async \(\) => \{/);
});
