"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Vocalization = require("../public/js/subtitle-material-vocalization.js");
const canonical = require("../db/premium/translit.js");

test("subtitle columns are derived locally without changing source or translation", async () => {
  const source = Array.from({ length: 17 }, (_, i) => ({ segment_index: i, he: "שלום עולם", ru: "Привет мир" }));
  const calls = [];
  const result = await Vocalization.enrich(source, {
    client: { vocalizeTexts: async (texts) => { calls.push(texts.length); return { results: texts.map(() => "שְׁלוֹם עוֹלָם"), model_version: "local-test" }; } },
    transliterate: canonical.transliterateWithProfile,
  });
  assert.deepEqual(calls, [16, 1]);
  assert.equal(result.vocalized, 17);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.rows[0].he, source[0].he);
  assert.equal(result.rows[0].ru, source[0].ru);
  assert.match(result.rows[0].niqqud, /[\u05b0-\u05c7]/);
  assert.ok(result.rows[0].translit);
  assert.ok(result.rows[0].translit_ru);
  assert.equal(source[0].niqqud, undefined);
});

test("changed consonants are never accepted as niqqud for a subtitle row", async () => {
  const result = await Vocalization.enrich([{ segment_index: 3, he: "שלום", ru: "мир" }], {
    client: { vocalizeTexts: async () => ({ results: ["עוֹלָם"] }) },
    transliterate: canonical.transliterateWithProfile,
  });
  assert.equal(result.rows[0].niqqud, undefined);
  assert.equal(result.rows[0].niqqud_status, "not_vocalized");
  assert.ok(result.rows[0].translit);
  assert.deepEqual(result.warnings, [{ segment_index: 3, reason: "VOCALIZATION_SOURCE_MISMATCH" }]);
});

test("a changed model word leaves the subtitle intact and preserves marks on matching words", () => {
  const source = "שופט יום הדין. אותך לבדך נעבוד, וממך לבדך נבקש עזרה.";
  const model = "שׁוֹפֵט יוֹם הַדִּין. אוֹתְךָ לְבַדְּךָ נַעֲבֹד, וּמִמְּךָ לְבַדְּךָ נְבַקֵּשׁ עֶזְרָה.";
  const projected = Vocalization.projectVocalization(source, model);
  assert.equal(Vocalization.plain(projected.text), source);
  assert.match(projected.text, /שׁוֹפֵט/);
  assert.match(projected.text, /נעבוד,/);
  assert.ok(projected.matched < projected.total);
});

test("browser transliteration bundle matches the server's deterministic profiles", () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync("public/js/local-translit-bundle.js", "utf8"), sandbox);
  for (const profile of ["learner-latin", "sbl", "ru-phonetic"]) {
    assert.equal(sandbox.LocalTranslit.transliterateWithProfile("שְׁלוֹם עוֹלָם", profile),
      canonical.transliterateWithProfile("שְׁלוֹם עוֹלָם", profile));
  }
});
