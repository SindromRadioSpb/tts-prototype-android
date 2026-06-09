// scripts/premium/lib/stampCanon.js
// BRR-P0-007 · Pure canon-audio stamping core, shared by build-canon-v3.js and
// the smoke gate. No I/O — takes parsed library + manifests, returns the stamped
// library + top-manifest + stats + a `missing` list (non-empty rows with no
// baked key). Keys are recomputed from row text with the SAME profile the bake
// used, so they're identical to the staged MP3 keys (zero drift).

const tb = require("./ttsBake");

const CANON_ORIGIN = "benyehuda-ingest"; // == public/db/local-db.js CANON_ORIGIN
const DEFAULT_CANON_VERSION = 3;

// library  : parsed library.json (mutated in place AND returned)
// bakeManifest : the bake's stamp-manifest { profile, voiceName, assets:{key:{bytes,...}} }
// opts.topManifest : optional top-level manifest.json (counts refreshed if given)
// opts.canonVersion / opts.canonOrigin override the defaults.
function stampCanonAudio(library, bakeManifest, opts) {
  opts = opts || {};
  const canonVersion = opts.canonVersion != null ? opts.canonVersion : DEFAULT_CANON_VERSION;
  const canonOrigin = opts.canonOrigin || CANON_ORIGIN;
  const profile = bakeManifest && bakeManifest.profile;
  const voiceName = bakeManifest && bakeManifest.voiceName;
  const assets = (bakeManifest && bakeManifest.assets) || {};
  if (!profile || !voiceName) throw new Error("bakeManifest missing profile/voiceName");

  const audioAssetsMap = new Map();
  const missing = [];
  let stampedRows = 0, emptyRows = 0, textsVoiced = 0;
  const texts = Array.isArray(library.texts) ? library.texts : [];

  for (const t of texts) {
    const rows = t.rows || t.sentences || [];
    let textRows = 0, textStamped = 0;
    for (const r of rows) {
      const text = tb.rowText(r);
      if (!text) { r.audio_asset_key = null; emptyRows++; continue; }
      textRows++;
      const key = tb.keyForText(text, profile);
      if (!assets[key]) { missing.push({ text_key: t.text_key, row_id: r.row_id, key, preview: text.slice(0, 40) }); continue; }
      r.audio_asset_key = key;
      stampedRows++; textStamped++;
      if (!audioAssetsMap.has(key)) {
        audioAssetsMap.set(key, {
          asset_key: key,
          relative_export_path: "audio/" + key + ".mp3",
          mime_type: "audio/mpeg",
          provider_id: "gcp-tts",
          voice_name: voiceName,
          language: profile.language || "he-IL",
          duration_ms: null,
          size_bytes: (assets[key] && assets[key].bytes) || null,
          content_hash: null,
          provenance: { ttsProfile: profile },
        });
      }
    }
    // R1: claim 'tts' ONLY when every non-empty row of this text is voiced; never 'human'.
    const fullyVoiced = textRows > 0 && textStamped === textRows;
    if (t.corpus && typeof t.corpus === "object") {
      t.corpus.audio_status = fullyVoiced ? "tts" : (t.corpus.audio_status || "none");
    }
    if (fullyVoiced) textsVoiced++;
  }

  // P0-008 stamping (only when the bake is complete — caller decides whether to
  // proceed past `missing`).
  library.canon_version = canonVersion;
  const shelves = Array.isArray(library.shelves) ? library.shelves : [];
  for (const sh of shelves) { sh.origin = canonOrigin; sh.canon_version = canonVersion; }
  library.audio_assets = Array.from(audioAssetsMap.values());

  if (opts.topManifest && typeof opts.topManifest === "object") {
    opts.topManifest.audio_count = library.audio_assets.length;
    opts.topManifest.missing_audio_count = 0;
    opts.topManifest.canon_version = canonVersion;
    opts.topManifest.audio_provider = "gcp-tts:" + voiceName;
  }

  return {
    library,
    topManifest: opts.topManifest || null,
    missing,
    stats: {
      texts: texts.length,
      stampedRows,
      emptyRows,
      textsVoiced,
      uniqueAudioAssets: library.audio_assets.length,
      shelvesStamped: shelves.length,
      canonVersion,
    },
  };
}

module.exports = { stampCanonAudio, CANON_ORIGIN, DEFAULT_CANON_VERSION };
