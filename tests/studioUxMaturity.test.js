const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const StudioImportCore = require("../public/js/studio-import.js");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const studioImport = fs.readFileSync(path.join(root, "public", "js", "studio-import.js"), "utf8");
const mediaPackage = fs.readFileSync(path.join(root, "public", "js", "studio-media-package.js"), "utf8");
const portableUi = fs.readFileSync(path.join(root, "public", "js", "studio-portable-learning-package.js"), "utf8");
const libraryHtml = fs.readFileSync(path.join(root, "public", "library.html"), "utf8");
const libraryUi = fs.readFileSync(path.join(root, "public", "js", "library-ui.js"), "utf8");
const locales = Object.fromEntries(["ru", "en", "he"].map((locale) => [
  locale,
  fs.readFileSync(path.join(root, "public", "i18n", "locales", `${locale}.js`), "utf8"),
]));

test("B1 exposes one semantic recommended next-step control", () => {
  assert.match(html, /id="classicNextStep"/);
  assert.match(html, /id="classicNextActionBtn"[^>]*data-studio-primary="true"/);
  assert.match(html, /function classicRunNextAction\(\)/);
  assert.match(html, /t\("classic\.nextAction\." \+ action\)/);
  assert.match(html, /action = "(?:add|correct|table|save|library)"/);
  for (const source of Object.values(locales)) assert.match(source, /nextAction:\s*\{\s*add:[\s\S]*table:[\s\S]*save:[\s\S]*library:/);
});

test("B1 source projection accepts an import passport only for its exact text snapshot", () => {
  assert.match(html, /function classicCurrentImportMeta\(text\)/);
  assert.match(html, /String\(meta\.textSnapshot\s*\|\|\s*""\)\.trim\(\)\s*!==\s*text/);
  assert.match(html, /if \(classicCurrentImportMeta\(before\)\) return classicSyncStateUi\(\)/);
  assert.match(html, /studio:source-context-changed/);
  assert.match(studioImport, /window\.v3LastImportMeta\s*=\s*importMeta;[\s\S]*studio:source-context-changed/);
  assert.match(mediaPackage, /studio:source-context-changed/);
  assert.match(html, /classic\.source\.youtubeCaptions/);
  assert.match(html, /classic\.source\.media/);
  assert.match(html, /classic\.source\.article/);
});

test("B1 distinguishes browser-local drafts from Import Center materials", () => {
  for (const source of Object.values(locales)) {
    assert.match(source, /workspaceLibrary:\s*"(?:Черновики|Drafts|טיוטות)"/);
    assert.match(source, /workspaceImportCenter:/);
  }
  assert.match(mediaPackage, /StudioImport\.open\(\)/);
  assert.match(mediaPackage, /StudioImport\.switchTab\("file"\)/);
  assert.doesNotMatch(mediaPackage, /openWorkspaceLibrary\(\)[\s\S]{0,220}PortableLearningPackage\.open\(\{ view: 'materials' \}\)/);
});

test("Add Material owns focus while open and restores it when closed", () => {
  assert.match(studioImport, /previouslyFocusedElement/);
  assert.match(studioImport, /\.inert\s*=\s*true/);
  assert.match(studioImport, /event\.key\s*===\s*"Escape"/);
  assert.match(studioImport, /event\.key\s*!==\s*"Tab"/);
  assert.match(studioImport, /var returnTo = previouslyFocusedElement;[\s\S]*returnTo\.focus/);
});

test("subtitle and media file pickers are native keyboard-operable buttons", () => {
  assert.match(html, /id="v3ImportCaptionsPicker"[^>]*onclick="document\.getElementById\('v3ImportCaptionsFile'\)\.click\(\)"/);
  assert.match(html, /id="v3ImportAudioPicker"[^>]*onclick="document\.getElementById\('v3ImportAudio'\)\.click\(\)"/);
  assert.doesNotMatch(html, /<label class="v3-import-file-btn">[\s\S]{0,240}id="v3Import(?:CaptionsFile|Audio)"/);
});

test("B1 carries landmark, contrast, target-size and accessible-name contracts", () => {
  assert.match(html, /class="main-card classic-main-card"[^>]*role="main"/);
  assert.match(html, /\.classic-nav-label\s*\{[\s\S]{0,240}var\(--theme-text-secondary/);
  assert.match(html, /#classicNextActionBtn\s*\{[\s\S]{0,240}min-height:\s*48px/);
  assert.match(html, /\.v3-import-file-btn[\s\S]{0,240}min-height:\s*(?:4[4-9]|[5-9]\d)px/);
  assert.match(html, /data-i18n-aria-label="studio\.localMt\.btnTitle"/);
  for (const source of Object.values(locales)) {
    assert.match(source, /btnTitle:\s*"MT\s*[—-]/);
    assert.match(source, /composerMetaChars:/);
    assert.match(source, /resultMetaCurrent:/);
    assert.match(source, /voiceAuto:/);
    assert.match(source, /translitSbl:/);
  }
});

test("Reading Room restores the canonical exact media binding before deriving row timing", () => {
  assert.match(libraryHtml, /<script src="\/js\/media-package-core\.js"><\/script>/);
  assert.match(libraryHtml, /<script src="\/js\/media-package-repository\.js"><\/script>/);
  assert.match(libraryHtml, /<script src="\/js\/studio-media-package\.js"><\/script>/);
  assert.match(libraryUi, /StudioMediaPackage\.activateTextBinding\(String\(textId\)\)/);
  assert.match(libraryUi, /MediaHost\.pickExactBindingPassport\(/);
});

test("B2 Downr handoff is bounded, honest, replaceable and discardable", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const now = Date.parse("2026-08-11T08:00:00.000Z");
  const first = StudioImportCore.writeDownrIntent(storage, "abcdefghijk", now);
  assert.deepEqual(Object.keys(first).sort(), ["created_at_ms", "expires_at_ms", "next_action", "video_id"]);
  assert.equal(first.next_action, "choose-downloaded-media");
  assert.equal(StudioImportCore.readDownrIntent(storage, now + 1000).video_id, "abcdefghijk");
  StudioImportCore.writeDownrIntent(storage, "ZYXWVUTSRQP", now + 2000);
  assert.equal(StudioImportCore.readDownrIntent(storage, now + 3000).video_id, "ZYXWVUTSRQP", "a newer link replaces the older intent");
  assert.equal(StudioImportCore.readDownrIntent(storage, now + 24 * 60 * 60 * 1000 + 2001), null, "expired intent is removed");
  StudioImportCore.writeDownrIntent(storage, "abcdefghijk", now);
  StudioImportCore.discardDownrIntent(storage);
  assert.equal(StudioImportCore.readDownrIntent(storage, now), null);
});

test("B2-B5 UI exposes return recovery, compact mobile navigation and Room continuation", () => {
  assert.match(html, /id="v3DownrDiscard"/);
  assert.match(studioImport, /readDownrIntent\(window\.localStorage/);
  assert.match(studioImport, /studio\.remoteMedia\.returnRemembered/);
  assert.match(html, /id="classicSecondaryNav"[^>]*class="classic-secondary-nav"/);
  assert.match(html, /id="classicPhaseLabel"/);
  assert.match(html, /action = "learn"/);
  assert.match(html, /room=1#\/t\//);
  assert.match(html, /body\.room-mode #classicNextStep\s*\{\s*display:\s*none !important;\s*\}/,
    "the Studio completion CTA must not leak into an already-open Reading Room");
  assert.match(html, /id="v3ImportAudioProviderTruth"/);
  assert.match(portableUi, /mergeLifecycleCatalog\(materials,workspaces,now\)/);
  assert.match(portableUi, /data-filter="draft"/);
  assert.match(portableUi, /workspaceDraftTruth/);
  for (const source of Object.values(locales)) {
    assert.match(source, /returnRemembered:/);
    assert.match(source, /discardReturn:/);
    assert.match(source, /providerTruthCloud:/);
    assert.match(source, /providerTruthLocal:/);
    assert.match(source, /nextAction:\s*\{[\s\S]*learn:/);
  }
});
