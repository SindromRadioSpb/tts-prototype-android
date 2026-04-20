"use strict";

// Dicta Nakdan cloud API client.
// Provides niqqud (vowel-pointing) for Hebrew text via Dicta's public endpoint.
// Same external interface as pythonClient.nakdan() so the gateway can swap
// providers transparently:
//   nakdan(texts) → { ok, status, body: { results: string[], model_version } }
//
// Rate/concurrency: up to CONCURRENCY requests in flight at once (default 3).
// Timeout: TIMEOUT_MS per request (default 8 s).

const https = require("https");

const DICTA_URL     = process.env.DICTA_NAKDAN_URL || "https://nakdan-5-1.loadbalancer.dicta.org.il/api";
const MODEL_VERSION = "dicta-nakdan-cloud-v1";
const TIMEOUT_MS    = Number(process.env.DICTA_TIMEOUT_MS  || 8000);
const CONCURRENCY   = Number(process.env.DICTA_CONCURRENCY || 3);

// ── HTTP helper ───────────────────────────────────────────────────────────────

function _post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + (parsed.search || ""),
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Accept":         "application/json",
        "User-Agent":     "Mozilla/5.0",
      },
      timeout: TIMEOUT_MS,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          const e = new Error(`Dicta cloud: HTTP ${res.statusCode}`);
          e.status = res.statusCode;
          return reject(e);
        }
        try   { resolve(JSON.parse(data)); }
        catch (_) { reject(new Error("Dicta cloud: invalid JSON response")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Dicta cloud: request timeout"));
    });
    req.write(payload);
    req.end();
  });
}

// ── Response parser ───────────────────────────────────────────────────────────
// Dicta returns one of two formats; both are handled:
//
// Format A — array of option-lists (compact):
//   [ [[niqqud, score, morph?], ...], null, [[niqqud, score], ...], ... ]
//   null entries represent spaces/separators.
//
// Format B — array of word objects:
//   [ {word, options: [[niqqud, score, morph?], ...], sep?}, ... ]
//   sep is a trailing separator string (space, punctuation).
//
// Both produce a concatenated niqqud string in input-word order.

function _tokensToNiqqud(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return "";
  const parts = [];

  for (const tok of tokens) {
    if (tok === null || tok === undefined) {
      // Format A null separator → space
      parts.push(" ");
      continue;
    }
    if (typeof tok === "string") {
      parts.push(tok);
      continue;
    }
    if (!Array.isArray(tok)) {
      // Format B object: {word, options?, sep?}
      const sep = (typeof tok.sep === "string") ? tok.sep : "";
      if (!tok.options || !Array.isArray(tok.options) || !tok.options.length) {
        parts.push((tok.word || "") + sep);
      } else {
        const best = tok.options[0];
        const niqqud = Array.isArray(best) ? (best[0] || tok.word || "") : String(best || tok.word || "");
        parts.push(niqqud + sep);
      }
      continue;
    }
    // Format A non-null: [[niqqud, score, morph?], ...]
    if (!tok.length) continue;
    const best = tok[0];
    parts.push(Array.isArray(best) ? (best[0] || "") : String(best || ""));
  }

  return parts.join("").replace(/\s{2,}/g, " ").trim();
}

// ── Single-text niqqud ────────────────────────────────────────────────────────

async function _niqqudOne(text, genre) {
  if (!String(text || "").trim()) return "";
  const data = await _post(DICTA_URL, {
    task:      "nakdan",
    genre,
    data:      text,
    addmorph:  false,
    keepqq:    false,
  });
  return _tokensToNiqqud(data);
}

// ── Public interface (matches pythonClient.nakdan signature) ──────────────────

async function nakdan(texts, genre = "modern") {
  if (!Array.isArray(texts) || !texts.length) {
    return { ok: true, status: 200, body: { results: [], model_version: MODEL_VERSION } };
  }

  const results = new Array(texts.length).fill("");

  // Process in batches of CONCURRENCY to avoid flooding Dicta.
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const slice = texts.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (t, j) => {
        const idx = i + j;
        try {
          results[idx] = await _niqqudOne(t, genre);
        } catch (e) {
          console.warn(`[dicta-cloud] segment ${idx} failed: ${e.message}`);
          results[idx] = "";
        }
      })
    );
  }

  return { ok: true, status: 200, body: { results, model_version: MODEL_VERSION } };
}

module.exports = { nakdan, MODEL_VERSION, _tokensToNiqqud };
