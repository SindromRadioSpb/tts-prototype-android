"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isPlausibleGeminiKey } = require("../ingest/geminiKey.js");

test("accepts AIza and AQ. key formats", () => {
  assert.equal(isPlausibleGeminiKey("AIzaSyA-fake-key-for-tests-123"), true);
  assert.equal(isPlausibleGeminiKey("AQ.fake-new-console-key-123"), true);
});

test("rejects junk", () => {
  for (const bad of [null, undefined, 42, "", "  ", "sk-openai", "AIza", "AQ."]) {
    assert.equal(isPlausibleGeminiKey(bad), false, String(bad));
  }
});
