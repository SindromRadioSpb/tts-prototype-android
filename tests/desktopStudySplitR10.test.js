"use strict";

// R10 (UI release program, audit P1-16): on a desktop the study screen was one narrow column —
// video 1256×340 on top, the table under it, and the word card a centred modal sheet over the
// rows being read. Now ≥1024px with media: video left (480px, never scrolls away), the word card
// docked under it, the table right.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const html = read("public/library.html");
const ui = read("public/js/library-ui.js");
const fnSource = (name) => {
  const start = ui.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " exists");
  let depth = 0, i = ui.indexOf("{", start);
  for (; i < ui.length; i++) { if (ui[i] === "{") depth++; else if (ui[i] === "}" && --depth === 0) break; }
  return ui.slice(start, i + 1);
};

test("the layout flag: study mode + visible media + ≥1024px", () => {
  const apply = fnSource("roomMediaApplyLayout");
  assert.match(apply, /roomWordDockSync\(mediaVisible\);/);
  const sync = fnSource("roomWordDockSync");
  assert.match(sync, /document\.body\.classList\.contains\('room-study'\) && !!mediaVisible && window\.innerWidth >= 1024/);
  assert.match(sync, /document\.body\.classList\.toggle\('room-word-docked', docked\)/);
  assert.match(sync, /setProperty\('--room-dock-top'/);
  assert.match(sync, /setAttribute\('aria-modal', docked \? 'false' : 'true'\)/);
  // Resize already re-runs roomMediaApplyLayout (rAF-coalesced `relayout`), and with it the dock.
  assert.match(ui, /window\.addEventListener\('resize', relayout, \{ passive: true \}\);/);
});

test("two columns: video left, table right, header rows across", () => {
  assert.match(html, /@media \(min-width: 1024px\) \{\s*body\.room-study\.room-word-docked #roomReader \{\s*--room-dock-w: clamp\(360px, 38vw, 480px\);\s*display: grid; grid-template-columns: var\(--room-dock-w\) minmax\(0, 1fr\);/);
  assert.match(html, /body\.room-study\.room-word-docked #roomReader > \* \{ grid-column: 1 \/ -1; \}/);
  assert.match(html, /body\.room-study\.room-word-docked #roomMediaBar \{ grid-column: 1; grid-row: 20;/);
  assert.match(html, /body\.room-study\.room-word-docked #roomReaderTable \{ grid-column: 2; grid-row: 20 \/ 22;/);
  assert.match(html, /body\.room-study\.room-word-docked #roomWordDockHint \{ display: block; grid-column: 1; grid-row: 21;/);
});

test("the word card docks under the video: no backdrop, own scroll, logical inset for RTL", () => {
  assert.match(html, /body\.room-word-docked \.rm-sheet \{\s*inset: var\(--room-dock-top, 420px\) auto 20px 20px;\s*inset-inline-start: 20px; inset-inline-end: auto; width: clamp\(360px, 38vw, 480px\);/);
  assert.match(html, /body\.room-word-docked \.rm-sheet-backdrop \{ display: none; \}/);
  assert.match(html, /body\.room-word-docked \.rm-sheet-card \{\s*position: static; max-width: none; max-height: 100%; height: 100%;/);
  assert.match(html, /<div id="roomWordDockHint" class="room-word-dock-hint" data-i18n="room\.reader\.wordDockHint" hidden>/);
});

test("the dock hint exists in every locale", () => {
  for (const l of ["ru", "en", "he"]) assert.match(read(`public/i18n/locales/${l}.js`), /\bwordDockHint: "/, l);
});

test("the shared word card reads the layout on every open (first open included)", () => {
  const morph = read("public/js/reader-morph.js");
  assert.match(morph, /function syncSheetModality\(el\) \{[\s\S]{0,200}room-word-docked[\s\S]{0,40}"false" : "true"/);
  assert.equal((morph.match(/syncSheetModality\(el\);/g) || []).length, 2);
});

// Final review: a word card opened from the «Мои слова» sheet (z-index 990) must stack above it;
// the docked panel kept the sheet's own z-index 1000 — lowering it hid that card on a desktop.
test("the docked word card still stacks above the words sheet", () => {
  const dock = html.match(/body\.room-word-docked \.rm-sheet \{[^}]*\}/)[0];
  assert.doesNotMatch(dock, /z-index/, "the dock keeps .rm-sheet's z-index (1000 > .room-study 990)");
  assert.match(read("public/css/reader-morph.css"), /\.rm-sheet \{ position: fixed; inset: 0; z-index: 1000; \}/);
  assert.match(html, /\.room-study \{ position: fixed; inset: 0; z-index: 990; \}/);
});

// Final-review minor: a word card left open when the reader closes turned from the docked panel
// into a bottom sheet over the shelves. Leaving the text closes it.
test("closing the reader closes an open word card", () => {
  const start = ui.indexOf("async function closeReader(options) {");
  assert.match(ui.slice(start, start + 900), /window\.ReaderMorph\.isSheetOpen\(\)\) window\.ReaderMorph\.closeSheet\(\);/);
});
