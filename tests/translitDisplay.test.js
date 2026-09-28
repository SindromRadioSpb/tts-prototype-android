"use strict";
// O-033, 2026-09-28: a Gemini-built trigonometry card stored only learner Latin; switching the
// Studio profile to "Russian phonetics" changed nothing, and "SBL" showed learner Latin under an
// SBL header. The column is derived from the pointed text for the selected profile.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../public/js/translit-display.js");
const { transliterateWithProfile: T } = require("../db/premium/translit.js");

const row = { he_niqqud: "שָׁלוֹם לָכֶם", translit: "Shalom lakhem", translit_ru: "" };

test("every profile is derived from the pointed text, not from the stored column", () => {
  const show = D.createDisplay(T);
  assert.equal(show(row, "ru-phonetic"), T(row.he_niqqud, "ru-phonetic"));
  assert.equal(show(row, "sbl"), T(row.he_niqqud, "sbl"));
  assert.equal(show(row, "learner-latin"), T(row.he_niqqud, "learner-latin"));
  assert.notEqual(show(row, "sbl"), row.translit);
});

test("a hand-edited cell is shown as the person wrote it", () => {
  const show = D.createDisplay(T);
  const edited = { ...row, translit: "Shalom lakhem (my note)", edit_meta_json: JSON.stringify({ edited: { translit: true } }) };
  assert.equal(show(edited, "learner-latin"), "Shalom lakhem (my note)");
  const editedRu = { ...row, translit_ru: "шалом", edit_meta_json: { edited: { translit_ru: true } } };
  assert.equal(show(editedRu, "ru-phonetic"), "шалом");
});

test("without niqqud or an engine the stored text stays", () => {
  assert.equal(D.createDisplay(T)({ translit: "abc", he_niqqud: "" }, "sbl"), "abc");
  assert.equal(D.createDisplay(null)(row, "ru-phonetic"), "Shalom lakhem");
});

test("the Studio renders the column through the display and loads it in the shell", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8");
  assert.match(html, /<script src="\/js\/translit-display\.js\?v=\d+"><\/script>/);
  assert.match(html, /v3TranslitDisplay\(row, _tProfile\)/);
  assert.match(sw, /"\/js\/translit-display\.js\?v=\d+"/);
});
