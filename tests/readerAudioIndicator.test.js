"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "public", "js", "reader-core.js"),
  "utf8"
);
const mediaHostSource = fs.readFileSync(
  path.resolve(__dirname, "..", "public", "js", "media-host.js"),
  "utf8"
);

async function readerCore() {
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}

function fakeButton() {
  const classes = new Set();
  const attrs = new Map();
  return {
    dataset: {},
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    removeAttribute(name) { attrs.delete(name); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    textContent: "",
    title: "",
    disabled: false,
  };
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

test("row TTS is activated only by its explicit button, never by a content-cell click", async () => {
  const core = await readerCore();
  const attachSource = String(core.attachRowAudio);
  assert.match(attachSource, /closest\("button\.row-tts-btn"\)/,
    "the delegated handler must recognize the explicit row TTS button");
  assert.doesNotMatch(attachSource, /tapToHearExcludeCols|closest\(['"]#proTable tbody td\[data-col\]/,
    "table cells must not remain hidden playback controls");
});

test("the explicit original-media replay button remains isolated from row TTS", () => {
  assert.match(mediaHostSource,
    /className\s*=\s*"smk-row-replay"[\s\S]{0,260}addEventListener\("click"[\s\S]{0,120}stopPropagation\(\)[\s\S]{0,260}onReplay/,
    "the media-chunk control must keep its own stopped-propagation playback route");
});

test("public cached-only playback cannot fall through to BYOK or browser speech", async () => {
  const core = await readerCore();
  const source = String(core.attachRowAudio);
  assert.match(source, /fallbackPolicy/);
  assert.match(source, /cached-only/);
  assert.match(source, /CACHED_AUDIO_REQUIRED/);
});

test("row TTS action names and ARIA state change atomically without exposing provider errors", async () => {
  const core = await readerCore();
  const button = fakeButton();
  const labels = { play: "Play", loading: "Loading", stop: "Stop", retry: "Retry" };

  const expected = {
    idle: ["▶", "Play", "false", "false", false],
    loading: ["…", "Loading", "true", "false", true],
    playing: ["■", "Stop", "false", "true", false],
    error: ["!", "Retry", "false", "false", false],
  };
  for (const [state, [glyph, name, busy, pressed, disabled]] of Object.entries(expected)) {
    assert.equal(core.applyRowTtsButtonState(button, state, labels).state, state);
    assert.equal(button.dataset.audioControlState, state);
    assert.equal(button.textContent, glyph);
    assert.equal(button.getAttribute("aria-label"), name);
    assert.equal(button.getAttribute("aria-busy"), busy);
    assert.equal(button.getAttribute("aria-pressed"), pressed);
    assert.equal(button.disabled, disabled);
  }
});
