"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ui = fs.readFileSync(path.join(__dirname, "../public/js/library-ui.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/library.html"), "utf8");

function slice(from, to) { return ui.slice(ui.indexOf(from), ui.indexOf(to)); }

test("all corpus card renderers use one material action surface", () => {
  assert.match(slice("function renderWorkCard", "function renderShelf"), /materialActionMenu\(\{ item: hit, source: \{ kind: 'local' \}/);
  assert.match(slice("function renderCorpusCard", "function renderTrack"), /materialActionMenu\(\{ item: card, source: \{ kind: 'benyehuda' \}/);
  assert.match(slice("async function renderPublicCorpus", "async function renderGroupCorpus"), /materialActionMenu\(\{ item, source: \{ kind: 'public', slug \}/);
  assert.match(ui, /materialActionMenu\(\{item:work,source:\{kind:'group',corpusId\}/);
  assert.match(slice("function renderMyTextCard", "async function paintMyTextsProfileFit"), /materialActionMenu\(\{ item, source: \{ kind: 'local' \}/);
  assert.match(html, /material-actions\.js\?v=1/);
});

test("a public card package is built from its materialized text, not the edition ZIP", () => {
  const publicRenderer = slice("async function renderPublicCorpus", "async function renderGroupCorpus");
  assert.doesNotMatch(publicRenderer, /openPublicShare\(catalog, item/);
  assert.match(ui, /exportBundle\(\{ includeArchived: true, textIds: \[String\(item\.id\)\] \}\)/);
  assert.match(ui, /MaterialActions\.fetchAudioAsset\(request\.source/);
  const editionDialog = slice("function openPublicShare", "async function renderPublicCorpus");
  assert.match(editionDialog, /\/api\/public-corpora\/.*\/package/,
    "edition package remains available only from the corpus-level dialog");
});

test("restricted group actions remain rights-aware", () => {
  assert.match(ui, /protectedLinkOnly/);
  assert.match(ui, /allowExport: capabilities\.obsidian/);
  assert.match(ui, /shareProtected:\(\)=>shareWork\(work\)/);
});
