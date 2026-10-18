// tests/wordGlossQuality.test.js — O-104..O-107: the free gloss under a word, measured on the
// owner's AI-glossed text (Professor Moshe Sharon) and the subtitle film (Mivtza Savta).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const WG = require("../public/js/word-gloss.js");
const fn = (meaning, extra) => ({ label: "function", meaning, functionWord: true, gateVia: "flat", ...extra });

test("O-104: vocalized closed-class homographs get their own word", () => {
  assert.equal(WG.composeGloss(fn("(винит. падеж); ты (ж.р.)"), "אַתְּ").text, "ты (ж.р.)");
  assert.equal(WG.composeGloss(fn("к"), "אַל").text, "не (запрет)");
  assert.equal(WG.composeGloss(fn("к"), "אֶל").text, "к");
  assert.equal(WG.composeGloss(fn("вам (ж.); поэтому"), "לָכֵן").text, "поэтому");
  assert.equal(WG.composeGloss(fn("ему; если бы"), "לוֹ").text, "ему");
  assert.equal(WG.composeGloss(fn("то есть, а именно"), "הָיִינוּ").text, "мы были");
  assert.equal(WG.composeGloss(fn("с"), "עַם").text, "народ");
  assert.equal(WG.composeGloss(fn("там"), "שֵׁם").text, "имя");
  assert.equal(WG.composeGloss(fn("тебе"), "לָךְ").text, "тебе (ж.)");
  // a proclitic split off by the gate is not part of the word
  assert.equal(WG.composeGloss(fn("к", { gateVia: "proclitic" }), "וְאַל").text, "и + не (запрет)");
  // dagesh variants key the same
  assert.equal(WG.composeGloss(fn("(винит. падеж); ты (ж.р.)"), "אַת").text, "ты (ж.р.)");
  // a word not in the table keeps the curated gloss
  assert.equal(WG.composeGloss(fn("это, этот"), "זֶה").text, "это, этот");
});

const par = (cells) => ({ cells, lemma: "x" });
test("O-106: safe «likely» classes are shown with ≈ and the lemma meaning", () => {
  const adj = { label: "likely", pos: "adjective", meaning: "хороший; приятный; уместный", paradigm: par({ "ms-a": { he: "טוֹב" } }) };
  assert.equal(WG.composeGloss(adj, "טוֹב").text, "≈хороший");
  const noun = { label: "likely", pos: "noun", meaning: "час", paradigm: par({ s: { he: "שָׁעָה" } }) };
  assert.equal(WG.composeGloss(noun, "שָׁעָה").text, "≈час");
  assert.equal(WG.composeGloss(noun, "בְּשָׁעָה").text, "в + ≈час");
  const part = { label: "likely", pos: "verb", meaning: "говорить", paradigm: par({ "AP-ms": { he: "מְדַבֵּר" } }) };
  assert.equal(WG.composeGloss(part, "מְדַבֵּר").text, "≈говорить");
  assert.equal(WG.composeGloss(part, "שֶׁמְּדַבֵּר").text, "что + ≈говорить");
});

test("O-106: risky «likely» classes stay silent", () => {
  const finite = { label: "likely", pos: "verb", meaning: "бежать", paradigm: par({ "PERF-3p": { he: "רָצוּ" } }) };
  assert.equal(WG.composeGloss(finite, "רָצוּ").text, "", "רָצוּ «хотели» is not «бежать»");
  const passive = { label: "likely", pos: "verb", meaning: "отмечать", paradigm: par({ "passive-AP-fs": { he: "מְצֻיֶּנֶת" } }) };
  assert.equal(WG.composeGloss(passive, "מְצֻיֶּנֶת").text, "");
  const english = { label: "likely", pos: "noun", meaning: "to be born", paradigm: par({ s: { he: "נוֹלַד" } }) };
  assert.equal(WG.composeGloss(english, "נוֹלַד").text, "", "a meaning in English is a data defect, not a gloss");
  const suffixed = { label: "likely", pos: "noun", meaning: "рука", paradigm: par({ "s-P-3ms": { he: "יָדוֹ" } }) };
  assert.equal(WG.composeGloss(suffixed, "יָדוֹ").text, "");
});

test("O-106/O-107: a participle with the article is a noun — no verb gloss under it", () => {
  const part = { label: "likely", pos: "verb", meaning: "охранять", paradigm: par({ "AP-mp": { he: "נוֹצְרִים" } }) };
  assert.equal(WG.composeGloss(part, "הַנּוֹצְרִים").text, "");
  assert.equal(WG.composeGloss(part, "בַּנּוֹצְרִים").text, "", "בַּ = preposition + article");
  const canon = { label: "likely", pos: "verb", meaning: "охранять", paradigm: par({ "AP-mp": { he: "נוֹצְרִים" } }),
    canon: { slots: ["AP-mp"], prefix: "ה" } };
  assert.equal(WG.composeGloss(canon, "הַנּוֹצְרִים").text, "");
  // exact readings are not touched
  const exact = { ...canon, label: "exact" };
  assert.notEqual(WG.composeGloss(exact, "הַנּוֹצְרִים").text, "");
});

test("O-105: a proper name is marked as a name, not translated as the word «שֵׁם»", () => {
  assert.equal(WG.composeGloss({ gateVia: "name", label: "unknown" }, "מֹשֶׁה").text, "(имя)");
});

test("O-106: a participle after a preposition is not read as a verb", () => {
  const part = { label: "likely", pos: "verb", meaning: "быть добавленным", paradigm: { lemma: "x", cells: { "AP-ms": { he: "נוֹסָף" } } } };
  assert.equal(WG.composeGloss(part, "בְּנוֹסָף").text, "");
  assert.equal(WG.composeGloss(part, "וְנוֹסָף").text, "и + ≈быть добавленным");
});
