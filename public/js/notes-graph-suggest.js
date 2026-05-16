/* notes-graph-suggest.js — v3.6 Phase 1.
 *
 * A2 offline shared-root/lemma/binyan/same-text candidate generator.
 *
 * The Smart Learning Graph "suggest" step: from purely LOCAL data the
 * app already has, propose note↔note candidate connections that the
 * learner will later confirm/reject in the editor (Phase 3+). This
 * module ONLY generates ranked candidates — it does not render, does
 * not write, does not touch the network, and does not mutate anything.
 *
 * HARD INVARIANTS (smoke-pinned):
 *  - READ-ONLY: every SQL goes through the same bare-SELECT guard the
 *    graph uses (`notes-graph.js` _READONLY_RE/_FORBIDDEN_RE). No
 *    INSERT/UPDATE/etc. can leave this module.
 *  - OFFLINE / LOCAL: only window.__localDB.dbQuery. No fetch/XHR/
 *    sendBeacon. No telemetry / events.
 *  - DETERMINISTIC: same DB state → identical output (no RNG, no
 *    time-of-day). Stable ordering. Capped (per-token + per-note).
 *  - DEGRADES, never throws: missing DB / morphology → returns [].
 *  - Graph stays read-only: this produces data for the editor Confirm
 *    panel (Phase 3); it never authors links itself.
 *
 * Contract pinned by scripts/notes-graph/__fixtures__/
 * suggest-bundle-fixture.json (the user's real bundle) +
 * suggest-generator-smoke.js.
 *
 * Public API (window.NotesGraphSuggest):
 *   candidatesForNote(noteId, opts?) → Promise<Array<{
 *       from, to, to_kind:'note', reason_code, evidence, score }>>
 *     opts: { k?:number=7, capPerToken?:number=8 }
 *   _index()  → Promise<idx>  (test hook; read-only)
 */
(function () {
  "use strict";

  // Reason priority + base weight. shared_root / shared_lemma are the
  // strongest learning signals; shared_binyan is ubiquitous (heavily
  // rarity-down-weighted below); same_text is the structural backbone.
  var REASON_PRIORITY = ["shared_root", "shared_lemma", "shared_binyan", "same_text"];
  var BASE = { shared_root: 3.0, shared_lemma: 3.0, shared_binyan: 1.0, same_text: 2.0 };
  var DEFAULT_K = 7;
  var DEFAULT_CAP_PER_TOKEN = 8;

  // ── read-only DB shim — identical guard to notes-graph.js _q ─────────────
  var _READONLY_RE = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
  var _FORBIDDEN_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
  async function _q(sql, params) {
    var ldb = (typeof window !== "undefined") && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== "function") {
      throw new Error("notes-graph-suggest: local-db not ready");
    }
    var s = String(sql || "");
    if (!_READONLY_RE.test(s) || _FORBIDDEN_RE.test(s)) {
      throw new Error("notes-graph-suggest: refused non-SELECT SQL (read-only invariant)");
    }
    return ldb.dbQuery(s, params || []);
  }

  function _norm(w) {
    if (typeof window !== "undefined" && window.MorphNormalize &&
        typeof window.MorphNormalize.normalizeHebrew === "function") {
      try { return String(window.MorphNormalize.normalizeHebrew(w) || "").trim(); }
      catch (_) { /* fall through */ }
    }
    return String(w == null ? "" : w).trim();
  }

  // ── read-only fetch (mirrors notes-graph _fetchRaw projection) ───────────
  async function _fetchRaw() {
    var notes = await _q(
      "SELECT id, text_id, note_type," +
      " json_extract(body_json, '$.root')   AS j_root," +
      " json_extract(body_json, '$.binyan') AS j_binyan," +
      " json_extract(body_json, '$.word')   AS j_word" +
      " FROM notes_v2", []);
    var links = await _q(
      "SELECT from_note_id, to_kind, to_id FROM note_links", []);
    return { notes: notes || [], links: links || [] };
  }

  // ── inverted index over local data (built once per call) ─────────────────
  async function buildIndex() {
    var raw;
    try { raw = await _fetchRaw(); }
    catch (_) { return null; }            // degrade, never throw
    var notes = raw.notes;
    var byId = new Map();
    var byRoot = new Map(), byLemma = new Map(), byBinyan = new Map(), byText = new Map();
    function add(map, key, id) {
      if (!key) return;
      var s = map.get(key);
      if (!s) { s = []; map.set(key, s); }
      s.push(id);
    }
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var id = String(n.id);
      byId.set(id, n);
      add(byRoot,   _norm(n.j_root),   id);
      add(byLemma,  _norm(n.j_word),   id);
      add(byBinyan, _norm(n.j_binyan), id);
      add(byText,   String(n.text_id == null ? "" : n.text_id).trim(), id);
    }
    // existing note→note links to exclude (note→text etc. do NOT block
    // a note→note same_text candidate — the bug class that broke the
    // graph; the fixture pins this).
    var linkedNN = new Set();
    for (var j = 0; j < raw.links.length; j++) {
      var l = raw.links[j];
      if (String(l.to_kind) === "note" && byId.has(String(l.to_id))) {
        linkedNN.add(String(l.from_note_id) + "->" + String(l.to_id));
      }
    }
    return { byId: byId, byRoot: byRoot, byLemma: byLemma,
             byBinyan: byBinyan, byText: byText, linkedNN: linkedNN };
  }

  // rarity weight: a token shared by many notes is a weak signal.
  // group size G → 1 / (1 + ln(1 + G)). A binyan shared by 50 notes is
  // ~0.2; a root shared by 2 notes is ~0.48 — so a rare root always
  // out-ranks a ubiquitous binyan.
  function rarity(groupSize) {
    return 1 / (1 + Math.log(1 + Math.max(0, groupSize)));
  }

  async function candidatesForNote(noteId, opts) {
    opts = opts || {};
    var K = Number.isFinite(opts.k) ? opts.k : DEFAULT_K;
    var capTok = Number.isFinite(opts.capPerToken) ? opts.capPerToken : DEFAULT_CAP_PER_TOKEN;
    var id = String(noteId == null ? "" : noteId);
    if (!id) return [];
    var idx = await buildIndex();
    if (!idx || !idx.byId.has(id)) return [];
    var self = idx.byId.get(id);

    var GROUPS = [
      ["shared_root",   idx.byRoot,   _norm(self.j_root)],
      ["shared_lemma",  idx.byLemma,  _norm(self.j_word)],
      ["shared_binyan", idx.byBinyan, _norm(self.j_binyan)],
      ["same_text",     idx.byText,   String(self.text_id == null ? "" : self.text_id).trim()],
    ];

    var out = [];
    for (var g = 0; g < GROUPS.length; g++) {
      var reason = GROUPS[g][0], map = GROUPS[g][1], token = GROUPS[g][2];
      if (!token) continue;
      var members = map.get(token) || [];
      var w = rarity(members.length);
      // per-token cap: keep the closest (deterministic: to_id asc).
      var peers = members
        .filter(function (m) { return m !== id; })
        .filter(function (m) { return !idx.linkedNN.has(id + "->" + m); })
        .sort(function (a, b) { return a.localeCompare(b); })
        .slice(0, capTok);
      for (var p = 0; p < peers.length; p++) {
        out.push({
          from: id, to: peers[p], to_kind: "note",
          reason_code: reason, evidence: token,
          score: +(BASE[reason] * w).toFixed(6),
        });
      }
    }
    // deterministic ranking: score desc, reason priority, to_id asc.
    out.sort(function (x, y) {
      return (y.score - x.score) ||
        (REASON_PRIORITY.indexOf(x.reason_code) - REASON_PRIORITY.indexOf(y.reason_code)) ||
        x.to.localeCompare(y.to);
    });
    return out.slice(0, K);
  }

  window.NotesGraphSuggest = {
    candidatesForNote: candidatesForNote,
    _index: buildIndex,          // test hook (read-only)
  };
})();
