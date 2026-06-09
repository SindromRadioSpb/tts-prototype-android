// tests/premium/ttsAssetKey.test.js
// BRR-P0-007 · Guards the content-addressed TTS asset-key contract. server.js
// now require()s this exact module (Slice 1), so a green test here proves the
// offline canon bake and the running server mint byte-identical keys. The frozen
// vector catches any accidental change to the hashing/normalisation (which would
// silently break every stamped audio_asset_key on prod).

const test = require("node:test");
const assert = require("node:assert");
const k = require("../../db/premium/ttsAssetKey");

const ROW_PROFILE = { language: "he-IL", voiceName: "he-IL-Wavenet-D", speakingRate: 1.0, pitch: 0.0 };

test("frozen vector — row asset key is stable", () => {
  const key = k.computeAssetKey({ text: "שָׁלוֹם עוֹלָם", ttsProfile: ROW_PROFILE, assetType: "row" });
  assert.strictEqual(key, "8b370a98f1e5a3371ad24457ba6f344769e4773c1171f3b0df720d0b9f27bf26");
  assert.match(key, /^[a-f0-9]{64}$/);
});

test("engine version is the documented constant", () => {
  assert.strictEqual(k.TTS_ENGINE_VERSION, "gcp-tts-v1");
});

test("profile key order does not change the hash (stableStringify)", () => {
  const a = k.computeAssetKey({ text: "טֶקְסְט", ttsProfile: { language: "he-IL", voiceName: "v", speakingRate: 1, pitch: 0 }, assetType: "row" });
  const b = k.computeAssetKey({ assetType: "row", text: "טֶקְסְט", ttsProfile: { pitch: 0, speakingRate: 1, voiceName: "v", language: "he-IL" } });
  assert.strictEqual(a, b);
});

test("assetType discriminates the key (row != word != text)", () => {
  const base = { text: "אַבָּא", ttsProfile: ROW_PROFILE };
  const row = k.computeAssetKey({ ...base, assetType: "row" });
  const word = k.computeAssetKey({ ...base, assetType: "word" });
  const txt = k.computeAssetKey({ ...base, assetType: "text" });
  assert.notStrictEqual(row, word);
  assert.notStrictEqual(row, txt);
  assert.notStrictEqual(word, txt);
});

test("voice / rate / pitch / language each change the key", () => {
  const t = "מִלָּה";
  const ref = k.computeAssetKey({ text: t, ttsProfile: ROW_PROFILE, assetType: "row" });
  assert.notStrictEqual(ref, k.computeAssetKey({ text: t, ttsProfile: { ...ROW_PROFILE, voiceName: "he-IL-Wavenet-A" }, assetType: "row" }));
  assert.notStrictEqual(ref, k.computeAssetKey({ text: t, ttsProfile: { ...ROW_PROFILE, speakingRate: 0.9 }, assetType: "row" }));
  assert.notStrictEqual(ref, k.computeAssetKey({ text: t, ttsProfile: { ...ROW_PROFILE, pitch: 1.0 }, assetType: "row" }));
  assert.notStrictEqual(ref, k.computeAssetKey({ text: t, ttsProfile: { ...ROW_PROFILE, language: "en-US" }, assetType: "row" }));
});

test("niqqud sensitivity — vocalised text keys differently from consonantal", () => {
  const vocalised = k.computeAssetKey({ text: "שָׁלוֹם", ttsProfile: ROW_PROFILE, assetType: "row" });
  const plain = k.computeAssetKey({ text: "שלום", ttsProfile: ROW_PROFILE, assetType: "row" });
  assert.notStrictEqual(vocalised, plain);
});

test("normalizeTtsProfile fills honest defaults", () => {
  assert.deepStrictEqual(k.normalizeTtsProfile({}), { language: null, voiceName: null, speakingRate: 1, pitch: 0 });
  assert.deepStrictEqual(k.normalizeTtsProfile(null), { language: null, voiceName: null, speakingRate: 1, pitch: 0 });
});

test("getAudioRelativePath is the cache layout the server serves", () => {
  assert.strictEqual(
    k.getAudioRelativePath("8b370a98f1e5a3371ad24457ba6f344769e4773c1171f3b0df720d0b9f27bf26"),
    "audio-cache/8b370a98f1e5a3371ad24457ba6f344769e4773c1171f3b0df720d0b9f27bf26.mp3"
  );
});
