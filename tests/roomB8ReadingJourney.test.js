"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const progress = require(path.join(ROOT, "public/js/reader-progress.js"));

test("B8-D2 owner-live correction: Continue follows the last worked row, including backward study", () => {
  assert.equal(typeof progress.workingTarget, "function");
  assert.equal(progress.workingTarget({ last_row_idx: 0 }, 100), 0,
    "row 0 remains a valid persistent working-row marker");
  assert.equal(progress.resumeTarget({ last_row_idx: 0 }, 100), null,
    "row 0 needs no separate Continue affordance");
  assert.equal(typeof progress.latestProgress, "function");
  assert.equal(progress.latestProgress(80, 10), 10,
    "working at an earlier paragraph must replace the previous resume row");
  assert.equal(progress.latestProgress(10, 34), 34,
    "working later again must replace the earlier resume row");
  assert.equal(progress.latestProgress(80, 0), 0,
    "the first row is a valid intentional last-worked position");
  assert.equal(progress.latestProgress(10, null), 10,
    "a missing observation must not erase the last valid working row");
  assert.equal(progress.mergeProgress(80, 10), 80,
    "the separate session-only furthest signal remains available for the end-of-text prompt");

  const ui = read("public/js/library-ui.js");
  const db = read("public/db/local-db.js");
  assert.match(ui, /loadReaderResumeProgress/);
  const open = ui.slice(ui.indexOf("async function openReader"), ui.indexOf("function maybeNudgeNiqqud"));
  assert.match(open, /await loadReaderResumeProgress\(readerTextId\)/);
  assert.match(open, /scrollToSentence/);
  assert.ok(open.indexOf("await loadReaderResumeProgress(readerTextId)") < open.indexOf("scrollToSentence(opts.scrollToSentence)"),
    "resume data is loaded before choosing the explicit bookmark or normal-resume route");
  assert.match(ui, /let _sessionLastRow = -1, _sessionFurthestRow = -1/,
    "durable last place and session-only completion evidence must not be conflated");
  const flush = ui.slice(ui.indexOf("async function flushReaderProgress"), ui.indexOf("function readerBarOffset"));
  assert.match(flush, /if \(idx < 0\)/,
    "a quick close at row 0 must persist that position instead of retaining a stale deeper anchor");
  assert.doesNotMatch(flush, /currentTopRowIdx|recordProgress\(top\)/,
    "closing after passive context browsing must not promote the top-visible row to working position");
  const writer = db.slice(db.indexOf("export async function setProgress"), db.indexOf("export async function setTextFinished"));
  assert.match(writer, /last_row_idx\s*=\s*excluded\.last_row_idx/);
  assert.match(writer, /last_step_id\s*=\s*excluded\.last_step_id/);
  assert.doesNotMatch(writer, /excluded\.last_row_idx\s*>=\s*text_progress\.last_row_idx/,
    "the durable writer must accept an intentional backward working position");
  const journeyItem = ui.slice(ui.indexOf("function renderReadingJourneyItem"), ui.indexOf("function learningHomeJourney"));
  assert.match(journeyItem, /kind === 'bookmark'[\s\S]*scrollToSentence/,
    "an explicit passage bookmark remains its own navigation fact");
  assert.match(ui, /room\.resume\.positionPercent/,
    "last position must not be labelled as percentage already read");
  const restore = ui.slice(ui.indexOf("function restoreReaderPosition"), ui.indexOf("// ── BRR Epic 5"));
  assert.match(restore, /workingTarget/);
  assert.match(restore, /setCurrentWorkingRow\(workingTarget\)/,
    "reload must repaint a valid row-0 working position without inventing a resume banner");
  assert.match(ui, /role: 'meter'[\s\S]*room\.home\.readingPosition/,
    "the Learning Home scalar is a text position, not completion progress");
});

test("ROW-HIGHLIGHT B: Room projects one persistent working row under playback", () => {
  const ui = read("public/js/library-ui.js");
  const room = read("public/library.html");
  const studio = read("public/index.html");

  assert.match(ui, /function setCurrentWorkingRow\(idx\)/,
    "Room needs one derived working-row projection over canonical progress");
  const projection = ui.slice(ui.indexOf("function setCurrentWorkingRow"), ui.indexOf("// B8-D2 owner-live correction"));
  assert.match(projection, /rm-row-current/);
  assert.match(projection, /aria-current[^\n]*location/,
    "the visual current row must also expose semantic location");
  assert.doesNotMatch(projection, /localDb\.|setProgress|localStorage|sessionStorage/,
    "the projection must not become a second position writer");
  const recorder = ui.slice(ui.indexOf("function recordProgress"), ui.indexOf("async function flushReaderProgress"));
  assert.match(recorder, /setCurrentWorkingRow\(_sessionLastRow\)/,
    "every canonical working-position observation must repaint the current row");
  assert.match(ui, /if \(_roomReaderPresentationReadOnly\) return;[\s\S]{0,180}Date\.now\(\) < _programmaticProgressUntil/,
    "late presentation-settling scroll must not replace the restored semantic row");
  const onScroll = ui.slice(ui.indexOf("const onScroll = () =>"), ui.indexOf("window.addEventListener('scroll', onScroll"));
  assert.match(onScroll, /maybeShowEndOfText\(\)/,
    "passive scroll still owns the honest end-of-text visibility observation");
  assert.doesNotMatch(onScroll, /recordProgress|currentTopRowIdx/,
    "passive page or media-table scroll must not move the canonical working row");
  const onRowEngage = ui.slice(ui.indexOf("const onRowEngage = (event) =>"), ui.indexOf("window.addEventListener('keydown', onScrollKey)"));
  assert.match(onRowEngage, /pointerdown/);
  assert.match(onRowEngage, /focusin/);
  assert.match(onRowEngage, /recordProgress\(idx\)/,
    "an intentional pointer or keyboard row engagement remains a canonical writer");
  assert.match(ui, /tr\.row-playing, #proTable tbody tr\.smk-row-active, #proTable tbody tr\.rm-row-current/,
    "hidden study actions follow playback first and the persistent working row second");

  assert.match(room, /#roomReader #roomReaderTable #proTable tbody tr\.rm-row-current:not\(\.row-error\)/,
    "Room owns a sufficiently scoped warm-row treatment that wins over shared hover/focus states");
  assert.match(room, /tr\.smk-row-active:not\(\.row-error\) td:first-child,[\s\S]{0,220}box-shadow/,
    "media playback adds a non-colour rail over the same warm base");
  assert.doesNotMatch(studio, /rm-row-current/,
    "READING_ROOM_ONLY must not leak the new state into Studio");
});

test("B8-I0 contract: journey projections are typed, bounded and read-only over canonical stores", () => {
  const db = read("public/db/local-db.js");
  const ui = read("public/js/library-ui.js");
  const schema = read("public/db/migrations.js");

  assert.match(db, /export async function getReadingJourneySummary/);
  assert.match(db, /export async function listReadingJourneyItems/);
  const journeyStart = db.indexOf("// ── B8 Reading Journey projections");
  const journeyDb = db.slice(journeyStart, db.indexOf("// ── progress", journeyStart));
  assert.match(journeyDb, /Math\.min\([^\n]*48/);
  assert.match(journeyDb, /LIMIT \? OFFSET \?/);
  assert.match(journeyDb, /options\.sourceKind/);
  assert.match(journeyDb, /notes_v2/);
  assert.match(journeyDb, /note_occurrences/);
  assert.match(journeyDb, /bookmarks/);
  assert.match(journeyDb, /finished_at/);
  assert.doesNotMatch(journeyDb, /source_text|body_json\s+AS|review_log/,
    "home/list projections must not fetch content bodies or touch learner-event truth");

  assert.match(ui, /function journeyWorkRef/);
  assert.match(ui, /function learningHomeJourney/);
  assert.match(ui, /data-journey-kind/);
  assert.match(ui, /learning-journey-filters/);
  assert.match(ui, /learning-journey-pager/);
  assert.match(ui, /room\.home\.journeyDevice/);
  assert.doesNotMatch(schema, /reading_journey|journey_state/,
    "MIGRATION=NONE: B8 must not create a journey truth table");
});

test("B8-I0 contract: RU, HE and EN own the recovery and typed-view copy", () => {
  for (const locale of ["ru", "he", "en"]) {
    const source = read(`public/i18n/locales/${locale}.js`);
    for (const key of ["journeyTitle", "journeyBookmarks", "journeyFinished", "journeyNotes", "journeyDevice", "journeyEmpty", "journeySourceFilters", "journeySourceAll", "journeyPages", "journeyPage"]) {
      assert.match(source, new RegExp(`\\b${key}:`), `${locale} must define room.home.${key}`);
    }
    assert.match(source, /\bpositionPercent:/, `${locale} must define room.resume.positionPercent`);
    assert.match(source, /\breadingPosition:/, `${locale} must define room.home.readingPosition`);
  }
});
