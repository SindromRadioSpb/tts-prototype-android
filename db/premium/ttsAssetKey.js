// db/premium/ttsAssetKey.js
// BRR-P0-007 · Single source of truth for the content-addressed TTS asset key.
//
// Extracted verbatim from server.js so the offline canon-audio bake
// (scripts/premium/bake-canon-audio.js) computes byte-IDENTICAL keys to the
// running server's /api/tts (ensureAudioAsset). A locally-baked MP3 is therefore
// valid on prod under the same key, and a stamped audio_asset_key in the bundle
// resolves to it via reader-core attachRowAudio tier-1 (HEAD /api/audio/:key).
//
// The key is SHA-256 over a STABLE-stringified payload
//   { assetType, engine, ttsProfile:{language,voiceName,speakingRate,pitch}, text }
// — order-independent (keys sorted), so any caller producing the same logical
// inputs gets the same hash. DO NOT change shapes/normalisation here without
// bumping TTS_ENGINE_VERSION (that invalidates every cached asset key).

const crypto = require("crypto");

// Bump when you change engine/ssml normalisation etc. (invalidates all keys).
const TTS_ENGINE_VERSION = "gcp-tts-v1";

function stableStringify(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function normalizeTtsProfile(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  return {
    language: p.language || null,
    voiceName: p.voiceName || null,
    speakingRate: (p.speakingRate == null ? 1.0 : Number(p.speakingRate)),
    pitch: (p.pitch == null ? 0.0 : Number(p.pitch)),
  };
}

function computeAssetKey({ text, ttsProfile, assetType }) {
  const payload = {
    assetType: String(assetType || "row"),
    engine: TTS_ENGINE_VERSION,
    ttsProfile: normalizeTtsProfile(ttsProfile),
    text: String(text || ""),
  };
  return crypto.createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

function getAudioRelativePath(assetKey) {
  return `audio-cache/${assetKey}.mp3`;
}

module.exports = {
  TTS_ENGINE_VERSION,
  stableStringify,
  normalizeTtsProfile,
  computeAssetKey,
  getAudioRelativePath,
};
