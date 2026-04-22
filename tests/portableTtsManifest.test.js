const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const path = require("node:path");
const core = require("../public/tts/core.js");

test("manifest validation requires modelPath and configPath", () => {
  const loader = new core.ModelManifestLoader({
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });

  assert.throws(
    () =>
      loader.validate({
        voiceId: "he-default",
        lang: "he",
        provider: core.PROVIDER_NAME,
        runtime: "sherpa-onnx",
        modelVersion: "v1",
        sampleRate: 22050,
        platforms: ["web_wasm"]
      }),
    /Manifest field is required: modelPath/
  );
});

test("repo manifests include config checksum field", () => {
  const manifestPath = path.join(__dirname, "..", "public", "tts", "models", "he", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.ok(Object.prototype.hasOwnProperty.call(manifest, "configChecksumSha256"));
  assert.equal(manifest.runtime, "sherpa-onnx");
  assert.ok(Array.isArray(manifest.platforms));
});

test("english manifest can declare optional tokens and data dir paths", () => {
  const manifestPath = path.join(__dirname, "..", "public", "tts", "models", "en", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.ok(Object.prototype.hasOwnProperty.call(manifest, "tokensPath"));
  assert.ok(Object.prototype.hasOwnProperty.call(manifest, "dataDirPath"));
});

test("missing manifest checksum remains visible to diagnostics", () => {
  const diagnostics = core.createDiagnostics({
    checksumStatus: "missing",
    configChecksumStatus: "missing"
  });

  assert.equal(diagnostics.checksumStatus, "missing");
  assert.equal(diagnostics.configChecksumStatus, "missing");
});
