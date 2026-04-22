const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../public/tts/core.js");
const backends = require("../public/tts/backends.js");

function manifest() {
  return {
    voiceId: "he-default",
    lang: "he",
    provider: core.PROVIDER_NAME,
    runtime: "sherpa-onnx",
    modelVersion: "v1",
    modelPath: "/tts/models/he/model.onnx",
    configPath: "/tts/models/he/model.onnx.json",
    sampleRate: 22050,
    checksumSha256: "",
    configChecksumSha256: "",
    platforms: ["web_wasm"]
  };
}

test("cache miss synthesizes once and cache hit reuses stored audio", async () => {
  const cache = new backends.MemoryAudioCache();
  let synthCalls = 0;
  const backend = new backends.WebPiperSherpaBackend({
    config: { webWasmEnabled: true, cacheEnabled: true, preferredBackend: "web_wasm" },
    cache,
    runtimeAdapter: {
      detectRuntime: async () => true,
      getStatus: () => ({
        runtimeStatus: "runtime_ready",
        modelStatus: "model_ready",
        synthesisStatus: "idle",
        actualBackend: "web_wasm",
        fallbackReason: null
      }),
      synthesize: async () => {
        synthCalls += 1;
        return {
          audioBuffer: {
            kind: "pcm_f32",
            channels: [new Float32Array([0, 0.25, -0.25])],
            sampleRate: 22050
          },
          sampleRate: 22050,
          durationMs: 20
        };
      },
      unload: async () => {}
    }
  });

  const request = {
    text: "שלום עולם",
    lang: "he",
    voiceId: "he-default",
    speed: 1,
    manifest: manifest()
  };
  const context = {
    config: { cacheEnabled: true, preferredBackend: "web_wasm" },
    manifest: manifest(),
    processed: { preprocessingVersion: core.PREPROCESSING_VERSION }
  };

  const first = await backend.synthesize(request, context);
  const second = await backend.synthesize(request, context);

  assert.equal(synthCalls, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
});

test("system fallback audio is not cached as web_wasm result", async () => {
  const cache = new backends.MemoryAudioCache();
  const fallback = new backends.SystemSpeechFallbackBackend({
    speechSynthesisImpl: { cancel() {}, getVoices() { return []; }, speak() {} },
    UtteranceCtor: function MockUtterance() {}
  });

  const result = await fallback.synthesize({
    text: "שלום",
    lang: "he",
    voiceId: "he-default",
    fallbackReason: "web_wasm_runtime_not_ready"
  });

  const key = await core.buildTtsCacheKey({
    provider: core.PROVIDER_NAME,
    voiceId: "he-default",
    lang: "he",
    normalizedText: "שלום",
    speed: 1,
    modelVersion: "v1",
    preprocessingVersion: core.PREPROCESSING_VERSION
  });

  assert.equal(result.backend, "system_fallback");
  assert.equal(await cache.get(key), null);
});
