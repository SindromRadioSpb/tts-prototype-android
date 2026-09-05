"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const ui = read("public/js/library-ui.js");
const html = read("public/library.html");
const packet = read("docs/planning/ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md");

test("ROOM-LIBRARY-IA owner approval is normalized and migration-free", () => {
  assert.match(packet, /Status: `APPROVED_FOR_LOCAL_IMPLEMENTATION`/);
  for (const value of [
    "D1=C_GLOBAL_JOURNEY_ON_LIBRARY_HOME_CORPUS_LOCAL",
    "D2=B_CONSOLIDATED_READING_LISTS_MODULE",
    "D3=B_VERTICAL_COMPACT_ROWS_NO_HORIZONTAL_SCROLL",
    "D4=B_BOUNDED_PREVIEW_PLUS_SHOW_ALL",
    "D5=B_SHARED_TYPED_SECTION_HEADER_AND_DISCLOSURE",
    "D6=B_IMMEDIATE_SURFACE_ONLY_NO_MIGRATION",
    "MIGRATION=NONE",
    "SCOPE=IMMEDIATE_SURFACE_ONLY",
  ]) assert.match(packet, new RegExp(value));
});

test("D1 gives global journey projections to L0 and keeps Ben corpus-local", () => {
  const coordinator = ui.slice(
    ui.indexOf("function injectBenHomeRails"),
    ui.indexOf("async function paintBenProfileFit"),
  );
  assert.doesNotMatch(coordinator, /injectCorpusRails\(body\)/,
    "obsolete rails must not duplicate the current corpus-local browse surface");
  assert.match(coordinator, /injectSavedSearches\(body\)/);
  for (const globalProjection of [
    "injectContinueReading", "injectFinishedReading", "injectBookmarksShelf", "injectReadingListShelves",
  ]) assert.doesNotMatch(coordinator, new RegExp(`${globalProjection}\\(body\\)`));

  const hub = ui.slice(ui.indexOf("async function renderCorpusHub"), ui.indexOf("async function renderMyTextsCorpus"));
  assert.match(hub, /learningHomeJourney\(journeySummary\)/);
  assert.match(hub, /learningHomeReadingLists\(\)/);
});

test("D2 consolidates named lists without changing the v1 payload or creating a second writer", () => {
  assert.match(ui, /const READING_LISTS_KEY = 'corpus_reading_lists_v1'/);
  assert.match(ui, /function learningHomeReadingLists\(/);
  assert.match(ui, /function renameReadingList\(/);
  assert.match(ui, /function restoreItemToList\(/);
  assert.match(ui, /window\.confirm\(tt\('room\.corpus\.lists\.deleteConfirm'/);
  assert.match(ui, /roomToast\([\s\S]*room\.corpus\.lists\.undo/,
    "removing a work from a list must expose the existing-writer undo path");
  assert.match(ui, /if \(!resolved\.openable\) row\.removeAttribute\('aria-disabled'\)/,
    "an unavailable work must not disable the independent Remove-from-list action");
  assert.doesNotMatch(ui, /class: 'shelf-list-del'/,
    "a named list must not expose the old ambiguous bare close glyph");
  assert.doesNotMatch(ui, /class: 'readinglist-rm'/,
    "removing a work must be a labelled secondary action");
  assert.doesNotMatch(ui, /corpus_reading_lists_v2|reading_list_state|archiveReadingList|pinReadingList/,
    "immediate scope must keep the existing payload shape and defer pin/archive");
});

test("D3 uses full-width semantic rows for repeated material collections", () => {
  const recommendations = ui.slice(ui.indexOf("function buildMaterialRowSection"), ui.indexOf("function buildColdStartSection"));
  assert.match(recommendations, /room-preview-list/);
  assert.match(recommendations, /renderCorpusWorkRow/);
  assert.doesNotMatch(recommendations, /shelf-rail|renderCorpusCard/);
  assert.match(ui, /learning-journey-item room-material-row/);
  assert.match(ui, /classList\.add\('reading-list-material-row'\)/);
  assert.match(html, /\.room-material-row/);
});

test("D4 replaces bounded 48-row pages instead of growing long material DOM", () => {
  const paged = ui.slice(ui.indexOf("function appendPagedWorkRows"), ui.indexOf("// ── BRR S1/S2"));
  assert.match(paged, /ROOM_BROWSE_PAGE/);
  assert.match(paged, /list\.replaceChildren\(\)/);
  assert.match(paged, /activeOffset/);
  assert.doesNotMatch(paged, /cursor \+ CORPUS_PAGE|list\.appendChild[\s\S]*cursor = upTo/);

  const group = ui.slice(ui.indexOf("async function renderGroupCorpus"), ui.indexOf("// ── Multi-corpus surface"));
  assert.match(group, /groupBrowseOffset/);
  assert.match(group, /found\.slice\(groupBrowseOffset,groupBrowseOffset\+ROOM_BROWSE_PAGE\)/);
  assert.doesNotMatch(group, /groupBrowseLimit\+=ROOM_BROWSE_PAGE/);
});

test("D5 shares typed disclosure semantics and repaints them after locale changes", () => {
  const disclosure = ui.slice(ui.indexOf("function attachRoomLongListDisclosure"), ui.indexOf("function buildMaterialRowSection"));
  assert.match(disclosure, /toggle\.__roomDisclosureRepaint/);
  assert.match(ui, /function repaintRoomDisclosureLocale\(/);
  const localeHandler = ui.slice(ui.indexOf("lang.addEventListener('change'"), ui.indexOf("TRACKS.forEach", ui.indexOf("lang.addEventListener('change'")));
  assert.match(localeHandler, /requestAnimationFrame\([\s\S]*repaintRoomDisclosureLocale\(\)/);
  assert.match(html, /\.room-long-list-head > \.room-section-toggle/);
  assert.match(html, /html\[dir="rtl"\][\s\S]*room-material-row/);

  for (const locale of ["ru", "en", "he"]) {
    const source = read(`public/i18n/locales/${locale}.js`);
    for (const key of ["moduleTitle", "moduleIntro", "openList", "rename", "deleteAction", "deleteConfirm", "removeFromList", "undo", "deviceOnly", "page"]) {
      assert.match(source, new RegExp(`\\b${key}:`), `${locale} must define room.corpus.lists.${key}`);
    }
  }
});

test("production hotfix keeps explicit Room deep links authoritative", () => {
  const decode = ui.slice(
    ui.indexOf("function roomDecodeInitialPresentation"),
    ui.indexOf("function roomApplyStateFields"),
  );
  assert.match(decode, /presentationStateFromHash\(location\.hash\)/);
  assert.match(decode, /presentationStateMatchesHash\(history\.state, location\.hash\)/);
  assert.match(decode, /presentationStateMatchesHash\(mirrored, location\.hash\)/);
  assert.ok(decode.indexOf("presentationStateFromHash(location.hash)") < decode.indexOf("history.state && history.state.v === 1"),
    "the explicit URL route must be resolved before history/session restoration");
});
