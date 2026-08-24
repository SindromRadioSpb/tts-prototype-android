"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  VERSION,
  normalizeRows,
  normalizeLearnerLatinTranslit,
} = require("../public/js/table-niqqud-normalizer.js");

test("shared normalizer repairs the audited page-05 row without mutating its source", () => {
  const source = [{
    he: "אופנוע ומכונית נוסעים על כביש ישר ואופקי.",
    he_niqqud: "אֶוֹפַנּוֹעַ וּמְכוֹנִית נוֹסְעִים עַל כְּבִישׁ יָשָׁר וְאֹפְקִי.",
    translit: "Evofano'a umkhonit nose'im al kvish yashar ve'ofki.",
    ru: "Мотоцикл и автомобиль едут по прямой горизонтальной дороге.",
  }];

  const result = normalizeRows(source);

  assert.equal(VERSION, "table-niqqud-normalizer-v1");
  assert.equal(result.rows[0].he, source[0].he);
  assert.equal(result.rows[0].he_niqqud, "אוֹפַנּוֹעַ וּמְכוֹנִית נוֹסְעִים עַל כְּבִישׁ יָשָׁר וְאָפְקִי.");
  assert.equal(result.rows[0].translit, "Ofno'a umkhonit nose'im al kvish yashar ve'ofki.");
  assert.deepEqual(result.corrections.map((item) => item.field), ["he_niqqud", "he_niqqud", "translit"]);
  assert.notStrictEqual(result.rows[0], source[0]);
  assert.equal(source[0].he_niqqud, "אֶוֹפַנּוֹעַ וּמְכוֹנִית נוֹסְעִים עַל כְּבִישׁ יָשָׁר וְאֹפְקִי.");
});

test("learner-Latin cleanup covers cached and freshly transliterated variants", () => {
  assert.equal(normalizeLearnerLatinTranslit("Evofano'a"), "Ofno'a");
  assert.equal(normalizeLearnerLatinTranslit("ha'evofano'a"), "ha'ofno'a");
  assert.equal(normalizeLearnerLatinTranslit("Ofano'a"), "Ofno'a");
  assert.equal(normalizeLearnerLatinTranslit("Ve'afki"), "Ve'ofki");
});
