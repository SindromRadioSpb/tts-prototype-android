"use strict";

const crypto = require("crypto");

const GEMINI_STUDIO_MODEL = "gemini-3.7-flash";
const GEMINI_ECONOMY_MODEL = "gemini-3.5-flash-lite";

const SCENARIOS = Object.freeze({
  ocr: Object.freeze({
    model: GEMINI_STUDIO_MODEL,
    fallbackModel: null,
    promptId: "ingest-extract-pages-v2",
    schemaId: "ingest-extract-pages-schema-v1",
  }),
  "table-he-ru": Object.freeze({
    model: GEMINI_STUDIO_MODEL,
    fallbackModel: null,
    promptId: "he-ru-table-v2",
    schemaId: "studio-table-rows-schema-v1",
  }),
  "table-any-he": Object.freeze({
    model: GEMINI_STUDIO_MODEL,
    fallbackModel: null,
    promptId: "any-he-table-v2",
    schemaId: "studio-table-rows-schema-v1",
  }),
  "table-seg-he-ru": Object.freeze({
    model: GEMINI_STUDIO_MODEL,
    fallbackModel: null,
    promptId: "he-ru-table-seg-v2",
    schemaId: "studio-table-rows-schema-v1",
  }),
  retell: Object.freeze({
    model: GEMINI_STUDIO_MODEL,
    fallbackModel: null,
    promptId: "retell-he-v1",
    schemaId: "plain-text-v1",
  }),
});

function getGeminiScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    const error = new Error(`Unknown Gemini scenario: ${name}`);
    error.code = "UNKNOWN_GEMINI_SCENARIO";
    throw error;
  }
  return scenario;
}

function buildGeminiCacheKey({ model, promptId, schemaId, contentSha256 }) {
  for (const [field, value] of Object.entries({ model, promptId, schemaId, contentSha256 })) {
    if (typeof value !== "string" || !value.trim()) {
      const error = new Error(`Missing Gemini cache identity field: ${field}`);
      error.code = "BAD_GEMINI_CACHE_IDENTITY";
      throw error;
    }
  }
  const identity = JSON.stringify({
    v: 1,
    model: model.trim(),
    promptId: promptId.trim(),
    schemaId: schemaId.trim(),
    contentSha256: contentSha256.trim().toLowerCase(),
  });
  return crypto.createHash("sha256").update(identity).digest("hex");
}

function cacheMatchesScenario(cached, scenario) {
  return !!(
    cached && scenario
    && cached.model === scenario.model
    && cached.promptId === scenario.promptId
    && cached.schemaId === scenario.schemaId
  );
}

module.exports = {
  GEMINI_STUDIO_MODEL,
  GEMINI_ECONOMY_MODEL,
  getGeminiScenario,
  buildGeminiCacheKey,
  cacheMatchesScenario,
};
