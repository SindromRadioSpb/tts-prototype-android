"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRows } = require("../public/js/table-niqqud-normalizer.js");
const { transliterateWithProfile: T } = require("../db/premium/translit");
test("cache correction derives every selected profile from corrected Hebrew", () => {
  const source = [{ he:"אופנוע ואופקי.", he_niqqud:"אֶוֹפַנּוֹעַ וְאֹפְקִי.", translit:"old", translit_ru:"old Russian" }];
  for(const profile of ["learner-latin","sbl","ru-phonetic"]) {
    const result=normalizeRows(source,{transliterate:T,translitProfile:profile});
    assert.equal(result.rows[0].he_niqqud,"אוֹפַנּוֹעַ וְאָפְקִי.");
    assert.equal(result.rows[0].translit,T(result.rows[0].he_niqqud,profile));
    assert.equal(result.rows[0].translit_ru,T(result.rows[0].he_niqqud,"ru-phonetic"));
    assert.equal(result.rows[0].he,source[0].he);
  }
  assert.equal(source[0].translit,"old");
});
test("manual vowel points and transliterations survive cache restoration", () => {
  const row={he:"אופנוע",he_niqqud:"אוֹפְנוֹעַ",translit:"Ofano'a",translit_ru:"моё",edit_meta_json:JSON.stringify({edited:{he_niqqud:true,translit:true,translit_ru:true}})};
  assert.deepEqual(normalizeRows([row],{transliterate:T}).rows[0],row);
  const marked={...row,edit_meta_json:JSON.stringify({edited:{translit:true,translit_ru:true}})};
  const next=normalizeRows([marked],{transliterate:T}).rows[0];
  assert.equal(next.he_niqqud,"אוֹפַנּוֹעַ");
  assert.equal(next.translit,"Ofano'a");
  assert.equal(next.translit_ru,"моё");
});
test("without the engine a cache correction never rewrites Latin fragments",()=>{
  const row={he:"אופנוע",he_niqqud:"אֶוֹפַנּוֹעַ",translit:"Evofano'a"};
  assert.equal(normalizeRows([row]).rows[0].translit,row.translit);
});
