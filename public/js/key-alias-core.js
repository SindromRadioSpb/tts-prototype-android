// public/js/key-alias-core.js — Ф4 · Д8-К3: one history per word. The «old key → new key» decision is an event of the
// review log itself (kind "alias"), folded by ONE rule on the client and on the mentor's server (the server requires
// this same file — parity by construction).
// Spec: docs/planning/word-layer/F4_D8K3_KEY_ALIAS_DESIGN_2026_10_14.md.
//
// Rule: the alias of a key = its latest alias event (reviewed_at, then id); alias_to == the key itself = undone.
// canonical(key) follows the chain (≤ 8 steps; a cycle stops where it closes). A key's schedule is the replay of the
// union of the rows of every key whose canonical key it is; an absorbed key has no projection of its own. The log is
// never rewritten. Pure; dual export (window.KeyAliasCore + module.exports).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KeyAliasCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KIND = "alias", SOURCE = "identity", MAX_CHAIN = 8;
  function str(v) { return v == null ? "" : String(v); }
  function metaOf(row) {
    var m = row && (row.meta_json != null ? row.meta_json : row.meta);
    if (typeof m === "string") { try { m = JSON.parse(m); } catch (_) { m = null; } }
    return m && typeof m === "object" ? m : {};
  }
  function cmp(a, b) { return str(a.reviewed_at).localeCompare(str(b.reviewed_at)) || str(a.id).localeCompare(str(b.id)); }
  // rows (any kinds) → Map(old key → new key), the latest decision per key; undone keys are absent
  function mapFromRows(rows) {
    var latest = new Map();
    (rows || []).forEach(function (r) {
      if (!r || r.kind !== KIND) return;
      var k = str(r.item_key).trim(); if (!k) return;
      var prev = latest.get(k);
      if (!prev || cmp(prev, r) < 0) latest.set(k, r);
    });
    var map = new Map();
    latest.forEach(function (r, k) { var to = str(metaOf(r).alias_to).trim(); if (to && to !== k) map.set(k, to); });
    return map;
  }
  function canonical(map, key) {
    var k = str(key), seen = {};
    for (var i = 0; i < MAX_CHAIN && map && map.has(k) && !seen[k]; i++) { seen[k] = 1; k = map.get(k); }
    return k;
  }
  // every key whose canonical key is `target` (the target itself included)
  function membersOf(map, target, keys) {
    var out = [target];
    (keys || Array.from(map ? map.keys() : [])).forEach(function (k) { if (k !== target && canonical(map, k) === target && out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  // the rows of a target's history: the union of its members' rows, by time; alias events themselves are not reviews
  function mergeRows(rowsLists) {
    var all = [];
    (rowsLists || []).forEach(function (rs) { (rs || []).forEach(function (r) { if (r && r.kind !== KIND) all.push(r); }); });
    return all.sort(cmp);
  }
  // keys a set of new events touches: both ends of every alias (both projections are recomputed)
  function touchedKeys(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || r.kind !== KIND) return;
      [str(r.item_key), str(metaOf(r).alias_to)].forEach(function (k) { if (k && out.indexOf(k) < 0) out.push(k); });
    });
    return out;
  }
  function fnv(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
    return ("00000000" + h1.toString(16)).slice(-8) + ("00000000" + h2.toString(16)).slice(-8);
  }
  // the event for «old → to» decided at `at` (to === old = undo); the id is the decision's (old, to, at)
  function aliasRow(oldKey, toKey, at, reason) {
    var o = str(oldKey).trim(), t = str(toKey).trim(), ts = str(at || new Date().toISOString());
    if (!o || !t) throw new Error("ALIAS_KEYS_REQUIRED");
    var meta = { alias_to: t }; if (reason) meta.alias_reason = str(reason).slice(0, 40);
    return { id: "alias:" + fnv(o + "\u0001" + t + "\u0001" + ts), item_key: o, kind: KIND, reviewed_at: ts, grade: null, source: SOURCE, channel: null, meta_json: JSON.stringify(meta) };
  }
  // The manual status of a word from the mark events of its keys (Д8-К3, owner incident 2026-10-14): the word's own marks
  // count whatever they say; an absorbed spelling's marks count only when they ASSERT a status — its clear (status "")
  // means «this spelling no longer carries the mark» (Д7.2 moved it), never «the learner cleared the word». The latest
  // counted mark wins (reviewed_at, id). marks: [{ item_key, reviewed_at, id, meta_json|meta }] → status | null.
  function foldMarks(marks, target) {
    var best = null;
    (marks || []).forEach(function (m) {
      if (!m) return;
      var s = metaOf(m).status; if (s == null) return; s = str(s);
      if (str(m.item_key) !== str(target) && s === "") return;
      if (!best || cmp(best, m) < 0) best = { reviewed_at: m.reviewed_at, id: m.id, s: s };
    });
    return best ? best.s : null;
  }
  // validator shared by the client's appendReviewLog and the server's ingest
  function validate(row) {
    if (!row || row.kind !== KIND) return { ok: true };
    var to = str(metaOf(row).alias_to).trim();
    if (!to) return { ok: false, reason: "alias_without_target" };
    if (to.length > 300) return { ok: false, reason: "alias_target_too_long" };
    if (row.grade != null) return { ok: false, reason: "grade_on_alias" };
    return { ok: true };
  }
  return { KIND: KIND, SOURCE: SOURCE, mapFromRows: mapFromRows, canonical: canonical, membersOf: membersOf, mergeRows: mergeRows,
    touchedKeys: touchedKeys, aliasRow: aliasRow, validate: validate, foldMarks: foldMarks };
});
