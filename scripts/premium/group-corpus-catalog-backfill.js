#!/usr/bin/env node
"use strict";

// Rebuild the small searchable catalog projection from protected work bundles.
// PLAN is the default. No text body, row or note content is printed.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");

function parseArgs(argv) {
  const o = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--db-path") o.dbPath = argv[++i];
    else if (a === "--data-dir") o.dataDir = argv[++i];
    else if (a === "--corpus-id") o.corpusId = argv[++i];
    else throw new Error("UNKNOWN_ARG:" + a);
  }
  if (!o.dbPath || !o.dataDir || !o.corpusId) throw new Error("REQUIRED:--db-path,--data-dir,--corpus-id");
  return o;
}
const open = (file) => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, (e) => e ? reject(e) : resolve(db)); });
const all = (db, sql, p = []) => new Promise((resolve, reject) => db.all(sql, p, (e, rows) => e ? reject(e) : resolve(rows || [])));
const run = (db, sql, p = []) => new Promise((resolve, reject) => db.run(sql, p, (e) => e ? reject(e) : resolve()));
const close = (db) => new Promise((resolve) => db.close(resolve));
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

function project(bundle) {
  const text = bundle && bundle.library && Array.isArray(bundle.library.texts) && bundle.library.texts[0];
  if (!text || !text.text_key) throw new Error("BUNDLE_TEXT_INVALID");
  const sourceLabel = String(text.source_label || "").trim();
  return {
    textKey: String(text.text_key), level: text.level == null ? null : String(text.level),
    topic: text.topic == null ? null : String(text.topic),
    tagsJson: JSON.stringify(Array.isArray(text.tags) ? text.tags.filter(Boolean).map(String) : []),
    sourceUrl: /^https?:\/\//i.test(sourceLabel) ? sourceLabel : null,
    sourceCreatedAt: text.created_at || null, sourceUpdatedAt: text.updated_at || null,
  };
}

async function main(argv) {
  const o = parseArgs(argv); const db = await open(path.resolve(o.dbPath));
  try {
    const rows = await all(db, `SELECT work_id,text_key,bundle_path,bundle_sha256 FROM group_corpus_works WHERE corpus_id=? AND rights_status!='REMOVED' ORDER BY work_id`, [o.corpusId]);
    const planned = [];
    for (const row of rows) {
      const abs = path.resolve(o.dataDir, String(row.bundle_path || ""));
      const root = path.resolve(o.dataDir, "group-corpora") + path.sep;
      if (!abs.startsWith(root) || !fs.statSync(abs).isFile()) throw new Error("BUNDLE_PATH_INVALID:" + row.work_id);
      const body = fs.readFileSync(abs);
      if (sha256(body) !== row.bundle_sha256) throw new Error("BUNDLE_HASH_MISMATCH:" + row.work_id);
      const p = project(JSON.parse(body.toString("utf8")));
      if (p.textKey !== row.text_key) throw new Error("TEXT_KEY_MISMATCH:" + row.work_id);
      planned.push({ workId: row.work_id, ...p });
    }
    if (o.apply) {
      await run(db, "BEGIN IMMEDIATE");
      try {
        for (const p of planned) await run(db, `UPDATE group_corpus_works SET level=?,topic=?,tags_json=?,source_url=?,source_created_at=?,source_updated_at=?,updated_at=? WHERE corpus_id=? AND work_id=?`,
          [p.level,p.topic,p.tagsJson,p.sourceUrl,p.sourceCreatedAt,p.sourceUpdatedAt,new Date().toISOString(),o.corpusId,p.workId]);
        await run(db, "COMMIT");
      } catch (e) { await run(db, "ROLLBACK"); throw e; }
    }
    process.stdout.write(JSON.stringify({ ok:true, mode:o.apply ? "APPLIED" : "PLAN", corpus_id:o.corpusId, works:planned.length,
      with_level:planned.filter((p)=>p.level).length, with_topic:planned.filter((p)=>p.topic).length,
      with_tags:planned.filter((p)=>JSON.parse(p.tagsJson).length).length, with_source_url:planned.filter((p)=>p.sourceUrl).length }) + "\n");
  } finally { await close(db); }
}
if (require.main === module) main(process.argv.slice(2)).catch((e) => { process.stderr.write("group-corpus-catalog-backfill: " + e.message + "\n"); process.exitCode = 1; });
module.exports = { parseArgs, project, main };
