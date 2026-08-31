"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createResolver, SLUG } = require("../materials/materialsPb2LearningSupport.js");

test("Materials PB2 word audio index is public only for its exact full-TTS edition", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-word-audio-"));
  const assetKey = "b".repeat(64), editionHash = "a".repeat(64);
  const manifest = {
    schema_version: "materials_pb2_learning_support_manifest.1.0.0", corpus_slug: SLUG,
    edition: { edition_id: "materials-pb2-edition-tts", edition_number: 3, manifest_sha256: editionHash },
    rights: { public_read_allowed: true, public_solution_display_and_print_allowed: true, full_tts_audio_and_timings_allowed: true },
    audio_boundary: { full_tts_generated: true },
    public_tts: {
      schema_version: "materials_pb2_public_tts_reference.1.0.0", profile_id: "materials-pb2-standard-a",
      profile: { language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 0.8, pitch: 2.5 },
      asset_manifest_sha256: "c".repeat(64),
      assets: [{ asset_key: assetKey, asset_type: "word" }],
      word_index: [{ text: "שָׁלוֹם", asset_key: assetKey }],
    },
    tasks: Array.from({ length: 60 }, (_, index) => ({ public_work_id: `work-${index + 1}` })),
  };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  try {
    const resolver = createResolver(root);
    const value = resolver.resolveWordAudioIndex({ slug: SLUG, editionId: manifest.edition.edition_id,
      editionNumber: 3, editionManifestSha256: editionHash });
    assert.equal(value.words.length, 1);
    assert.equal(value.words[0].audio_url, "/api/audio/" + assetKey);
    assert.throws(() => resolver.resolveWordAudioIndex({ slug: SLUG, editionId: manifest.edition.edition_id,
      editionNumber: 3, editionManifestSha256: "d".repeat(64) }), /MATERIALS_PB2_LEARNING_SUPPORT_NOT_FOUND/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("current zero-audio support does not expose a word audio index", () => {
  const resolver = createResolver(path.resolve(__dirname, "..", "materials", "pb2-support"));
  const manifest = resolver.loadManifest();
  assert.equal(manifest.audio_boundary.full_tts_generated, false);
  assert.throws(() => resolver.resolveWordAudioIndex({ slug: SLUG, editionId: manifest.edition.edition_id,
    editionNumber: manifest.edition.edition_number, editionManifestSha256: manifest.edition.manifest_sha256 }),
  /MATERIALS_PB2_LEARNING_SUPPORT_NOT_FOUND/);
});
