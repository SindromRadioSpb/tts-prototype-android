const test = require("node:test");
const assert = require("node:assert/strict");

const settings = require("../public/tts/settings.js");

test("legacy flat settings migrate without losing speed pitch and online voice", () => {
  const migrated = settings.parseStoredSettings(JSON.stringify({
    voice: "he-IL-Standard-A",
    rate: 1.3,
    pitch: -0.5
  }));

  assert.equal(migrated.selectedProvider, "online_tts");
  assert.equal(migrated.speed, 1.3);
  assert.equal(migrated.pitch, -0.5);
  assert.equal(migrated.voices.online_tts, "he-IL-Standard-A");
});

test("settings serialize and restore selected provider with per-provider voices", () => {
  const raw = settings.serializeSettings({
    selectedProvider: "hebrew_phonikud_piper",
    speed: 1.1,
    pitch: 0,
    voices: {
      online_tts: "he-IL-Standard-B",
      hebrew_phonikud_piper: "shaul",
      local_neural_tts_piper: "en-default",
      system_fallback: ""
    }
  });

  const restored = settings.parseStoredSettings(raw);
  assert.equal(restored.selectedProvider, "hebrew_phonikud_piper");
  assert.equal(restored.voices.online_tts, "he-IL-Standard-B");
  assert.equal(restored.voices.hebrew_phonikud_piper, "shaul");
  assert.equal(restored.speed, 1.1);
});

test("unknown provider normalizes back to online_tts", () => {
  const restored = settings.parseStoredSettings(JSON.stringify({
    selectedProvider: "unknown_provider",
    speed: 1.0,
    pitch: 0,
    voices: {}
  }));

  assert.equal(restored.selectedProvider, "online_tts");
});

test("setVoiceForProvider updates only requested provider slot", () => {
  const next = settings.setVoiceForProvider(settings.DEFAULT_SETTINGS, "hebrew_phonikud_piper", "shaul");
  assert.equal(next.voices.hebrew_phonikud_piper, "shaul");
  assert.equal(next.voices.local_neural_tts_piper, "en-default");
});
