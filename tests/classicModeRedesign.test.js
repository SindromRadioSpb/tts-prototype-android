const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("classic mode separates utility navigation from workflow actions", () => {
  assert.match(html, /class="classic-utility-bar"[\s\S]*id="btnLibrary"/);
  assert.match(html, /class="classic-utility-bar"[\s\S]*id="btnDashboard"/);
  assert.match(html, /class="classic-utility-bar"[\s\S]*id="btnSrsTrainer"/);
  assert.match(html, /class="classic-utility-bar"[\s\S]*id="v3ModeToggle"/);

  const utilityPos = html.indexOf('class="classic-utility-bar"');
  const primaryPos = html.indexOf('class="classic-primary-bar"');
  assert.notEqual(utilityPos, -1);
  assert.notEqual(primaryPos, -1);
  assert.ok(utilityPos < primaryPos, "utility navigation must render before workflow actions");
});

test("classic mode exposes first-screen input, status chips and primary actions", () => {
  assert.match(html, /id="classicInputStateChip"/);
  assert.match(html, /id="classicResultStateChip"/);
  assert.match(html, /id="classicSourceStateChip"/);
  assert.match(html, /id="inputText"/);
  assert.match(html, /id="btnAiTranslate"[\s\S]*Собрать таблицу/);
  assert.match(html, /id="btnMainTts"[\s\S]*Озвучить/);
});

test("classic mode keeps table fine-tuning in a secondary advanced area", () => {
  assert.match(html, /id="btnTableCustomizeToggle"/);
  assert.match(html, /class="table-settings-advanced"/);
  assert.match(html, /id="tableEditToolbar"/);
  assert.match(html, /id="tableEditAddBtn"/);
});

test("classic mode provides trust-focused result workspace and static mode toggle", () => {
  assert.match(html, /id="classicResultTrust"/);
  assert.match(html, /id="classicResultSummary"/);
  assert.match(html, /id="classicResultWorkspace"/);
  assert.match(html, /class="[^"]*classic-export-actions[^"]*"/);
  assert.match(html, /class="classic-export-actions is-hidden"|classList\.toggle\("is-hidden"/);
  assert.match(html, /id="classicRowSheet"/);
  assert.match(html, /id="classicRowSheetPlay"/);
  assert.match(html, /id="classicRowSheetNote"/);
  assert.match(html, /\.v3-mode-toggle\s*\{[\s\S]*position:\s*static;/);
});

test("classic mode removes floating edit FAB and uses deeper mobile disclosure", () => {
  assert.doesNotMatch(html, /id="tableEditFab"/);
  assert.doesNotMatch(html, /#tableEditFab/);
  assert.match(html, /classic-result-workspace-summary/);
  assert.match(html, /@media \(max-width: 768px\)[\s\S]*classic-result-workspace-summary[\s\S]*display:\s*flex/);
});

test("classic mode user-facing copy no longer refers to AI translate label", () => {
  assert.doesNotMatch(html, /AI Перевод|AI перевод/);
});
