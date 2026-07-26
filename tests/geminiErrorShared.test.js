"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("ingest/geminiError re-exports the SAME function object as public/js/gemini-error", () => {
  const a = require("../ingest/geminiError.js").classifyGeminiError;
  const b = require("../public/js/gemini-error.js").classifyGeminiError;
  assert.equal(a, b); // идентичность, не эквивалентность — один источник
});

test("classify works on browser-style err {status, message}", () => {
  const c = require("../public/js/gemini-error.js").classifyGeminiError(
    { status: 400, message: "API key not valid. reason API_KEY_INVALID" });
  assert.equal(c.error_code, "GEMINI_KEY_REJECTED");
});
