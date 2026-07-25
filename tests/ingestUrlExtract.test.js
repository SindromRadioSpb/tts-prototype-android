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

test("strip fallback on page Readability cannot parse, with warning", () => {
  const thin = "<html><body><div>שלום עולם. זהו טקסט קצר אבל מספיק ארוך כדי לעבור את סף שמונים התווים של הבדיקה הזאת בקלות רבה.</div></body></html>";
  const r = extractArticle(thin, "https://x.example/");
  assert.equal(r.method, "strip");
  assert.match(r.text, /שלום עולם/);
  assert.deepEqual(r.warnings, ["EXTRACT_LOW_CONFIDENCE"]);
});

test("EXTRACT_EMPTY on empty page", () => {
  assert.throws(() => extractArticle("<html><body><nav>a</nav></body></html>", "https://x.example/"), /EXTRACT_EMPTY/);
});
