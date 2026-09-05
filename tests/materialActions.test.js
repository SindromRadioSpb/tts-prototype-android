"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const MaterialActions = require("../public/js/material-actions.js");

test("one capability model covers local, public and protected materials", () => {
  assert.deepEqual(MaterialActions.capabilities({ kind: "local" }), {
    share: true, morphology: true, obsidian: true, machineNiqqud: true, protectedLinkOnly: false,
  });
  assert.equal(MaterialActions.capabilities({ kind: "public", slug: "study-songs" }).obsidian, true);
  assert.equal(MaterialActions.capabilities({ kind: "group", corpusId: "songs" }).protectedLinkOnly, true);
  assert.equal(MaterialActions.capabilities({ kind: "group", corpusId: "songs" }).obsidian, false);
});

test("audio transport follows the material authority", () => {
  const key = "a".repeat(64);
  assert.equal(MaterialActions.audioUrl({ kind: "local" }, key), "/api/audio/" + key);
  assert.equal(MaterialActions.audioUrl({ kind: "benyehuda" }, key), "/api/audio/" + key);
  assert.equal(MaterialActions.audioUrl({ kind: "public", slug: "study-songs" }, key), "/api/public-corpora/study-songs/assets/" + key);
  assert.equal(MaterialActions.audioUrl({ kind: "group", corpusId: "aleph/bet" }, key), "/api/group-corpora/aleph%2Fbet/audio/" + key);
});

test("source-aware fetch returns exact bytes", async () => {
  let requested = "";
  const bytes = await MaterialActions.fetchAudioAsset({ kind: "public", slug: "study-songs" }, "b".repeat(64), {
    fetch: async url => { requested = url; return { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }; },
  });
  assert.equal(requested, "/api/public-corpora/study-songs/assets/" + "b".repeat(64));
  assert.deepEqual(Array.from(new Uint8Array(bytes)), [1, 2, 3]);
});
