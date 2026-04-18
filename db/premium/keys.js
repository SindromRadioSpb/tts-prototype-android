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
// Changing any version or the provider/target produces a different key.
function buildDocKey({ provider, target_lang, normalizedSource }) {
  const parts = [
    "doc",
    SEGMENTER_VERSION,
    NIKUD_VERSION,
    TRANSLIT_PROFILE,
    translatorVersion(provider),
    provider,
    target_lang,
    normalizedSource,
  ];
  return sha256Hex(parts.join("\x1f"));
}

// Segment-level cache key: segmentation is irrelevant (the segment is already
// isolated), so SEGMENTER_VERSION is not part of the key — same segment text
// is reusable across different segmentations of the surrounding document.
function buildSegmentKey({ provider, target_lang, normalizedSegment }) {
  const parts = [
    "seg",
    NIKUD_VERSION,
    TRANSLIT_PROFILE,
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
