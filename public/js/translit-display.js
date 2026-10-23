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
// in the background, in slices that keep the page responsive, then patches the column in place.
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
    var cache = new Map(), pending = new Map(), deadline = Infinity, filling = null, waiters = [];
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
      pending.set(k, [chosen, niqqud]);
      return stored;
    }

    // Call before a render: opens the synchronous budget for this render.
    function beginRender() { pending.clear(); deadline = now() + budgetMs; }

    // A material/profile switch supersedes its unfinished work, but useful derived values stay
    // cached. Already scheduled slices become inert and cannot call a stale render callback.
    function cancelPending() {
      pending.clear();
      deadline = Infinity;
      filling = null;
      waiters = [];
    }

    // Call after a render. When rows were left on their stored text, fills them in the background
    // and calls onFilled() once, so the caller re-renders with every row derived.
    function endRender(onFilled) {
      deadline = Infinity;
      var work = pending; pending = new Map();
      if (!work.size) return false;
      if (typeof onFilled === "function") waiters.push(onFilled);
      if (!filling) fillSlices(work);
      else work.forEach(function (item, k) {
        if (!filling.keys.has(k) && !cache.has(k)) {
          filling.keys.add(k);
          filling.queue.push(item);
        }
      });
      return true;
    }

    function fillSlices(work) {
      var state = { queue: Array.from(work.values()), keys: new Set(work.keys()), cursor: 0 };
      filling = state;
      function step() {
        if (filling !== state) return;
        var stop = now() + sliceMs;
        while (state.cursor < state.queue.length && now() < stop) {
          var item = state.queue[state.cursor];
          state.queue[state.cursor++] = null;
          var k = key(item[0], item[1]);
          state.keys.delete(k);
          if (!cache.has(k)) derive(item[0], item[1]);
        }
        if (state.cursor < state.queue.length) { defer(step); return; }
        filling = null;
        var callbacks = waiters; waiters = [];
        callbacks.forEach(function (fn) { try { fn(); } catch (_) {} });
      }
      defer(step);
    }

    // One-shot helper for callers that render without the budget (tests, small tables).
    function displayNow(row, profile) {
      var saved = deadline; deadline = Infinity;
      try { return display(row, profile); } finally { deadline = saved; }
    }

    return { display: display, displayNow: displayNow, beginRender: beginRender, endRender: endRender,
      cancelPending: cancelPending,
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

  var tablePatches = new WeakMap();
  // Background completion must not recreate editors, selection, replay controls,
  // word cards or the rest of the table. Each mounted table owns one patch job.
  function patchTable(table, rows, profile, options) {
    var opts = options || {}, store = opts.store;
    if (!table || !store || !Array.isArray(rows)) return Promise.resolve({ patched: 0, cancelled: false });
    var job = {}, patched = 0;
    tablePatches.set(table, job);
    var current = function () { return tablePatches.get(table) === job && table.isConnected && (!opts.isCurrent || opts.isCurrent()); };
    var cells = Array.from(table.querySelectorAll('tbody td[data-col="translit"]'));
    var cursor = 0, defer = opts.defer || function (fn) { setTimeout(fn, 0); };
    return new Promise(function (resolve) {
      function step() {
        if (!current()) { resolve({ patched: patched, cancelled: true }); return; }
        // getSelection can flush layout after text mutations. Read it once per
        // slice; DOM Range intersection itself does not measure the table.
        var selection = table.ownerDocument.defaultView?.getSelection?.(), ranges = [];
        if (selection && !selection.isCollapsed) {
          for (var r = 0; r < selection.rangeCount; r++) ranges.push(selection.getRangeAt(r).cloneRange());
        }
        var deadline = now() + 8;
        while (cursor < cells.length) {
          var cell = cells[cursor++], tr = cell.closest('tr[data-row-idx]');
          var row = tr && rows[Number(tr.dataset.rowIdx)];
          var selected = ranges.some(function (range) { return range.intersectsNode(cell); });
          if (row && cell.isConnected && !selected && !cell.querySelector('.cell-editor-wrap,input,textarea,[contenteditable="true"]') &&
              (!row._v3_sentenceId || tr.dataset.sentenceId === String(row._v3_sentenceId))) {
            var value = store.display(row, profile);
            var text = Array.from(cell.childNodes).find(function (node) {
              return node.nodeType === 3 && !(node.textContent === '\u00a0' && node.nextSibling?.classList?.contains('smk-row-replay'));
            });
            if (!text) { text = cell.ownerDocument.createTextNode(''); cell.insertBefore(text, cell.firstChild); }
            if (text.textContent !== value) { text.textContent = value; patched++; }
          }
          if (now() >= deadline) break;
        }
        if (cursor < cells.length) defer(step);
        else resolve({ patched: patched, cancelled: false });
      }
      step();
    });
  }

  return { createStore: createStore, createDisplay: createDisplay, resolveProfile: resolveProfile,
    normalizeProfile: normalizeProfile, patchTable: patchTable, PROFILES: PROFILES };
});
