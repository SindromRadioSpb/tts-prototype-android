const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("classic mode separates utility navigation from workflow actions", () => {
  assert.match(html, /class="classic-utility-bar"[\s\S]*id="btnLibrary"/);
  assert.match(html, /class="classic-utility-bar"[\s\S]*id="btnDashboard"/);
  assert.match(html, /class="classic-utility-bar"[\s\S]*id="btnSrsTrainer"/);
  assert.match(html, /class="classic-header-top"[\s\S]*id="v3ModeToggle"/);

  const utilityPos = html.indexOf('class="classic-utility-bar"');
  const togglePos = html.indexOf('id="v3ModeToggle"');
  const primaryPos = html.indexOf('class="classic-primary-bar"');
  assert.notEqual(utilityPos, -1);
  assert.notEqual(togglePos, -1);
  assert.notEqual(primaryPos, -1);
  assert.ok(togglePos < utilityPos, "mode toggle must render beside Classic Mode, before utility navigation");
  assert.ok(utilityPos < primaryPos, "utility navigation must render before workflow actions");
});

test("classic mode exposes first-screen input, status chips and primary actions", () => {
  assert.match(html, /id="classicInputStateChip"/);
  assert.match(html, /id="classicResultStateChip"/);
  assert.match(html, /id="classicSourceStateChip"/);
  assert.match(html, /id="classicStatusStrip"/);
  assert.match(html, /id="classicComposerPanel"/);
  assert.match(html, /id="classicResultPanel"/);
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

test("classic mode applies mobile-only compact layout contracts", () => {
  assert.match(html, /class="classic-status-strip-summary"[^>]*>Лимиты и квоты<\/summary>/);
  assert.match(html, /function classicSyncServiceStripState\(\)/);
  assert.match(html, /function classicSyncMainPanels\(options\)/);
  assert.match(html, /classicStatusStripEl\.open = saved === "1"/);
  assert.match(html, /classic-mobile-panel-summary/);
  assert.match(html, /classicComposerPanelMeta/);
  assert.match(html, /classicResultPanelMeta/);
  assert.match(html, /classic-composer-tools[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(html, /classic-primary-actions[\s\S]*flex-wrap:\s*nowrap/);
  assert.match(html, /classic-export-actions #btnAudioPrefetch,\s*[\s\S]*#btnAnki \{ display:\s*none !important;/);
  assert.match(html, /table-presets[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});

test("classic mode keeps a contextual mobile edit FAB and deeper mobile disclosure", () => {
  assert.match(html, /id="tableEditFab"/);
  assert.match(html, /function tableEditFabUpdate\(\)/);
  assert.match(html, /shouldShow = isMobile && toolbarVisible && !rowSheetOpen/);
  assert.match(html, /@media \(pointer: coarse\) and \(max-width: 768px\)[\s\S]*#tableEditFab\.fab-visible/);
  assert.match(html, /right:\s*calc\(18px \+ env\(safe-area-inset-right, 0px\)\)/);
  assert.match(html, /bottom:\s*calc\(24px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(html, /classic-result-workspace-summary/);
  assert.match(html, /@media \(max-width: 768px\)[\s\S]*classic-result-workspace-summary[\s\S]*display:\s*flex/);
  assert.match(html, /classicSyncMainPanels\(\{ force: true \}\)/);
  assert.match(html, /classicRememberMobileDisclosureChoice\(classicComposerPanelEl\)/);
});

test("classic mode user-facing copy no longer refers to AI translate label", () => {
  assert.doesNotMatch(html, /AI Перевод|AI перевод/);
});
