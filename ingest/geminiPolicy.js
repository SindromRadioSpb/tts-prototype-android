"use strict";

const crypto = require("crypto");

const GEMINI_STUDIO_MODEL = "gemini-3.8-flash";
const GEMINI_ECONOMY_MODEL = "gemini-3.5-flash-lite";
const GEMINI_STUDIO_THINKING_LEVEL = "medium";
const DEPRECATED_GEMINI_3_CONFIG_FIELDS = Object.freeze([
  "temperature", "topP", "topK", "candidateCount", "thinkingBudget",
]);

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
    promptId: "he-ru-table-v3",
    schemaId: "studio-table-rows-schema-v1",
  }),
  "table-any-he": Object.freeze({
    model: GEMINI_STUDIO_MODEL,
    fallbackModel: null,
    promptId: "any-he-table-v3",
    schemaId: "studio-table-rows-schema-v1",
  }),
  "table-seg-he-ru": Object.freeze({
    model: GEMINI_STUDIO_MODEL,
    fallbackModel: null,
    promptId: "he-ru-table-seg-v3",
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

function buildGeminiStudioConfig(config = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    const error = new Error("Gemini generation config must be an object");
    error.code = "BAD_GEMINI_GENERATION_CONFIG";
    throw error;
  }
  const deprecated = DEPRECATED_GEMINI_3_CONFIG_FIELDS.find((field) =>
    Object.prototype.hasOwnProperty.call(config, field));
  const thinking = config.thinkingConfig;
  const badThinking = thinking !== undefined && (
    !thinking || typeof thinking !== "object" || Array.isArray(thinking)
    || Object.keys(thinking).some((field) => field !== "thinkingLevel")
    || thinking.thinkingLevel !== GEMINI_STUDIO_THINKING_LEVEL
  );
  if (deprecated || badThinking) {
    const error = new Error("Gemini 3.8 config must use the managed thinking level and default sampling");
    error.code = "BAD_GEMINI_GENERATION_CONFIG";
    throw error;
  }
  return {
    ...config,
    thinkingConfig: { thinkingLevel: GEMINI_STUDIO_THINKING_LEVEL },
  };
}

module.exports = {
  GEMINI_STUDIO_MODEL,
  GEMINI_ECONOMY_MODEL,
  GEMINI_STUDIO_THINKING_LEVEL,
  getGeminiScenario,
  buildGeminiCacheKey,
  cacheMatchesScenario,
  buildGeminiStudioConfig,
};
