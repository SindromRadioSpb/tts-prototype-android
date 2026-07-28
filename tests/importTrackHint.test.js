// tests/importTrackHint.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SI = require("../public/js/studio-import.js");

const T = (lang, kind, name) => ({ languageCode: lang, kind: kind, languageName: name });

test("manual Hebrew wins over everything, alphabet is irrelevant", () => {
  const list = [T("az", "", "Азербайджанский"), T("sq", "", "Албанский"),
                T("en", "", "Английский"), T("iw", "", "Иврит")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksHeManual");
  assert.equal(r.more, 3);
});

test("he code variant is recognised too", () => {
  assert.equal(SI.chooseTrackHint([T("he", "", "Hebrew")], true).key,
               "studio.import.captionsTracksHeManual");
});

test("auto Hebrew is named as auto, not as manual", () => {
  const r = SI.chooseTrackHint([T("en", "", "Английский"), T("iw", "asr", "Иврит")], true);
  assert.equal(r.key, "studio.import.captionsTracksHeAuto");
});

test("manual Hebrew beats auto Hebrew when both exist", () => {
  const r = SI.chooseTrackHint([T("iw", "asr", "Иврит"), T("iw", "", "Иврит")], true);
  assert.equal(r.key, "studio.import.captionsTracksHeManual");
});

test("no Hebrew: says so and lists at most three others", () => {
  const list = [T("en", "", "Английский"), T("de", "", "Немецкий"),
                T("fr", "", "Французский"), T("es", "", "Испанский")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksNoHe");
  assert.equal(r.langs.split(", ").length, 3);
  assert.equal(r.more, 1);
});

test("empty list: pending before confirmation, none after", () => {
  assert.equal(SI.chooseTrackHint([], false).key, "studio.import.captionsTracksPending");
  assert.equal(SI.chooseTrackHint([], true).key, "studio.import.captionsTracksNone");
  assert.equal(SI.chooseTrackHint(null, false).key, "studio.import.captionsTracksPending");
});

test("a track without name or code never renders as undefined", () => {
  const r = SI.chooseTrackHint([{ kind: "" }, T("en", "", "Английский")], true);
  assert.equal(r.key, "studio.import.captionsTracksNoHe");
  assert.ok(!/undefined/.test(r.langs || ""));
});
