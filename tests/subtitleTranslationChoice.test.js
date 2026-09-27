"use strict";
// O-031c (2026-09-28, Sweet Mud): the Russian track was in sync but covered 82% of the Hebrew
// lines (it ends nine minutes earlier), below the 85% auto threshold. The owner picked it in
// "Change" and it was silently dropped, with the text "no suitable track"; English (94%) was not
// offered at all. A person's explicit choice is taken with its coverage stated.
const test = require("node:test");
const assert = require("node:assert/strict");
const SMC = require("../public/js/subtitle-material-core.js");

const HE = Array.from({ length: 20 }, (_, i) => ({ start: i * 4, end: i * 4 + 3, text: "שורה " + i }));
const RU_PARTIAL = HE.slice(0, 16).map((c, i) => ({ start: c.start, end: c.end, text: "строка " + i }));
const EN_FULL = HE.map((c, i) => ({ start: c.start, end: c.end, text: "line " + i }));
const tracks = () => [
  { index: 3, language: "ru", title: null, disposition: {}, cues: RU_PARTIAL },
  { index: 4, language: "en", title: null, disposition: {}, cues: EN_FULL },
  { index: 5, language: "he", title: null, disposition: {}, cues: HE },
];

test("automatic choice still refuses a partial translation and names what it saw", () => {
  const sel = SMC.selectTracks({ tracks: tracks(), targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(sel.translation_track, null);
  assert.equal(sel.reasons.translation, "translation_coverage_too_low");
  assert.equal(sel.translation_rejected.index, 3);
  assert.ok(Math.abs(sel.translation_rejected.coverage - 0.8) < 1e-9);
});

test("an explicit choice is taken below the threshold, with its coverage", () => {
  const sel = SMC.selectTracks({ tracks: tracks(), targetLanguage: "he", translationLanguage: "ru", trackChoices: { translation: 3 } });
  assert.equal(sel.translation_track.index, 3);
  assert.equal(sel.reasons.translation, "user_selected_track");
});

test("an explicit choice may be a track in another language", () => {
  const sel = SMC.selectTracks({ tracks: tracks(), targetLanguage: "he", translationLanguage: "ru", trackChoices: { translation: 4 } });
  assert.equal(sel.translation_track.index, 4);
  assert.equal(sel.translation_track.language, "en");
});

test("an explicit choice with no overlap at all is still refused", () => {
  const far = tracks();
  far[0].cues = RU_PARTIAL.map((c) => ({ ...c, start: c.start + 5000, end: c.end + 5000 }));
  const sel = SMC.selectTracks({ tracks: far, targetLanguage: "he", translationLanguage: "ru", trackChoices: { translation: 3 } });
  assert.equal(sel.translation_track, null);
});
