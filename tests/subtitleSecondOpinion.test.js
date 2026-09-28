"use strict";
// O-033 tail, owner decision 2026-09-28 (a): only suspect subtitle lines go to Dicta, with consent
// once per build; only the suspect words may change, and only to a pointing that keeps the
// subtitle's letters and passes the same plausibility rules.
const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../public/js/subtitle-material-vocalization.js");
const P = require("../public/js/niqqud-plausibility.js");
const { transliterateWithProfile } = require("../db/premium/translit.js");

const deps = { wordFaults: P.wordFaults, transliterate: transliterateWithProfile, translitProfile: "learner-latin" };

test("an impossible word takes Dicta's plausible pointing; the rest of the line is untouched", () => {
  const rows = [
    { he: "שלום", he_niqqud: "שָׁלוֹם" },
    { he: "הוא תנגב את הכלים.", he_niqqud: "הוּא תְּנְגֵּב אֶת הַכֵּלִים.", translit: "old" },
  ];
  const suspects = P.scanRows(rows);
  assert.deepEqual(V.secondOpinionLines(rows, suspects), ["הוא תנגב את הכלים."]);
  // Dicta also points the neighbours differently; those are not suspect and must stay ours.
  const out = V.applySecondOpinion(rows, suspects, ["הוּא תְּנַגֵּב אֵת הַכֵּלִים."], deps);
  assert.equal(out.rows[1].he_niqqud, "הוּא תְּנַגֵּב אֶת הַכֵּלִים.");
  assert.equal(out.rows[1].translit, transliterateWithProfile(out.rows[1].he_niqqud, "learner-latin"));
  assert.equal(out.rows[1].niqqud_second_opinion, "dicta");
  assert.equal(out.replaced.length, 1);
  assert.equal(out.replaced[0].replacement, "תְּנַגֵּב");
  assert.equal(rows[1].he_niqqud, "הוּא תְּנְגֵּב אֶת הַכֵּלִים.", "input rows are not mutated");
  assert.equal(out.rows[0].he_niqqud, "שָׁלוֹם");
});

test("Dicta agreeing exactly confirms a loanword; a changed letter or another impossible pointing keeps ours", () => {
  const rows = [
    { he: "סטפן בא", he_niqqud: "סְטְפָן בָּא" },
    { he: "לסיבוב", he_niqqud: "לְסִּיבּוּב" },
    { he: "בקראטה", he_niqqud: "בְּקְרָאטָה" },
  ];
  const suspects = P.scanRows(rows);
  const out = V.applySecondOpinion(rows, suspects, ["סְטְפָן בָּא", "לְכִבּוּב", "בְּקְרָאטֶה"], deps);
  assert.deepEqual(out.confirmed.map((e) => e.word), ["סְטְפָן"]);
  assert.deepEqual(out.kept.map((e) => e.word), ["לְסִּיבּוּב", "בְּקְרָאטָה"],
    "Dicta read another letter in one and kept an impossible pointing in the other");
  assert.deepEqual(out.rows.map((r) => r.he_niqqud), rows.map((r) => r.he_niqqud));
  assert.equal(out.replaced.length, 0);
});

test("a missing or unusable answer changes nothing", () => {
  const rows = [{ he: "לסיבוב", he_niqqud: "לְסִּיבּוּב" }];
  const suspects = P.scanRows(rows);
  for (const answers of [[], [""], ["hello"], null]) {
    const out = V.applySecondOpinion(rows, suspects, answers, deps);
    assert.equal(out.rows[0].he_niqqud, "לְסִּיבּוּב");
    assert.equal(out.kept.length, 1);
  }
  const fixed = V.applySecondOpinion(rows, suspects, ["לְסִיבּוּב"], deps);
  assert.equal(fixed.rows[0].he_niqqud, "לְסִיבּוּב");
});

// Recorded Dicta Nakdan answers, 2026-09-28, for lines carrying the Sweet Mud model errors. Dicta
// answers in defective spelling; its points go back onto the subtitle's full spelling.
test("recorded Dicta answers fix all eight Sweet Mud words, full spelling kept", () => {
  const pairs = [
    ["הוא תנגב את הכלים", "הוּא תְּנְגֵּב אֶת הַכֵּלִים", "הוּא תְּנַגֵּב אֶת הַכֵּלִים"],
    ["אני הולך לקראטה", "אֲנִי הוֹלֵךְ לְקְרָאטָה", "אֲנִי הוֹלֵךְ לְקָרָטֶה"],
    ["נצא לסיבוב", "נֵצֵא לְסִּיבּוּב", "נֵצֵא לְסִבּוּב"],
    ["קנינו אפרסקים", "קָנִינוּ אַפְרְסְקִים", "קָנִינוּ אֲפַרְסְקִים"],
    ["תגיד לסטפן", "תַּגִּיד לְסְטֵפָן", "תַּגִּיד לִסְטֵפָן"],
    ["ספרנו את הכסף", "סְפְרֵנוּ אֶת הַכֶּסֶף", "סָפַרְנוּ אֶת הַכֶּסֶף"],
    ["נתראה בסוף לשבוע", "נִתְרָאֶה בַּסּוֹף לְשְׁבוּעַ", "נִתְרָאֶה בַּסּוֹף לְשָׁבוּעַ"],
    ["סטפן בא", "סְטְפָן בָּא", "סְטֵפָן בָּא"],
  ];
  const rows = pairs.map(([he, he_niqqud]) => ({ he, he_niqqud }));
  const out = V.applySecondOpinion(rows, P.scanRows(rows), pairs.map((p) => p[2]), deps);
  assert.equal(out.replaced.length, 8);
  assert.equal(out.kept.length, 0);
  assert.deepEqual(out.replaced.map((e) => e.replacement),
    ["תְּנַגֵּב", "לְקָרָאטֶה", "לְסִיבּוּב", "אֲפַרְסְקִים", "לִסְטֵפָן", "סָפַרְנוּ", "לְשָׁבוּעַ", "סְטֵפָן"]);
  for (const row of out.rows) assert.equal(V.plain(row.he_niqqud), V.plain(row.he), "letters of the subtitle never change");
  assert.deepEqual(P.scanRows(out.rows), []);
});

test("matres left out by Dicta are restored; a different letter is refused", () => {
  assert.equal(V.fillMatres("לקראטה", "לְקָרָטֶה"), "לְקָרָאטֶה");
  assert.equal(V.fillMatres("כול", "כֹּל"), "כּוֹל");
  assert.equal(V.fillMatres("קומקום", "קֻמְקֻם"), "קוּמְקוּם");
  assert.equal(V.fillMatres("לסיבוב.", "לְסִבּוּב"), "לְסִיבּוּב.");
  assert.equal(V.fillMatres("לסיבוב", "לְכִבּוּב"), null);
  assert.equal(V.fillMatres("ספר", "סְפָרִים"), null, "extra letters in the answer are a different word");
});

test("the Studio asks once before sending, sends only suspect lines, and the server accepts that purpose", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");
  const fn = src.slice(src.indexOf("async function secondOpinionForDoubtfulWords"), src.indexOf("material.preparationPlan = plan;"));
  assert.ok(fn.indexOf("window.confirm(") > 0 && fn.indexOf("window.confirm(") < fn.indexOf("fetch("), "consent precedes the request");
  assert.match(fn, /material\.dictaConsent == null/, "one question per build");
  assert.match(fn, /secondOpinionLines\(rows, suspects\)/);
  assert.match(fn, /purpose: "SUBTITLE_CHECK"/);
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(server, /\["IMPORT_PREVIEW", "LIBRARY_OWNER", "SUBTITLE_CHECK"\]\.includes\(purpose\)/);
});
