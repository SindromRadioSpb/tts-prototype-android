"use strict";
// Owner decision 2026-09-28 (O-032): Hebrew subtitles often come in "visual order" for players
// without RTL support - the full stop leads the line (".נקודה") and a dialogue dash trails it.
// Sweet Mud had 427 of 546 rows like that, Ushpizin was fixed by hand. Import restores the
// logical order line by line; the raw track stays untouched as evidence.
const test = require("node:test");
const assert = require("node:assert/strict");
const SMC = require("../public/js/subtitle-material-core.js");

const cue = (text, i = 0) => ({ start: i, end: i + 1, text });

test("a visual-order track gets its punctuation back at the end and dashes at the start", () => {
  const input = [
    cue("התנועה הקיבוצית הוקמה בארץ\n.בשנות ה-20", 0),
    cue(".נקודה", 1),
    cue("?מה אתה אומר", 2),
    cue("...אפשר לקבל לפחות", 3),
    cue("שלום לכם -\n!תודה -", 4),
    cue(",אפרסקים", 5),
  ];
  const out = SMC.normalizeVisualPunctuation(input);
  assert.equal(out.applied, true);
  assert.deepEqual(out.cues.map((c) => c.text), [
    "התנועה הקיבוצית הוקמה בארץ\nבשנות ה-20.",
    "נקודה.",
    "מה אתה אומר?",
    "אפשר לקבל לפחות...",
    "- שלום לכם\n- תודה!",
    "אפרסקים,",
  ]);
  assert.equal(out.lines, 7);
  assert.equal(input[1].text, ".נקודה", "the source cues are not mutated");
  assert.deepEqual(out.cues.map((c) => c.start), [0, 1, 2, 3, 4, 5]);
});

test("a track already in logical order is left alone", () => {
  const input = [cue("שלום, מה שלומך?"), cue("...ואז הלכנו"), cue("טוב מאוד."), cue("- כן.\n- לא.")];
  const out = SMC.normalizeVisualPunctuation(input);
  assert.equal(out.applied, false);
  assert.equal(out.lines, 0);
  assert.deepEqual(out.cues.map((c) => c.text), input.map((c) => c.text));
});

test("lines without Hebrew keep their text", () => {
  const out = SMC.normalizeVisualPunctuation([cue(".שלום"), cue(".עוד"), cue("[music]."), cue("...")]);
  assert.equal(out.applied, true);
  assert.deepEqual(out.cues.map((c) => c.text), ["שלום.", "עוד.", "[music].", "..."]);
});

// O-033 tail, 2026-09-28: 15 Sweet Mud lines like ".לבוא" kept their stop at the start because the
// quote hid the run from the rule. A stop in the run marks it as the mirrored line end.
test("a quote in the leading run moves with the stop; a lone opening quote stays", () => {
  const out = SMC.normalizeVisualPunctuation([cue("\".לבוא"), cue(".נקודה"), cue("\"שלום לכם"), cue("?\"באמת"), cue("\"")]);
  assert.equal(out.applied, true);
  assert.deepEqual(out.cues.map((c) => c.text), ["לבוא.\"", "נקודה.", "\"שלום לכם", "באמת\"?", "\""]);
  assert.equal(out.lines, 3);
});
