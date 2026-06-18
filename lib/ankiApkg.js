"use strict";
// ── lib/ankiApkg.js — SERVER/CLI Anki «.apkg» builder (sqlite3 + archiver adapter) ──────────────────────
// ⑤ Anki-sync (design: docs/planning/ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md).
//
// Thin server-side adapter over the shared format core (public/db/anki-apkg-core.js): the core owns ALL
// Anki-format logic (sha1/csum/guid/col-JSON/DDL/row-building); this file just materializes those rows
// into a real `collection.anki2` SQLite file (sqlite3) and zips it to a `.apkg` Buffer (archiver).
//
// The user-facing export is the CLIENT builder (public/db/anki-apkg.js, sql.js+jszip) so card data never
// leaves the device. This server builder is for CLI / batch / curated decks. Both share the core, so they
// cannot drift — gates: smoke:anki-apkg (this) + smoke:anki-apkg-client (parity).

const fs = require("fs");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");
const archiver = require("archiver");
const core = require("../public/db/anki-apkg-core.js");

function run(db, sql, params) {
  return new Promise((resolve, reject) => db.run(sql, params || [], (err) => (err ? reject(err) : resolve())));
}
function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve())));
}

// Write a legacy collection.anki2 (schema ver 11) at `dbPath` from the prepared rows.
async function writeCollection(dbPath, prepared) {
  const db = new sqlite3.Database(dbPath);
  try {
    await exec(db, "PRAGMA journal_mode=DELETE; PRAGMA legacy_file_format=ON;");
    for (const ddl of core.SCHEMA_DDL) await exec(db, ddl);
    await run(db,
      `INSERT INTO col (id,crt,mod,scm,ver,dty,usn,ls,conf,models,decks,dconf,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      prepared.colValues);
    for (const n of prepared.notes) {
      await run(db,
        `INSERT INTO notes (id,guid,mid,mod,usn,tags,flds,sfld,csum,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [n.id, n.guid, n.mid, n.mod, n.usn, n.tags, n.flds, n.sfld, n.csum, n.flags, n.data]);
    }
    for (const c of prepared.cards) {
      await run(db,
        `INSERT INTO cards (id,nid,did,ord,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [c.id, c.nid, c.did, c.ord, c.mod, c.usn, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.left, c.odue, c.odid, c.flags, c.data]);
    }
  } finally {
    await new Promise((resolve) => db.close(() => resolve()));
  }
}

// buildApkg(spec, opts?) → Promise<Buffer>. spec = { deckName, modelName, fieldNames, templates, css,
// notes:[{guid?,fields:[],tags?}], media?:[{name,data:Buffer}] }. opts.now (ms) makes ids deterministic.
async function buildApkg(spec, opts) {
  const groups = (Array.isArray(spec && spec.groups) && spec.groups.length) ? spec.groups : (spec ? [spec] : []);
  if (!groups.length) throw new Error("ankiApkg: spec required");
  for (const g of groups) {
    if (!Array.isArray(g.fieldNames) || !g.fieldNames.length) throw new Error("ankiApkg: fieldNames required");
    if (!Array.isArray(g.templates) || !g.templates.length) throw new Error("ankiApkg: templates required");
  }
  const prepared = core.prepareCollection(spec, opts || {});
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-apkg-"));
  const dbPath = path.join(tmpDir, "collection.anki2");
  try {
    await writeCollection(dbPath, prepared);
    const media = prepared.media || [];
    return await new Promise((resolve, reject) => {
      const chunks = [];
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("data", (c) => chunks.push(c));
      archive.on("error", reject);
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.file(dbPath, { name: "collection.anki2" });
      archive.append(JSON.stringify(prepared.mediaMap), { name: "media" });
      media.forEach((m, i) => archive.append(m.data, { name: String(i) }));
      archive.finalize();
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  buildApkg,
  // re-exported from the shared core for the gate + reuse:
  stableGuid: core.stableGuid, fieldChecksum: core.fieldChecksum, stripHtmlMedia: core.stripHtmlMedia,
  templateReq: core.templateReq, sha1Hex: core.sha1Hex, prepareCollection: core.prepareCollection,
  LP_DECK_ID: core.LP_DECK_ID, LP_MODEL_ID: core.LP_MODEL_ID, FIELD_SEP: core.FIELD_SEP,
};
