"use strict";
const zlib = require("zlib"), fs = require("fs"), path = require("path");
const REPO = "E:/projects/tts-prototype-android";
const OUTDIR = path.join(REPO, "docs/research/name-gazetteer/2026-06-26");
const hs = new Set(Object.keys(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public/morph/heb_morphology_full.bin.gz"))).toString("utf8")).entries));
const split = JSON.parse(fs.readFileSync(path.join(OUTDIR, "gazetteer-split.json"), "utf8"));
const U = split.detail.unambiguous.slice().sort((a, b) => b.freq - a.freq);

// existing seed in reader-morph.js (don't duplicate)
const SEED = new Set("אירופה ירושלים ישראל מצרים בבל אשור רומא ציון כנען סיני אמריקה אסיה אפריקה מוסקבה פריז ברלין יעקב יצחק אברהם משה אהרן יוסף יהושע שמואל מרדכי אסתר רבקה רחל לאה מרים גדעון שמשון שלמה בנימין אפרים ירמיהו ישעיהו יחזקאל מנשה ראובן".split(" "));

// DROP from the not-in-hspell base: common words / construct forms / junk hspell happened to miss,
// or short ambiguous tokens. (Conservative: when a real Hebrew common reading plausibly exists → drop.)
const DROP_NOTH = new Set(("מעין ולמה מאלה בנין אלוהים רום תום יון ארון חסון בבא שין אידר ורן האשם נועם מעיין " +
  "ראם היל דרבן ניק סילון ולס לסה לימון אוז אורן מימון חנן ליה וורם רוס אנגל עידן ארבר אסיף שיהו קיי קיה " +
  "שחף ידין מוש וויי מישן באליה אלג בדולה עמודה חומרה מיניה חריש צעדה וולס מרוזי מארה מנור ויט אדיל הני יוז " +
  "וינס מא הו הי בל בר אן רד יו די מג לר וס לס פו פר בס").split(/\s+/).filter(Boolean));

// RECOVER from the in-hspell set: clear proper names with NO competing common Hebrew reading —
// toponyms + theophoric/compound classical-Hebrew personal names + foreign personal names.
// (Single-stem homographs like עוז «сила»/ארי «лев»/דוב «медведь»/יעל/נטע/עמוס are deliberately NOT recovered.)
const RECOVER_HSPELL = new Set(("אנגליה חיפה גרמניה חדרה רוסיה כנרת יפו יריחו אוסטריה איטליה רומניה הרצליה סלובקיה הונגריה " +
  "צפת בולגריה קיסריה קובנה מטולה סוריה טבריה רעננה לטביה עפולה לוד גדרה נתיבות נצרת ורשה יורק מילאנו רחביה גלעד " +
  "הולנד מלטה פינלנד אוסטרליה וילנה עכו ערד רמלה אלכסנדריה דמשק ליטא כרמל חניתה אופיר אפרת מוריה " +
  "אליהו עזרא אליעזר אוריאל מיכאל גבריאל דניאל מלאכי נחמיה זכריה רפאל נתנאל מתתיהו יקותיאל נפתלי יששכר זרובבל " +
  "עזריאל שמריהו אביגדור יהושפט חננאל ירמיה אביתר אלעזר יחיאל בצלאל יגאל עקיבא אבנר אהוד אלכסנדר אלכסנדרה טוביה " +
  "שמעיה אוריה בתיה מיכה פנחס אילנה יוחאי גיורא שלומית ברוריה אביגיל חגי יואל אמנון הדסה דינה נדב עמנואל ענת").split(/\s+/).filter(Boolean));

const decisions = [];
const keep = [];
for (const x of U) {
  const inHs = hs.has(x.skel);
  let dec, reason;
  if (SEED.has(x.skel)) { dec = "skip"; reason = "already in seed"; }
  else if (x.skel.length < 3) { dec = "drop"; reason = "len<3 (collision-prone)"; }
  else if (!inHs) {
    if (DROP_NOTH.has(x.skel)) { dec = "drop"; reason = "common-word/construct/junk (hspell-missed)"; }
    else { dec = "keep"; reason = "not-in-hspell name"; }
  } else { // in hspell
    if (RECOVER_HSPELL.has(x.skel)) { dec = "keep"; reason = "recovered toponym/classical name"; }
    else { dec = "drop"; reason = "in-hspell (possible common-word homograph)"; }
  }
  decisions.push({ skel: x.skel, freq: x.freq, hspell: inHs ? 1 : 0, decision: dec, reason });
  if (dec === "keep") keep.push(x.skel);
}
// also drop anything in DROP_NOTH that slipped, and dedup
const finalKeep = [...new Set(keep)].sort();

// curation.tsv (the reproducible record)
const tsv = ["﻿# R2 name-gazetteer curation record — every unambiguous-bucket candidate + keep/drop + reason.",
  "# Producer: scripts/premium/build-name-gazetteer.js → gazetteer-split.json; curated by scratchpad/curate.js (conservative, precision-first).",
  "skel\tfreq\thspell\tdecision\treason"];
for (const d of decisions) tsv.push([d.skel, d.freq, d.hspell, d.decision, d.reason].join("\t"));
fs.writeFileSync(path.join(OUTDIR, "curation.tsv"), tsv.join("\n") + "\n");

fs.writeFileSync(path.join(OUTDIR, "name-proper-final.json"), JSON.stringify(finalKeep, null, 0));

const counts = decisions.reduce((a, d) => (a[d.decision] = (a[d.decision] || 0) + 1, a), {});
console.log("decisions:", JSON.stringify(counts));
console.log("FINAL new NAME_PROPER additions:", finalKeep.length, "(+ seed", SEED.size, ")");
console.log("\nfinal kept (sorted):");
for (let i = 0; i < finalKeep.length; i += 14) console.log("  " + finalKeep.slice(i, i + 14).join(" "));
