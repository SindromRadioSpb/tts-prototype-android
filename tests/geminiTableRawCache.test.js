"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { cacheMatchesScenario } = require("../ingest/geminiPolicy.js");
const {
  RAW_TABLE_CACHE_SCHEMA,
  buildRawTableCachePayload,
  readRawTableCache,
  writeRawTableCacheAtomic,
} = require("../ingest/geminiTableRawCache.js");

const scenario = {
  model: "gemini-test",
  promptId: "table-test-v1",
  schemaId: "rows-test-v1",
};

test("raw Gemini table cache preserves a paid response without credentials", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-table-raw-"));
  const file = path.join(dir, "table-raw.json");
  const payload = buildRawTableCachePayload({
    rawText: '{"rows":[{"he":"שלום"}]}',
    scenario,
    modelVersion: "gemini-test-20260825",
    translitProfile: "learner-latin",
    createdAt: "2026-08-25T00:00:00.000Z",
    geminiApiKey: "must-never-persist",
  });
  writeRawTableCacheAtomic(file, payload);
  const onDisk = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(onDisk, /must-never-persist|geminiApiKey/);
  const restored = readRawTableCache(file, scenario, "learner-latin", cacheMatchesScenario);
  assert.equal(restored.cacheSchema, RAW_TABLE_CACHE_SCHEMA);
  assert.equal(restored.rawText, payload.rawText);
  assert.equal(restored.modelVersion, "gemini-test-20260825");
});

test("raw Gemini table cache fails closed for a different model, prompt, schema, or profile", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-table-raw-mismatch-"));
  const file = path.join(dir, "table-raw.json");
  writeRawTableCacheAtomic(file, buildRawTableCachePayload({
    rawText: '{"rows":[]}', scenario, translitProfile: "learner-latin",
  }));
  assert.equal(readRawTableCache(file, { ...scenario, model: "other" }, "learner-latin", cacheMatchesScenario), null);
  assert.equal(readRawTableCache(file, scenario, "sbl", cacheMatchesScenario), null);
});
