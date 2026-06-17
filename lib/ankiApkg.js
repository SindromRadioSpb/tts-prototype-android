"use strict";
// ── lib/ankiApkg.js — hand-rolled Anki «.apkg» package builder (legacy schema, ver 11) ──────────────
// ⑤ Anki-sync, brick A1 (design: docs/planning/ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md).
//
// Why hand-rolled (no genanki/black-box dep — owner norm «без заглушек»): a .apkg is just a ZIP of a
// SQLite `collection.anki2` (the legacy ver-11 collection every Anki/AnkiDroid/AnkiMobile still imports)
// + a `media` JSON map + numbered media files. We own every byte. This is the deploy-safe, one-way,
// universal export path — unlike AnkiConnect, which is local-only (server→127.0.0.1:8765).
//
// Idempotency: each note's `guid` is a STABLE function of the LinguistPro card key, so re-importing an
// updated deck UPDATES the matching note in Anki instead of duplicating it (Anki matches on guid). The
// deck id and model id are fixed constants so repeat imports merge into the same deck/model.
//
// This module is PURE Node (sqlite3 + archiver, both already deps); no browser/OPFS. Verified by the
// golden gate `npm run smoke:anki-apkg` (build → unzip → open SQLite → assert schema/notes/csum/guid).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const archiver = require("archiver");

// Fixed ids → repeat imports merge into the same deck/model rather than spawning copies.
const LP_DECK_ID = 1718600000001;
const LP_MODEL_ID = 1718600000002;
const FIELD_SEP = "\x1f"; // Anki joins note fields with US (unit separator)

// ── small helpers ───────────────────────────────────────────────────────────────────────────────────
function nowSec() { return Math.floor(Date.now() / 1000); }
function nowMs() { return Date.now(); }

// Anki strips HTML + media refs from the sort field and from the checksum source.
function stripHtmlMedia(s) {
  return String(s == null ? "" : s)
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/\[\[type:[^\]]*\]\]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Anki field checksum: first 8 hex digits of sha1(stripped first field), as an integer.
function fieldChecksum(firstField) {
  const h = crypto.createHash("sha1").update(stripHtmlMedia(firstField), "utf8").digest("hex");
  return parseInt(h.slice(0, 8), 16);
}

// Stable, Anki-shaped guid (10 base91 chars) derived deterministically from a LinguistPro key.
const GUID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-./:;<=>?@[]^_`{|}~";
function stableGuid(key) {
  // 64-bit value from sha1(key), base-91 encoded to 10 chars (genanki-compatible shape).
  const hex = crypto.createHash("sha1").update("lp:" + String(key), "utf8").digest("hex").slice(0, 16);
  let n = BigInt("0x" + hex);
  const base = BigInt(GUID_ALPHABET.length);
  let out = "";
  for (let i = 0; i < 10; i++) { out = GUID_ALPHABET[Number(n % base)] + out; n = n / base; }
  return out;
}

// Which field ords a template's FRONT references → the model `req` entry (Anki recomputes on import, but
// a valid value keeps strict importers happy). "any" so a card generates if any referenced field is set.
function templateReq(ord, frontFmt, fieldNames) {
  const refs = new Set();
  const re = /\{\{[#^/]?\s*([^}]+?)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(frontFmt))) !== null) {
    const name = m[1].replace(/^[#^/]/, "").trim();
    const idx = fieldNames.indexOf(name);
    if (idx >= 0) refs.add(idx);
  }
  const list = refs.size ? Array.from(refs).sort((a, b) => a - b) : [0];
  return [ord, "any", list];
}

// ── the col JSON blobs (models / decks / conf / dconf) ────────────────────────────────────────────────
function buildModelsJson({ modelId, modelName, fieldNames, templates, css }) {
  const flds = fieldNames.map((name, ord) => ({
    name, ord, sticky: false, rtl: false, font: "Arial", size: 20, media: [],
  }));
  const tmpls = templates.map((t, ord) => ({
    name: t.Name || `Card ${ord + 1}`, ord,
    qfmt: t.Front || "", afmt: t.Back || "",
    did: null, bqfmt: "", bafmt: "",
  }));
  const req = templates.map((t, ord) => templateReq(ord, t.Front || "", fieldNames));
  return {
    [String(modelId)]: {
      id: modelId, name: modelName, type: 0, mod: nowSec(), usn: -1, sortf: 0, did: LP_DECK_ID,
      tmpls, flds, css: css || "", latexPre: "", latexPost: "", latexsvg: false, req, vers: [], tags: [],
    },
  };
}

function buildDecksJson({ deckId, deckName }) {
  const common = (id, name) => ({
    id, name, mod: nowSec(), usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0],
    timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: "", dyn: 0, conf: 1,
    extendNew: 10, extendRev: 50,
  });
  return { "1": common(1, "Default"), [String(deckId)]: common(deckId, deckName) };
}

function buildConfJson({ modelId, deckId }) {
  return {
    nextPos: 1, estTimes: true, activeDecks: [deckId], sortType: "noteFld", timeLim: 0,
    sortBackwards: false, addToCur: true, curDeck: deckId, newBury: true, newSpread: 0,
    dueCounts: true, curModel: String(modelId), collapseTime: 1200,
  };
}

function buildDconfJson() {
  return {
    "1": {
      id: 1, name: "Default", mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true,
      new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
      rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
      lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
      dyn: false,
    },
  };
}

// ── sqlite collection writer ──────────────────────────────────────────────────────────────────────────
const SCHEMA_DDL = [
  `CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
     ver integer not null, dty integer not null, usn integer not null, ls integer not null,
     conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);`,
  `CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
     usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null,
     flags integer not null, data text not null);`,
  `CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
     mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null,
     ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null,
     odue integer not null, odid integer not null, flags integer not null, data text not null);`,
  `CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null,
     ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);`,
  `CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);`,
  `CREATE INDEX ix_notes_usn on notes (usn);`,
  `CREATE INDEX ix_cards_usn on cards (usn);`,
  `CREATE INDEX ix_cards_nid on cards (nid);`,
  `CREATE INDEX ix_cards_sched on cards (did, queue, due);`,
  `CREATE INDEX ix_revlog_cid on revlog (cid);`,
  `CREATE INDEX ix_revlog_usn on revlog (usn);`,
  `CREATE INDEX ix_notes_csum on notes (csum);`,
];

function run(db, sql, params) {
  return new Promise((resolve, reject) => db.run(sql, params || [], (err) => (err ? reject(err) : resolve())));
}
function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve())));
}

// Write a legacy collection.anki2 at `dbPath` from the deck spec. `notes[i] = { guid?, fields:[...], tags? }`
// where fields aligns with fieldNames (fields[0] is the sort/identity field).
async function writeCollection(dbPath, { deckName, modelName, fieldNames, templates, css, notes }) {
  const db = new sqlite3.Database(dbPath);
  try {
    await exec(db, "PRAGMA journal_mode=DELETE; PRAGMA legacy_file_format=ON;");
    for (const ddl of SCHEMA_DDL) await exec(db, ddl);
    const crt = nowSec();
    const mod = nowMs();
    const models = buildModelsJson({ modelId: LP_MODEL_ID, modelName, fieldNames, templates, css });
    const decks = buildDecksJson({ deckId: LP_DECK_ID, deckName });
    const conf = buildConfJson({ modelId: LP_MODEL_ID, deckId: LP_DECK_ID });
    const dconf = buildDconfJson();
    await run(db,
      `INSERT INTO col (id,crt,mod,scm,ver,dty,usn,ls,conf,models,decks,dconf,tags)
       VALUES (1,?,?,?,?,0,0,0,?,?,?,?,?)`,
      [crt, mod, mod, 11, JSON.stringify(conf), JSON.stringify(models), JSON.stringify(decks),
       JSON.stringify(dconf), "{}"]);

    let nid = mod;          // note ids: unique, ascending (ms-based + index)
    let cid = mod + 100000; // card ids: separate range
    let pos = 0;
    for (const note of notes) {
      const fields = note.fields || [];
      const first = fields[0] != null ? String(fields[0]) : "";
      const flds = fields.map((f) => String(f == null ? "" : f)).join(FIELD_SEP);
      const sfld = stripHtmlMedia(first);
      const guid = note.guid || stableGuid(first);
      const tags = " " + (Array.isArray(note.tags) ? note.tags.join(" ") : String(note.tags || "")).trim() + " ";
      await run(db,
        `INSERT INTO notes (id,guid,mid,mod,usn,tags,flds,sfld,csum,flags,data)
         VALUES (?,?,?,?,-1,?,?,?,?,0,'')`,
        [nid, guid, LP_MODEL_ID, nowSec(), tags, flds, sfld, fieldChecksum(first)]);
      // one card per template ord (this model has a single template)
      for (let ord = 0; ord < templates.length; ord++) {
        await run(db,
          `INSERT INTO cards (id,nid,did,ord,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data)
           VALUES (?,?,?,?,?,-1,0,0,?,0,0,0,0,0,0,0,0,'')`,
          [cid, nid, LP_DECK_ID, ord, nowSec(), pos]);
        cid += 1;
      }
      nid += 1; pos += 1;
    }
  } finally {
    await new Promise((resolve) => db.close(() => resolve()));
  }
}

// ── public API ────────────────────────────────────────────────────────────────────────────────────────
// buildApkg(spec) → Promise<Buffer> (the .apkg bytes). spec = { deckName, modelName, fieldNames,
// templates:[{Name,Front,Back}], css, notes:[{guid?,fields:[...],tags?}], media?:[{name,data:Buffer}] }.
async function buildApkg(spec) {
  if (!spec || !Array.isArray(spec.fieldNames) || !spec.fieldNames.length) throw new Error("ankiApkg: fieldNames required");
  if (!Array.isArray(spec.templates) || !spec.templates.length) throw new Error("ankiApkg: templates required");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-apkg-"));
  const dbPath = path.join(tmpDir, "collection.anki2");
  try {
    await writeCollection(dbPath, {
      deckName: spec.deckName || "LinguistPro::SRS",
      modelName: spec.modelName || "LinguistPro SRS Card v1",
      fieldNames: spec.fieldNames,
      templates: spec.templates,
      css: spec.css || "",
      notes: spec.notes || [],
    });
    const media = Array.isArray(spec.media) ? spec.media : [];
    const mediaMap = {};
    media.forEach((m, i) => { mediaMap[String(i)] = m.name; });
    // zip: collection.anki2 + media (JSON map) + numbered media files → .apkg buffer
    return await new Promise((resolve, reject) => {
      const chunks = [];
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("data", (c) => chunks.push(c));
      archive.on("error", reject);
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.file(dbPath, { name: "collection.anki2" });
      archive.append(JSON.stringify(mediaMap), { name: "media" });
      media.forEach((m, i) => archive.append(m.data, { name: String(i) }));
      archive.finalize();
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  buildApkg,
  // exported for the golden gate + reuse:
  stableGuid, fieldChecksum, stripHtmlMedia, templateReq,
  LP_DECK_ID, LP_MODEL_ID, FIELD_SEP,
};
