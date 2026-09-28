"use strict";
// O-033(d), 2026-09-28: the Sweet Mud card (778 rows, 3928 words) showed learner Latin dropping
// almost every spoken sheva (lsibuv, lhit'orer, myukhedet: 490 of 630 initial shevas), Russian
// phonetics voicing silent ones by classical rules (хукэма, амэру), a final silent aleph kept as
// an apostrophe (hu', lo', yotse': 249 words), and the doubled consonant letters of full spelling
// read twice (mitsvavh, ga'avavh, shvavyyts, eyayl: 30 words). Expectations are modern Israeli
// pronunciation, the way a learner hears these words in the film.
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../public/js/translit-modern-reading.js");
const { transliterateWithProfile: T } = require("../db/premium/translit.js");

const learner = (w) => T(w, "learner-latin").toLowerCase().replace(/[.,!?]/g, "");

const GOLD = [
  // spoken sheva at the start of the word (after prefixes and the article too)
  ["לְסִיבּוּב", "lesibuv"], ["לְהִתְעוֹרֵר", "lehit'orer"], ["מְיוּחֶדֶת", "meyukhedet"], ["לְךָ", "lekha"],
  ["מְתוּקָה", "metuka"], ["יְלָדִים", "yeladim"], ["בְּבָתֵּי", "bevate"], ["בְּיַחַד", "beyakhad"],
  ["בְּהַפְתָּעָה", "behafta'a"], ["לַקְּהִילָּה", "lakehila"], ["הַלְּוַואי", "halevay"], ["וְאָז", "ve'az"],
  ["פְּעָמִים", "pe'amim"],
  // clusters stay clusters
  ["בְּגָדִים", "bgadim"], ["קְצָת", "ktsat"], ["דְּבִיר", "dvir"], ["תְּנוּעָה", "tnu'a"], ["שְׁנוֹת", "shnot"],
  // silent sheva inside the word, and the second of two / before the same letter is spoken
  ["הוּקְמָה", "hukma"], ["אָמְרוּ", "amru"], ["שׁוּחְרְרוּ", "shukhreru"], ["תִּכְתְּבִי", "tikhtevi"],
  // aleph without a vowel is silent; with a vowel it stays a stop
  ["הוּא", "hu"], ["לֹא", "lo"], ["יוֹצֵא", "yotse"], ["מָאיָה", "maya"], ["סוֹצְיָאלִיסְטִית", "sotsyalistit"],
  ["בָּאָרֶץ", "ba'arets"], ["לְאוֹר", "le'or"],
  // doubled consonant letters of full spelling are one consonant
  ["מִצְוָוה", "mitsva"], ["גַּאֲוָוה", "ga'ava"], ["שְׁוַויְיץ", "shvayts"], ["אֱיָיל", "eyal"],
  ["סְמַיְילִי", "smayli"], ["הַשִּׁוְויוֹן", "hashivyon"], ["מִתְכַּוְּונִים", "mitkavnim"],
];

test("learner Latin reads Sweet Mud words the way they are spoken", () => {
  const wrong = GOLD.filter(([he, want]) => learner(he) !== want).map(([he, want]) => `${he}: ${learner(he)} ≠ ${want}`);
  assert.deepEqual(wrong, []);
});

test("Russian phonetics follows the same modern sheva", () => {
  assert.equal(T("הוּקְמָה", "ru-phonetic"), "хукма");
  assert.equal(T("אָמְרוּ", "ru-phonetic"), "амру");
  assert.equal(T("לְסִיבּוּב", "ru-phonetic"), "лэсибув");
  assert.equal(T("מִצְוָוה", "ru-phonetic"), "мицва");
});

test("SBL keeps classical reading but no longer reads a spelling letter twice", () => {
  assert.equal(T("מִצְוָוה", "sbl"), T("מִצְוָה", "sbl"));
  assert.equal(T("הוּקְמָה", "sbl"), "hûqəmâ", "SBL is the academic classical transcription");
});

test("the sheva pass never changes consonants or text outside Hebrew words", () => {
  const src = "עד סוף שנות ה-80 \"הַיְּלָדִים גָּדְלוּ\" 20.";
  const out = R.prepare(src, { sheva: true });
  assert.equal(out.replace(/[֑-ׇ]/g, "").replace(/\s+/g, " "), src.replace(/[֑-ׇ]/g, "").replace(/\s+/g, " "));
  assert.equal(R.prepare("", {}), "");
});

test("a hiriq's mater yod is not a doubling, and interjections keep their shape", () => {
  assert.equal(T("חַיִּים", "sbl"), "ḥayyîm");
  assert.equal(learner("הָיִיתִי"), "hayiti");
  assert.equal(learner("הָיְיתָה"), "hayta");
  assert.equal(T("שְׁשְׁשׁ", "ru-phonetic"), "шшш");
});

test("neighbouring consonants that cannot run together take the spoken sheva", () => {
  assert.equal(learner("בְּוַועֲדַת"), "beva'adat");
  assert.equal(learner("תְּצַיְּירִי"), "tetsayri");
  assert.equal(learner("תְּשׁוּבָה"), "tshuva", "a dental before shin still clusters");
});
