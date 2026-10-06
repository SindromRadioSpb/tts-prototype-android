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

// O-033 tails, 2026-09-28: a geresh (ג'ודו, בתיה'לה in Sweet Mud) was read as a plain letter and its
// apostrophe drifted to the end of the word (gudo'); Arabic loans with a doubled letter read as two.
test("a geresh makes ג ז צ into j, zh, ch in every profile, with ASCII or Hebrew geresh", () => {
  const cases = [
    ["ג'וּדוֹ", "Judo", "ǧûḏô", "джудо"], ["גִ'ינְס", "Jins", "ǧîns", "джинс"], ["ג'ִינְס", "Jins", "ǧîns", "джинс"],
    ["ז'וּרְנָל", "Zhurnal", "žûrənāl", "журнал"], ["צִ'יפְּס", "Chips", "čîps", "чипс"],
    ["מָסָאז'", "Masazh", "māsāʾž", "масаж"], ["ג׳וֹרְג׳", "Jorj", "ǧôrǧ", "джордж"],
  ];
  for (const [he, learnerWant, sblWant, ruWant] of cases) {
    assert.deepEqual([T(he, "learner-latin"), T(he, "sbl"), T(he, "ru-phonetic")], [learnerWant, sblWant, ruWant], he);
  }
  assert.equal(learner("לְג'ִינְס"), "lejins", "the geresh does not split the word for the sheva rules");
});

test("the geresh pass leaves the pointed text and other apostrophes alone", () => {
  assert.equal(R.prepare("ג'וּדוֹ").replace(R.GERESH, ""), "גוּדוֹ", "only moves the geresh, never a point or letter");
  assert.equal(R.prepare("אָמַר 'כֵּן'"), "אָמַר 'כֵּן'");
});

test("Arabic loans with a doubled letter keep one long consonant", () => {
  assert.equal(learner("יַאלְלָה"), "yalla");
  assert.equal(learner("וַואלְלָה"), "valla");
  assert.equal(T("יַאלְלָה", "ru-phonetic"), "йалла");
  assert.equal(learner("שׁוּחְרְרוּ"), "shukhreru", "native words keep the spoken sheva before the same letter");
});

// O-033, 2026-09-29: a ב/כ prefix before an ordinary consonant was read as a cluster
// (bmahalakh, btsahal) because only morphology tells it from a root letter (bgadim). Words whose
// ב/כ is a root letter come from Pealim's own transcriptions; an unknown word is read as prefixed
// (owner's decision): in the Ben-Yehuda corpus 9 697 of 15 445 such words carry the prefix.
test("a ב/כ prefix takes its e, a root ב/כ stays in the cluster", () => {
  const cases = [
    ["בְּמַהֲלַךְ", "bemahalakh"], ["בְּצַהַ״ל", "betsahal"], ["בְּסוֹף", "besof"], ["בְּדֶרֶךְ", "bederekh"],
    ["כְּשֵׁם", "keshem"], ["בְּתוֹךְ", "betokh"], ["בְּמֶשֶׁךְ", "bemeshekh"],
    ["בְּגָדִים", "bgadim"], ["בְּרָכָה", "brakha"], ["כְּתִיבָה", "ktiva"], ["בְּדִיקָה", "bdika"], ["בְּרֵיכָה", "brekha"],
    ["כְּבָר", "kvar"], ["כְּמוֹ", "kmo"], ["כְּדֵי", "kde"], ["בְּלִי", "bli"], ["כְּלוֹמַר", "klomar"],
    ["כְּשֶׁהוּא", "kshehu"], ["הַבְּגָדִים", "habgadim"],
  ];
  const wrong = cases.filter(([he, want]) => learner(he) !== want).map(([he, want]) => `${he}: ${learner(he)} ≠ ${want}`);
  assert.deepEqual(wrong, []);
  assert.equal(T("בְּמַהֲלַךְ", "ru-phonetic"), "бэмахалах");
  assert.equal(T("בְּגָדִים", "ru-phonetic"), "бгадим");
});

// Since 3.11.678 a spoken prefix sheva hid the qamats qatan from the library (לְכָל → lekhal).
test("a spoken prefix sheva keeps the qamats qatan of the word after it", () => {
  assert.equal(learner("לְכָל"), "lekhol");
  assert.equal(learner("בְּכָל"), "bekhol");
  assert.equal(learner("וְכָל"), "vekhol");
  assert.equal(learner("וּלְכָל"), "ulekhol", "behind the conjunction וּ too");
  assert.equal(learner("שֶׁבְּכָל"), "shebekhol");
  assert.equal(T("בְּכָל", "ru-phonetic"), "бэхол");
  assert.equal(learner("כָּל"), "kol");
  assert.equal(learner("בְּחָכְמָה"), "bekhokhma");
  assert.equal(learner("בְּשָׁלוֹם"), "beshalom", "a plain qamats stays a");
});

test("after the conjunction וּ the word starts again", () => {
  assert.equal(learner("וּלְסִיבּוּב"), "ulesibuv");
  assert.equal(learner("וּבְמַהֲלַךְ"), "uvemahalakh");
  assert.equal(learner("וּבְגָדִים"), "uvgadim");
  assert.equal(learner("שֶׁבְּמַהֲלַךְ"), "shebemahalakh");
});

test("the root-cluster word list is rebuilt from Pealim exactly", () => {
  const { buildClusterWords, renderModule } = require("../scripts/premium/build-translit-cluster-words.js");
  const fs = require("node:fs"), path = require("node:path");
  const committed = fs.readFileSync(path.join(__dirname, "..", "public", "js", "translit-cluster-words.js"), "utf8");
  assert.equal(committed, renderModule(buildClusterWords()), "run: node scripts/premium/build-translit-cluster-words.js");
});

// 2026-09-29: gershayim in an abbreviation stayed in the output (בְּצַהַ״ל → btsaha״l).
test("gershayim inside an abbreviation is spelling; quotes around words stay", () => {
  assert.equal(T("צַהַ״ל", "learner-latin"), "Tsahal");
  assert.equal(T('צַהַ"ל', "ru-phonetic"), "цахал");
  assert.equal(T("תַּנַ״ךְ", "sbl"), "tanaḵ");
  assert.equal(T('הִיא אָמְרָה "כֵּן"', "learner-latin"), 'Hi amra "ken"');
});
