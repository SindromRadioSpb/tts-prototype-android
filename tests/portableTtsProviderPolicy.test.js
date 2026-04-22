const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../public/tts/providerPolicy.js");

test("English does not use local TTS by default", () => {
  assert.equal(policy.shouldUseLocalTts("en-US", {}), false);
});

test("Hebrew local TTS is disabled by default", () => {
  assert.equal(policy.shouldUseLocalTts("he-IL", {}), false);
});

test("Hebrew local TTS can be explicitly disabled by flag", () => {
  assert.equal(policy.shouldUseLocalTts("he", { hebrewLocalExperimentalEnabled: false }), false);
});

test("Hebrew local TTS is blocked for commercial mode", () => {
  assert.equal(
    policy.shouldUseLocalTts("he", {
      hebrewLocalExperimentalEnabled: true,
      hebrewLocalLicenseMode: "commercial"
    }),
    false
  );
});

test("resolveSelectedProvider normalizes Hebrew local to online by product policy", () => {
  assert.equal(
    policy.resolveSelectedProvider("he-IL", "hebrew_phonikud_piper", {
      hebrewLocalExperimentalEnabled: true,
      hebrewLocalLicenseMode: "noncommercial"
    }),
    "online_tts"
  );
});

test("resolveSelectedProvider normalizes web_wasm to online by product policy", () => {
  assert.equal(
    policy.resolveSelectedProvider("en-US", "local_neural_tts_piper", {}),
    "online_tts"
  );
});

test("Russian does not use local TTS by default", () => {
  assert.equal(policy.shouldUseLocalTts("ru-RU", {}), false);
});
