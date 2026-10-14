// public/js/dicta-enrich.js — Ф4 · Д8-К (К-4): Dicta's parse of a text, saved locally (sentence_morph).
//
// Spec: docs/planning/word-layer/F4_D8K_ROLE_CRITIQUE_2026_10_14.md. The same request and the same stored rows as the
// Studio's «Обогатить (Dicta)» (/api/morphology/batch, model dicta-morph-v1): the device's Dicta lexicon is folded
// from these rows. Outbound text → consent (R15): the Studio's consent for a text the learner chose, and a separate,
// versioned consent for parsing NEW personal texts automatically. Polite to Dicta (R16): one request at a time,
// 40 sentences per request, a sentence budget per run. Never a corpus text (Ben-Yehuda, public, group).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DictaEnrich = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MODEL = "dicta-morph-v1";
  var CONSENT_KEY = "morphOnlineConsent_v1", CONSENT_VERSION = "1.0";          // == index.html V3_MORPH_ONLINE_CONSENT_*
  var AUTO_KEY = "dictaAutoParseConsent_v1", AUTO_VERSION = "1.0";            // new: parse new personal texts on its own
  var CHUNK = 40;
  var PERSONAL = "t.is_archived = 0 AND (NOT json_valid(t.source_meta_json) OR (json_type(t.source_meta_json, '$.corpus') IS NULL" +
    " AND json_type(t.source_meta_json, '$.group_corpus') IS NULL AND json_type(t.source_meta_json, '$.public_corpus') IS NULL))";

  function ls() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; } }
  function get(k) { var s = ls(); try { return s ? s.getItem(k) : null; } catch (_) { return null; } }
  function set(k, v) { var s = ls(); try { if (s) s.setItem(k, v); } catch (_) {} }
  function hasConsent() { return get(CONSENT_KEY) === CONSENT_VERSION; }
  function hasAuto() { return hasConsent() && get(AUTO_KEY) === AUTO_VERSION; }
  // the learner agreed (one dialog): sending this text, and — when `auto` — new personal texts from now on
  function grant(opts) {
    set(CONSENT_KEY, CONSENT_VERSION);
    if (opts && opts.auto) set(AUTO_KEY, AUTO_VERSION);
    try { set("dictaAutoParseConsent_v1.at", new Date().toISOString()); } catch (_) {}
  }
  function revokeAuto() { var s = ls(); try { if (s) s.removeItem(AUTO_KEY); } catch (_) {} }

  // texts (personal unless ids are given) with sentences Dicta has not parsed: [{ id, title, n, have }], newest first
  async function coverage(ldb, ids) {
    var where = ids && ids.length ? "t.id IN (" + ids.map(function () { return "?"; }).join(",") + ")" : PERSONAL;
    var rows = await ldb.dbQuery(
      "SELECT t.id, t.title, (SELECT COUNT(*) FROM sentences s WHERE s.text_id = t.id) AS n," +
      " (SELECT COUNT(*) FROM sentence_morph m WHERE m.text_id = t.id) AS have FROM texts t WHERE " + where +
      " ORDER BY t.created_at DESC", ids && ids.length ? ids.map(String) : []);
    return (rows || []).map(function (r) { return { id: String(r.id), title: r.title || "", n: Number(r.n) || 0, have: Number(r.have) || 0 }; });
  }
  // one text: the sentences without a stored parse, 40 per request, one request at a time → { total, enriched, failed }
  async function enrichText(ldb, textId, opts) {
    opts = opts || {};
    var doFetch = opts.fetch || (typeof fetch === "function" ? fetch : null);
    if (!doFetch) throw new Error("DICTA_FETCH_UNAVAILABLE");
    var sentences = (await ldb.getSentences(textId)) || [];
    var have = {}; try { have = (await ldb.getSentenceMorphForText(textId)) || {}; } catch (_) { have = {}; }
    var todo = sentences.filter(function (s) { return String(s.he_plain || s.he_niqqud || "").trim() && !have[String(s.id)]; })
      .map(function (s) { return { id: s.id, he: String(s.he_plain || s.he_niqqud || "").trim() }; });
    if (opts.budget != null) todo = todo.slice(0, Math.max(0, opts.budget));
    var out = { total: todo.length, enriched: 0, failed: 0 };
    for (var i = 0; i < todo.length; i += CHUNK) {
      var slice = todo.slice(i, i + CHUNK), results = [];
      try {
        var resp = await doFetch("/api/morphology/batch", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentences: slice.map(function (x) { return x.he; }) }) });
        var data = await resp.json().catch(function () { return {}; });
        results = data && Array.isArray(data.results) ? data.results : [];
      } catch (e) { out.failed += slice.length; out.error = String(e && e.message || e); break; }   // offline: stop honestly
      for (var j = 0; j < slice.length; j++) {
        var rr = results[j];
        if (rr && rr.ok && Array.isArray(rr.tokens) && rr.tokens.length) {
          try { await ldb.saveSentenceMorph(textId, slice[j].id, MODEL, rr.tokens, "dicta-morph"); out.enriched++; } catch (_) { out.failed++; }
        } else out.failed++;
      }
      if (typeof opts.onProgress === "function") { try { opts.onProgress(Math.min(i + CHUNK, todo.length), todo.length); } catch (_) {} }
    }
    return out;
  }
  // background (consented): new personal texts without a parse, newest first, within a sentence budget per run
  async function autoEnrich(ldb, opts) {
    opts = opts || {};
    if (!hasAuto()) return { ran: false };
    var budget = opts.budget != null ? opts.budget : 2000, done = { ran: true, texts: 0, enriched: 0 };
    var list = (await coverage(ldb)).filter(function (t) { return t.n > 0 && t.have < t.n; });
    for (var i = 0; i < list.length && budget > 0; i++) {
      var r = await enrichText(ldb, list[i].id, { budget: budget, fetch: opts.fetch });
      budget -= r.total; done.texts++; done.enriched += r.enriched;
      if (r.error) { done.error = r.error; break; }
    }
    return done;
  }
  return { MODEL: MODEL, CONSENT_KEY: CONSENT_KEY, AUTO_KEY: AUTO_KEY, hasConsent: hasConsent, hasAuto: hasAuto, grant: grant,
    revokeAuto: revokeAuto, coverage: coverage, enrichText: enrichText, autoEnrich: autoEnrich };
});
