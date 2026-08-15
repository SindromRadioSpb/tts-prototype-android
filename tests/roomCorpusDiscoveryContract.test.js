"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const ui = read("public/js/library-ui.js");
const shell = read("public/library.html");
const ru = read("public/i18n/locales/ru.js");
const en = read("public/i18n/locales/en.js");
const he = read("public/i18n/locales/he.js");

test("Ben sort never activates a hidden Ready filter and sorts the visible preview", () => {
  assert.doesNotMatch(ui, /if\s*\(corpusL1Sort\s*===\s*['"]familiar_desc['"]\)\s*\{\s*corpusFilter\.readyOnly\s*=\s*true/);
  assert.match(ui, /function corpusSortedReadyPreview\(/);
  assert.match(ui, /corpusSortedReadyPreview\(ready\)\.slice\(0,\s*ROOM_PREVIEW\)/);
  assert.match(ui, /hits\.sort\(corpusL1Comparator\(corpusL1Sort,/);
});

test("profile fit is a bounded typed reader, not a new recommendation writer", () => {
  assert.match(ui, /const ROOM_PROFILE_FIT_PREVIEW = 4/);
  assert.match(ui, /function buildProfileFitSection\(/);
  assert.match(ui, /paintBenProfileFit\(/);
  assert.match(ui, /paintMyTextsProfileFit\(/);
  assert.match(ui, /paintGroupProfileFit\(/);
  assert.match(ui, /ensureFinishedSet\(\)/);
  assert.match(ui, /excludeIds/);
  assert.doesNotMatch(ui, /(?:put|save|create|write)(?:Recommendation|ProfileFit|NextForYou)/);
});

test("every corpus places optional profile fit before an explicit catalog region", () => {
  assert.match(ui, /function corpusCatalogRegion\(/);
  assert.match(ui, /class:\s*['"]corpus-catalog-region/);
  assert.match(ui, /profileFitHost[\s\S]{0,700}catalogRegion/);
  assert.match(ui, /main\.appendChild\(wrap\);\s*paintBenProfileFit\(profileFitHost, token\)/);
  assert.match(ui, /groupProfileFitHost[\s\S]{0,1600}groupCatalogRegion/);
  assert.match(ui, /myProfileFitHost[\s\S]{0,1800}myCatalogRegion/);
  assert.match(shell, /\.corpus-profile-fit\b/);
  assert.match(shell, /\.corpus-catalog-region\b/);
});

test("RU EN HE copy names recorded profile fit and rejects comprehension claims", () => {
  for (const [locale, source] of [["ru", ru], ["en", en], ["he", he]]) {
    assert.match(source, /profileFitTitle\s*:/, `${locale}: profileFitTitle missing`);
    assert.match(source, /profileFitIntro\s*:/, `${locale}: profileFitIntro missing`);
    assert.match(source, /catalogTitle\s*:/, `${locale}: catalogTitle missing`);
    assert.match(source, /catalogIntro\s*:/, `${locale}: catalogIntro missing`);
  }
  assert.match(ru, /не оценка понимания текста/);
  assert.match(en, /not a comprehension estimate/i);
  assert.match(he, /אינה הערכה של הבנת הנקרא/);
});
