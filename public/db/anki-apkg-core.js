/* ── anki-apkg-core.js — shared, environment-agnostic Anki «.apkg» format core ────────────────────────
 * ⑤ Anki-sync (design: docs/planning/ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md).
 *
 * The ONE source of truth for the legacy Anki collection format (schema ver 11): pure-JS SHA-1, field
 * checksum, stable note GUID, the col JSON blobs (models/decks/conf/dconf), the schema DDL, and
 * `prepareCollection()` which turns a deck spec into ready-to-insert col/notes/cards rows. NO SQLite or
 * ZIP here — those are the thin adapters:
 *   • server  → lib/ankiApkg.js   (sqlite3 + archiver)        — for CLI / batch decks
 *   • client  → public/db/anki-apkg.js (sql.js + jszip)        — the user-facing export (data stays on device)
 * Both consume this core, so the two builders cannot drift (gate: smoke:anki-apkg + smoke:anki-apkg-client).
 *
 * UMD: usable via `require()` in Node and as a global `AnkiApkgCore` in the browser. Pure-JS SHA-1 (not
 * Node crypto / WebCrypto) so the SAME sync code runs in both — verified byte-equal to crypto in the gate.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AnkiApkgCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FIELD_SEP = "\x1f";          // Anki joins note fields with US (unit separator)
  const LP_DECK_ID = 1718600000001;  // fixed → repeat imports merge into the same deck
  const LP_MODEL_ID = 1718600000002; // fixed → repeat imports merge into the same model

  // ── UTF-8 + pure-JS SHA-1 (sync, no crypto dep) ─────────────────────────────────────────────────────
  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(str));
    // Fallback (older runtimes): manual UTF-8.
    const s = unescape(encodeURIComponent(String(str)));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }
  function rotl(n, b) { return ((n << b) | (n >>> (32 - b))) >>> 0; }
  // SHA-1 over a string's UTF-8 bytes → 40-char lowercase hex.
  function sha1Hex(str) {
    const msg = utf8Bytes(str);
    const ml = msg.length;
    const bitLen = ml * 8;
    // pad: 0x80, then zeros, then 64-bit big-endian length, to a multiple of 64 bytes
    const withPad = new Uint8Array(((ml + 8) >> 6) * 64 + 64);
    withPad.set(msg);
    withPad[ml] = 0x80;
    // 64-bit length (we only need the low 32 bits for our sizes, high stays 0)
    const dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 4, bitLen >>> 0, false);
    dv.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Int32Array(80);
    for (let off = 0; off < withPad.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
      for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const hex = (n) => ("00000000" + (n >>> 0).toString(16)).slice(-8);
    return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
  }

  // ── format helpers ──────────────────────────────────────────────────────────────────────────────────
  // Anki strips HTML + media refs from the sort field and from the checksum source.
  function stripHtmlMedia(s) {
    return String(s == null ? "" : s)
      .replace(/\[sound:[^\]]*\]/g, "")
      .replace(/\[\[type:[^\]]*\]\]/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  // Anki field checksum: first 8 hex digits of sha1(stripped first field), as an integer.
  function fieldChecksum(firstField) { return parseInt(sha1Hex(stripHtmlMedia(firstField)).slice(0, 8), 16); }

  // Stable, Anki-shaped guid (10 base91 chars) derived deterministically from a LinguistPro key → a
  // re-exported deck UPDATES the matching note instead of duplicating it (Anki matches on guid).
  const GUID_ALPHABET =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-./:;<=>?@[]^_`{|}~";
  function stableGuid(key) {
    let n = BigInt("0x" + sha1Hex("lp:" + String(key)).slice(0, 16));
    const base = BigInt(GUID_ALPHABET.length);
    let out = "";
    for (let i = 0; i < 10; i++) { out = GUID_ALPHABET[Number(n % base)] + out; n = n / base; }
    return out;
  }

  // Field ords a template's FRONT references → the model `req` entry (Anki recomputes on import; a valid
  // value keeps strict importers happy). "any" → a card generates if any referenced field is set.
  function templateReq(ord, frontFmt, fieldNames) {
    const refs = new Set();
    const re = /\{\{[#^/]?\s*([^}]+?)\s*\}\}/g;
    let m;
    while ((m = re.exec(String(frontFmt))) !== null) {
      const idx = fieldNames.indexOf(m[1].replace(/^[#^/]/, "").trim());
      if (idx >= 0) refs.add(idx);
    }
    return [ord, "any", refs.size ? Array.from(refs).sort((a, b) => a - b) : [0]];
  }

  // ── col JSON blobs ────────────────────────────────────────────────────────────────────────────────
  function buildModelsJson(o) {
    const flds = o.fieldNames.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: "Arial", size: 20, media: [] }));
    const tmpls = o.templates.map((t, ord) => ({ name: t.Name || ("Card " + (ord + 1)), ord, qfmt: t.Front || "", afmt: t.Back || "", did: null, bqfmt: "", bafmt: "" }));
    const req = o.templates.map((t, ord) => templateReq(ord, t.Front || "", o.fieldNames));
    return { [String(o.modelId)]: { id: o.modelId, name: o.modelName, type: 0, mod: o.modSec, usn: -1, sortf: 0, did: o.deckId != null ? o.deckId : LP_DECK_ID, tmpls, flds, css: o.css || "", latexPre: "", latexPost: "", latexsvg: false, req, vers: [], tags: [] } };
  }
  function deckEntry(id, name, modSec) {
    return { id, name, mod: modSec, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: "", dyn: 0, conf: 1, extendNew: 10, extendRev: 50 };
  }
  function buildDecksJson(o) {
    return { "1": deckEntry(1, "Default", o.modSec), [String(o.deckId)]: deckEntry(o.deckId, o.deckName, o.modSec) };
  }
  function buildConfJson(o) {
    return { nextPos: 1, estTimes: true, activeDecks: [o.deckId], sortType: "noteFld", timeLim: 0, sortBackwards: false, addToCur: true, curDeck: o.deckId, newBury: true, newSpread: 0, dueCounts: true, curModel: String(o.modelId), collapseTime: 1200 };
  }
  function buildDconfJson() {
    return { "1": { id: 1, name: "Default", mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 }, rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 }, lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 }, dyn: false } };
  }

  const SCHEMA_DDL = [
    "CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);",
    "CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);",
    "CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);",
    "CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);",
    "CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);",
    "CREATE INDEX ix_notes_usn on notes (usn);",
    "CREATE INDEX ix_cards_usn on cards (usn);",
    "CREATE INDEX ix_cards_nid on cards (nid);",
    "CREATE INDEX ix_cards_sched on cards (did, queue, due);",
    "CREATE INDEX ix_revlog_cid on revlog (cid);",
    "CREATE INDEX ix_revlog_usn on revlog (usn);",
    "CREATE INDEX ix_notes_csum on notes (csum);",
  ];

  // Turn a deck spec into ready-to-insert rows. `opts.now` (ms) makes ids deterministic (parity tests).
  // Single-model spec: { deckName, modelName, fieldNames, templates:[{Name,Front,Back}], css, notes:[{guid?,fields:[],tags?}], media? }
  // Multi-model spec (e.g. «both» = words + sentences in ONE .apkg): { groups: [<single-model spec without media>, ...], media? }
  // Each group gets its OWN model id (LP_MODEL_ID+gi) + deck (LP_DECK_ID+gi) so a collection can hold many.
  function prepareCollection(spec, opts) {
    opts = opts || {};
    const nowMs = opts.now != null ? opts.now : Date.now();
    const crtSec = Math.floor(nowMs / 1000);
    const modSec = crtSec;
    const groups = (Array.isArray(spec.groups) && spec.groups.length)
      ? spec.groups
      : [{ deckName: spec.deckName, modelName: spec.modelName, fieldNames: spec.fieldNames, templates: spec.templates, css: spec.css, notes: spec.notes }];

    const models = {};
    const decks = { "1": deckEntry(1, "Default", modSec) };
    const notes = [], cards = [];
    let nid = nowMs, cid = nowMs + 100000, pos = 0;
    groups.forEach((g, gi) => {
      const mid = LP_MODEL_ID + gi, did = LP_DECK_ID + gi;
      const templates = g.templates || [];
      Object.assign(models, buildModelsJson({ modelId: mid, deckId: did, modelName: g.modelName, fieldNames: g.fieldNames, templates, css: g.css, modSec }));
      decks[String(did)] = deckEntry(did, g.deckName, modSec);
      for (const note of (g.notes || [])) {
        const fields = note.fields || [];
        const first = fields[0] != null ? String(fields[0]) : "";
        const flds = fields.map((f) => String(f == null ? "" : f)).join(FIELD_SEP);
        const tags = " " + (Array.isArray(note.tags) ? note.tags.join(" ") : String(note.tags || "")).trim() + " ";
        notes.push({ id: nid, guid: note.guid || stableGuid(first), mid, mod: modSec, usn: -1, tags, flds, sfld: stripHtmlMedia(first), csum: fieldChecksum(first), flags: 0, data: "" });
        for (let ord = 0; ord < templates.length; ord++) {
          cards.push({ id: cid, nid, did, ord, mod: modSec, usn: -1, type: 0, queue: 0, due: pos, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, data: "" });
          cid += 1;
        }
        nid += 1; pos += 1;
      }
    });
    // conf points at the FIRST group's model/deck (curModel/curDeck).
    const conf = buildConfJson({ modelId: LP_MODEL_ID, deckId: LP_DECK_ID });
    const dconf = buildDconfJson();
    const colValues = [1, crtSec, nowMs, nowMs, 11, 0, 0, 0, JSON.stringify(conf), JSON.stringify(models), JSON.stringify(decks), JSON.stringify(dconf), "{}"];
    const media = Array.isArray(spec.media) ? spec.media : [];
    const mediaMap = {};
    media.forEach((m, i) => { mediaMap[String(i)] = m.name; });
    return { colValues, notes, cards, mediaMap, media };
  }

  return {
    FIELD_SEP, LP_DECK_ID, LP_MODEL_ID,
    sha1Hex, stripHtmlMedia, fieldChecksum, stableGuid, templateReq,
    buildModelsJson, buildDecksJson, buildConfJson, buildDconfJson,
    SCHEMA_DDL, prepareCollection,
  };
});
