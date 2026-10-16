"use strict";

// Morphology gateway — context-aware Hebrew analysis via Dicta (free, no key).
// Mirrors niqqudGateway's shape. Single-provider for now (Dicta cloud); a local
// sidecar morphology provider could be slotted in as a first attempt later,
// exactly like niqqudGateway tries the sidecar before Dicta.

const dictaMorph = require("./providers/dictaMorph");

// Circuit-breaker shared with niqqud (dictaBreaker.js): Dicta's ban is per server IP, so a refusal to any of our
// Dicta calls pauses all of them.
const dictaBreaker = require("./dictaBreaker");
function rateLimitedUntil() { return dictaBreaker.openUntil(); }
function _limited() {
  return { ok: false, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: true,
    reason: "rate_limited", retry_after_ms: dictaBreaker.retryAfterMs() };
}

// analyze(sentence) → { ok, tokens, model_version, provider, degraded, reason? }
// tokens: one record per non-separator word, in order:
//   { word, niqqud, prefix, stem, lemma, lemmas[], confident }
async function analyze(sentence, opts) {
  const text = String(sentence == null ? "" : sentence).trim();
  if (!text) {
    return { ok: true, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: false };
  }
  if (rateLimitedUntil()) return _limited();
  try {
    const r = await _analyzeGuarded(text, (opts && opts.genre) || "modern");
    if (r && r.ok && Array.isArray(r.tokens)) {
      // R10 honest degradation: a non-empty HEBREW sentence must yield ≥1 token. Zero
      // tokens means the provider was reached but returned nothing usable (a transient
      // Dicta hiccup, or a garbled/non-Hebrew payload). Surfacing it as success
      // (degraded:false) is a silent failure; report degraded so the client falls back to
      // the offline path consciously instead of trusting an empty result. (NB: prod DOES
      // reach Dicta — a prior "egress blocked" reading was a curl UTF-8 test artifact.)
      if (r.tokens.length === 0 && /[א-ת]/.test(text)) {
        return { ok: false, tokens: [], model_version: r.model_version || dictaMorph.MODEL_VERSION, provider: r.provider || "none", degraded: true, reason: "provider_empty_on_hebrew" };
      }
      return { ok: true, tokens: r.tokens, model_version: r.model_version, provider: r.provider, degraded: false };
    }
    return { ok: false, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: true, reason: "provider_empty" };
  } catch (e) {
    if (e && e.rateLimited) return _limited();
    return { ok: false, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: true, reason: String(e && e.message ? e.message : e) };
  }
}

async function _analyzeGuarded(text, genre) {
  try {
    const r = await dictaMorph.analyzeSentence(text, genre);
    dictaBreaker.noteSuccess();
    return r;
  } catch (e) {
    if (e && dictaBreaker.noteRefusal(e.status, "morphology")) e.rateLimited = true;
    throw e;
  }
}

module.exports = { analyze, rateLimitedUntil, MODEL_VERSION: dictaMorph.MODEL_VERSION, _breaker: dictaBreaker._state };
