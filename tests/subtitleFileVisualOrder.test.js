// tests/subtitleFileVisualOrder.test.js — O-095: a chosen .srt gets the same visual-order repair
// as a container track, before cues are merged (merging needs the real sentence ends).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const CP = require("../public/js/captions-parse.js");
const SMC = require("../public/js/subtitle-material-core.js");

const VISUAL = [
  "1", "00:00:17,700 --> 00:00:22,800", "טוב, מי יכול להגיד לי מה", "?ההבדל בין חרדון לבין שממית", "",
  "2", "00:00:23,000 --> 00:00:24,700", "?שהוא יונק", "",
  "3", "00:00:24,900 --> 00:00:27,300", ".לא משה, הוא לא יונק", "",
  "4", "00:00:27,400 --> 00:00:31,600", ",שממית אם תולשים לה תזנב", ".מגדלת זנב חדש תוך עשר שעות", "",
].join("\r\n");

test("visual-order Hebrew file: punctuation returns to the end and sentences split there", () => {
  const r = CP.parse(VISUAL, { normalizeCueLines: SMC.normalizeVisualPunctuation });
  assert.equal(r.ok, true);
  assert.equal(r.visualPunctuationLines, 5);
  assert.deepEqual(r.segments.map((s) => s.text), [
    "טוב, מי יכול להגיד לי מה ההבדל בין חרדון לבין שממית?",
    "שהוא יונק?",
    "לא משה, הוא לא יונק.",
    "שממית אם תולשים לה תזנב, מגדלת זנב חדש תוך עשר שעות.",
  ]);
});

test("logical-order file is left alone", () => {
  const logical = "1\n00:00:01,000 --> 00:00:02,000\nשלום, מה שלומך?\n\n2\n00:00:03,000 --> 00:00:04,000\nטוב.\n";
  const r = CP.parse(logical, { normalizeCueLines: SMC.normalizeVisualPunctuation });
  assert.equal(r.visualPunctuationLines, 0);
  assert.deepEqual(r.segments.map((s) => s.text), ["שלום, מה שלומך?", "טוב."]);
});

test("without the hook the parser behaves as before", () => {
  const r = CP.parse(VISUAL);
  assert.equal(r.visualPunctuationLines, undefined);
  assert.match(r.segments[0].text, /^טוב, מי יכול/);
});
