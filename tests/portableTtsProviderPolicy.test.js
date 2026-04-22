const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../public/tts/providerPolicy.js");

test("English uses local TTS by default", () => {
  assert.equal(policy.shouldUseLocalTts("en-US", {}), true);
});

test("Hebrew stays on online TTS by default", () => {
  assert.equal(policy.shouldUseLocalTts("he-IL", {}), false);
});

test("Hebrew local TTS requires explicit experimental flag", () => {
  assert.equal(
    policy.shouldUseLocalTts("he", { hebrewLocalExperimentalEnabled: true }),
    true
  );
});

test("Russian does not use local TTS by default", () => {
  assert.equal(policy.shouldUseLocalTts("ru-RU", {}), false);
});
