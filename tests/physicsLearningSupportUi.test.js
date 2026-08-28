"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

test("every Physics card and Reader expose answer-first and full learning-support actions", () => {
  const ui = read("public/js/library-ui.js");
  const html = read("public/library.html");
  assert.match(ui, /renderPhysicsLearningActions/);
  assert.match(ui, /openPhysicsLearningSupport/);
  assert.match(ui, /physicsCheckAnswer/);
  assert.match(ui, /physicsUnderstandSolve/);
  assert.match(html, /id="readerTaskLearningSupport"/);
  assert.match(html, /\.physics-learning-overlay/);
  assert.match(html, /@media \(max-width: 760px\)[\s\S]*\.physics-learning-viewer/);
});

test("Physics learning support ships RU EN HE copy and cache/version lockstep", () => {
  for (const locale of ["ru", "en", "he"]) {
    const body = read(`public/i18n/locales/${locale}.js`);
    for (const key of ["physicsCheckAnswer", "physicsUnderstandSolve", "physicsLearningTitle", "physicsExamSolution", "physicsAnswer"])
      assert.match(body, new RegExp(`${key}:`), `${locale}: ${key}`);
  }
  const html = read("public/library.html");
  const sw = read("public/sw.js");
  const htmlVersion = html.match(/roomFooterVersion[^>]*>v([0-9.]+)</)?.[1];
  const swVersion = sw.match(/const CACHE_VERSION = "v([0-9.]+)"/)?.[1];
  assert.equal(htmlVersion, swVersion);
});
