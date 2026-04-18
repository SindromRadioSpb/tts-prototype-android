"use strict";

// Full test suite for sblAcademicSpirantization transliteration scheme.
// Covers every rule from TASK_FIX_SBL_ACADEMIC_SPIRANTIZATION.md.
// All code paths must use db/premium/translit.js — never inline logic.

const { test } = require("node:test");
const assert   = require("node:assert/strict");

const { transliterate } = require("../../db/premium/translit");

// ---------------------------------------------------------------------------
// 1. Regression tests for reported bugs
// ---------------------------------------------------------------------------

test("regression: לָלֶכֶת single word", () => {
  assert.equal(transliterate("לָלֶכֶת"), "lāleḵeṯ");
});

test("regression: לָלֶכֶת מִכָּאן phrase", () => {
  assert.equal(transliterate("לָלֶכֶת מִכָּאן"), "lāleḵeṯ mikkāʾn");
});

test("regression: טוֹב → ṭôḇ (not ṭôb)", () => {
  assert.equal(transliterate("טוֹב"), "ṭôḇ");
  assert.notEqual(transliterate("טוֹב"), "ṭôb");
});

test("regression: סֵפֶר → sēp̄er (not sēper)", () => {
  assert.equal(transliterate("סֵפֶר"), "sēp̄er");
  assert.notEqual(transliterate("סֵפֶר"), "sēper");
});

// ---------------------------------------------------------------------------
// 2. BeGaDKePhaT full table — with and without dagesh
// ---------------------------------------------------------------------------

test("bet WITH dagesh (בּ) → b", () => {
  assert.equal(transliterate("בַּ"), "ba");
});

test("bet WITHOUT dagesh (ב) → ḇ", () => {
  // isolated letter, no dagesh
  const out = transliterate("אָב");
  assert.ok(out.endsWith("ḇ"), `expected final ḇ, got: ${out}`);
});

test("gimel WITH dagesh (גּ) → g", () => {
  assert.equal(transliterate("גַּן"), "gan");
});

test("gimel WITHOUT dagesh (ג) → ḡ", () => {
  const out = transliterate("גַ");
  assert.equal(out, "ḡa");
});

test("dalet WITH dagesh (דּ) → d", () => {
  assert.equal(transliterate("דַּ"), "da");
});

test("dalet WITHOUT dagesh (ד) → ḏ", () => {
  assert.equal(transliterate("יַד"), "yaḏ");
});

test("kaf WITH dagesh (כּ) → k", () => {
  assert.equal(transliterate("כַּ"), "ka");
});

test("kaf WITHOUT dagesh (כ) → ḵ", () => {
  assert.ok(transliterate("לָלֶכֶת").includes("ḵ"), "phrase must contain ḵ");
});

test("final kaf WITHOUT dagesh (ך) → ḵ", () => {
  const out = transliterate("מֶלֶךְ");
  assert.ok(out.endsWith("ḵ") || out.endsWith("ḵ"), `expected final ḵ, got: ${out}`);
});

test("pe WITH dagesh (פּ) → p", () => {
  assert.equal(transliterate("פַּ"), "pa");
});

test("pe WITHOUT dagesh (פ) → p̄", () => {
  assert.equal(transliterate("סֵפֶר"), "sēp̄er");
  assert.notEqual(transliterate("סֵפֶר"), "sēp̱er");
});

test("final pe WITHOUT dagesh (ף) → p̄", () => {
  const out = transliterate("כַּף");
  assert.ok(out.endsWith("p̄"), `expected final p̄, got: ${out}`);
});

test("tav WITH dagesh (תּ) → t", () => {
  assert.equal(transliterate("תּוֹרָה"), "tôrâ");
});

test("tav WITHOUT dagesh (ת) → ṯ", () => {
  assert.equal(transliterate("אֶת"), "ʾeṯ");
  assert.notEqual(transliterate("אֶת"), "ʾet");
});

// ---------------------------------------------------------------------------
// 3. Other consonants
// ---------------------------------------------------------------------------

test("alef → ʾ", () => {
  assert.ok(transliterate("אֲנִי").startsWith("ʾ"));
});

test("ayin → ʿ", () => {
  assert.ok(transliterate("עַם").startsWith("ʿ"));
});

test("he → h", () => {
  assert.ok(transliterate("הַ").startsWith("h"));
});

test("vav → w", () => {
  // vav as consonant (without holam/shureq)
  assert.ok(transliterate("וָו").startsWith("w"));
});

test("zayin → z", () => {
  assert.ok(transliterate("זָהָב").startsWith("z"));
});

test("het → ḥ", () => {
  assert.ok(transliterate("חַי").startsWith("ḥ"));
});

test("tet → ṭ", () => {
  assert.ok(transliterate("טוֹב").startsWith("ṭ"));
});

test("yod → y", () => {
  assert.ok(transliterate("יָד").startsWith("y"));
});

test("lamed → l", () => {
  assert.ok(transliterate("לָב").startsWith("l"));
});

test("mem → m, final mem → m", () => {
  assert.ok(transliterate("מַיִם").startsWith("m"));
  assert.ok(transliterate("מַיִם").endsWith("m"));
});

test("nun → n, final nun → n", () => {
  assert.ok(transliterate("נָגֵן").startsWith("n"));
});

test("samekh → s", () => {
  assert.ok(transliterate("סֵפֶר").startsWith("s"));
});

test("tsadi → ṣ, final tsadi → ṣ", () => {
  assert.ok(transliterate("צֶאן").startsWith("ṣ"));
  assert.ok(transliterate("אֶרֶץ").endsWith("ṣ"));
});

test("qof → q", () => {
  assert.ok(transliterate("קוֹל").startsWith("q"));
});

test("resh → r", () => {
  assert.ok(transliterate("רֹאשׁ").startsWith("r"));
});

test("shin (shin dot) → š", () => {
  assert.ok(transliterate("שָׁלוֹם").startsWith("š"));
});

test("sin (sin dot) → ś", () => {
  assert.ok(transliterate("יִשְׂרָאֵל").includes("ś"));
});

test("maqef → hyphen", () => {
  const out = transliterate("כָּל־הָ");
  assert.ok(out.includes("-"), `expected hyphen, got: ${out}`);
});

// ---------------------------------------------------------------------------
// 4. Vowels
// ---------------------------------------------------------------------------

test("patah → a", () => {
  assert.equal(transliterate("אַ"), "ʾa");
});

test("qamats gadol → ā", () => {
  assert.equal(transliterate("אָ"), "ʾā");
});

test("segol → e", () => {
  assert.equal(transliterate("אֶ"), "ʾe");
});

test("tsere → ē", () => {
  assert.equal(transliterate("אֵ"), "ʾē");
});

test("hiriq → i", () => {
  assert.equal(transliterate("אִ"), "ʾi");
});

test("holam → ō", () => {
  assert.equal(transliterate("אֹ"), "ʾō");
});

test("qubuts → ū", () => {
  assert.equal(transliterate("אֻ"), "ʾū");
});

test("vocal sheva → ə", () => {
  assert.equal(transliterate("אְ"), "ʾə");
});

test("hataf-patah → ă", () => {
  assert.equal(transliterate("אֲ"), "ʾă");
});

test("hataf-segol → ĕ", () => {
  assert.equal(transliterate("אֱ"), "ʾĕ");
});

test("hataf-qamats → ŏ", () => {
  // U+05B3 hataf-qamats (not U+05C7 qamats-qatan)
  assert.equal(transliterate("\u05D0\u05B3"), "ʾŏ");
});

// ---------------------------------------------------------------------------
// 5. Matres lectionis
// ---------------------------------------------------------------------------

test("tsere+yod → ê", () => {
  assert.equal(transliterate("אֵי"), "ʾê");
});

test("segol+yod → ê", () => {
  assert.equal(transliterate("אֶי"), "ʾê");
});

test("qamats+he → â", () => {
  assert.equal(transliterate("אָה"), "ʾâ");
});

test("segol+he → ê", () => {
  assert.equal(transliterate("אֶה"), "ʾê");
});

test("tsere+he → ê", () => {
  assert.equal(transliterate("אֵה"), "ʾê");
});

test("holam+vav → ô", () => {
  assert.equal(transliterate("אוֹ"), "ʾô");
});

test("shureq → û", () => {
  assert.equal(transliterate("אוּ"), "ʾû");
});

test("hiriq+yod → î", () => {
  assert.equal(transliterate("אִי"), "ʾî");
});

// ---------------------------------------------------------------------------
// 6. Phrase consistency
// ---------------------------------------------------------------------------

test("phrase == word1 + space + word2", () => {
  const w1 = transliterate("לָלֶכֶת");
  const w2 = transliterate("מִכָּאן");
  const phrase = transliterate("לָלֶכֶת מִכָּאן");
  assert.equal(phrase, w1 + " " + w2);
  assert.equal(phrase, "lāleḵeṯ mikkāʾn");
});

// ---------------------------------------------------------------------------
// 7. Negative assertions: forbidden simplified outputs
// ---------------------------------------------------------------------------

test("forbidden: לָלֶכֶת must not give lāleket", () => {
  assert.notEqual(transliterate("לָלֶכֶת"), "lāleket");
});

test("forbidden: phrase must not give lāleket mikkāʾn", () => {
  assert.notEqual(transliterate("לָלֶכֶת מִכָּאן"), "lāleket mikkāʾn");
});

test("forbidden: טוֹב must not give ṭôb", () => {
  assert.notEqual(transliterate("טוֹב"), "ṭôb");
});

test("forbidden: סֵפֶר must not give sēper", () => {
  assert.notEqual(transliterate("סֵפֶר"), "sēper");
});

test("forbidden: אֶת must not give ʾet", () => {
  assert.notEqual(transliterate("אֶת"), "ʾet");
});

test("forbidden: בַּיִת must not give bayit", () => {
  assert.notEqual(transliterate("בַּיִת"), "bayit");
});
