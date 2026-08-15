"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "public", "js", "reader-core.js"),
  "utf8"
);

async function readerCore() {
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}

test("row audio indicator follows the Studio ready/missing/mismatch contract", async () => {
  const core = await readerCore();
  assert.equal(typeof core.rowAudioIndicatorPresentation, "function");

  const missing = core.rowAudioIndicatorPresentation({}, { language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 1, pitch: 0 });
  assert.equal(missing.state, "missing");

  const ready = core.rowAudioIndicatorPresentation({
    _v3_audioAssetKey: "sha-ready",
    _v3_audioTtsProfileJson: JSON.stringify({ language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 0.8, pitch: 2.5 }),
  }, { language: "he-IL", voiceName: "", speakingRate: 1, pitch: 0 });
  assert.equal(ready.state, "ok", "incomplete current profile must not hide a usable cached asset");

  const mismatch = core.rowAudioIndicatorPresentation({
    _v3_audioAssetKey: "sha-other-profile",
    _v3_audioTtsProfileJson: JSON.stringify({ language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 1, pitch: 0 }),
  }, { language: "he-IL", voiceName: "he-IL-Wavenet-C", speakingRate: 1, pitch: 0 });
  assert.equal(mismatch.state, "mismatch");
});

test("attachRowAudio exposes one successful-asset callback instead of a second persistence writer", async () => {
  const core = await readerCore();
  assert.match(String(core.attachRowAudio), /onAssetReady/);
});
