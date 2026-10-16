"use strict";

// Morphology gateway — context-aware Hebrew analysis via Dicta (free, no key).
// Mirrors niqqudGateway's shape. Single-provider for now (Dicta cloud); a local
// sidecar morphology provider could be slotted in as a first attempt later,
// exactly like niqqudGateway tries the sidecar before Dicta.

const dictaMorph = require("./providers/dictaMorph");

// Circuit-breaker: Dicta answers a sustained load with HTTP 503/429 to EVERY caller of this server's IP (one bulk parse
// banned the live card for everyone). After one, nobody calls Dicta until the cooldown ends (2 min, doubling on each
// repeated refusal up to 15 min); the first call after it is the probe, and a success resets the breaker.
const COOLDOWN_MIN_MS = 120000, COOLDOWN_MAX_MS = 900000;
const breaker = { until: 0, ms: 0 };
function _now() { return breaker.clock ? breaker.clock() : Date.now(); }
function rateLimitedUntil() { return breaker.until > _now() ? breaker.until : 0; }
function _limited() {
  return { ok: false, tokens: [], model_version: dictaMorph.MODEL_VERSION, provider: "none", degraded: true,
    reason: "rate_limited", retry_after_ms: Math.max(0, breaker.until - _now()) };
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
    breaker.ms = 0;
    return r;
  } catch (e) {
    if (e && (e.status === 503 || e.status === 429)) {
      breaker.ms = Math.min(COOLDOWN_MAX_MS, breaker.ms ? breaker.ms * 2 : COOLDOWN_MIN_MS);
      breaker.until = _now() + breaker.ms;
      console.warn(`[morphology] Dicta HTTP ${e.status}: pausing calls for ${Math.round(breaker.ms / 1000)} s`);
      e.rateLimited = true;
    }
    throw e;
  }
}

module.exports = { analyze, rateLimitedUntil, MODEL_VERSION: dictaMorph.MODEL_VERSION, _breaker: breaker };
