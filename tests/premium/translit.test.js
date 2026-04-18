"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { transliterate } = require("../../db/premium/translit");

test("empty string → ''", () => {
  assert.equal(transliterate(""), "");
});

test("whitespace-only → ''", () => {
  assert.equal(transliterate("   "), "");
});

test("non-string input → ''", () => {
  assert.equal(transliterate(null), "");
  assert.equal(transliterate(undefined), "");
  assert.equal(transliterate(42), "");
});

test("שָׁלוֹם → šālôm (SBL Academic)", () => {
  assert.equal(transliterate("שָׁלוֹם"), "šālôm");
});

test("בֹּקֶר טוֹב → bōqer ṭôḇ", () => {
  assert.equal(transliterate("בֹּקֶר טוֹב"), "bōqer ṭôḇ");
});

test("אֱלֹהִים → ʾĕlōhîm", () => {
  assert.equal(transliterate("אֱלֹהִים"), "ʾĕlōhîm");
});

test("יִשְׂרָאֵל → yiśrāʾēl (left-shin distinguished)", () => {
  assert.equal(transliterate("יִשְׂרָאֵל"), "yiśrāʾēl");
});

test("Hebrew without niqqud passes through (no error)", () => {
  // The library returns the input unchanged when there are no vowel points.
  // We just want to assert that it doesn't throw and returns a string.
  const out = transliterate("שלום");
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

test("multi-word verse בְּרֵאשִׁית בָּרָא אֱלֹהִים", () => {
  assert.equal(
    transliterate("בְּרֵאשִׁית בָּרָא אֱלֹהִים"),
    "bərēʾšîṯ bārāʾ ʾĕlōhîm"
  );
});
