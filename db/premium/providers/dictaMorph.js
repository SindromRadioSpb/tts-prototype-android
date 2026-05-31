"use strict";

// Dicta morphology (context-aware) via the Nakdan `addmorph` API.
//
// Unlike a context-free dictionary lookup, Dicta disambiguates homography by
// SENTENCE CONTEXT: the niqqud option order and the per-option morph list
// reflect Dicta's contextual ranking. From the top (contextually-best) option
// we extract, per word:
//   • prefix segmentation — from the `|` morpheme-boundary markers Dicta
//     inserts between proclitics and the stem (e.g. שֶׁ|אֵין → prefix שׁ, stem אֵין);
//   • the top lemma + a few candidate lemmas (niqqud-stripped).
//
// Root/binyan are intentionally NOT derived here — the client maps Dicta's
// authoritative, context-correct lemma through the local dictionary (reliable
// for dictionary forms), and honestly reports "no root" for particles (אין …).
//
// Same HTTP shape as dictaCloud.js (Dicta Nakdan endpoint, free, no key).

const https = require("https");

const DICTA_URL     = process.env.DICTA_NAKDAN_URL || "https://nakdan-5-1.loadbalancer.dicta.org.il/api";
const MODEL_VERSION = "dicta-morph-v1";
const TIMEOUT_MS    = Number(process.env.DICTA_TIMEOUT_MS || 8000);

// ── HTTP helper (mirrors dictaCloud._post) ────────────────────────────────
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
          const e = new Error(`Dicta morph: HTTP ${res.statusCode}`);
          e.status = res.statusCode;
          return reject(e);
        }
        try   { resolve(JSON.parse(data)); }
        catch (_) { reject(new Error("Dicta morph: invalid JSON response")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Dicta morph: request timeout")); });
    req.write(payload);
    req.end();
  });
}

// Strip niqqud + cantillation + bidi marks; KEEP base letters (incl. finals).
const NIQQUD_RE = /[֑-ׇ]/g;
const FORMAT_RE = /[‌-‏‪-‮⁦-⁩﻿]/g;
function stripNiqqud(s) {
  return String(s == null ? "" : s).replace(NIQQUD_RE, "").replace(FORMAT_RE, "").replace(/\|/g, "").trim();
}

// Parse one Dicta token into a normalized morphology record.
//   tk = { word, sep, options: [ [ niqqud, [[id, lemma, bool], ...] ], ... ], fconfident }
function _parseToken(tk) {
  const word = String(tk && tk.word || "");
  const opt0 = (tk && Array.isArray(tk.options)) ? tk.options[0] : null;
  if (!opt0) {
    return { word, niqqud: "", prefix: "", stem: stripNiqqud(word), lemma: "", lemmas: [], confident: !!(tk && tk.fconfident) };
  }
  const niqqudRaw = String(opt0[0] || "");                 // e.g. "שֶׁ|אֵין"
  // Prefix segmentation from the | markers: everything before the LAST segment
  // is proclitic(s); the last segment is the stem.
  const segs = niqqudRaw.split("|");
  let prefix = "", stem = niqqudRaw;
  if (segs.length > 1) {
    stem = segs[segs.length - 1];
    prefix = segs.slice(0, -1).join("");
  }
  const morphList = Array.isArray(opt0[1]) ? opt0[1] : [];
  const lemmas = morphList
    .map((m) => stripNiqqud(Array.isArray(m) ? m[1] : ""))
    .filter(Boolean);
  // de-dup, preserve order
  const seen = new Set();
  const lemmasUniq = [];
  for (const l of lemmas) { if (!seen.has(l)) { seen.add(l); lemmasUniq.push(l); } }
  return {
    word,
    niqqud: niqqudRaw.replace(/\|/g, ""),
    prefix: stripNiqqud(prefix),
    stem:   stripNiqqud(stem),
    lemma:  lemmasUniq[0] || "",
    lemmas: lemmasUniq.slice(0, 5),
    confident: !!(tk && tk.fconfident),
  };
}

// Analyze a full sentence; returns one record per (non-separator) token in order.
async function analyzeSentence(sentence, genre = "modern") {
  const text = String(sentence == null ? "" : sentence).trim();
  if (!text) return { ok: true, status: 200, tokens: [], model_version: MODEL_VERSION, provider: "dicta-morph" };
  const data = await _post(DICTA_URL, { task: "nakdan", genre, data: text, addmorph: true, keepqq: false });
  if (!Array.isArray(data)) {
    return { ok: false, status: 502, tokens: [], model_version: MODEL_VERSION, provider: "dicta-morph" };
  }
  const tokens = data.filter((t) => t && !t.sep).map(_parseToken);
  return { ok: true, status: 200, tokens, model_version: MODEL_VERSION, provider: "dicta-morph" };
}

module.exports = { analyzeSentence, MODEL_VERSION, _parseToken, stripNiqqud };
