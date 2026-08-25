#!/usr/bin/env node
"use strict";

// Turn a preserved raw Gemini table response into a publishable cache only
// when every source correction is scan-backed and the repaired rows still
// preserve the complete corrected Hebrew input. This never calls Gemini.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildRowsFromGeminiPayload,
  canonicalizeKnownNiqqudRows,
  validateHebrewSourceCoverage,
} = require("../../ingest/tableRows.js");
const {
  buildGeminiCacheKey,
  cacheMatchesScenario,
  getGeminiScenario,
} = require("../../ingest/geminiPolicy.js");
const { transliterateWithProfile } = require("../../db/premium/translit.js");
const { translitProfileVersion } = require("../../db/premium/versions.js");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key || !key.startsWith("--") || argv[i + 1] == null) {
      throw new Error(`Bad argument at position ${i}: ${key || "<empty>"}`);
    }
    out[key.slice(2)] = argv[i + 1];
  }
  for (const name of ["raw-cache", "corrected-input", "corrections", "output"]) {
    if (!out[name]) throw new Error(`--${name} is required`);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function countOccurrences(value, token) {
  if (!token) return 0;
  return String(value).split(token).length - 1;
}

function cleanRawJson(value) {
  return String(value || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawPath = path.resolve(args["raw-cache"]);
  const inputPath = path.resolve(args["corrected-input"]);
  const correctionsPath = path.resolve(args.corrections);
  const outputPath = path.resolve(args.output);
  const rawCache = readJson(rawPath);
  const correctionSpec = readJson(correctionsPath);
  const correctedText = fs.readFileSync(inputPath, "utf8").trim();
  const scenario = getGeminiScenario("table-he-ru");
  const profile = rawCache.translitProfile || "learner-latin";

  if (!cacheMatchesScenario(rawCache, scenario)) {
    throw new Error("Raw cache does not match the current table-he-ru scenario");
  }
  const parsed = JSON.parse(cleanRawJson(rawCache.rawText));
  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
    throw new Error("Raw cache has no table rows");
  }

  const applied = [];
  for (const correction of correctionSpec.replacements || []) {
    const from = String(correction.from || "");
    const to = String(correction.to || "");
    const expected = Number(correction.expected_count);
    const actual = parsed.rows.reduce(
      (sum, row) => sum + countOccurrences(row && row.he, from), 0);
    if (!from || !Number.isInteger(expected) || expected < 0 || actual !== expected) {
      throw new Error(`Correction count mismatch for ${JSON.stringify(from)}: expected ${expected}, got ${actual}`);
    }
    for (const row of parsed.rows) {
      if (row && typeof row.he === "string") row.he = row.he.split(from).join(to);
    }
    applied.push({
      from,
      to,
      count: actual,
      source_page: correction.source_page,
      source_filename: correction.source_filename,
      source_image_sha256: correction.source_image_sha256,
      reason: correction.reason,
    });
  }

  // These two checks fail closed on any remaining niqqud consonant rewrite or
  // omitted/duplicated Hebrew source content.
  let rows = buildRowsFromGeminiPayload(parsed, { direction: "he-ru" });
  validateHebrewSourceCoverage(rows, correctedText);

  const normalized = canonicalizeKnownNiqqudRows(rows);
  rows = normalized.rows;
  const profileVersion = translitProfileVersion(profile);
  rows.forEach((row) => {
    row.translit = transliterateWithProfile(row.he_niqqud, profile) || "";
    row.translation_provider = `gemini:${scenario.model}`;
    row.translation_meta_json = JSON.stringify({
      provider: "gemini",
      model: scenario.model,
      modelVersion: rawCache.modelVersion || null,
      promptId: scenario.promptId,
      schemaId: scenario.schemaId,
      translitProfile: profileVersion,
      localNiqqudNormalization: normalized.corrections.length > 0,
      localSourceCorrection: applied.length > 0,
    });
  });

  const taskNumbers = rows
    .map((row) => String(row.he || "").match(/שאלה\s+(\d+\.\d+)/))
    .filter(Boolean)
    .map((match) => match[1]);
  const expectedTasks = [...correctedText.matchAll(/שאלה\s+(\d+\.\d+)/g)].map((match) => match[1]);
  if (JSON.stringify(taskNumbers) !== JSON.stringify(expectedTasks)) {
    throw new Error(`Task sequence mismatch: rows=${taskNumbers.join(",")} input=${expectedTasks.join(",")}`);
  }

  const contentSha256 = crypto.createHash("sha256")
    .update(`${correctedText}\n\u0000translit_profile=${profile}`)
    .digest("hex");
  const cacheKey = buildGeminiCacheKey({ ...scenario, contentSha256 });
  const warnings = [];
  if (normalized.corrections.length) warnings.push("LOCAL_NIQQUD_CANONICALIZED");
  if (applied.length) warnings.push("LOCAL_SOURCE_CORRECTED_FROM_SCAN");
  const payload = {
    text: correctedText,
    rows,
    warnings,
    model: scenario.model,
    modelVersion: rawCache.modelVersion || null,
    promptId: scenario.promptId,
    schemaId: scenario.schemaId,
    translitProfile: profile,
    translitProfileVersion: profileVersion,
    localNiqqudCorrections: normalized.corrections,
    localSourceCorrections: applied,
    createdAt: rawCache.createdAt || new Date().toISOString(),
    repairedAt: new Date().toISOString(),
    rawCacheSha256: crypto.createHash("sha256").update(fs.readFileSync(rawPath)).digest("hex"),
    correctedInputSha256: crypto.createHash("sha256").update(fs.readFileSync(inputPath)).digest("hex"),
    cacheKey,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({
    output: outputPath,
    cacheKey,
    rowCount: rows.length,
    taskCount: taskNumbers.length,
    repairs: applied.length,
    warnings,
  }, null, 2) + "\n");
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ error: error && error.message ? error.message : String(error) }));
  process.exit(1);
}
