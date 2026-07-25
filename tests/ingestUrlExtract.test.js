"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { extractArticle } = require("../ingest/urlExtract.js");

const FIXTURE = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "premium", "fixtures", "ingest", "article-he.html"), "utf8");

test("readability path: main text in, boilerplate out", () => {
  const r = extractArticle(FIXTURE, "https://news.example/morning");
  assert.equal(r.method, "readability");
  assert.match(r.title || "", /נאם הבוקר בכנסת|חדשות הבוקר/);
  assert.match(r.text, /נשא הבוקר נאום ארוך בכנסת/);
  assert.match(r.text, /שישים ואחד תומכים/);
  assert.doesNotMatch(r.text, /כל הזכויות שמורות/);   // footer
  assert.doesNotMatch(r.text, /קנו עכשיו במבצע/);      // ad
  assert.equal(r.warnings.length, 0);
});

test("strip fallback when Readability returns insufficient content", () => {
  // HTML that Readability can parse but gets < 80 chars of usable content
  // Page has boilerplate elements only, so falls back to strip
  const boilerplateOnly = "<html><body><nav><a href='/'>ראשי</a> <a href='/sports'>ספורט</a> <a href='/news'>חדשות</a> <a href='/weather'>מזג אוויר</a> <a href='/opinion'>דעות</a></nav><footer><p>כל הזכויות שמורות © 2026 לאתר זה. צור קשר עם המערכת בדיוק כאן בעמוד זה.</p></footer></body></html>";
  const r = extractArticle(boilerplateOnly, "https://x.example/");
  assert.equal(r.method, "strip");
  assert.match(r.text, /ראשי/);
  assert.deepEqual(r.warnings, ["EXTRACT_LOW_CONFIDENCE"]);
});

test("EXTRACT_EMPTY on empty page", () => {
  assert.throws(() => extractArticle("<html><body><nav>a</nav></body></html>", "https://x.example/"), /EXTRACT_EMPTY/);
});

test("readability path with EXTRACT_SHORT when article is 80-200 chars", () => {
  const shortArticle = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><title>מאמר קצר</title></head>
<body>
  <nav><ul><li><a href="/">ראשי</a></li></ul></nav>
  <article>
    <h1>כותרת הכתבה</h1>
    <p>זהו מאמר קצר ולא ארוך מדי. הוא מכיל מידע אבל לא מספיק לעומת מאמר רגיל בעיתון גדול כלשהו.</p>
  </article>
  <footer><p>כל הזכויות שמורות © 2026</p></footer>
</body>
</html>`;
  const r = extractArticle(shortArticle, "https://news.example/short");
  assert.equal(r.method, "readability");
  assert.deepEqual(r.warnings, ["EXTRACT_SHORT"]);
  assert.match(r.text, /זהו מאמר קצר/);
  assert.doesNotMatch(r.text, /כל הזכויות שמורות/);  // footer excluded
  assert.doesNotMatch(r.text, /ראשי/);               // nav excluded
});
