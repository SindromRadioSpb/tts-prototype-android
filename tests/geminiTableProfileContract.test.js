"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getGeminiScenario } = require("../ingest/geminiPolicy");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const serverJs = fs.readFileSync(path.join(root, "server.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "public", "sw.js"), "utf8");

test("Studio sends the selected transliteration profile to Gemini table routes", () => {
  assert.match(indexHtml, /<option value="learner-latin" selected>/);
  assert.match(indexHtml, /return \{ text: getText\(\), geminiApiKey: geminiKeyGet\(\), direction: getTableDirection\(\), translit_profile,/);
  assert.match(indexHtml, /translit_profile:\s*translitProfile/);
});

test("local table cache cannot cross direction or transliteration contracts", () => {
  assert.match(indexHtml, /TABLE_CACHE_CONTRACT_VERSION = "table-cache-v3-local-niqqud-normalization"/);
  assert.match(indexHtml, /cache\.tableCacheContract === TABLE_CACHE_CONTRACT_VERSION/);
  assert.match(indexHtml, /cache\.translitProfile === requestedTranslitProfile/);
  assert.match(indexHtml, /cache\.direction === requestedDirection/);
  assert.match(indexHtml, /cache\.segmentMode === requestedSegmentMode/);
  assert.match(indexHtml, /cache\.promptId === requestedPromptId/);
  assert.match(indexHtml, /tableCacheContract: TABLE_CACHE_CONTRACT_VERSION/);
  assert.match(indexHtml, /translitProfile: translit_profile/);
  assert.match(indexHtml, /promptId: v3LastGeminiMeta && v3LastGeminiMeta\.promptId \|\| null/);
});

test("restored browser tables use the same audited local niqqud normalizer", () => {
  assert.match(indexHtml, /<script src="\/js\/table-niqqud-normalizer\.js\?v=429"><\/script>/);
  assert.match(indexHtml, /TableNiqqudNormalizer\.normalizeRows\(cache\.rows\)/);
  assert.match(indexHtml, /cache\.localNiqqudCorrections = localNiqqud\.corrections/);
  assert.match(indexHtml, /таблица восстановлена и исправлена локально \(без запроса к Gemini\)/);
  assert.match(serviceWorker, /"\/js\/table-niqqud-normalizer\.js\?v=429"/);
  assert.match(serverJs, /"\/js\/table-niqqud-normalizer\.js\?v=429"/);
});

test("Gemini local-cache prompt identity distinguishes direction and segment mode", () => {
  assert.match(indexHtml, /if \(segmentMode\) return "he-ru-table-seg-v3"/);
  assert.match(indexHtml, /direction === "any-he" \? "any-he-table-v3" : "he-ru-table-v3"/);
});

test("Gemini route isolates cache and recomputes transliteration by profile", () => {
  assert.match(serverJs, /translit_profile=\$\{translitProfile\}/);
  assert.match(serverJs, /canonicalizeGeminiTableRowsLocally\(cached\.rows, translitProfile\)/);
  assert.match(serverJs, /canonicalizeGeminiTableRowsLocally\(preparedRows, translitProfile\)/);
  assert.match(serverJs, /transliterateWithProfile\(row\.he_niqqud, translitProfile\)/);
  assert.match(serverJs, /LOCAL_NIQQUD_CANONICALIZED/);
  assert.match(serverJs, /localNiqqudCorrections:\s*local\.corrections/);
  assert.match(serverJs, /translitProfileVersion:\s*resolvedTranslitProfile/);
});

test("actual Gemini generations are counted before parse or semantic rejection", () => {
  const routeStart = serverJs.indexOf('app.post("/api/translate-table"');
  const routeEnd = serverJs.indexOf('app.post("/api/translate-table-v2"', routeStart);
  const route = serverJs.slice(routeStart, routeEnd > routeStart ? routeEnd : undefined);
  const generated = route.indexOf("const rawText = generated.text;");
  const counted = route.indexOf('updateUsage("gemini", 1);');
  const parsed = route.indexOf("JSON.parse(cleaned)");
  assert.ok(generated >= 0 && counted > generated, "usage increments only after an upstream response exists");
  assert.ok(parsed > counted, "usage increments before parsing/semantic validation can reject the response");
  assert.equal(route.indexOf('updateUsage("gemini", 1);', counted + 1), -1, "one generation is counted once");
});

test("Hebrew table prompt revisions are cache-distinct v3 scenarios", () => {
  assert.equal(getGeminiScenario("table-he-ru").promptId, "he-ru-table-v3");
  assert.equal(getGeminiScenario("table-any-he").promptId, "any-he-table-v3");
  assert.equal(getGeminiScenario("table-seg-he-ru").promptId, "he-ru-table-seg-v3");
});
