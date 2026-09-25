"use strict";

// R2 (UI release program 2026-09-25, owner D2/D4/D7/D10): the «Действие» column carries the row
// number, the TTS state dot and ▶ (TTS), and in the Room the mentor — every target ≥ 44px,
// the mentor drawn as a line icon instead of an emoji. The parity-locked builder is untouched:
// numbers are a post-render attribute.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
const P = require("../public/js/table-presets.js");

test("markRowNumbers numbers action cells from the row index, two digits up to 99", () => {
  const { parseHTML } = require("linkedom");
  const rows = [0, 1, 9, 99, 120].map((i) => `<tr data-row-idx="${i}"><td data-col="action" class="col-action-cell"></td><td>x</td></tr>`).join("");
  const { document } = parseHTML(`<!doctype html><html><body><table><tbody>${rows}</tbody></table></body></html>`);
  P.markRowNumbers(document.querySelector("table"));
  const ns = [...document.querySelectorAll("td.col-action-cell")].map((td) => td.getAttribute("data-row-n"));
  assert.deepEqual(ns, ["01", "02", "10", "100", "121"]);
});

for (const shell of ["public/library.html", "public/index.html"]) {
  test(shell + ": the row number is drawn from the attribute with tabular digits, row buttons are 44px", () => {
    const css = read(shell);
    assert.match(css, /\.col-action-cell\[data-row-n\]::before \{[^}]*content: attr\(data-row-n\)[^}]*tabular-nums/);
    assert.match(css, /\.col-action-cell \.row-tts-btn[^{]*\{[^}]*min-width: 44px[^}]*min-height: 44px/);
  });
}

test("both shells number the rows after every render", () => {
  assert.match(read("public/js/library-ui.js"), /TablePresets\.markRowNumbers\(/);
  assert.match(read("public/index.html"), /TablePresets\.markRowNumbers\(/);
});

test("the Room mentor button is a line icon with a label, and the narrow action column fits a 44px button", () => {
  const ui = read("public/js/library-ui.js");
  const start = ui.indexOf("class: 'row-explain-btn'");
  assert.ok(start > 0);
  const block = ui.slice(start, start + 900);
  assert.doesNotMatch(block, /text: '🤖'/);
  assert.match(block, /<svg/);
  assert.match(ui, /const ROOM_RAIL_PX = (5[2-9]|[6-9]\d);/);
  for (const locale of ["ru", "en", "he"]) assert.doesNotMatch(read(`public/i18n/locales/${locale}.js`), /actionRail: "Рельс"/);
});
