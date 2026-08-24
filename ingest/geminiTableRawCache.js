"use strict";

const fs = require("fs");
const path = require("path");

const RAW_TABLE_CACHE_SCHEMA = "linguistpro.gemini-table-raw.1";

function buildRawTableCachePayload({ rawText, scenario, modelVersion, translitProfile, createdAt }) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new TypeError("rawText is required");
  }
  if (!scenario || !scenario.model || !scenario.promptId || !scenario.schemaId) {
    throw new TypeError("complete Gemini scenario is required");
  }
  return {
    cacheSchema: RAW_TABLE_CACHE_SCHEMA,
    rawText,
    model: scenario.model,
    modelVersion: modelVersion || null,
    promptId: scenario.promptId,
    schemaId: scenario.schemaId,
    translitProfile: translitProfile || "learner-latin",
    createdAt: createdAt || new Date().toISOString(),
  };
}

function readRawTableCache(cacheFile, scenario, translitProfile, cacheMatchesScenario) {
  if (!fs.existsSync(cacheFile)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (cached.cacheSchema !== RAW_TABLE_CACHE_SCHEMA
        || typeof cached.rawText !== "string" || !cached.rawText.trim()
        || cached.translitProfile !== translitProfile
        || !cacheMatchesScenario(cached, scenario)) {
      return null;
    }
    return cached;
  } catch (_) {
    return null;
  }
}

function writeRawTableCacheAtomic(cacheFile, payload) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const tmp = `${cacheFile}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, cacheFile);
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  }
}

module.exports = {
  RAW_TABLE_CACHE_SCHEMA,
  buildRawTableCachePayload,
  readRawTableCache,
  writeRawTableCacheAtomic,
};
