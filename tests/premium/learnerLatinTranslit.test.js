"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { transliterateWithProfile } = require("../../db/premium/translit");
const { translitProfileVersion } = require("../../db/premium/versions");

test("learner Latin reproduces the approved physics-corpus style", () => {
  const hebrew = "פֶּרֶק 1: בְּעָיוֹת בִּתְחוּם תְּנוּעָה שְׁוַת תְּאוּצָה";
  assert.equal(
    transliterateWithProfile(hebrew, "learner-latin"),
    "Perek 1: be'ayot bitkhum tnu'a shvat te'utsa",
  );
});

test("learner Latin profile has a distinct cache version", () => {
  assert.equal(translitProfileVersion("learner-latin"), "learner-latin-v1");
  assert.notEqual(translitProfileVersion("learner-latin"), translitProfileVersion("sbl"));
});

test("learner Latin keeps the existing readable apostrophe convention", () => {
  assert.equal(transliterateWithProfile("אוֹפְנוֹעַ", "learner-latin"), "Ofno'a");
  assert.equal(transliterateWithProfile("הָאוֹפְנוֹעַ", "learner-latin"), "Ha'ofno'a");
  assert.equal(transliterateWithProfile("נוֹסֵעַ", "learner-latin"), "Nose'a");
});
