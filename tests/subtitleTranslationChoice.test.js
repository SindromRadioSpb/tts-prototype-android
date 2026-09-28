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

// O-033 (2026-09-28): the choice lived only in the open dialog, so the rebuild of the same film
// silently fell back to the automatic refusal and the card came out with an empty translation.
const withSha = () => tracks().map((t) => ({ ...t, sha256: String(t.index).repeat(64) }));

test("the same subtitle inventory gives the same choice key, in any track order", () => {
  const key = SMC.trackChoiceKey(withSha());
  assert.match(key, /^subtitle-tracks:/);
  assert.equal(SMC.trackChoiceKey(withSha().reverse()), key);
  const other = withSha(); other[0].sha256 = "f".repeat(64);
  assert.notEqual(SMC.trackChoiceKey(other), key);
  const unknown = withSha(); delete unknown[1].sha256;
  assert.equal(SMC.trackChoiceKey(unknown), null, "no key without every track's content hash");
});

test("a remembered choice is restored only onto tracks that still exist", () => {
  assert.deepEqual(SMC.restoreTrackChoices({ text: 5, translation: 3 }, withSha()), { text: 5, translation: 3 });
  assert.deepEqual(SMC.restoreTrackChoices({ text: 9, translation: 3 }, withSha()), { translation: 3 });
  assert.equal(SMC.restoreTrackChoices({ text: 9 }, withSha()), null);
  assert.equal(SMC.restoreTrackChoices(null, withSha()), null);
  assert.equal(SMC.restoreTrackChoices({ translation: "3" }, withSha()), null, "only integer indexes");
});
