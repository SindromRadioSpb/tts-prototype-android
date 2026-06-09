// scripts/premium/lib/ttsBake.js
// BRR-P0-007 · Shared offline GCP-TTS bake primitives for the canon audio
// pre-bake (Slice 0 voice sample + Slice 2 full bake). DB-free, key-from-env.
//
// The asset key is computed with db/premium/ttsAssetKey.js — the SAME module
// server.js require()s — so a baked MP3 is valid on prod under its key and a
// stamped audio_asset_key resolves to it via reader-core tier-1. We synthesize
// by calling texttospeech.googleapis.com directly (mirrors server.js
// gcpTtsRestSynthesize); no running server needed, canonical assetType:'row'.

const { computeAssetKey } = require("../../../db/premium/ttsAssetKey");

// Hebrew WaveNet voices offered by GCP (2 female A/C, 2 male B/D).
const VOICE_CANDIDATES = ["he-IL-Wavenet-A", "he-IL-Wavenet-B", "he-IL-Wavenet-C", "he-IL-Wavenet-D"];

// GCP synthesize input cap is ~5000 BYTES; stay safely under (mirrors server.js).
const TTS_MAX_INPUT_BYTES = 4900;
const TTS_SAFE_TARGET_BYTES = 4700;

function utf8Len(s) { return Buffer.byteLength(String(s || ""), "utf8"); }

// Row → the exact string fed to TTS: vocalised (niqqud) wins, else consonantal —
// byte-identical rule to reader-core.getRowTtsTextForRow, so the cached audio
// matches what the reader would otherwise synthesize (R1).
function rowText(row) {
  if (!row || typeof row !== "object") return "";
  const niqqud = String(row.hebrew_niqqud || row.he_niqqud || "").trim();
  if (niqqud) return niqqud;
  const plain = String(row.hebrew_plain || row.he_plain || "").trim();
  return plain || "";
}

// Pinned default profile for the keyless canon narration.
function defaultProfile(voiceName) {
  return { language: "he-IL", voiceName: String(voiceName || ""), speakingRate: 1.0, pitch: 0.0 };
}

// Canonical 'row' asset key for a given text + profile (matches the server +
// a BYOK tier-2 synth of the same row → shared cache entry).
function keyForText(text, profile) {
  return computeAssetKey({ text: String(text || ""), ttsProfile: profile, assetType: "row" });
}

// Safety chunker for the rare row > limit (canon max is ~2KB so this never
// fires, but never silently truncate — R1). Greedy whitespace pack; hard
// char-split only if a single token itself exceeds the limit. The key is over
// the FULL text, so chunk boundaries only affect prosody at the (non-existent)
// split, never correctness.
function splitForTts(text, maxBytes = TTS_SAFE_TARGET_BYTES) {
  const src = String(text || "").trim();
  if (!src) return [];
  if (utf8Len(src) <= maxBytes) return [src];
  const parts = [];
  let buf = "";
  for (const tok of src.split(/(\s+)/)) {
    if (!tok) continue;
    const cand = buf + tok;
    if (utf8Len(cand) <= maxBytes) { buf = cand; continue; }
    if (buf.trim()) parts.push(buf.trim());
    if (utf8Len(tok) <= maxBytes) { buf = tok; continue; }
    let w = "";
    for (const ch of Array.from(tok)) {
      const c = w + ch;
      if (utf8Len(c) <= maxBytes) w = c;
      else { if (w.trim()) parts.push(w.trim()); w = ch; }
    }
    buf = w;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.filter(Boolean);
}

async function gcpSynth(apiKey, request) {
  const url = "https://texttospeech.googleapis.com/v1/text:synthesize?key=" + encodeURIComponent(apiKey);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!resp.ok) {
    let bodyText = "";
    try { bodyText = await resp.text(); } catch (_) {}
    let parsed = null;
    try { parsed = JSON.parse(bodyText); } catch (_) {}
    const err = new Error((parsed && parsed.error && parsed.error.message) || ("Google TTS REST error: HTTP " + resp.status));
    err.status = resp.status;
    err.code = parsed && parsed.error && parsed.error.status;
    throw err;
  }
  const data = await resp.json();
  if (!data || !data.audioContent) throw new Error("Google TTS REST: empty audioContent");
  return Buffer.from(data.audioContent, "base64");
}

// text + profile → MP3 Buffer (chunk+concat if oversized). Throws on any tier
// failure (no silent empty audio).
async function synthesizeMp3(apiKey, text, profile) {
  const clean = String(text || "").trim();
  if (!clean) return Buffer.alloc(0);
  if (!apiKey) { const e = new Error("GCP TTS API key required (env)"); e.code = "TTS_KEY_REQUIRED"; throw e; }
  const p = profile || {};
  const voice = { languageCode: p.language || "he-IL", name: p.voiceName || undefined };
  const audioConfig = { audioEncoding: "MP3", speakingRate: p.speakingRate || 1.0, pitch: p.pitch || 0.0 };
  if (utf8Len(clean) <= TTS_MAX_INPUT_BYTES) {
    return await gcpSynth(apiKey, { input: { text: clean }, voice, audioConfig });
  }
  const buffers = [];
  for (const part of splitForTts(clean, TTS_SAFE_TARGET_BYTES)) {
    const b = await gcpSynth(apiKey, { input: { text: part }, voice, audioConfig });
    if (!b || !b.length) throw new Error("empty chunk audio");
    buffers.push(b);
  }
  return Buffer.concat(buffers);
}

module.exports = {
  VOICE_CANDIDATES,
  TTS_MAX_INPUT_BYTES,
  TTS_SAFE_TARGET_BYTES,
  utf8Len,
  rowText,
  defaultProfile,
  keyForText,
  splitForTts,
  gcpSynth,
  synthesizeMp3,
};
