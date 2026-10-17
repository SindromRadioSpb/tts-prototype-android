// public/js/corpus-place-parse.js — Ф4 · Д8-К4 v2 (К4.3): a corpus work's Dicta facts, baked once off-server and served
// with the work, put into this device's stored parse (sentence_morph, provider 'corpus-dicta') so the word's PLACE rule
// (ReaderMorph._atPlace, Д10) reads homographs by context for every learner from the first open — no consent (a corpus is
// not a personal text), no waiting. Plan: docs/planning/word-layer/F4_D8K4_V2_CORPUS_PLACE_PARSE_PLAN_2026_10_17.md.
//
// Raw facts only (word, lemma, lemmas, part of speech, niqqud, binyan, prefix) — the rule decides on the device.
// Binding: sha256(he_plain.trim()) of the row + its order_index; a row the learner edited does not match and gets nothing.
// Never over an existing parse (the learner's own, or one that came inside a published snapshot).
// Memory (3.11.760 lesson): one work at a time, rows read and written a page at a time.
// Dependencies come as arguments (Node-testable):
//   db: { dbQuery(sql, params), saveSentenceMorphIfAbsent(textId, sid, model, tokens, provider) },
//   fetch, sha256Hex(string) → Promise<hex>, RM: ReaderMorph (placeUnits, invalidatePlaces),
//   done (optional): { has(textId), add(textId) } — the works applied under this ALIGN.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CorpusPlaceParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PROVIDER = "corpus-dicta", PAGE = 200, MIN_ALIGNED = 0.9;
  // ALIGN — the alignment's version (O-092, 2: quoted abbreviations). A work applied under an older one is applied once
  // more: rows that now align get their facts, rows with facts are kept (deps.done remembers the works done under ALIGN).
  var ALIGN = 2;
  var HASH64 = /^[0-9a-f]{64}$/, KEY = /^[0-9a-f]{64}$/;

  function meta(text) { try { return JSON.parse((text && text.source_meta_json) || "{}") || {}; } catch (_) { return {}; } }
  // where this text's facts live, or null (a personal / group text, or a corpus text we cannot address)
  function sourceOf(text) {
    var m = meta(text);
    if (m.public_corpus && m.public_corpus.slug && m.public_corpus.public_work_id && HASH64.test(String(m.public_corpus.snapshot_sha256 || ""))) {
      var pc = m.public_corpus;
      return { kind: "pc", edition: pc.snapshot_sha256,
        url: "/api/public-corpora/" + encodeURIComponent(pc.slug) + "/works/" + encodeURIComponent(pc.public_work_id) + "/parse?snapshot=" + pc.snapshot_sha256 };
    }
    if (m.corpus && m.corpus.byehuda_id && KEY.test(String(text.text_key || ""))) {
      return { kind: "by", edition: String(text.text_key), url: "/data/corpus-parse/by/" + text.text_key + ".json" };
    }
    return null;
  }
  // a stored row (the same shape /api/morphology/batch gives sentence_morph) from a packed token
  function unpack(a) {
    return { word: a[0], lemma: a[1] || "", lemmas: [a[1]].concat(a[2] || []).filter(Boolean), posDicta: a[3] || "", niqqud: a[4] || "",
      binyan: a[5] || null, prefix: a[6] || "", stem: "" };
  }

  // → { status: 'applied'|'none'|'skip'|'error', applied, unmatched, misaligned, kept }
  async function apply(text, deps) {
    deps = deps || {};
    var db = deps.db, src = sourceOf(text);
    if (!src || !db) return { status: "skip" };
    var tid = String(text.id);
    var have = ((await db.dbQuery("SELECT COUNT(*) AS n FROM sentence_morph WHERE text_id = ? AND provider = ?", [tid, PROVIDER])) || [])[0];
    if (have && Number(have.n) > 0 && (!deps.done || deps.done.has(tid))) return { status: "skip", reason: "applied before" };
    var res;
    try { res = await deps.fetch(src.url, { cache: "default" }); } catch (e) { return { status: "error", reason: String(e && e.message || e) }; }
    if (!res || res.status === 404 || res.status === 409) return { status: "none" };
    if (!res.ok) return { status: "error", reason: "HTTP " + res.status };
    var file = await res.json();
    if (!file || file.v !== 1 || !file.src || String(file.src.edition) !== String(src.edition) || !Array.isArray(file.rows)) {
      return { status: "error", reason: "file does not belong to this edition" };
    }
    var byKey = new Map();
    file.rows.forEach(function (r) { if (Array.isArray(r) && r.length >= 3) byKey.set(String(r[0]) + ":" + String(r[1]), r[2]); });
    var out = { status: "applied", applied: 0, unmatched: 0, misaligned: 0, kept: 0 }, touched = [];
    for (var off = 0; ; off += PAGE) {
      var page = await db.dbQuery("SELECT s.id, s.order_index, s.he_plain, s.he_niqqud, (SELECT COUNT(*) FROM sentence_morph m WHERE m.sentence_id = s.id) AS has " +
        "FROM sentences s WHERE s.text_id = ? ORDER BY s.order_index LIMIT ? OFFSET ?", [tid, PAGE, off]);
      if (!page || !page.length) break;
      for (var i = 0; i < page.length; i++) {
        var row = page[i], plain = String(row.he_plain || "").trim();
        if (!plain) continue;
        var packed = byKey.get((await deps.sha256Hex(plain)).slice(0, 16) + ":" + String(row.order_index));
        if (!packed) { out.unmatched++; continue; }
        if (Number(row.has) > 0) { out.kept++; continue; }
        var tokens = packed.map(unpack);
        // the same alignment the place loader will run: the facts must sit on this row's words
        var pu = deps.RM.placeUnits(row, tokens), units = pu.sk.filter(Boolean).length;
        if (!units || pu.at.size + (pu.cover ? pu.cover.size : 0) < units * MIN_ALIGNED) { out.misaligned++; continue; }
        await db.saveSentenceMorphIfAbsent(tid, String(row.id), String(file.model || ""), tokens, PROVIDER);
        out.applied++; touched.push(String(row.id));
      }
    }
    if (touched.length && deps.RM.invalidatePlaces) deps.RM.invalidatePlaces(touched);
    if (deps.done) { try { deps.done.add(tid); } catch (_) {} }
    return out;
  }

  return { PROVIDER: PROVIDER, ALIGN: ALIGN, sourceOf: sourceOf, unpack: unpack, apply: apply };
});
