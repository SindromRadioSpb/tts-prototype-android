const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("IDE table headers are re-rendered on locale changes", () => {
  assert.match(html, /document\.addEventListener\("i18n:changed", function \(\) \{/);
  assert.match(html, /classList\.contains\("v3-ide-mode"\)/);
  assert.match(html, /v3IdeRenderTable\(currentTableData, ideTextId\)/);
  assert.match(html, /v3IdeSelectRow\(v3IdeState\.selectedRowIdx\)/);
  assert.match(html, /else\s*\{\s*renderTable\(currentTableData\);/);
});

test("IDE table renderer uses localized column titles", () => {
  assert.match(html, /function v3IdeRenderTable\(rows, textId\) \{/);
  assert.match(html, /t\("table\.colHebrew"\)/);
  assert.match(html, /t\("table\.colNiqqud"\)/);
  assert.match(html, /t\("table\.colTranslitLat"\)/);
  assert.match(html, /t\("table\.colTranslation"\)/);
});
