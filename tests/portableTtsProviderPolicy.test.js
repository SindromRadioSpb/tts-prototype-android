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

test("Hebrew local TTS is blocked for commercial mode", () => {
  assert.equal(
    policy.shouldUseLocalTts("he", {
      hebrewLocalExperimentalEnabled: true,
      hebrewLocalLicenseMode: "commercial"
    }),
    false
  );
});

test("resolveSelectedProvider keeps Hebrew local when noncommercial mode is allowed", () => {
  assert.equal(
    policy.resolveSelectedProvider("he-IL", "hebrew_phonikud_piper", {
      hebrewLocalExperimentalEnabled: true,
      hebrewLocalLicenseMode: "noncommercial"
    }),
    "hebrew_phonikud_piper"
  );
});

test("resolveSelectedProvider falls back to online when Hebrew local is blocked", () => {
  assert.equal(
    policy.resolveSelectedProvider("he-IL", "hebrew_phonikud_piper", {
      hebrewLocalExperimentalEnabled: true,
      hebrewLocalLicenseMode: "commercial"
    }),
    "online_tts"
  );
});

test("Russian does not use local TTS by default", () => {
  assert.equal(policy.shouldUseLocalTts("ru-RU", {}), false);
});
