"use strict";

const crypto = require("crypto");
const {
  SEGMENTER_VERSION,
  NIKUD_VERSION,
  TRANSLIT_PROFILE,
  translatorVersion,
} = require("./versions");

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// Document-level cache key: full pipeline identity + the normalized source.
// translitProfile: the versioned profile string (e.g. "sbl-v3-spirant"), not the
// short profile name — callers must resolve via translitProfileVersion() first.
function buildDocKey({ provider, target_lang, normalizedSource, translitProfile }) {
  const parts = [
    "doc",
    SEGMENTER_VERSION,
    NIKUD_VERSION,
    translitProfile || TRANSLIT_PROFILE,
    translatorVersion(provider),
    provider,
    target_lang,
    normalizedSource,
  ];
  return sha256Hex(parts.join("\x1f"));
}

// Segment-level cache key. Same translitProfile convention as buildDocKey.
function buildSegmentKey({ provider, target_lang, normalizedSegment, translitProfile }) {
  const parts = [
    "seg",
    NIKUD_VERSION,
    translitProfile || TRANSLIT_PROFILE,
    translatorVersion(provider),
    provider,
    target_lang,
    normalizedSegment,
  ];
  return sha256Hex(parts.join("\x1f"));
}

function hashString(s) {
  return sha256Hex(s);
}

module.exports = {
  sha256Hex,
  hashString,
  buildDocKey,
  buildSegmentKey,
};
