// public/js/inflection-dict.js — offline Pealim inflection dictionary loader.
//
// Loads the shipped dataset (public/data/inflection/pealim-infl-<model>.json.gz),
// decompresses it (DecompressionStream), and ONE-TIME bulk-imports it into the
// OPFS `lemma_inflection` table so the existing getLemmaInflection read path
// serves every word offline + on prod (server can't scrape Pealim).
//
// Memory: after a successful import the in-memory dataset is RELEASED (the
// decompressed JSON is heavy for mid-range Android); lookups then hit OPFS
// (indexed, sub-ms). The resident dataset is kept ONLY as a degraded fallback
// for follower tabs that can't write OPFS (DB owned by another tab).
//
// Exposes window.InflectionDict = { ensureReady, lookup, ensureImported,
// getStatus, clearCache, MODEL }.

(function () {
  "use strict";

  var MODEL = (typeof window !== "undefined" && window.V3_PEALIM_INFL_MODEL) || "pealim-infl-v12";
  var BASE = "/data/inflection/" + MODEL; // MODEL already = "pealim-infl-vN"
  var IMPORT_FLAG = "inflectionDictImported_v1";

  var _dataset = null;        // { model_version, paradigms:[], index:{} } | null
  var _readyPromise = null;
  var _meta = null;

  function _flagOk() { try { return localStorage.getItem(IMPORT_FLAG) === MODEL; } catch (_) { return false; } }
  function _setFlag() { try { localStorage.setItem(IMPORT_FLAG, MODEL); } catch (_) {} }

  async function _fetchJson(url) {
    var res = await fetch(url, { cache: "no-cache" });
    if (!res || !res.ok) throw new Error("inflection meta " + (res && res.status));
    return res.json();
  }
  async function _fetchGz(url) {
    var res = await fetch(url);
    if (!res || !res.ok) throw new Error("inflection gz " + (res && res.status));
    // Browser may already have inflated a Content-Encoding:gzip response; our
    // file is a raw .gz body, so decompress explicitly (mirror morph-provider).
    if (typeof DecompressionStream === "function" && res.body) {
      var stream = res.body.pipeThrough(new DecompressionStream("gzip"));
      var text = await new Response(stream).text();
      return JSON.parse(text);
    }
    // Fallback: no DecompressionStream — assume server/runtime already inflated.
    return res.json();
  }

  // Load meta + dataset into memory (idempotent; shared promise).
  function ensureReady() {
    if (_dataset) return Promise.resolve(_dataset);
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async function () {
      try { _meta = await _fetchJson(BASE + ".meta.json"); } catch (_) { _meta = null; }
      var ds = await _fetchGz(BASE + ".json.gz");
      if (!ds || !ds.index || !Array.isArray(ds.paradigms)) throw new Error("inflection dataset malformed");
      _dataset = ds;
      return ds;
    })().catch(function (e) { _readyPromise = null; throw e; });
    return _readyPromise;
  }

  // Look up one paradigm by (key, binyan). key = a lemma OR root (the dataset is
  // multi-alias indexed). Returns the paradigm envelope or null.
  async function lookup(key, binyan) {
    if (!key) return null;
    var ds;
    try { ds = await ensureReady(); } catch (_) { return null; }
    var idx = ds.index[String(key) + " " + String(binyan || "")];
    return (idx != null && ds.paradigms[idx]) ? ds.paradigms[idx] : null;
  }

  // One-time bulk import of the whole dataset into OPFS lemma_inflection.
  // Inserts one row per INDEX KEY (so verbs-by-root rows exist), matching the
  // client's getLemmaInflection read key. Idempotent (flag + ON CONFLICT).
  async function ensureImported(localDb, onProgress) {
    if (_flagOk()) return { already: true };
    var ldb = localDb || (typeof window !== "undefined" && window.__localDB);
    if (!ldb || typeof ldb.bulkSaveLemmaInflections !== "function") return { skipped: "no-localdb" };
    // skip if OPFS already has ~all keys for this model (e.g. prior partial run)
    try {
      if (typeof ldb.getLemmaInflectionKeys === "function" && _meta) {
        var have = await ldb.getLemmaInflectionKeys(MODEL);
        if (have && have.size >= (_meta.key_count || 0) && (_meta.key_count || 0) > 0) { _setFlag(); _release(); return { already: true }; }
      }
    } catch (_) {}
    var ds = await ensureReady();
    var rows = [];
    var keys = Object.keys(ds.index);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var sp = k.lastIndexOf(" ");
      var lemma = sp >= 0 ? k.slice(0, sp) : k;
      var binyan = sp >= 0 ? k.slice(sp + 1) : "";
      var p = ds.paradigms[ds.index[k]];
      if (!lemma || !p) continue;
      rows.push({ lemma: lemma, binyan: binyan, modelVersion: MODEL, pos: p.pos || null, kind: p.kind || null,
                  paradigm: p, source: p.source || "pealim", pealimId: p.pealim_id || null });
    }
    var written = await ldb.bulkSaveLemmaInflections(rows, { chunk: 500, onProgress: onProgress });
    _setFlag();
    _release(); // free the heavy in-memory dataset; OPFS now serves lookups
    return { imported: written, keys: keys.length };
  }

  function _release() { _dataset = null; _readyPromise = null; }

  function getStatus() { return { model: MODEL, loaded: !!_dataset, imported: _flagOk(), meta: _meta }; }
  function clearCache() { _release(); try { localStorage.removeItem(IMPORT_FLAG); } catch (_) {} }

  if (typeof window !== "undefined") {
    window.InflectionDict = { ensureReady: ensureReady, lookup: lookup, ensureImported: ensureImported,
                              getStatus: getStatus, clearCache: clearCache, MODEL: MODEL };
  }
})();
