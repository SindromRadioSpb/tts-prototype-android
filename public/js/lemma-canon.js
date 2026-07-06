/* lemma-canon.js — THE single canonical word-memory keyer + review-log id helper (UMD, pure).
 *
 * Retention program P0 (docs/planning/RETENTION_PROGRAM_RECON_2026_07_02.md §3.3, BLOCKER B1/B2/B5):
 * every path that WRITES a memory fact about a word (Room recall save/paint, Studio trainer,
 * Anki ingest mapping, bundle backfill) must derive the item key HERE, so the append-only
 * review_log can never split one word's history across key dialects. reader-morph's
 * statusKeyForCard delegates to canonKey (keeping its own byte-equal inline fallback for load
 * order); the conformance gate in smoke:memory-canon asserts delegate == fallback == noteKey
 * on shared fixtures — any drift fails the build.
 *
 * Key shape (byte-identical to NotesAutoGen.lemmaKey — the Epic-4 canon):
 *   pid:<pealim_id>                        (authoritative when a Pealim id is known)
 *   <niqqud-stripped lemma|word>#<pos>     (otherwise)
 * canonKey() additionally mirrors reader-morph's two save==paint enrichments:
 *   - keyWord: derive the surface from the vocalization (ktiv male/chaser parity);
 *   - functionPid: PealimFunctionLinks id for function words (גם→pid:3304 class).
 *
 * KEYER_VERSION is stamped into review_log.meta_json on every row; bumping it WITHOUT a
 * re-key migration of review_log/word_status fails the gate (recon §3.3 re-keying invariant).
 *
 * Pure: no DOM, no DB, no Date.now(). Node-requirable for gates and reports.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.LemmaCanon = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYER_VERSION = 1;

  var NIQQUD_RE = /[֑-ׇ]/g;
  function stripNiqqud(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, ""); }

  // Canonical key of a NOTE BODY — byte-mirror of NotesAutoGen.lemmaKey (notes-autogen.js:377),
  // standalone so ES-module contexts (local-db) can key without the NA global. part_of_speech is
  // accepted as a defensive fallback for hand-edited bodies that lack `pos` (NA-canonical bodies
  // always carry `pos`, where the two are byte-identical — asserted by the conformance gate).
  function noteKey(body) {
    if (!body || typeof body !== "object") return "";
    if (body.pealim_id) return "pid:" + body.pealim_id;   // truthy check — byte-parity with NA.lemmaKey
    var lem = stripNiqqud(body.lemma || body.word || "");
    if (!lem) return "";   // deliberate deviation: an unkeyable body REFUSES ('' → appendReviewLog rejects) rather than minting a junk '#<pos>' key
    return lem + "#" + (body.pos || body.part_of_speech || "");
  }

  // Mirror of reader-morph _statusKeyWord: derive the status-key surface from the vocalization
  // when present (identical for ktiv male + chaser columns), else card.word / raw surface.
  function keyWord(card, niqqud, surface) {
    if (niqqud && /[֑-ׇ]/.test(niqqud)) return stripNiqqud(niqqud);
    return (card && card.word) || surface || "";
  }

  // Mirror of reader-morph _statusPid: a function word's Pealim id via PealimFunctionLinks so
  // save==paint==review agree on pid-keys for גם/לא-class words. `links` is injectable for
  // Node gates; defaults to the page global when present.
  function functionPid(card, surface, pos, links) {
    if (card && card.pealim_id) return String(card.pealim_id);
    var fl = links || (typeof self !== "undefined" ? self.PealimFunctionLinks : null);
    try {
      if (fl && surface) {
        var hit = fl.lookup(surface, pos || (card && card.pos) || "", { lemma: surface });
        if (hit && hit.id != null) return String(hit.id);
      }
    } catch (_) {}
    return "";
  }

  // THE canonical status/colour/review key for a resolved card. Byte-identical to reader-morph's
  // statusKeyForCard (which now delegates here): keyWord + functionPid enrichments folded into
  // NA.lemmaKey. Returns "" when NA is unavailable (caller treats as unkeyable — never guesses).
  function canonKey(NA, card, niqqud, surface, links) {
    if (!NA || !NA.lemmaKey || !card) return "";
    var ks = keyWord(card, niqqud, surface);
    try { return NA.lemmaKey({ pealim_id: functionPid(card, ks, card.pos, links), lemma: card.lemma, word: ks, pos: card.pos }) || ""; }
    catch (_) { return ""; }
  }

  // ---- pure SHA-1 (UTF-8) — self-contained so review ids need no load-order dependency. ----
  function _utf8(str) {
    str = String(str == null ? "" : str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return out;
  }
  function _rotl(n, b) { return ((n << b) | (n >>> (32 - b))) >>> 0; }
  function sha1Hex(str) {
    var msg = _utf8(str);
    var ml = msg.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    for (var s = 56; s >= 0; s -= 8) msg.push((s >= 32 ? Math.floor(ml / 0x100000000) : ml) >>> (s % 32) & 0xff);
    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    var w = new Array(80);
    for (var off = 0; off < msg.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
      for (i = 16; i < 80; i++) w[i] = _rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      var a = h0, b = h1, c = h2, d = h3, e = h4, f, k;
      for (i = 0; i < 80; i++) {
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        var t = (_rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0;
        e = d; d = c; c = _rotl(b, 30); b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    var hex = function (n) { return ("00000000" + n.toString(16)).slice(-8); };
    return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
  }

  // Content-deterministic, globally-unique review_log id (recon §3.2, BLOCKER B5): the same
  // review produces the same id on every device/import → INSERT OR IGNORE merges bundles with
  // zero loss and zero duplication. Per-device counters are rejected by design.
  function reviewId(row) {
    var itemKey = row && row.item_key != null ? row.item_key : "";
    var at = row && row.reviewed_at != null ? row.reviewed_at : "";
    var grade = row && row.grade != null ? row.grade : "";
    var source = row && row.source != null ? row.source : "";
    var channel = row && row.channel != null ? row.channel : "";
    return "app:" + sha1Hex(itemKey + "|" + at + "|" + grade + "|" + source + "|" + channel).slice(0, 20);
  }

  // D3 (owner 2026-07-05, CLG-P3) — CONTENT-HASHED seed id: the legacy identity id
  // 'seed:<item_key>' collided across devices/users by PK, and a cross-device union silently
  // dropped one snapshot (AI_MENTOR_RECON §14 D3). Hashing the seed's meta keeps BOTH rows in a
  // union; fsrs-core.replay picks deterministically (earliest-wins watermark). Stable key order →
  // the same snapshot hashes identically on every device/engine, so a same-content double-append
  // still dedupes by PK (the old backstop survives for identical snapshots).
  function stableJson(v) {
    if (v == null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) {
      var parts = [];
      for (var i = 0; i < v.length; i++) parts.push(stableJson(v[i]));
      return "[" + parts.join(",") + "]";
    }
    var keys = Object.keys(v).sort();
    var out = [];
    for (var k = 0; k < keys.length; k++) {
      if (v[keys[k]] === undefined) continue;
      out.push(JSON.stringify(keys[k]) + ":" + stableJson(v[keys[k]]));
    }
    return "{" + out.join(",") + "}";
  }
  function seedId(itemKey, meta) {
    return "seed:" + String(itemKey == null ? "" : itemKey) + "#" + sha1Hex(stableJson(meta || {})).slice(0, 12);
  }

  // P7.0a (TELEGRAM_P7_DECISION, критика wf_1bf34023 M-4) — канон id annul-строки:
  // ДЕТЕРМИНИРОВАН по цели (двойная доставка одного аннулирования дедупится по PK)
  // и РАЗЛИЧЕН для разных целей (bulk-annul двух грейдов в одну миллисекунду не
  // схлопывается). reviewId для annul-строк ЗАПРЕЩЁН (не включает annul_of, grade
  // у annul всегда null → два annul разных целей получили бы один id — тихая
  // потеря второго аннулирования).
  function annulId(targetId) {
    return "annul:" + sha1Hex(String(targetId == null ? "" : targetId)).slice(0, 20);
  }

  return {
    KEYER_VERSION: KEYER_VERSION,
    stripNiqqud: stripNiqqud,
    noteKey: noteKey,
    keyWord: keyWord,
    functionPid: functionPid,
    canonKey: canonKey,
    sha1Hex: sha1Hex,
    reviewId: reviewId,
    stableJson: stableJson,
    seedId: seedId,
    annulId: annulId,
  };
});
