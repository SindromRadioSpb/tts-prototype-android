"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const progress = require(path.join(ROOT, "public/js/reader-progress.js"));

test("B8-I0 contract: every Reader entry seeds its session max from valid stored progress", () => {
  assert.equal(typeof progress.sessionProgressSeed, "function");
  assert.equal(progress.sessionProgressSeed({ last_row_idx: 80 }, 100), 80);
  assert.equal(progress.mergeProgress(progress.sessionProgressSeed({ last_row_idx: 80 }, 100), 10), 80,
    "opening a bookmark/FTS hit behind the furthest row must not lower durable progress on close");
  assert.equal(progress.sessionProgressSeed({ last_row_idx: 0 }, 100), -1);
  assert.equal(progress.sessionProgressSeed({ last_row_idx: 100 }, 100), -1,
    "a shrunk/re-imported text keeps the existing honest no-resume behavior");

  const ui = read("public/js/library-ui.js");
  const db = read("public/db/local-db.js");
  assert.match(ui, /seedReaderSessionProgress/);
  const open = ui.slice(ui.indexOf("async function openReader"), ui.indexOf("function maybeNudgeNiqqud"));
  assert.match(open, /await seedReaderSessionProgress\(readerTextId\)/);
  assert.match(open, /scrollToSentence/);
  assert.ok(open.indexOf("await seedReaderSessionProgress(readerTextId)") < open.indexOf("scrollToSentence(opts.scrollToSentence)"),
    "the stored seed must be loaded before a bookmark jump can set a lower session row");
  const writer = db.slice(db.indexOf("export async function setProgress"), db.indexOf("export async function setTextFinished"));
  assert.match(writer, /excluded\.last_row_idx >= text_progress\.last_row_idx/);
  assert.match(writer, /ELSE text_progress\.last_row_idx END/);
  assert.match(writer, /excluded\.last_row_idx = text_progress\.last_row_idx THEN COALESCE\(excluded\.last_step_id, text_progress\.last_step_id\)/);
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
  }
});
