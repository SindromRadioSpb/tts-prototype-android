const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../public/tts/core.js");

test("cache key is deterministic for identical input", async () => {
  const first = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: "שלום עולם",
    speed: 1.0,
    modelVersion: "v1",
    preprocessingVersion: core.PREPROCESSING_VERSION
  });
  const second = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: "שלום עולם",
    speed: 1.0,
    modelVersion: "v1",
    preprocessingVersion: core.PREPROCESSING_VERSION
  });

  assert.equal(first, second);
});

test("cache key changes when speed changes", async () => {
  const slow = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: "שלום עולם",
    speed: 0.8,
    modelVersion: "v1",
    preprocessingVersion: core.PREPROCESSING_VERSION
  });
  const fast = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: "שלום עולם",
    speed: 1.4,
    modelVersion: "v1",
    preprocessingVersion: core.PREPROCESSING_VERSION
  });

  assert.notEqual(slow, fast);
});

test("cache key changes when modelVersion changes", async () => {
  const first = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: "שלום עולם",
    speed: 1.0,
    modelVersion: "v1",
    preprocessingVersion: core.PREPROCESSING_VERSION
  });
  const second = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: "שלום עולם",
    speed: 1.0,
    modelVersion: "v2",
    preprocessingVersion: core.PREPROCESSING_VERSION
  });

  assert.notEqual(first, second);
});

test("same normalized text yields same cache key", async () => {
  const preprocessor = new core.HebrewPreprocessor();
  const first = preprocessor.preprocess("<b>שלום</b>   עולם", { lang: "he" });
  const second = preprocessor.preprocess("שלום עולם", { lang: "he" });

  const firstKey = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: first.normalizedText,
    speed: 1.0,
    modelVersion: "v1",
    preprocessingVersion: first.preprocessingVersion
  });
  const secondKey = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: second.normalizedText,
    speed: 1.0,
    modelVersion: "v1",
    preprocessingVersion: second.preprocessingVersion
  });

  assert.equal(firstKey, secondKey);
});

test("Hebrew preprocessing preserves niqqud", () => {
  const preprocessor = new core.HebrewPreprocessor();
  const result = preprocessor.preprocess("בָּרוּךְ אַתָּה", { lang: "he" });
  assert.equal(result.normalizedText, "בָּרוּךְ אַתָּה");
});

test("Hebrew preprocessing strips HTML", () => {
  const preprocessor = new core.HebrewPreprocessor();
  const result = preprocessor.preprocess("<span>שלום</span> <b>עולם</b>", { lang: "he" });
  assert.equal(result.normalizedText, "שלום עולם");
});

test("long Hebrew text is split safely", () => {
  const preprocessor = new core.HebrewPreprocessor({ maxChars: 12 });
  const result = preprocessor.preprocess("שלום עולם. בָּרוּךְ אַתָּה. עברית טובה.", {
    lang: "he",
    maxChars: 12
  });

  assert.ok(result.chunks.length >= 2);
  assert.ok(result.chunks.every((chunk) => chunk.length <= 12));
});

test("voice registry returns default voice by lang", () => {
  const registry = new core.TTSVoiceRegistry();
  const voice = registry.getDefaultVoice("ru");
  assert.equal(voice.voiceId, "ru-default");
});

test("manifest loader returns null for missing manifest without crashing", async () => {
  const loader = new core.ModelManifestLoader({
    basePath: "/tts/models",
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });

  const manifest = await loader.loadForLang("he");
  assert.equal(manifest, null);
});

test("router selects web_wasm when backend is available", async () => {
  const router = new core.TTSProviderRouter({
    config: core.DEFAULT_TTS_CONFIG,
    backends: {
      web_wasm: {
        isAvailable: async () => true,
        supportsRequest: async () => true
      },
      system_fallback: {
        isAvailable: async () => true
      }
    }
  });

  const selection = await router.selectBackend({ lang: "he" }, {});
  assert.equal(selection.backendId, "web_wasm");
});

test("router falls back when web_wasm is unavailable", async () => {
  const router = new core.TTSProviderRouter({
    config: core.DEFAULT_TTS_CONFIG,
    backends: {
      web_wasm: {
        isAvailable: async () => false,
        supportsRequest: async () => false,
        lastUnavailableReason: "web_wasm_runtime_not_ready"
      },
      system_fallback: {
        isAvailable: async () => true
      }
    }
  });

  const selection = await router.selectBackend({ lang: "he" }, {});
  assert.equal(selection.backendId, "system_fallback");
});

test("TTS_ENABLED=false disables provider availability", async () => {
  const provider = new core.PortableTtsProvider({
    config: {
      enabled: false,
      allowSystemFallback: false
    },
    backends: {}
  });

  const available = await provider.isAvailable();
  assert.equal(available, false);
});
