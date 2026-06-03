// public/js/knowledge-map-data.js — Knowledge Map v3.8 (root-centric).
//
// Phase 1: READ-ONLY data layer. No UI, no DOM, no d3.
//
// Exposes:
//   window.KnowledgeMapData = {
//     build(opts)            -> full index { roots, lemmas, edges, stats }
//     rootCluster(rootKey)   -> focus subgraph for one root family
//     rankRoots(opts)        -> roots ranked by corpus frequency ("learn next")
//     _STATE3                -> the 3-state status vocabulary
//   }
//
// SPINE = the Hebrew ROOT (שורש). The atomic learnable unit is the root
// family: root -> derived lemmas (labelled by binyan; mishkal in Phase 5).
//   • node = a DISTINCT LEMMA (not a note occurrence). size/freq = #occurrences.
//   • root-less words (≈46% — function words) are NOT clustered here; they are
//     reported in stats and reached via text/search, not the root map (R2).
//   • text is NEVER a node (avoids the 725-note hub); a lemma carries its
//     source text ids in meta for the preview card (R3 anti-hairball).
//
// HARD invariants (parity with notes-graph.js):
//   • Read-only. Only SELECT via window.__localDB.dbQuery; _q refuses non-SELECT.
//   • No raw note body crosses the boundary — only json_extract scalars
//     (root/binyan/word/pos) are selected; body_json is never selected raw.
//   • Normalization delegates to window.MorphNormalize (shared contract).
//   • Deterministic: same input -> same output (sorted, no RNG, no clock here;
//     learning status uses the SRS overlay which owns its own clock).
//   • No telemetry, no fetch, no events, no writes.

(function () {
  "use strict";

  // Generous caps — Phase-0 spike: max root family = 29 distinct lemmas, so a
  // focus cluster never needs collapse. Caps are a safety backstop only; the
  // old SHARED_SKIP_OVER=24 is deliberately NOT inherited (it dropped the top
  // teaching roots בוא/הלך/ראי).
  var MAX_ROOTS = 5000;
  var MAX_LEMMAS_PER_ROOT = 200;

  var STATE3 = ["known", "learning", "new"]; // primary visual channel (LingQ)

  // ── read-only DB shim — identical guard to notes-graph.js _q ─────────────
  var _READONLY_RE = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
  var _FORBIDDEN_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
  async function _q(sql, params) {
    var ldb = (typeof window !== "undefined") && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== "function") {
      throw new Error("knowledge-map: local-db not ready (window.__localDB.dbQuery missing)");
    }
    var s = String(sql || "");
    if (!_READONLY_RE.test(s) || _FORBIDDEN_RE.test(s)) {
      throw new Error("knowledge-map: refused non-SELECT SQL (read-only invariant)");
    }
    return ldb.dbQuery(s, params || []);
  }

  function _norm(w) {
    if (typeof window !== "undefined" && window.MorphNormalize &&
        typeof window.MorphNormalize.normalizeHebrew === "function") {
      try { return String(window.MorphNormalize.normalizeHebrew(w) || "").trim(); }
      catch (_) { /* fall through */ }
    }
    return String(w == null ? "" : w).replace(/[֑-ׇ]/g, "").trim();
  }

  // Map the SRS overlay's 5 states -> the 3-state learner-frontier vocabulary.
  function _to3(state) {
    switch (String(state || "new").toLowerCase()) {
      case "known": return "known";
      case "learning":
      case "relearning":
      case "weak":
      case "stale": return "learning";
      default: return "new";
    }
  }

  // Aggregate a lemma's per-note states into one frontier status. Surfaces the
  // most actionable: anything in-progress -> learning; mixed new+known (partly
  // learned) -> learning; untouched -> new; all mastered -> known.
  function _aggStatus(set) {
    if (set.has("learning")) return "learning";
    if (set.has("new") && set.has("known")) return "learning";
    if (set.has("new")) return "new";
    if (set.has("known")) return "known";
    return "new";
  }

  // ── read-only fetch (privacy parity: json_extract scalars only) ──────────
  async function _fetchNotes() {
    var rows = await _q(
      "SELECT id, text_id, note_type," +
      " json_extract(body_json, '$.root')   AS j_root," +
      " json_extract(body_json, '$.binyan') AS j_binyan," +
      " json_extract(body_json, '$.word')   AS j_word," +
      " json_extract(body_json, '$.pos')    AS j_pos" +
      " FROM notes_v2", []);
    return rows || [];
  }

  // Prefer the shipped overlay (5-state, owns its clock); fall back to {}.
  async function _fetchOverlay() {
    try {
      var ldb = (typeof window !== "undefined") && window.__localDB;
      if (ldb && typeof ldb.getLearningStateOverlay === "function") {
        return (await ldb.getLearningStateOverlay()) || {};
      }
    } catch (_) { /* degrade */ }
    return {};
  }

  // Edge label for root -> lemma: binyan for verbs (real morphology), else the
  // POS as a coarse class. True mishkal patterns arrive with Pealim enrichment
  // (Phase 5); we never invent one here (R1).
  function _edgeLabel(binyan, pos) {
    if (binyan) return binyan;
    return pos || "";
  }

  // ── build the full root index ────────────────────────────────────────────
  async function build(opts) {
    opts = opts || {};
    var capRoots = Number.isFinite(opts.maxRoots) ? opts.maxRoots : MAX_ROOTS;
    var capLemmas = Number.isFinite(opts.maxLemmasPerRoot) ? opts.maxLemmasPerRoot : MAX_LEMMAS_PER_ROOT;

    var notes = await _fetchNotes();
    var overlay = await _fetchOverlay();

    var lemmas = new Map(); // "word:<norm>" -> node
    var roots = new Map();  // "root:<norm>" -> node
    var stats = { totalNotes: notes.length, withRoot: 0, rootless: 0,
                  distinctLemmas: 0, distinctRoots: 0, teachableRoots: 0 };

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var root = _norm(n.j_root);
      if (!root) { stats.rootless++; continue; }
      var lemma = _norm(n.j_word);
      if (!lemma) { stats.rootless++; continue; }
      stats.withRoot++;

      var binyan = _norm(n.j_binyan);
      var pos = _norm(n.j_pos);
      var st3 = _to3(overlay[String(n.id)]);

      var lk = "word:" + lemma;
      var ln = lemmas.get(lk);
      if (!ln) {
        ln = { id: lk, kind: "word", rawId: lemma, label: lemma, freq: 0,
               status: "new", meta: { roots: new Set(), binyans: new Set(),
               pos: new Set(), textIds: new Set(), noteIds: [], _states: new Set() } };
        lemmas.set(lk, ln);
      }
      ln.freq++;
      ln.meta.roots.add(root);
      if (binyan) ln.meta.binyans.add(binyan);
      if (pos) ln.meta.pos.add(pos);
      if (n.text_id != null && String(n.text_id) !== "") ln.meta.textIds.add(String(n.text_id));
      ln.meta.noteIds.push(String(n.id));
      ln.meta._states.add(st3);

      var rk = "root:" + root;
      var rn = roots.get(rk);
      if (!rn) {
        rn = { id: rk, kind: "root", rawId: root, label: root, freq: 0,
               status: "new", meta: { lemmaKeys: new Set() } };
        roots.set(rk, rn);
      }
      rn.freq++;
      rn.meta.lemmaKeys.add(lk);
    }

    // finalize lemma status from accumulated per-note states
    lemmas.forEach(function (ln) { ln.status = _aggStatus(ln.meta._states); });

    // edges root -> lemma (deterministic order)
    var edges = [];
    var rootKeysSorted = Array.from(roots.keys()).sort(function (a, b) { return a.localeCompare(b); });
    for (var r = 0; r < rootKeysSorted.length; r++) {
      var rn2 = roots.get(rootKeysSorted[r]);
      var memberKeys = Array.from(rn2.meta.lemmaKeys).sort(function (a, b) { return a.localeCompare(b); });
      var emitted = 0;
      for (var m = 0; m < memberKeys.length && emitted < capLemmas; m++) {
        var ln2 = lemmas.get(memberKeys[m]);
        if (!ln2) continue;
        var binyan2 = ln2.meta.binyans.size ? Array.from(ln2.meta.binyans).sort()[0] : "";
        var pos2 = ln2.meta.pos.size ? Array.from(ln2.meta.pos).sort()[0] : "";
        edges.push({ source: rn2.id, target: ln2.id, edge_kind: "root_lemma",
                     label: _edgeLabel(binyan2, pos2) });
        emitted++;
      }
    }

    // root aggregate status = most-attention-worthy of its members
    roots.forEach(function (rn3) {
      var agg = new Set();
      rn3.meta.lemmaKeys.forEach(function (lk2) {
        var ln3 = lemmas.get(lk2); if (ln3) agg.add(ln3.status);
      });
      rn3.status = _aggStatus(agg);
      rn3.meta.memberCount = rn3.meta.lemmaKeys.size;
    });

    stats.distinctLemmas = lemmas.size;
    stats.distinctRoots = roots.size;
    roots.forEach(function (rn4) { if (rn4.meta.memberCount >= 2) stats.teachableRoots++; });

    // serialize Sets -> arrays for a clean, deterministic, JSON-safe payload
    var rootList = rootKeysSorted.slice(0, capRoots).map(function (k) {
      var rn5 = roots.get(k);
      return { id: rn5.id, kind: "root", rawId: rn5.rawId, label: rn5.label,
               freq: rn5.freq, status: rn5.status, memberCount: rn5.meta.memberCount,
               lemmaKeys: Array.from(rn5.meta.lemmaKeys).sort() };
    });
    var lemmaList = Array.from(lemmas.values())
      .sort(function (a, b) { return a.id.localeCompare(b.id); })
      .map(function (ln6) {
        return { id: ln6.id, kind: "word", rawId: ln6.rawId, label: ln6.label,
                 freq: ln6.freq, status: ln6.status,
                 roots: Array.from(ln6.meta.roots).sort(),
                 binyans: Array.from(ln6.meta.binyans).sort(),
                 pos: Array.from(ln6.meta.pos).sort(),
                 textIds: Array.from(ln6.meta.textIds).sort(),
                 noteIds: ln6.meta.noteIds.slice() };
      });

    return { roots: rootList, lemmas: lemmaList, edges: edges, stats: stats };
  }

  // ── focus subgraph for one root family ───────────────────────────────────
  async function rootCluster(rootKey, opts) {
    var idx = (opts && opts._index) ? opts._index : await build(opts);
    var rk = String(rootKey || "");
    if (rk.indexOf("root:") !== 0) rk = "root:" + _norm(rk);
    var root = idx.roots.find(function (r) { return r.id === rk; });
    if (!root) return { root: null, lemmas: [], edges: [] };
    var memberSet = new Set(root.lemmaKeys);
    var lemmas = idx.lemmas.filter(function (l) { return memberSet.has(l.id); });
    var edges = idx.edges.filter(function (e) { return e.source === rk; });
    return { root: root, lemmas: lemmas, edges: edges };
  }

  // ── ranked roots for "learn next" / cluster list ─────────────────────────
  // Root nodes only ever come from rooted (content) words, so ranking by
  // frequency is already content-weighted — function words (top of raw
  // frequency) are root-less and never appear here (Phase-0 finding).
  async function rankRoots(opts) {
    opts = opts || {};
    var idx = opts._index || await build(opts);
    var list = idx.roots.slice();
    if (opts.teachableOnly) list = list.filter(function (r) { return r.memberCount >= 2; });
    list.sort(function (a, b) {
      return (b.freq - a.freq) || a.id.localeCompare(b.id); // deterministic
    });
    if (Number.isFinite(opts.limit)) list = list.slice(0, opts.limit);
    return list;
  }

  if (typeof window !== "undefined") {
    window.KnowledgeMapData = { build: build, rootCluster: rootCluster,
                                rankRoots: rankRoots, _STATE3: STATE3 };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { build: build, rootCluster: rootCluster, rankRoots: rankRoots, _STATE3: STATE3 };
  }
})();
