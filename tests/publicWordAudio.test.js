"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PublicWordAudio = require("../public/js/public-word-audio.js");

test("public word audio loads one immutable index and resolves NFC-equivalent forms", async () => {
  let fetches = 0;
  const resolver = PublicWordAudio.createResolver({
    endpoint: "/word-index",
    fetchImpl: async () => {
      fetches += 1;
      return { ok: true, json: async () => ({
        schema_version: "materials_pb2_public_word_audio.1.0.0",
        edition_id: "ed-1", edition_manifest_sha256: "a".repeat(64), profile_id: "profile-1",
        words: [{ text: "שָׁלוֹם", asset_key: "b".repeat(64), audio_url: "/api/audio/" + "b".repeat(64) }],
      }) };
    },
  });
  const first = await resolver.resolve(" שָׁלוֹם ");
  const second = await resolver.resolve("שָׁלוֹם".normalize("NFD"));
  assert.equal(first.asset_key, "b".repeat(64));
  assert.equal(second.audio_url, first.audio_url);
  assert.equal(fetches, 1);
});

test("public word audio fails closed for malformed or absent assets", async () => {
  const malformed = PublicWordAudio.createResolver({ fetchImpl: async () => ({ ok: true, json: async () => ({ words: [{ text: "מִלָּה", asset_key: "bad" }] }) }) });
  assert.equal(await malformed.resolve("מִלָּה"), null);
  const unavailable = PublicWordAudio.createResolver({ fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(await unavailable.resolve("מִלָּה"), null);
  assert.equal(await unavailable.resolve("מִלָּה"), null);
});
