"use strict";

// Unofficial Google Translate via the client=gtx endpoint.
// No API key required. For non-commercial personal use only.
//
// Strategy: newline-joined batch request (one HTTP call for all segments).
// Falls back to controlled-concurrency individual requests if the line count
// in the response doesn't match the input (Google occasionally collapses lines).

const https = require("https");

const SOURCE_LANG  = "iw";                  // Hebrew — legacy code used by gtx endpoint
const MODEL_VERSION = "google-free-gtx-v1";
const TIMEOUT_MS    = 20000;

function _get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        if (res.statusCode === 429) {
          const e = new Error("Google Translate: rate limit (429)");
          e.status = 429; e.kind = "rate_limit"; return reject(e);
        }
        if (res.statusCode >= 400) {
          const e = new Error(`Google Translate: HTTP ${res.statusCode}`);
          e.status = res.statusCode;
          e.kind = res.statusCode >= 500 ? "transient" : "unknown";
          return reject(e);
        }
        try { resolve(JSON.parse(body)); }
        catch (_) { reject(new Error("Google Translate: invalid JSON")); }
      });
    });
    req.on("error", (e) => { e.kind = "network"; reject(e); });
    req.on("timeout", () => {
      req.destroy();
      const e = new Error("Google Translate: timeout");
      e.kind = "timeout"; reject(e);
    });
  });
}

async function _translateText(text, targetLang) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx" +
    "&sl=" + SOURCE_LANG +
    "&tl=" + encodeURIComponent(targetLang) +
    "&dt=t" +
    "&q=" + encodeURIComponent(text);
  const data = await _get(url);
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Google Translate: unexpected response shape");
  }
  return data[0].map((item) => (item && item[0]) || "").join("");
}

// Individual fallback — used when the batch line count doesn't match.
async function _translateIndividual(segments, targetLang) {
  const CONCURRENCY = 3;
  const results = [];
  for (let i = 0; i < segments.length; i += CONCURRENCY) {
    const slice = segments.slice(i, i + CONCURRENCY);
    const batch = await Promise.all(slice.map(async (seg) => {
      const text = String(seg.he || "").trim();
      if (!text) return { index: seg.index, ru: "" };
      try {
        return { index: seg.index, ru: (await _translateText(text, targetLang)).trim() };
      } catch (e) {
        if (e.status === 429 || e.kind === "rate_limit") throw e;
        return { index: seg.index, ru: "" };
      }
    }));
    results.push(...batch);
  }
  return results;
}

async function translateBatch(segments, targetLang = "ru") {
  if (!segments.length) return { results: [], model_version: MODEL_VERSION };

  // ── Primary: newline-joined single request ───────────────────────────────
  const texts    = segments.map((s) => String(s.he || "").trim());
  const combined = texts.join("\n");

  try {
    const translated = await _translateText(combined, targetLang);
    const parts = translated.split("\n");

    if (parts.length === segments.length) {
      return {
        results: segments.map((s, i) => ({ index: s.index, ru: parts[i].trim() })),
        model_version: MODEL_VERSION,
      };
    }
    // Line count mismatch — fall through to individual.
    console.warn(
      `[google-free] batch line mismatch: sent ${segments.length}, got ${parts.length} — retrying individually`
    );
  } catch (e) {
    if (e.status === 429 || e.kind === "rate_limit") {
      const err = new Error("Google Translate бесплатный лимит запросов исчерпан (429)");
      err.provider = "google-free"; err.kind = "rate_limit"; err.status = 429;
      throw err;
    }
    console.warn("[google-free] batch request failed, retrying individually:", e.message);
  }

  // ── Fallback: individual with concurrency=3 ──────────────────────────────
  const results = await _translateIndividual(segments, targetLang);
  return { results, model_version: MODEL_VERSION };
}

module.exports = { translateBatch, MODEL_VERSION };
