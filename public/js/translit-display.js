// What a learning table shows in the transliteration column for the selected profile (O-033, 2026-09-28).
// Used by the Studio table and by the Reading Room / Mediatheque reader (reader-core), so all three
// profiles are available everywhere.
//
// A row stores one Latin transliteration (`translit`, built with the profile chosen at build time)
// and optionally `translit_ru`. Transliteration is a deterministic function of the pointed text, so
// the column is derived from `he_niqqud` for the selected profile, locally and for free. A cell the
// person edited by hand is theirs and is shown as stored.
//
// The engine costs a few milliseconds per row (≈3 s for a 778-row film), so a render derives
// synchronously only within a small time budget; rows past it show the stored text and are filled
// in the background, in slices that keep the page responsive, after which the caller re-renders.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TranslitDisplay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PROFILES = ["learner-latin", "sbl", "ru-phonetic"];
  var CACHE_LIMIT = 50000;
  var RENDER_BUDGET_MS = 120;
  var SLICE_MS = 40;

  function now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

  function normalizeProfile(profile) { return PROFILES.indexOf(profile) >= 0 ? profile : "learner-latin"; }

  function editedFields(row) {
    var meta = row && row.edit_meta_json;
    if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch (_) { meta = null; } }
    return (meta && meta.edited && typeof meta.edited === "object") ? meta.edited : {};
  }

  function storedFor(row, profile) {
    return profile === "ru-phonetic" ? String(row && (row.translit_ru || row.translit) || "") : String(row && row.translit || "");
  }

  // The niqqud to derive from, or "" when the row must show its stored text.
  function sourceOf(row, profile) {
    if (editedFields(row)[profile === "ru-phonetic" ? "translit_ru" : "translit"]) return "";
    return String(row && row.he_niqqud || "").trim();
  }

  function createStore(transliterate, options) {
    var opts = options || {};
    var budgetMs = opts.budgetMs == null ? RENDER_BUDGET_MS : opts.budgetMs;
    var sliceMs = opts.sliceMs == null ? SLICE_MS : opts.sliceMs;
    var defer = opts.defer || function (fn) { setTimeout(fn, 0); };
    var cache = new Map(), pending = [], deadline = Infinity, filling = null, waiters = [];
    var usable = typeof transliterate === "function";

    function key(profile, niqqud) { return profile + "\u0001" + niqqud; }
    function derive(profile, niqqud) {
      var value = "";
      try { value = String(transliterate(niqqud, profile) || ""); } catch (_) { value = ""; }
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key(profile, niqqud), value);
      return value;
    }

    function display(row, profile) {
      var chosen = normalizeProfile(profile);
      var stored = storedFor(row, chosen);
      var niqqud = usable ? sourceOf(row, chosen) : "";
      if (!niqqud) return stored;
      var prepared = row && row.translit_precomputed;
      if (prepared && prepared.source === niqqud && prepared.versions &&
          prepared.versions[chosen] === (transliterate.profileVersions || {})[chosen] &&
          typeof prepared.profiles?.[chosen] === 'string') return prepared.profiles[chosen];
      var k = key(chosen, niqqud);
      if (cache.has(k)) return cache.get(k) || stored;
      if (now() < deadline) return derive(chosen, niqqud) || stored;
      pending.push([chosen, niqqud]);
      return stored;
    }

    // Call before a render: opens the synchronous budget for this render.
    function beginRender() { pending = []; deadline = now() + budgetMs; }

    // Call after a render. When rows were left on their stored text, fills them in the background
    // and calls onFilled() once, so the caller re-renders with every row derived.
    function endRender(onFilled) {
      deadline = Infinity;
      var work = pending; pending = [];
      if (!work.length) return false;
      if (typeof onFilled === "function") waiters.push(onFilled);
      if (!filling) filling = fillSlices(work);
      else work.forEach(function (item) { filling.queue.push(item); });
      return true;
    }

    function fillSlices(work) {
      var state = { queue: work.slice() };
      function step() {
        var stop = now() + sliceMs;
        while (state.queue.length && now() < stop) {
          var item = state.queue.shift();
          if (!cache.has(key(item[0], item[1]))) derive(item[0], item[1]);
        }
        if (state.queue.length) { defer(step); return; }
        filling = null;
        var callbacks = waiters; waiters = [];
        callbacks.forEach(function (fn) { try { fn(); } catch (_) {} });
      }
      defer(step);
      return state;
    }

    // One-shot helper for callers that render without the budget (tests, small tables).
    function displayNow(row, profile) {
      var saved = deadline; deadline = Infinity;
      try { return display(row, profile); } finally { deadline = saved; }
    }

    return { display: display, displayNow: displayNow, beginRender: beginRender, endRender: endRender,
      isFilling: function () { return !!filling; }, usable: usable };
  }

  // Backward-compatible single-call display (no budget).
  function createDisplay(transliterate) {
    var store = createStore(transliterate);
    return function (row, profile) { return store.displayNow(row, profile); };
  }

  // The profile a table actually renders and its column title, shared by the Studio renderTable and
  // reader-core so both surfaces agree (reader parity gate).
  function resolveProfile(selected, hasRuTranslit, canDerive) {
    if (selected === "ru-phonetic") return (hasRuTranslit || canDerive) ? "ru-phonetic" : "sbl";
    return selected === "learner-latin" ? "learner-latin" : "sbl";
  }

  return { createStore: createStore, createDisplay: createDisplay, resolveProfile: resolveProfile,
    normalizeProfile: normalizeProfile, PROFILES: PROFILES };
});
