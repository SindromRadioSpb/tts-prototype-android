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

test("a cancelled vocalization stops before its next batch", async () => {
  const controller = new AbortController();
  const rows = Array.from({ length: 40 }, (_, i) => ({ segment_index: i, he: "שלום", ru: "мир" }));
  let calls = 0;
  await assert.rejects(Vocalization.enrich(rows, {
    signal: controller.signal,
    transliterate: canonical.transliterateWithProfile,
    client: { vocalizeTexts: async (texts) => { calls++; controller.abort(); return { results: texts.map(() => "שָׁלוֹם") }; } },
  }), (e) => e.code === "MATERIAL_CANCELED");
  assert.equal(calls, 1);
});

// Sweet Mud, 2026-09-28: DictaBERT answers in defective spelling (נקודה → נְקֻדָּה), so every word
// written with matres lectionis failed the consonant check: 6 rows had no niqqud and 262 were
// partial. Asked to mark matres, it keeps the letters; these are its exact answers.
test("full-spelling answers become ordinary pointed text", () => {
  const n = Vocalization.normalizeMatres;
  assert.equal(n("נְקֻו¤דָּה"), "נְקוּדָּה");
  assert.equal(n("בֹּו¤קֶר"), "בּוֹקֶר");
  assert.equal(n("קִי¤בּוּץ"), "קִיבּוּץ");
  assert.equal(n("אֹוֹמֵר"), "אוֹמֵר");
  assert.equal(n("הַשִּׁוְו¤יוֹן"), "הַשִּׁוְויוֹן");
  assert.equal(n("*מוּזִיקָה*"), "*מוּזִיקָה*", "a subtitle's own asterisks are not markers");
});

test("vocalization asks for marked matres and fills words written in full spelling", async () => {
  const seen = [];
  const answers = { "נקודה": "נְקֻו¤דָּה", "בוקר טוב": "בֹּו¤קֶר טוֹב" };
  const result = await Vocalization.enrich([{ segment_index: 0, he: "נקודה", ru: "точка" }, { segment_index: 1, he: "בוקר טוב", ru: "доброе утро" }], {
    client: { vocalizeTexts: async (texts, options) => { seen.push(options); return { results: texts.map((t) => answers[t]) }; } },
    transliterate: canonical.transliterateWithProfile,
  });
  assert.equal(seen[0].markMatres, "¤");
  assert.equal(result.rows[0].niqqud, "נְקוּדָּה");
  assert.equal(result.rows[0].niqqud_status, "local_model");
  assert.equal(result.rows[1].niqqud, "בּוֹקֶר טוֹב");
  assert.equal(result.warnings.length, 0);
});

// O-033: the Studio had "SBL Academic" selected, yet the subtitle card showed learner Latin: this
// path always wrote learner-latin into the one visible column.
test("the visible transliteration follows the profile selected in the Studio", async () => {
  const client = { vocalizeTexts: async (texts) => ({ results: texts.map(() => "שְׁלוֹם"), model_version: "t" }) };
  for (const profile of ["learner-latin", "sbl", "ru-phonetic"]) {
    const result = await Vocalization.enrich([{ segment_index: 0, he: "שלום" }], {
      client, transliterate: canonical.transliterateWithProfile, translitProfile: profile,
    });
    assert.equal(result.rows[0].translit, canonical.transliterateWithProfile("שְׁלוֹם", profile), profile);
  }
  const fallback = await Vocalization.enrich([{ segment_index: 0, he: "שלום" }], {
    client, transliterate: canonical.transliterateWithProfile, translitProfile: "unknown",
  });
  assert.equal(fallback.rows[0].translit, canonical.transliterateWithProfile("שְׁלוֹם", "learner-latin"));
});
