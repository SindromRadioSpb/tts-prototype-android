"use strict";

// One-request BYOK production-policy gate for Gemini 3.8 Flash. The key and
// request/response text never leave this process and are never persisted.
const fs = require("node:fs");
const path = require("node:path");
const { Type } = require("@google/genai");
const { generateGeminiContent } = require("../../ingest/geminiClient");
const { getGeminiScenario, buildGeminiStudioConfig } = require("../../ingest/geminiPolicy");
const { buildGeminiTableResponseSchema } = require("../../ingest/geminiTableSchema");
const { buildRowsFromGeminiPayload } = require("../../ingest/tableRows");
const segTable = require("../../ingest/segTable");

function readArg(name) {
  const prefix = `${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

async function main() {
  const keyFile = readArg("--key-file");
  if (!keyFile) throw Object.assign(new Error("missing key file"), { code: "KEY_FILE_REQUIRED" });
  const apiKey = fs.readFileSync(path.resolve(keyFile), "utf8").trim();
  const scenario = getGeminiScenario("table-seg-he-ru");
  const segments = [{ i: 0, text: "שלום." }, { i: 1, text: "תודה רבה." }];
  const started = Date.now();
  const generated = await generateGeminiContent({
    apiKey,
    scenario,
    contents: segTable.HE_RU_SEG_PROMPT(segTable.buildSegInput(segments)),
    config: buildGeminiStudioConfig({
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: buildGeminiTableResponseSchema(Type),
    }),
  });
  const cleaned = generated.text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const rows = buildRowsFromGeminiPayload(JSON.parse(cleaned), { direction: "he-ru" }, { keepSegmentIndex: true });
  if (rows.length !== segments.length || rows.some((row, index) => row.segment_index !== index)) {
    throw Object.assign(new Error("unexpected coverage"), { code: "COVERAGE_MISMATCH" });
  }
  const usage = generated.usageMetadata || {};
  process.stdout.write(`${JSON.stringify({
    status: "TECHNICAL_PASS",
    requestedModel: scenario.model,
    modelVersion: /^[A-Za-z0-9._-]{1,100}$/.test(generated.modelVersion || "") ? generated.modelVersion : null,
    rows: rows.length,
    coveredSegments: new Set(rows.map((row) => row.segment_index)).size,
    promptTokens: Number(usage.promptTokenCount) || null,
    outputTokens: Number(usage.candidatesTokenCount) || null,
    thinkingTokens: Number(usage.thoughtsTokenCount) || null,
    elapsedMs: Date.now() - started,
  })}\n`);
}

main().catch((error) => {
  const code = /^[A-Z0-9_]{2,80}$/.test(error && error.code || "") ? error.code : "LIVE_GATE_ERROR";
  const status = Number(error && (error.status || error.statusCode)) || null;
  process.stderr.write(`${JSON.stringify({ status: "FAIL", code, httpStatus: status })}\n`);
  process.exitCode = 1;
});
