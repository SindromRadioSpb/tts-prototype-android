"use strict";

// Owner 2026-09-25: on a phone the study screen belongs to the video and the table.
// Service chrome (source switcher, "playback by table timestamps", copyright notice,
// Studio edit toolbar) must not take the screen, and the end-of-text card must never
// squeeze or cover the last rows.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const libraryUi = read("public/js/library-ui.js");
const libraryHtml = read("public/library.html");
const indexHtml = read("public/index.html");
const sourceUi = read("public/js/study-video-source-ui.js");

test("working YouTube synchronization shows no service caption", () => {
  const sandbox = { window: {}, document: { documentElement: { lang: "ru" }, addEventListener() {} }, localStorage: { getItem() { return null; } } };
  sandbox.window.addEventListener = () => {};
  vm.runInNewContext(sourceUi, sandbox);
  const ui = sandbox.window.StudyVideoSourceUI;
  assert.equal(ui.playbackNote({ playbackReason: null }), "");
  assert.match(ui.playbackNote({ playbackReason: "PLAYBACK_TIMING_CHANGED" }), /изменились/,
    "a problem still earns a visible line");
  assert.match(libraryHtml, /\.room-media-note:empty \{ display: none; \}/);
  assert.match(indexHtml, /\.v3-media-note:empty \{ display: none; \}/);
});

test("Room source controls live in the Аа panel, not above the video", () => {
  assert.match(libraryUi, /host:roomPlaybackSettings/);
  assert.match(sourceUi, /const host=options\.host \|\| bar/);
  const aids = libraryUi.slice(libraryUi.indexOf("function buildAidsPanel"), libraryUi.indexOf("// labeled <select> helper"));
  assert.match(aids, /roomPlaybackSettings\.childElementCount/);
  for (const locale of ["ru", "en", "he"]) assert.match(read(`public/i18n/locales/${locale}.js`), /sourceSection:/);
});

test("the copyright notice moves into Аа instead of under the table", () => {
  const render = libraryUi.slice(libraryUi.indexOf("function roomRenderReaderCopyright"));
  assert.doesNotMatch(render.slice(0, 400), /host\.appendChild\(roomCopyrightNotice/);
  assert.match(libraryUi, /about\.appendChild\(roomCopyrightNotice\(/);
});

test("end-of-text card is the tail of the table scroller and survives rebuilds", () => {
  const endCard = libraryUi.slice(libraryUi.indexOf("async function renderEndOfTextCard"), libraryUi.indexOf("// ── B7 end-of-text handoff"));
  assert.match(endCard, /wrap\.insertBefore\(card, provNote\)/);
  assert.doesNotMatch(endCard, /provNote\.parentNode === reader/);
  const place = libraryUi.slice(libraryUi.indexOf("function roomPlaceProvNote"), libraryUi.indexOf("let roomColResize"));
  assert.match(place, /wrap\.insertBefore\(endCard, note\)/);
});

test("«Видео и строки» is offered only to own media materials", () => {
  const fn = libraryUi.slice(libraryUi.indexOf("function roomStudyVideoEligible"), libraryUi.indexOf("async function roomMediaSetup"));
  assert.match(fn, /isPublished\(meta\)\) return false/);
  assert.match(fn, /passportFromTextRow/);
  assert.match(libraryUi, /roomStudyVideoEligible\(textRow\)\) \{\n    studyButton\.hidden = false;/);
});

test("Studio edit toolbar is not pinned on phones outside edit mode", () => {
  assert.match(indexHtml, /body:not\(\.edit-mode-active\) #tableEditToolbar\.visible \{ position: static; \}/);
});
