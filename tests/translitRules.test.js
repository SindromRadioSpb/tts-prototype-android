"use strict";
const test=require("node:test"), assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {transliterateWithProfile:T}=require("../db/premium/translit");
const V=require("../public/js/subtitle-material-vocalization");
const P=require("../public/js/niqqud-plausibility");
const GOLD=[
  ["הַגָּדוֹל","Hagadol","haggāḏôl","хагадол"],
  ["הַכָּל","Hakol","hakkol","хакол"],
  ["וְהַכָּל","Vehakol","wəhakkol","вэхакол"],
  ["גָּדוֹל","Gadol","gāḏôl","гадол"],
  ["מִשְׁפָּט","Mishpat","mišpāṭ","мишпат"],
  ["שֶׁלְּךָ","Shelkha","šelləḵā","шэлха"],
  ["שֶׁלְּכֶם","Shelkhem","šelləḵem","шэлхэм"],
  ["וְמְתוּקָה","Vemetuka","wəməṯûqâ","вэмэтука"],
  ["רַע","Ra'","raʿ","ра"],
  ["נוֹסֵעַ","Nose'a","nôsēaʿ","носеа"],
  ["רוּחַ","Ruakh","rûaḥ","руах"],
  ["אֵלָיו","Elav","ʾēlāyw","елав"],
  ["יָדָיו","Yadav","yāḏāyw","йадав"],
  ["אָפְקִי","Ofki","ʾop̄qî","офки"],
  ["תְּנַגֵּן","Tenagen","tənaggēn","тэнаген"],
  ["תְּנוּעָה","Tnu'a","tənûʿâ","тнуа"],
  ["יְאָרְחוּ","Ye'arkhu","yəʾārəḥû","йэарху"],
  ["לְכָל־הַיְּלָדִים","Lekhol-hayeladim","ləḵol-hayyəlāḏîm","лэхол-хайэладим"],
];
test("source-grounded rules in all profiles, including the reported row-02 article",()=>{
  for(const [he,...want]of GOLD) assert.deepEqual(["learner-latin","sbl","ru-phonetic"].map(p=>T(he,p)),want,he);
});
test("each browser profile equals the server on the complete rule matrix",()=>{
  const sandbox={};vm.runInNewContext(fs.readFileSync("public/js/local-translit-bundle.js","utf8"),sandbox);
  for(const [he]of GOLD)for(const p of ["learner-latin","sbl","ru-phonetic"])assert.equal(sandbox.LocalTranslit.transliterateWithProfile(he,p),T(he,p),he+" "+p);
});
test("maqaf, accents and real geresh remain punctuation, not internal markers",()=>{
  for(const p of ["learner-latin","sbl","ru-phonetic"]) {
    assert.ok(T("שָׁלוֹם׳",p).endsWith("׳"));
    assert.equal(T("רַע!",p),T("רַע",p)+"!");
    assert.equal(T("שָׁל֖וֹם",p),T("שָׁלוֹם",p));
    assert.doesNotMatch(T("ג'וּדוֹ לְכָל־הַיְּלָדִים",p),/[\uE000-\uF8FF]/);
  }
  assert.equal(V.plain("שָׁל֖וֹם־עוֹלָם׃"),"שלום־עולם׃");
  const projected=V.projectVocalization("שלום־עולם׃", "שָׁלוֹם־עוֹלָם׃");
  assert.equal(projected.text,"שָׁלוֹם־עוֹלָם׃");
  assert.equal(V.plain(projected.text),"שלום־עולם׃");
});
test("contradictory model marks request review rather than being silently accepted",()=>{
  assert.deepEqual(P.wordFaults("בַָר"),["MULTIPLE_VOWELS"]);
  assert.deepEqual(P.wordFaults("שָׁׂם"),["CONFLICTING_SHIN_DOTS"]);
  assert.deepEqual(P.wordFaults("הַגָּדוֹל"),[]);
});
test("lexical inference requires a unique aligned pronunciation and excludes conflicts",()=>{
  const {infer,build}=require("../scripts/premium/build-hebrew-reading-lexicon");
  assert.deepEqual(infer("תְּנַגֵּן","тенаген"),[[0,"e"]]);
  assert.equal(infer("תְּנַגֵּן","совсем другое"),null);
  const result=build([{cells:{one:{he:"תְּנַגֵּן",translit:"тенаген"},two:{he:"תְּנַגֵּן",translit:"тнаген"}}}]);
  assert.deepEqual(result.data,{});
  assert.equal(result.stats.conflicts,1);
});
