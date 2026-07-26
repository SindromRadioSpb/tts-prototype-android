"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyGeminiError } = require("../ingest/geminiError.js");

// Real Gemini SDK error shapes are strings like:
//   "[GoogleGenerativeAI Error]: Error fetching from https://.../models/gemini-flash-latest:generateContent: [400 Bad Request] API key not valid. Please pass a valid API key. [{...\"reason\":\"API_KEY_INVALID\"...}]"
// classifyGeminiError maps them to a stable {status, error_code} the client can act on.

test("invalid API key -> GEMINI_KEY_REJECTED (400)", () => {
  const msg = '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent: [400 Bad Request] API key not valid. Please pass a valid API key. [{"reason":"API_KEY_INVALID"}]';
  const r = classifyGeminiError(new Error(msg));
  assert.equal(r.error_code, "GEMINI_KEY_REJECTED");
  assert.equal(r.status, 400);
});

test("permission denied -> GEMINI_KEY_REJECTED (400)", () => {
  const msg = '[GoogleGenerativeAI Error]: ... [403 Forbidden] Permission denied [{"reason":"PERMISSION_DENIED"}]';
  const r = classifyGeminiError(new Error(msg));
  assert.equal(r.error_code, "GEMINI_KEY_REJECTED");
  assert.equal(r.status, 400);
});

test("429 rate/quota -> GEMINI_QUOTA (429)", () => {
  const msg = '[GoogleGenerativeAI Error]: ... [429 Too Many Requests] Resource has been exhausted (e.g. check quota). [{"reason":"RESOURCE_EXHAUSTED"}]';
  const r = classifyGeminiError(new Error(msg));
  assert.equal(r.error_code, "GEMINI_QUOTA");
  assert.equal(r.status, 429);
});

test("503 overloaded -> GEMINI_OVERLOADED (503)", () => {
  const msg = '[GoogleGenerativeAI Error]: ... [503 Service Unavailable] The model is overloaded. Please try again later.';
  const r = classifyGeminiError(new Error(msg));
  assert.equal(r.error_code, "GEMINI_OVERLOADED");
  assert.equal(r.status, 503);
});

test("unknown -> GEMINI_FAILED (502)", () => {
  const r = classifyGeminiError(new Error("some totally unexpected failure"));
  assert.equal(r.error_code, "GEMINI_FAILED");
  assert.equal(r.status, 502);
});

test("null/garbage input fails safe to GEMINI_FAILED (502)", () => {
  for (const bad of [null, undefined, {}, 42, "plain string with no markers"]) {
    const r = classifyGeminiError(bad);
    assert.equal(r.error_code, "GEMINI_FAILED", String(bad));
    assert.equal(r.status, 502);
  }
});

test("prefers explicit numeric err.status when present", () => {
  const e = new Error("wrapped");
  e.status = 429;
  const r = classifyGeminiError(e);
  assert.equal(r.error_code, "GEMINI_QUOTA");
  assert.equal(r.status, 429);
});
