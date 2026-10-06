"use strict";
// O-033 tail, 2026-09-28: pointings no Hebrew word can have, from the Sweet Mud subtitle build.
// Reviewed Pealim forms are the false-positive gate: the rules only ask for a second look.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const zlib = require("node:zlib");
const path = require("node:path");
const P = require("../public/js/niqqud-plausibility.js");

test("Sweet Mud model errors are caught with their reason", () => {
  assert.deepEqual(P.wordFaults("תְּנְגֵּב"), ["INITIAL_DOUBLE_SHEVA"]);
  assert.deepEqual(P.wordFaults("בְּקְרָאטָה"), ["INITIAL_DOUBLE_SHEVA"]);
  assert.deepEqual(P.wordFaults("לְשְׁבוּעַ"), ["INITIAL_DOUBLE_SHEVA"]);
  assert.deepEqual(P.wordFaults("לְסִּיבּוּב"), ["DAGESH_AFTER_SHEVA"]);
  assert.deepEqual(P.wordFaults("אַפְרְסְקִים"), ["TRIPLE_SHEVA"]);
});

test("ordinary pointings pass", () => {
  for (const w of ["לְסִיבּוּב", "תְּנַגֵּב", "מִשְׁפָּט", "עַצְמְךְ", "אַתְּ", "הִתְפַּלְּלוּ", "שׁוּחְרְרוּ", "יְלָדִים",
    "בְּבָתֵּי", "וּבְכֵן", "אֲפַרְסְקִים", "שָׁלוֹם", "גָּבְהָהּ", "מִצְוָוה"]) {
    assert.deepEqual(P.wordFaults(w), [], w);
  }
});
test('final begadkefat and punctuation-separated quotation/stutter are not synthetic pointing faults', () => {
  for (const word of ['וַיֵּבְךְּ', 'זְ-זְּ-זֶה', 'בְּ"וְאֵלֶּה']) assert.deepEqual(P.wordFaults(word), [], word);
  assert.deepEqual(P.wordFaults('תְּנְגֵּב!'), ['INITIAL_DOUBLE_SHEVA']);
});

test("scan names word positions on the whitespace split, punctuation included", () => {
  assert.deepEqual(P.scan("הוּא תְּנְגֵּב  אֶת\nהַכֵּלִים."), [{ index: 1, word: "תְּנְגֵּב", reasons: ["INITIAL_DOUBLE_SHEVA"] }]);
  assert.deepEqual(P.scan("לְסִּיבּוּב."), [{ index: 0, word: "לְסִּיבּוּב.", reasons: ["DAGESH_AFTER_SHEVA"] }]);
  assert.deepEqual(P.scan("טקסט בלי ניקוד"), []);
  assert.deepEqual(P.scanRows([{ he_niqqud: "שָׁלוֹם" }, { he_niqqud: "בְּקְרָאטָה" }, {}]).map((r) => r.rowIndex), [1]);
});

test("reviewed Pealim forms: the doubling rule never fires, the others stay rare", () => {
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "../public/data/inflection/pealim-infl-v12.json.gz"))));
  const forms = new Set();
  for (const p of data.paradigms) {
    if (p.lemma_niqqud) forms.add(p.lemma_niqqud);
    for (const c of Object.values(p.cells || {})) if (c && c.he) for (const w of String(c.he).split(/[\s~־,/]+/)) if (w) forms.add(w);
  }
  const counts = {};
  for (const f of forms) for (const r of P.wordFaults(f)) counts[r] = (counts[r] || 0) + 1;
  assert.ok(forms.size > 200000);
  assert.equal(counts.DAGESH_AFTER_SHEVA || 0, 0);
  assert.ok((counts.INITIAL_DOUBLE_SHEVA || 0) <= 2, JSON.stringify(counts));
  assert.ok((counts.TRIPLE_SHEVA || 0) <= 30, JSON.stringify(counts));
});

test("table marks skip confirmed words and rows whose niqqud the owner edited", () => {
  const M = require("../public/js/niqqud-suspect-marks.js");
  assert.equal(M.key("לְסִּיבּוּב."), "לְסִּיבּוּב");
  assert.deepEqual(M.suspects("סְטְפָן תְּנְגֵּב", new Set([M.key("סְטְפָן")]), P).map((s) => s.index), [1]);
  assert.deepEqual(M.suspects("שָׁלוֹם", new Set(), P), []);
  assert.equal(M.editedNiqqud({ edit_meta_json: JSON.stringify({ edited: { he_niqqud: true } }) }), true);
  assert.equal(M.editedNiqqud({ edit_meta_json: JSON.stringify({ edited: { ru: true } }) }), false);
  assert.equal(M.editedNiqqud(null), false);
});

test("new table strings exist in every locale (the tt fallback is dead)", () => {
  for (const lang of ["ru", "en", "he"]) {
    const src = fs.readFileSync(path.join(__dirname, `../public/i18n/locales/${lang}.js`), "utf8");
    for (const k of ["niqqudSuspect:", "niqqudSuspectINITIAL_DOUBLE_SHEVA:", "niqqudSuspectDAGESH_AFTER_SHEVA:",
      "niqqudSuspectTRIPLE_SHEVA:", "ladderStepNiqqudCheck:", "dictaConsent:", "dictaChecked:", "dictaDeclined:",
      "dictaSignIn:", "dictaFailed:"]) assert.ok(src.includes(k), `${lang} ${k}`);
  }
});
