"use strict";

// Morphology gateway — context-aware Hebrew analysis via Dicta (free, no key).
// Mirrors niqqudGateway's shape. Single-provider for now (Dicta cloud); a local
// sidecar morphology provider could be slotted in as a first attempt later,
// exactly like niqqudGateway tries the sidecar before Dicta.

const dictaMorph = require("./providers/dictaMorph");

// analyze(sentence) → { ok, tokens, model_version, provider, degraded, reason? }
// tokens: one record per non-separator word, in order:
//   { word, niqqud, prefix, stem, lemma, lemmas[], confident }
async function analyze(sentence, opts) {
  const text = String(sentence == null ? "" : sentence).trim();
  if (!text) {
    return { ok: true, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: false };
  }
  try {
    const r = await dictaMorph.analyzeSentence(text, (opts && opts.genre) || "modern");
    if (r && r.ok && Array.isArray(r.tokens)) {
      return { ok: true, tokens: r.tokens, model_version: r.model_version, provider: r.provider, degraded: false };
    }
    return { ok: false, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: true, reason: "provider_empty" };
  } catch (e) {
    return { ok: false, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: true, reason: String(e && e.message ? e.message : e) };
  }
}

module.exports = { analyze, MODEL_VERSION: dictaMorph.MODEL_VERSION };
