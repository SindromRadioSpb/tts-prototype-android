"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getGeminiScenario } = require("../ingest/geminiPolicy");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const serverJs = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("Studio sends the selected transliteration profile to Gemini table routes", () => {
  assert.match(indexHtml, /<option value="learner-latin" selected>/);
  assert.match(indexHtml, /return \{ text: getText\(\), geminiApiKey: geminiKeyGet\(\), direction: getTableDirection\(\), translit_profile,/);
  assert.match(indexHtml, /translit_profile:\s*translitProfile/);
});

test("local table cache cannot cross direction or transliteration contracts", () => {
  assert.match(indexHtml, /TABLE_CACHE_CONTRACT_VERSION = "table-cache-v2-direction-translit"/);
  assert.match(indexHtml, /cache\.tableCacheContract === TABLE_CACHE_CONTRACT_VERSION/);
  assert.match(indexHtml, /cache\.translitProfile === requestedTranslitProfile/);
  assert.match(indexHtml, /cache\.direction === requestedDirection/);
  assert.match(indexHtml, /tableCacheContract: TABLE_CACHE_CONTRACT_VERSION/);
  assert.match(indexHtml, /translitProfile: translit_profile/);
});

test("Gemini route isolates cache and recomputes transliteration by profile", () => {
  assert.match(serverJs, /translit_profile=\$\{translitProfile\}/);
  assert.match(serverJs, /transliterateWithProfile\(row\.he_niqqud, translitProfile\)/);
  assert.match(serverJs, /translitProfileVersion:\s*resolvedTranslitProfile/);
});

test("Hebrew table prompt revisions are cache-distinct v3 scenarios", () => {
  assert.equal(getGeminiScenario("table-he-ru").promptId, "he-ru-table-v3");
  assert.equal(getGeminiScenario("table-any-he").promptId, "any-he-table-v3");
  assert.equal(getGeminiScenario("table-seg-he-ru").promptId, "he-ru-table-seg-v3");
});
