const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../public/tts/core.js");
const backends = require("../public/tts/backends.js");

function createMockAdapter(overrides = {}) {
  let status = {
    runtimeStatus: "runtime_missing",
    modelStatus: "model_missing",
    synthesisStatus: "idle",
    actualBackend: "unavailable",
    fallbackReason: null
  };

  return {
    detectRuntime: async () => false,
    getStatus: () => status,
    loadModel: async () => null,
    synthesize: async () => ({
      audioBuffer: {
        kind: "pcm_f32",
        channels: [new Float32Array([0, 0.5, -0.5])],
        sampleRate: 22050
      },
      sampleRate: 22050,
      durationMs: 10
    }),
    unload: async () => {},
    setStatus(next) {
      status = Object.assign({}, status, next);
    },
    ...overrides
  };
}

test("runtime disabled uses system fallback when allowed", async () => {
  const router = new core.TTSProviderRouter({
    config: {
      enabled: true,
      webWasmEnabled: false,
      allowSystemFallback: true
    },
    backends: {
      system_fallback: {
        isAvailable: async () => true
      }
    }
  });

  const selection = await router.selectBackend({ lang: "he", text: "שלום" }, {});
  assert.equal(selection.backendId, "system_fallback");
  assert.equal(selection.fallbackReason, "web_wasm_disabled");
});

test("runtime disabled and fallback disabled returns unavailable", async () => {
  const router = new core.TTSProviderRouter({
    config: {
      enabled: true,
      webWasmEnabled: false,
      allowSystemFallback: false
    },
    backends: {}
  });

  const selection = await router.selectBackend({ lang: "he", text: "שלום" }, {});
  assert.equal(selection.backendId, "unavailable");
  assert.equal(selection.unavailableReason, "web_wasm_disabled");
});

test("web backend reports model_missing when adapter cannot load model", async () => {
  const adapter = createMockAdapter({
    detectRuntime: async () => true,
    synthesize: async () => {
      throw new Error("model missing");
    }
  });
  const backend = new backends.WebPiperSherpaBackend({
    config: { webWasmEnabled: true },
    runtimeAdapter: adapter,
    cache: new backends.MemoryAudioCache()
  });

  await assert.rejects(
    () =>
      backend.synthesize(
        {
          text: "שלום",
          lang: "he",
          voiceId: "he-default",
          speed: 1,
          manifest: {
            voiceId: "he-default",
            runtime: "sherpa-onnx",
            modelVersion: "v1",
            modelPath: "/tts/models/he/model.onnx",
            configPath: "/tts/models/he/model.onnx.json",
            sampleRate: 22050,
            checksumSha256: "",
            configChecksumSha256: ""
          }
        },
        {
          config: core.DEFAULT_TTS_CONFIG,
          processed: { preprocessingVersion: core.PREPROCESSING_VERSION },
          manifest: {
            voiceId: "he-default",
            runtime: "sherpa-onnx",
            modelVersion: "v1",
            modelPath: "/tts/models/he/model.onnx",
            configPath: "/tts/models/he/model.onnx.json",
            sampleRate: 22050,
            checksumSha256: "",
            configChecksumSha256: ""
          }
        }
      ),
    (error) => error && error.code === "model_missing"
  );
});

test("system fallback diagnostics contain fallback reason", async () => {
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

  assert.equal(result.backend, "system_fallback");
  assert.equal(result.diagnostics.fallbackReason, "web_wasm_runtime_not_ready");
  assert.equal(result.diagnostics.synthesisStatus, "fallback_used");
});
