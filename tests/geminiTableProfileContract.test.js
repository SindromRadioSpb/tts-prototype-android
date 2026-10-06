"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getGeminiScenario } = require("../ingest/geminiPolicy");
const { requestedUrl, assertPrecachedExactly } = require("./helpers/releaseLock");

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
  const browserModel = indexHtml.match(/EXPECTED_GEMINI_STUDIO_MODEL = "([^"]+)"/);
  assert.ok(browserModel, "browser model pin is required for local cache identity");
  assert.equal(browserModel[1], getGeminiScenario("table-seg-he-ru").model);
  assert.match(indexHtml, /TABLE_CACHE_CONTRACT_VERSION = "table-cache-v3-local-niqqud-normalization"/);
  assert.match(indexHtml, /cache\.tableCacheContract === TABLE_CACHE_CONTRACT_VERSION/);
  assert.match(indexHtml, /cache\.translitProfile === requestedTranslitProfile/);
  assert.match(indexHtml, /cache\.direction === requestedDirection/);
  assert.match(indexHtml, /cache\.segmentMode === requestedSegmentMode/);
  assert.match(indexHtml, /cache\.promptId === requestedPromptId/);
  assert.match(indexHtml, /cache\.model === EXPECTED_GEMINI_STUDIO_MODEL/);
  assert.match(indexHtml, /tableCacheContract: TABLE_CACHE_CONTRACT_VERSION/);
  assert.match(indexHtml, /translitProfile: translit_profile/);
  assert.match(indexHtml, /promptId: v3LastGeminiMeta && v3LastGeminiMeta\.promptId \|\| null/);
  assert.match(indexHtml, /model: v3LastGeminiMeta && \(v3LastGeminiMeta\.requestedModel \|\| v3LastGeminiMeta\.model\) \|\| EXPECTED_GEMINI_STUDIO_MODEL/);
});

test("Gemini resumable table jobs are bound to the pinned browser model", () => {
  assert.match(indexHtml, /provider: "gemini", model: EXPECTED_GEMINI_STUDIO_MODEL,/);
  assert.match(indexHtml, /const jobInput = \{ text: getText\(\)\.trim\(\), provider: "gemini", model: EXPECTED_GEMINI_STUDIO_MODEL,/);
});

test("restored browser tables use the same audited local niqqud normalizer", () => {
  const url = requestedUrl(indexHtml, "/js/table-niqqud-normalizer.js", "Studio");
  assertPrecachedExactly(url, { sw: serviceWorker, server: serverJs });
  assert.match(indexHtml, /TableNiqqudNormalizer\.normalizeRows\(cache\.rows,\s*\{/);
  assert.match(indexHtml, /cache\.localNiqqudCorrections = localNiqqud\.corrections/);
  assert.match(indexHtml, /таблица восстановлена и исправлена локально \(без запроса к Gemini\)/);
});

test("Gemini local-cache prompt identity distinguishes direction and segment mode", () => {
  assert.match(indexHtml, /if \(segmentMode\) return "he-ru-table-seg-v5"/);
  assert.match(indexHtml, /direction === "any-he" \? "any-he-table-v4" : "he-ru-table-v4"/);
});

test("Gemini route recomputes transliteration by profile from a profile-free cache", () => {
  assert.match(serverJs, /tableCacheIdentities\(\{ scenario, cleanText, translitProfile \}\)/);
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
  const generated = route.indexOf("rawText = generated.text;");
  const counted = route.indexOf('updateUsage("gemini", 1);');
  const preserved = route.indexOf("writeRawTableCacheAtomic(rawCacheFile");
  const parsed = route.indexOf("JSON.parse(cleaned)");
  assert.ok(generated >= 0 && counted > generated, "usage increments only after an upstream response exists");
  assert.ok(preserved > counted && preserved < parsed,
    "paid raw output is preserved before parsing/semantic validation can reject it");
  assert.ok(parsed > counted, "usage increments before parsing/semantic validation can reject the response");
  const repairCounted = route.indexOf('updateUsage("gemini", 1);', counted + 1);
  assert.ok(repairCounted > route.indexOf('const answer = await generateGeminiContent'),
    'a targeted repair is a separate paid generation and must also be counted');
  assert.equal(route.indexOf('updateUsage("gemini", 1);', repairCounted + 1), -1,
    'no duplicate counter after validation or cache publication');
});

test("Hebrew table prompt revisions are cache-distinct scenarios without transliteration (O-006)", () => {
  assert.equal(getGeminiScenario("table-he-ru").promptId, "he-ru-table-v4");
  assert.equal(getGeminiScenario("table-any-he").promptId, "any-he-table-v4");
  assert.equal(getGeminiScenario("table-seg-he-ru").promptId, "he-ru-table-seg-v5");
  for (const name of ["table-he-ru", "table-any-he", "table-seg-he-ru"]) {
    assert.equal(getGeminiScenario(name).schemaId, "studio-table-rows-schema-v2");
  }
});

test("the model is not asked for transliteration in any table or repair prompt (O-006)", () => {
  const segTable = require("../ingest/segTable");
  const { buildRepairPrompt, buildRepairSchema } = require("../ingest/geminiTableRepair");
  const { buildGeminiTableResponseSchema } = require("../ingest/geminiTableSchema");
  const Type = { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", INTEGER: "INTEGER" };
  const promptsStart = serverJs.indexOf("const HE_RU_PROMPT");
  const promptsEnd = serverJs.indexOf('app.post("/api/translate-table"');
  const prompts = [serverJs.slice(promptsStart, promptsEnd), segTable.HE_RU_SEG_PROMPT("[0] שלום"),
    buildRepairPrompt([{ row_index: 0, he: "שלום", he_niqqud: "שלם", ru: "мир" }])];
  for (const prompt of prompts) assert.doesNotMatch(prompt, /"translit"|transliteration profile/);
  const rowSchema = buildGeminiTableResponseSchema(Type).properties.rows.items;
  assert.equal(rowSchema.properties.translit, undefined);
  assert.ok(!rowSchema.required.includes("translit"));
  assert.ok(!buildRepairSchema(Type).properties.repairs.items.required.includes("translit"));
});

test("answers paid before O-006 stay reachable under their old cache key", () => {
  const crypto = require("node:crypto");
  const { tableCacheIdentities, buildGeminiCacheKey, PROFILE_FREE_CACHE } = require("../ingest/geminiPolicy");
  const scenario = getGeminiScenario("table-seg-he-ru");
  const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const [current, legacy] = tableCacheIdentities({ scenario, cleanText: "[0] שלום", translitProfile: "sbl" });
  assert.equal(current.cacheProfile, PROFILE_FREE_CACHE);
  assert.equal(current.hashKey, buildGeminiCacheKey({ ...scenario, contentSha256: sha("[0] שלום") }));
  // Ровно та формула, что была в server.js до O-006.
  assert.equal(legacy.hashKey, buildGeminiCacheKey({ model: scenario.model, promptId: "he-ru-table-seg-v4",
    schemaId: "studio-table-rows-schema-v1", contentSha256: sha("[0] שלום\n\u0000translit_profile=sbl") }));
  assert.equal(legacy.cacheProfile, "sbl");
  const [otherProfile] = tableCacheIdentities({ scenario, cleanText: "[0] שלום", translitProfile: "ru-phonetic" });
  assert.equal(otherProfile.hashKey, current.hashKey, "switching profile never pays Gemini again");
});
