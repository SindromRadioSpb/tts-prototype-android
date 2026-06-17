/* ── anki-apkg.js — CLIENT-side Anki «.apkg» builder (sql.js + jszip) ──────────────────────────────────
 * ⑤ Anki-sync, brick A2 (design: docs/planning/ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md).
 *
 * Builds the `.apkg` entirely IN THE BROWSER from OPFS data, so the user's card content NEVER leaves the
 * device (same privacy posture as the library bundle export). Shares the format core
 * (public/db/anki-apkg-core.js) with the server builder (lib/ankiApkg.js) → the two cannot drift.
 *
 * Engine: sql.js (vendored at /db/sql-wasm.{js,wasm}, lazy-loaded only on export) materializes a legacy
 * collection.anki2; jszip (vendored) zips it to a `.apkg`. `buildApkgBytes(spec, deps)` takes an injected
 * { SQL, JSZip } so it runs headless in Node for the gate (smoke:anki-apkg-client); the browser convenience
 * wrappers lazy-load both. UMD: require()-able in Node, global `AnkiApkg` in the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./anki-apkg-core.js"));
  else root.AnkiApkg = factory(root.AnkiApkgCore);
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  // Build the .apkg bytes from a deck spec. deps = { SQL (initialized sql.js module), JSZip (constructor),
  // now? (ms, for deterministic ids), zipType? ('uint8array'|'blob'|'nodebuffer') }.
  async function buildApkgBytes(spec, deps) {
    if (!spec || !Array.isArray(spec.fieldNames) || !spec.fieldNames.length) throw new Error("AnkiApkg: fieldNames required");
    if (!Array.isArray(spec.templates) || !spec.templates.length) throw new Error("AnkiApkg: templates required");
    if (!deps || !deps.SQL || !deps.JSZip) throw new Error("AnkiApkg: deps.SQL and deps.JSZip required");
    const prepared = core.prepareCollection(spec, { now: deps.now });

    const db = new deps.SQL.Database();
    try {
      for (const ddl of core.SCHEMA_DDL) db.run(ddl);
      db.run("INSERT INTO col (id,crt,mod,scm,ver,dty,usn,ls,conf,models,decks,dconf,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", prepared.colValues);
      const nstmt = db.prepare("INSERT INTO notes (id,guid,mid,mod,usn,tags,flds,sfld,csum,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
      for (const n of prepared.notes) nstmt.run([n.id, n.guid, n.mid, n.mod, n.usn, n.tags, n.flds, n.sfld, n.csum, n.flags, n.data]);
      nstmt.free();
      const cstmt = db.prepare("INSERT INTO cards (id,nid,did,ord,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      for (const c of prepared.cards) cstmt.run([c.id, c.nid, c.did, c.ord, c.mod, c.usn, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.left, c.odue, c.odid, c.flags, c.data]);
      cstmt.free();
      const bytes = db.export(); // Uint8Array of the collection.anki2 file
      const zip = new deps.JSZip();
      zip.file("collection.anki2", bytes);
      zip.file("media", JSON.stringify(prepared.mediaMap));
      (prepared.media || []).forEach((m, i) => zip.file(String(i), m.data));
      return await zip.generateAsync({ type: deps.zipType || "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    } finally {
      try { db.close(); } catch (_) {}
    }
  }

  // ── browser lazy-loaders (no-op in Node) ──────────────────────────────────────────────────────────
  let _sqlPromise = null;
  function ensureSqlJs() {
    if (_sqlPromise) return _sqlPromise;
    _sqlPromise = (async () => {
      if (typeof self !== "undefined" && typeof self.initSqlJs !== "function") {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "/db/sql-wasm.js"; s.onload = resolve; s.onerror = () => reject(new Error("sql-wasm.js load failed"));
          document.head.appendChild(s);
        });
      }
      // initSqlJs is global after the script loads; point it at the vendored wasm.
      return await self.initSqlJs({ locateFile: () => "/db/sql-wasm.wasm" });
    })();
    return _sqlPromise;
  }
  async function ensureJSZip() {
    if (typeof self !== "undefined" && self.JSZip) return self.JSZip;
    // reuse the app's existing JSZip loader if present (public/db/jszip.min.js)
    if (typeof self !== "undefined" && typeof self.v3LoadJSZip === "function") { await self.v3LoadJSZip(); return self.JSZip; }
    throw new Error("JSZip unavailable");
  }

  // Browser convenience: build the .apkg as a Blob (lazy-loads sql.js + jszip).
  async function buildApkgBlob(spec) {
    const [SQL, JSZip] = await Promise.all([ensureSqlJs(), ensureJSZip()]);
    return buildApkgBytes(spec, { SQL, JSZip, zipType: "blob" });
  }

  // Browser convenience: build + trigger a download.
  async function downloadApkg(spec, filename) {
    const blob = await buildApkgBlob(spec);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename || "linguistpro-srs.apkg";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { bytes: blob.size, filename: a.download };
  }

  return { buildApkgBytes, buildApkgBlob, downloadApkg, ensureSqlJs, core };
});
