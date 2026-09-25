"use strict";

// R4 (UI release program 2026-09-25, audit P0-8): the study video overflowed the screen by one
// gutter — clipped on the right in LTR, flush left in RTL — because the YouTube mount added
// inline margins on top of flex-basis 100% inside a bar that already has the gutter.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("the Room YouTube mount adds no inline margin of its own", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public/library.html"), "utf8").replace(/\r\n/g, "\n");
  const rule = html.slice(html.indexOf("#roomMediaYtMount {"), html.indexOf("}", html.indexOf("#roomMediaYtMount {")));
  assert.doesNotMatch(rule, /margin:\s*0 12px/);
  assert.match(rule, /margin:\s*0 0 6px/);
});

// R4 (audit P0-10): the first word tap opened a Dicta consent modal over the card. The card
// itself offers «Уточнить в контексте» (one-off or for all words) and Аа has the switch, so an
// undecided user gets the offline reading silently and decides inside the card.
test("an undecided Dicta consent never opens a modal on a word tap", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public/js/morph-host.js"), "utf8");
  const provider = src.slice(src.indexOf("function makeContextProvider"), src.indexOf("function makeContextProvider") + 1400);
  assert.doesNotMatch(provider, /promptContextConsent\(\)/);
  assert.match(provider, /if \(consent !== "granted"\) return null;/);
});

// R4b (owner 2026-09-26, option 2): on a phone the section header (title, icons, Медиатека, tabs)
// is hidden in ANY open text — study mode stays a manual Аа switch (D5). The reader bar's back
// button returns to the shelves, where the header is back.
test("on a phone the Room section header hides while a text is open, study mode or not", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public/library.html"), "utf8");
  assert.match(html, /@media \(max-width: 599px\) \{\s*body\.room-reading header\.room-header \{ display: none !important; \}/);
  const ui = fs.readFileSync(path.join(__dirname, "..", "public/js/library-ui.js"), "utf8");
  assert.match(ui, /classList\.remove\('room-reading'\)/, "closing the text brings the header back");
});
