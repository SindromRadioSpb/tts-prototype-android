// reader-dicta.js — CLIENT-SIDE context-aware morphology for the Reading Room (Tier-3).
//
// Why client-side (offline-first, R5): the Room is a client-side OPFS app. Calling Dicta
// from the browser avoids a server round-trip and keeps the morphology path independent of
// the server. (The prod server's /api/morphology ALSO reaches Dicta fine — an earlier
// "egress blocked" reading was a curl UTF-8-mangling test artifact, since corrected — so
// a server-side Tier-3 is equally viable; this client path is the lighter, offline-leaning
// alternative.) Dicta sends `Access-Control-Allow-Origin: *`, so the browser can read it.
// Caveat: Dicta's CORS preflight (OPTIONS) 500s, so we must send a "simple" request
// (Content-Type: text/plain) that the browser does NOT preflight.
//
// What it gives the Room: per-word CONTEXT-correct niqqud + lemma + POS. The tapped word's
// context-correct niqqud feeds the existing offline form-first resolver, which then matches
// the RIGHT homograph paradigm (e.g. הַיּוֹם «today» vs «the day»). R1: the vocalization is a
// machine reading — surfaced as «контекст (Dicta)» provenance, never as human/native truth.
//
// Network-only, opt-in, gracefully degrades (offline / Dicta down → {ok:false, degraded:true}).

(function () {
  "use strict";

  var DICTA_URL = "https://nakdan-5-1.loadbalancer.dicta.org.il/api";
  var MODEL_VERSION = "dicta-morph-client-v1";
  var TIMEOUT_MS = 8000;

  var NIQQUD_RE = /[֑-ׇ]/g;
  var FORMAT_RE = /[‌-‏‪-‮⁦-⁩﻿]/g;
  function stripNiqqud(s) {
    return String(s == null ? "" : s).replace(NIQQUD_RE, "").replace(FORMAT_RE, "").replace(/\|/g, "").trim();
  }

  // morphId POS/binyan decode (BigInt) — mirror of db/premium/morph/dictaMorphId.js.
  var POS = { 1: "adjective", 2: "adverb", 3: "conjunction", 4: "preposition", 5: "negation",
    6: "noun", 7: "numeral", 8: "preposition", 9: "pronoun", 10: "propernoun",
    13: "verb", 15: "interrogative", 30: "preposition" };
  var BINYAN = { 1: "paal", 2: "nifal", 3: "hifil", 4: "hufal", 5: "piel", 6: "pual", 7: "hitpael" };
  function decodeMorphId(idStr) {
    var v;
    try { v = BigInt(String(idStr == null ? "0" : idStr)); } catch (_) { return { pos: null, binyan: null }; }
    if (v <= 0n) return { pos: null, binyan: null };
    return { pos: POS[Number((v >> 16n) & 0x1Fn)] || null, binyan: BINYAN[Number((v >> 51n) & 0x7n)] || null };
  }

  // Parse one Dicta token (same shape as the server's _parseToken, trimmed to what the
  // Room needs): { word, niqqud, lemma, lemmas[], posDicta, binyan, confident }.
  function parseToken(tk) {
    var word = String((tk && tk.word) || "");
    var opt0 = (tk && Array.isArray(tk.options)) ? tk.options[0] : null;
    if (!opt0) return { word: word, niqqud: "", stem: stripNiqqud(word), lemma: "", lemmas: [], posDicta: null, binyan: null, confident: !!(tk && tk.fconfident) };
    var niqqudRaw = String(opt0[0] || "");
    var morphList = Array.isArray(opt0[1]) ? opt0[1] : [];
    var lemmas = [], seen = {};
    for (var i = 0; i < morphList.length; i++) {
      var l = stripNiqqud(Array.isArray(morphList[i]) ? morphList[i][1] : "");
      if (l && !seen[l]) { seen[l] = 1; lemmas.push(l); }
    }
    var top = morphList[0];
    var dec = decodeMorphId((Array.isArray(top) && top[0] != null) ? String(top[0]) : "");
    return {
      word: word,
      niqqud: niqqudRaw.replace(/\|/g, ""),
      stem: stripNiqqud(niqqudRaw.split("|").pop()),
      lemma: lemmas[0] || "",
      lemmas: lemmas.slice(0, 5),
      posDicta: dec.pos,
      binyan: dec.binyan,
      confident: !!(tk && tk.fconfident),
    };
  }

  function _post(text, genre) {
    return new Promise(function (resolve, reject) {
      var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error("dicta-client: timeout")); }, TIMEOUT_MS);
      // text/plain → "simple" request, NO CORS preflight (Dicta's OPTIONS 500s). ACAO:* lets us read it.
      fetch(DICTA_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ task: "nakdan", genre: genre || "modern", data: text, addmorph: true, keepqq: false }),
        signal: ctrl ? ctrl.signal : undefined,
      }).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) { reject(new Error("dicta-client: HTTP " + r.status)); return; }
        return r.json();
      }).then(function (j) { resolve(j); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  // analyzeSentence(text) → { ok, tokens, model_version, degraded, reason? }
  // tokens: one record per non-separator word, in order. Honest degradation: a non-empty
  // Hebrew input that returns zero tokens is degraded (network/egress problem), NOT success.
  function analyzeSentence(text, genre) {
    var t = String(text == null ? "" : text).trim();
    if (!t) return Promise.resolve({ ok: true, tokens: [], model_version: MODEL_VERSION, degraded: false });
    return _post(t, genre).then(function (data) {
      if (!Array.isArray(data)) return { ok: false, tokens: [], model_version: MODEL_VERSION, degraded: true, reason: "bad_response" };
      var tokens = [];
      for (var i = 0; i < data.length; i++) { var tk = data[i]; if (tk && !tk.sep) tokens.push(parseToken(tk)); }
      if (tokens.length === 0 && /[א-ת]/.test(t)) return { ok: false, tokens: [], model_version: MODEL_VERSION, degraded: true, reason: "empty_on_hebrew" };
      return { ok: true, tokens: tokens, model_version: MODEL_VERSION, degraded: false };
    }, function (e) {
      return { ok: false, tokens: [], model_version: MODEL_VERSION, degraded: true, reason: String((e && e.message) || e) };
    });
  }

  // Convenience: pick the token whose stem matches a target surface (niqqud-stripped),
  // so the resolver can replace an ambiguous corpus niqqud with Dicta's context niqqud.
  function tokenForSurface(tokens, surface) {
    var s = stripNiqqud(surface);
    if (!s || !tokens) return null;
    for (var i = 0; i < tokens.length; i++) { if (stripNiqqud(tokens[i].word) === s || tokens[i].stem === s) return tokens[i]; }
    return null;
  }

  var API = { analyzeSentence: analyzeSentence, parseToken: parseToken, tokenForSurface: tokenForSurface, stripNiqqud: stripNiqqud, decodeMorphId: decodeMorphId, MODEL_VERSION: MODEL_VERSION, DICTA_URL: DICTA_URL };
  if (typeof window !== "undefined") window.ReaderDicta = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
