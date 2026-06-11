#!/usr/bin/env node
"use strict";
// smoke:reniqqud — guards the Tier-2 niqqud-fill text-integrity invariant (R1).
// reconstructNiqqud must NEVER change a row's consonant skeleton: it only adds vowel
// marks to words whose skeleton matches Dicta's, and keeps ktiv-normalized / dropped
// words BARE. No network — pure logic over hand-built Dicta-shaped inputs.

const path = require("path");
const RF = require(path.resolve(__dirname, "reniqqud-fill.js"));

const failures = [];
const eq = (cond, m) => { if (!cond) failures.push(m); };
const skel = (s) => String(s || "").replace(/[^א-ת]/g, "");

// 1) full match — skeleton-stable words all vocalized, skeleton + spacing preserved
{
  const plain = "הוא הלך הביתה";
  const dicta = "הוּא הָלַךְ הַבַּיְתָה";
  const r = RF.reconstructNiqqud(plain, dicta);
  eq(skel(r.niqqud) === skel(plain), "1: skeleton must be preserved (full match)");
  eq(RF.VOW.test(r.niqqud), "1: result must carry niqqud");
  eq(r.matched === 3 && r.total === 3, "1: all 3 skeleton-stable words matched, got " + r.matched + "/" + r.total);
}

// 2) ktiv normalization — Dicta re-spells one word (עתון→עיתון); that word stays BARE,
//    the rest vocalize, skeleton still equals the PLAIN row's (never imposes new spelling)
{
  const plain = "את העתון הלאומי";
  const dicta = "אֶת הָעִיתוֹן הַלְּאֻמִּי";        // עיתון has an extra yod vs plain עתון
  const r = RF.reconstructNiqqud(plain, dicta);
  eq(skel(r.niqqud) === skel(plain), "2: skeleton must equal PLAIN (ktiv-normalized word kept bare)");
  eq(r.niqqud.indexOf("העתון") >= 0 || r.niqqud.indexOf("עתון") >= 0, "2: re-spelled word must stay as plain עתון, not עיתון");
  eq(r.matched < r.total, "2: at least one word must be left bare (the re-spelled one)");
}

// 3) punctuation + spacing preserved verbatim
{
  const plain = "שלום, עולם!";
  const dicta = "שָׁלוֹם, עוֹלָם!";
  const r = RF.reconstructNiqqud(plain, dicta);
  eq(skel(r.niqqud) === skel(plain), "3: skeleton preserved with punctuation");
  eq(r.niqqud.indexOf(",") >= 0 && r.niqqud.indexOf("!") >= 0, "3: punctuation must be preserved");
}

// 4) Dicta returns garbage / unrelated text → NOTHING substituted, skeleton intact
{
  const plain = "בית ספר";
  const dicta = "abcdefg זרזיר מוזר";          // wrong skeletons
  const r = RF.reconstructNiqqud(plain, dicta);
  eq(skel(r.niqqud) === skel(plain), "4: garbage Dicta output must not corrupt the row");
  eq(r.matched === 0, "4: no word should match garbage, got " + r.matched);
}

// 5) empty Dicta output → row returned unchanged (bare), skeleton intact
{
  const plain = "ירושלים";
  const r = RF.reconstructNiqqud(plain, "");
  eq(skel(r.niqqud) === skel(plain), "5: empty Dicta output → unchanged skeleton");
  eq(r.matched === 0, "5: nothing matched on empty input");
}

// 6) Yiddish guard (R7/R10): a Yiddish row scores high; a Hebrew row scores ~0
{
  const yiddish = [{ hebrew_plain: "געשריבענע ליטערארישע ירושה האט ער ניט איבערגעלאזן מיט דער צייט" }];
  const hebrew = [{ hebrew_plain: "מן האחרונים הכנסתי לקובץ זה רק אלו שנראו לי ראויים לכך" }];
  eq(RF.yiddishRatio(yiddish) >= 0.05, "6: Yiddish text must score high (got " + RF.yiddishRatio(yiddish).toFixed(2) + ")");
  eq(RF.yiddishRatio(hebrew) < 0.03, "6: Hebrew text must score ~0 (got " + RF.yiddishRatio(hebrew).toFixed(2) + ")");
}

if (failures.length) {
  console.error("FAIL (" + failures.length + "):");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("reniqqud: text-integrity invariant (skeleton preserved, ktiv-normalized/garbage kept bare) + Yiddish guard — 6 cases");
console.log("PASS — reniqqud smoke green");
