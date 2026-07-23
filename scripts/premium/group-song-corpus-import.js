#!/usr/bin/env node
"use strict";

// GROUP_SONG_CORPUS_P0 — bounded, idempotent importer for an owner-supplied
// full library backup. Default is a read-only plan. --apply is required before
// filesystem or database mutation. Never logs song bodies or note contents.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const sqlite3 = require("sqlite3");

const DEFAULT_POSITIONS = [1, 13, 101];
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const asId = (v) => String(v == null ? "" : v);

function parseArgs(argv) {
  const out = { apply: false, positions: DEFAULT_POSITIONS.slice(), members: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--archive") out.archive = argv[++i];
    else if (a === "--archive-sha256") out.archiveSha256 = String(argv[++i] || "").toLowerCase();
    else if (a === "--db-path") out.dbPath = argv[++i];
    else if (a === "--data-dir") out.dataDir = argv[++i];
    else if (a === "--owner-user-id") out.ownerUserId = argv[++i];
    else if (a === "--member-user-id") out.members.push(argv[++i]);
    else if (a === "--group-id") out.groupId = argv[++i];
    else if (a === "--corpus-id") out.corpusId = argv[++i];
    else if (a === "--positions") out.positions = String(argv[++i] || "").split(",").map(Number).filter(Number.isInteger);
    else throw new Error("UNKNOWN_ARG:" + a);
  }
  return out;
}

function requireOptions(o) {
  for (const k of ["archive", "archiveSha256", "dbPath", "dataDir", "ownerUserId", "groupId", "corpusId"])
    if (!o[k]) throw new Error("MISSING_OPTION:" + k);
  if (!/^[0-9a-f]{64}$/.test(o.archiveSha256)) throw new Error("BAD_ARCHIVE_SHA256");
  if (!o.positions.length || new Set(o.positions).size !== o.positions.length) throw new Error("BAD_POSITIONS");
  for (const k of ["groupId", "corpusId"]) if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(String(o[k]))) throw new Error("BAD_ID:" + k);
}

function jsonEntry(zip, name) {
  const e = zip.getEntry(name);
  if (!e || e.isDirectory) throw new Error("ARCHIVE_ENTRY_MISSING:" + name);
  return JSON.parse(e.getData().toString("utf8"));
}

function parsePosition(title) {
  const m = String(title || "").match(/^Position\s+(\d+)\.\s*/i);
  return m ? Number(m[1]) : null;
}

function referencedAssetKeys(text, notes) {
  const keys = new Set();
  const add = (v) => { const s = String(v || "").trim().toLowerCase(); if (/^[0-9a-f]{64}$/.test(s)) keys.add(s); };
  add(text.text_audio_asset_key);
  for (const row of text.rows || []) add(row && row.audio_asset_key);
  for (const note of notes || []) add(note && note.audio_asset_key);
  return keys;
}

function scopedAdvanced(all, text) {
  const tid = asId(text.text_id);
  const occurrences = (all.occurrences || []).filter((x) => asId(x.text_id) === tid);
  const noteIds = new Set((all.notes || []).filter((x) => asId(x.text_id) === tid).map((x) => asId(x.id)));
  for (const x of occurrences) noteIds.add(asId(x.note_id));
  const notes = (all.notes || []).filter((x) => noteIds.has(asId(x.id))).map((x) => ({ ...x, srs_card_id: null }));
  const sentenceIds = new Set((text.rows || []).map((x) => asId(x && x.row_id)).filter(Boolean));
  return {
    schema_version: all.schema_version,
    exported_at: all.exported_at,
    app_id: all.app_id,
    format: all.format,
    notes,
    versions: (all.versions || []).filter((x) => noteIds.has(asId(x.note_id))),
    links: (all.links || []).filter((x) => noteIds.has(asId(x.from_note_id || x.note_id)) || noteIds.has(asId(x.to_note_id || x.linked_note_id))),
    roots: [],
    sentence_morph: (all.sentence_morph || []).filter((x) => asId(x.text_id) === tid || sentenceIds.has(asId(x.sentence_id))),
    occurrences: occurrences.filter((x) => noteIds.has(asId(x.note_id))),
    // Personal learner/export truth is intentionally not shared.
    srs_cards: [], srs_review_events: [], srs_attempts: [], srs_card_exports: [],
    anki_word_exports: [], events: [], translation_overrides: [], review_log: [], word_status: [], study_day: [],
  };
}

function safeText(text, corpusId, workId) {
  const sourceMeta = text.source_meta && typeof text.source_meta === "object" ? { ...text.source_meta } : {};
  sourceMeta.group_corpus = { schema: 1, corpus_id: corpusId, work_id: workId, visibility: "GROUP_RESTRICTED", audio_revision: 1 };
  return {
    ...text,
    source_meta: sourceMeta,
    progress: null,
    bookmarks: [],
    is_pinned: false,
    pin_order: null,
    manual_smart_tag: null,
  };
}

function buildPlan(zip, library, advanced, options) {
  const wanted = new Set(options.positions);
  const selected = (library.texts || []).filter((t) => wanted.has(parsePosition(t.title)));
  const found = new Set(selected.map((t) => parsePosition(t.title)));
  for (const p of wanted) if (!found.has(p)) throw new Error("POSITION_NOT_FOUND:" + p);
  if (selected.length !== wanted.size) throw new Error("POSITION_NOT_UNIQUE");
  const assetsByKey = new Map((library.audio_assets || []).map((a) => [String(a.asset_key || "").toLowerCase(), a]));
  const works = selected.sort((a, b) => parsePosition(a.title) - parsePosition(b.title)).map((text) => {
    const positionNo = parsePosition(text.title);
    const workId = "song-pos-" + String(positionNo).padStart(3, "0");
    const adv = scopedAdvanced(advanced, text);
    const keys = referencedAssetKeys(text, adv.notes);
    const assets = [];
    for (const key of keys) {
      const meta = assetsByKey.get(key);
      if (!meta) throw new Error("AUDIO_METADATA_MISSING:" + key);
      const entryName = String(meta.relative_export_path || "").replace(/\\/g, "/");
      const entry = zip.getEntry(entryName);
      if (!entry || entry.isDirectory) throw new Error("AUDIO_FILE_MISSING:" + key);
      const data = entry.getData();
      assets.push({ key, meta, entryName, bytes: data.length, sha256: sha256(data) });
    }
    const cleanText = safeText(text, options.corpusId, workId);
    const bundle = {
      group_corpus_schema_version: 1,
      corpus_id: options.corpusId,
      work_id: workId,
      audio_revision: 1,
      library: { schema_version: library.schema_version, corpus_meta_version: library.corpus_meta_version, shelves: [], texts: [cleanText], audio_assets: assets.map((a) => a.meta) },
      notes_advanced: adv,
    };
    const body = Buffer.from(JSON.stringify(bundle), "utf8");
    const rawTitle = String(text.title || "");
    const displayTitle = rawTitle.replace(/^Position\s+\d+\.\s*/i, "");
    const split = displayTitle.split(/\s+-\s+/, 2);
    const sourceUrl = /^https?:\/\//i.test(String(text.source_label || '').trim()) ? String(text.source_label).trim() : null;
    return { positionNo, workId, textKey: String(text.text_key), title: displayTitle, artist: split.length > 1 ? split[0] : null,
      level: text.level == null ? null : String(text.level), topic: text.topic == null ? null : String(text.topic),
      tagsJson: JSON.stringify(Array.isArray(text.tags) ? text.tags.filter(Boolean).map(String) : []),
      sourceUrl, sourceCreatedAt: text.created_at || null, sourceUpdatedAt: text.updated_at || null,
      rowsCount: (text.rows || []).length, notesCount: adv.notes.length, morphCount: adv.sentence_morph.length,
      bundle, body, bundleSha256: sha256(body), assets };
  });
  return { works, positions: options.positions.slice().sort((a, b) => a - b) };
}

function openDb(file) { return new Promise((resolve, reject) => { const db = new sqlite3.Database(file, (e) => e ? reject(e) : resolve(db)); }); }
function get(db, sql, p = []) { return new Promise((resolve, reject) => db.get(sql, p, (e, row) => e ? reject(e) : resolve(row))); }
function run(db, sql, p = []) { return new Promise((resolve, reject) => db.run(sql, p, function(e) { e ? reject(e) : resolve(this); })); }
function exec(db, sql) { return new Promise((resolve, reject) => db.exec(sql, (e) => e ? reject(e) : resolve())); }
function close(db) { return new Promise((resolve) => db.close(() => resolve())); }

function writeExact(file, body) {
  if (fs.existsSync(file)) {
    if (sha256(fs.readFileSync(file)) !== sha256(body)) throw new Error("TARGET_HASH_MISMATCH:" + path.basename(file));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, body, { flag: "wx" });
  fs.renameSync(tmp, file);
}

async function applyPlan(zip, plan, o) {
  const db = await openDb(path.resolve(o.dbPath));
  const root = path.resolve(o.dataDir, "group-corpora", o.corpusId, "v1");
  const now = new Date().toISOString();
  try {
    await exec(db, "PRAGMA foreign_keys=ON");
    if (!await get(db, "SELECT id FROM users WHERE id=?", [o.ownerUserId])) throw new Error("OWNER_USER_NOT_FOUND");
    for (const member of o.members) if (!await get(db, "SELECT id FROM users WHERE id=?", [member])) throw new Error("MEMBER_USER_NOT_FOUND:" + member);
    // Materialise verified files first. DB remains invisible until the transaction commits.
    for (const work of plan.works) {
      writeExact(path.join(root, "works", work.workId + ".json"), work.body);
      for (const a of work.assets) {
        const data = zip.getEntry(a.entryName).getData();
        if (sha256(data) !== a.sha256) throw new Error("AUDIO_HASH_MISMATCH:" + a.key);
        writeExact(path.join(root, "audio", a.key + ".mp3"), data);
      }
    }
    await exec(db, "BEGIN IMMEDIATE");
    await run(db, `INSERT INTO reading_groups(group_id,owner_user_id,name,status,created_at,updated_at) VALUES(?,?,?,'ACTIVE',?,?)
      ON CONFLICT(group_id) DO UPDATE SET owner_user_id=excluded.owner_user_id,name=excluded.name,status='ACTIVE',updated_at=excluded.updated_at`, [o.groupId, o.ownerUserId, "Учебная группа", now, now]);
    const members = [[o.ownerUserId, "OWNER"], ...o.members.filter((x) => x !== o.ownerUserId).map((x) => [x, "MEMBER"])];
    for (const [uid, role] of members) await run(db, `INSERT INTO reading_group_members(group_id,user_id,role,status,created_at,updated_at,revoked_at) VALUES(?,?,?,'ACTIVE',?,?,NULL)
      ON CONFLICT(group_id,user_id) DO UPDATE SET role=excluded.role,status='ACTIVE',updated_at=excluded.updated_at,revoked_at=NULL`, [o.groupId, uid, role, now, now]);
    await run(db, `INSERT INTO group_corpora(corpus_id,group_id,slug,title,visibility,version,status,rights_basis,created_at,updated_at)
      VALUES(?,?,?,'Учебные песни','GROUP_RESTRICTED',1,'PILOT','EDUCATIONAL_GROUP_RESTRICTED_REVIEW_REQUIRED',?,?)
      ON CONFLICT(corpus_id) DO UPDATE SET group_id=excluded.group_id,status='PILOT',updated_at=excluded.updated_at`, [o.corpusId, o.groupId, "study-songs", now, now]);
    for (const w of plan.works) {
      const bundleRel = path.posix.join("group-corpora", o.corpusId, "v1", "works", w.workId + ".json");
      await run(db, `INSERT INTO group_corpus_works(corpus_id,work_id,text_key,position_no,title,artist,source_url,rights_status,bundle_path,bundle_sha256,rows_count,audio_count,notes_count,morph_count,source_updated_at,created_at,updated_at,level,topic,tags_json,source_created_at)
        VALUES(?,?,?,?,?,?,?,'REVIEW_REQUIRED',?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(corpus_id,work_id) DO UPDATE SET text_key=excluded.text_key,title=excluded.title,artist=excluded.artist,source_url=excluded.source_url,bundle_path=excluded.bundle_path,bundle_sha256=excluded.bundle_sha256,rows_count=excluded.rows_count,audio_count=excluded.audio_count,notes_count=excluded.notes_count,morph_count=excluded.morph_count,source_updated_at=excluded.source_updated_at,level=excluded.level,topic=excluded.topic,tags_json=excluded.tags_json,source_created_at=excluded.source_created_at,updated_at=excluded.updated_at`,
        [o.corpusId,w.workId,w.textKey,w.positionNo,w.title,w.artist,w.sourceUrl,bundleRel,w.bundleSha256,w.rowsCount,w.assets.length,w.notesCount,w.morphCount,w.sourceUpdatedAt,now,now,w.level,w.topic,w.tagsJson,w.sourceCreatedAt]);
      for (const a of w.assets) {
        const rel = path.posix.join("group-corpora", o.corpusId, "v1", "audio", a.key + ".mp3");
        const bytes = fs.statSync(path.resolve(o.dataDir, rel)).size;
        await run(db, `INSERT INTO group_corpus_audio(corpus_id,work_id,asset_key,relative_path,bytes,sha256,mime,created_at)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(corpus_id,work_id,asset_key) DO UPDATE SET
          relative_path=excluded.relative_path,bytes=excluded.bytes,sha256=excluded.sha256,mime=excluded.mime`,
          [o.corpusId,w.workId,a.key,rel,bytes,a.sha256,"audio/mpeg",now]);
      }
    }
    await exec(db, "COMMIT");
  } catch (e) {
    try { await exec(db, "ROLLBACK"); } catch (_) {}
    throw e;
  } finally { await close(db); }
}

async function main(argv) {
  const o = parseArgs(argv); requireOptions(o);
  const archive = fs.readFileSync(path.resolve(o.archive));
  const actual = sha256(archive);
  if (actual !== o.archiveSha256) throw new Error("ARCHIVE_SHA256_MISMATCH");
  const zip = new AdmZip(archive);
  const manifest = jsonEntry(zip, "manifest.json");
  const library = jsonEntry(zip, manifest.library_json_path || "library/library.json");
  const advanced = jsonEntry(zip, manifest.notes_advanced_path || "library/notes_advanced.json");
  const plan = buildPlan(zip, library, advanced, o);
  if (o.apply) await applyPlan(zip, plan, o);
  const report = { ok: true, mode: o.apply ? "APPLIED" : "PLAN", archive_sha256: actual, corpus_id: o.corpusId,
    positions: plan.positions, works: plan.works.map((w) => ({ work_id:w.workId, position_no:w.positionNo, text_key:w.textKey, rows:w.rowsCount, audio:w.assets.length, notes:w.notesCount, morph:w.morphCount, bundle_sha256:w.bundleSha256 })) };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) main(process.argv.slice(2)).catch((e) => { process.stderr.write("group-song-corpus-import: " + e.message + "\n"); process.exitCode = 1; });
module.exports = { parseArgs, buildPlan, scopedAdvanced, safeText, main };
