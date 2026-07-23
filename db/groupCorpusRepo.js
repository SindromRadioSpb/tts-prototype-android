"use strict";

// GROUP_SONG_CORPUS_P0 — authenticated metadata/file resolver for restricted
// group corpora. This module never reads learner state and never exposes a
// corpus merely because its id is known: ACTIVE membership is part of every
// query. Bundles/audio are outside public/ and resolve only below the bounded
// DATA_DIR/group-corpora root.

const path = require("path");
const { getDb } = require("./sqlite");
const { DATA_DIR } = require("../storage");

const all = (db, sql, p = []) => new Promise((resolve, reject) => db.all(sql, p, (e, rows) => e ? reject(e) : resolve(rows || [])));
const get = (db, sql, p = []) => new Promise((resolve, reject) => db.get(sql, p, (e, row) => e ? reject(e) : resolve(row || null)));
const run = (db, sql, p = []) => new Promise((resolve, reject) => db.run(sql, p, (e) => e ? reject(e) : resolve()));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, (e) => e ? reject(e) : resolve()));

function fail(code) { const e = new Error(code); e.code = code; throw e; }
function db() { const out = getDb(); if (!out) fail("DB_NOT_AVAILABLE"); return out; }
function cleanId(value, max = 128) {
  const v = String(value || "").trim();
  if (!v || v.length > max || !/^[A-Za-z0-9_.:-]+$/.test(v)) fail("GROUP_CORPUS_NOT_FOUND");
  return v;
}

function privatePath(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/");
  if (!rel || rel.startsWith("/") || rel.includes("../") || rel.includes("\0")) fail("GROUP_CORPUS_FILE_INVALID");
  const root = path.resolve(DATA_DIR, "group-corpora");
  const abs = path.resolve(DATA_DIR, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) fail("GROUP_CORPUS_FILE_INVALID");
  return abs;
}

async function listCorpora(userId) {
  const rows = await all(db(),
    `SELECT c.corpus_id, c.slug, c.title, c.version, c.status, c.visibility,
            c.rights_basis, m.role,
            (SELECT COUNT(*) FROM group_corpus_works w
              WHERE w.corpus_id=c.corpus_id AND w.rights_status!='REMOVED') AS works_count
       FROM reading_group_members m
       JOIN reading_groups g ON g.group_id=m.group_id AND g.status='ACTIVE'
       JOIN group_corpora c ON c.group_id=g.group_id
      WHERE m.user_id=? AND m.status='ACTIVE' AND c.status IN ('PILOT','ACTIVE')
      ORDER BY c.title, c.corpus_id`, [String(userId)]);
  return rows.map((r) => ({ ...r, version: Number(r.version), works_count: Number(r.works_count) || 0 }));
}

async function accessibleCorpus(userId, corpusId) {
  const cid = cleanId(corpusId);
  const row = await get(db(),
    `SELECT c.corpus_id, c.slug, c.title, c.version, c.status, c.visibility,
            c.rights_basis, m.role
       FROM group_corpora c
       JOIN reading_groups g ON g.group_id=c.group_id AND g.status='ACTIVE'
       JOIN reading_group_members m ON m.group_id=g.group_id
      WHERE c.corpus_id=? AND m.user_id=? AND m.status='ACTIVE'
        AND c.status IN ('PILOT','ACTIVE')`, [cid, String(userId)]);
  if (!row) fail("GROUP_CORPUS_NOT_FOUND");
  return { ...row, version: Number(row.version) };
}

async function ownerCorpus(userId, corpusId) {
  const corpus = await accessibleCorpus(userId, corpusId);
  if (corpus.role !== "OWNER") fail("GROUP_CORPUS_NOT_FOUND");
  return corpus;
}

async function listWorks(userId, corpusId) {
  const corpus = await accessibleCorpus(userId, corpusId);
  const rows = await all(db(),
    `SELECT work_id, text_key, position_no, title, artist, source_url,
            rights_status, rows_count, audio_count, notes_count, morph_count,
            bundle_sha256, audio_revision, audio_profile_json, audio_published_at, source_updated_at,
            level, topic, tags_json, source_created_at
       FROM group_corpus_works
      WHERE corpus_id=? AND rights_status!='REMOVED'
      ORDER BY CASE WHEN position_no IS NULL THEN 1 ELSE 0 END, position_no, title`, [corpus.corpus_id]);
  return { corpus, works: rows.map((r) => ({ ...r,
    position_no: r.position_no == null ? null : Number(r.position_no),
    rows_count: Number(r.rows_count) || 0, audio_count: Number(r.audio_count) || 0,
    notes_count: Number(r.notes_count) || 0, morph_count: Number(r.morph_count) || 0,
    audio_revision: Number(r.audio_revision) || 1,
    tags: (() => { try { const v = JSON.parse(r.tags_json || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch (_) { return []; } })(),
  })) };
}

async function getWork(userId, corpusId, workId) {
  const corpus = await accessibleCorpus(userId, corpusId);
  const wid = cleanId(workId);
  const row = await get(db(),
    `SELECT work_id, text_key, position_no, title, artist, source_url, rights_status,
            bundle_path, bundle_sha256, audio_revision, audio_profile_json, audio_published_at,
            rows_count, audio_count, notes_count, morph_count
       FROM group_corpus_works
      WHERE corpus_id=? AND work_id=? AND rights_status!='REMOVED'`, [corpus.corpus_id, wid]);
  if (!row) fail("GROUP_CORPUS_WORK_NOT_FOUND");
  return { corpus, work: row, absolute_path: privatePath(row.bundle_path) };
}

async function getAudio(userId, corpusId, assetKey) {
  const corpus = await accessibleCorpus(userId, corpusId);
  const key = String(assetKey || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) fail("GROUP_CORPUS_AUDIO_NOT_FOUND");
  const row = await get(db(),
    `SELECT a.work_id, a.asset_key, a.relative_path, a.bytes, a.sha256, a.mime,
            a.revision, a.timing_relative_path, a.timing_bytes, a.timing_sha256
       FROM group_corpus_audio a
       JOIN group_corpus_works w ON w.corpus_id=a.corpus_id AND w.work_id=a.work_id
      WHERE a.corpus_id=? AND a.asset_key=? AND w.rights_status!='REMOVED'
      LIMIT 1`, [corpus.corpus_id, key]);
  if (!row) fail("GROUP_CORPUS_AUDIO_NOT_FOUND");
  return { corpus, audio: { ...row, bytes: Number(row.bytes) || 0, revision: Number(row.revision) || 1 }, absolute_path: privatePath(row.relative_path) };
}

async function getAudioTiming(userId, corpusId, assetKey) {
  const out = await getAudio(userId, corpusId, assetKey);
  if (!out.audio.timing_relative_path || !out.audio.timing_sha256) fail("GROUP_CORPUS_TIMING_NOT_FOUND");
  return { corpus: out.corpus, audio: out.audio, absolute_path: privatePath(out.audio.timing_relative_path) };
}

async function updateCatalogMetadata(userId, corpusId, input) {
  const corpus = await ownerCorpus(userId, corpusId);
  const works = input && Array.isArray(input.works) ? input.works : null;
  if (!works || works.length > 500) fail("GROUP_CORPUS_IMPORT_INVALID");
  const existing = await all(db(), "SELECT work_id FROM group_corpus_works WHERE corpus_id=? AND rights_status!='REMOVED'", [corpus.corpus_id]);
  const known = new Set(existing.map((r) => String(r.work_id)));
  if (works.length !== known.size) fail("GROUP_CORPUS_IMPORT_INVALID");
  const clean = works.map((w) => {
    const workId = cleanId(w && w.work_id); if (!known.has(workId)) fail("GROUP_CORPUS_IMPORT_INVALID");
    const title = String(w.title || "").trim(); if (!title || Buffer.byteLength(title) > 500) fail("GROUP_CORPUS_IMPORT_INVALID");
    const artist = w.artist == null ? null : String(w.artist).trim().slice(0, 300);
    const level = w.level == null ? null : String(w.level).trim().slice(0, 40);
    const topic = w.topic == null ? null : String(w.topic).trim().slice(0, 200);
    const sourceUrl = w.source_url == null ? null : String(w.source_url).trim();
    if (sourceUrl && (!/^https:\/\//i.test(sourceUrl) || sourceUrl.length > 1000)) fail("GROUP_CORPUS_IMPORT_INVALID");
    const tags = Array.isArray(w.tags) ? w.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [];
    if (tags.some((t) => t.length > 80)) fail("GROUP_CORPUS_IMPORT_INVALID");
    return { workId, title, artist, level, topic, sourceUrl, tagsJson: JSON.stringify(tags) };
  });
  if (new Set(clean.map((w) => w.workId)).size !== known.size) fail("GROUP_CORPUS_IMPORT_INVALID");
  const now = new Date().toISOString(); await exec(db(), "BEGIN IMMEDIATE");
  try {
    for (const w of clean) await run(db(), `UPDATE group_corpus_works SET title=?,artist=?,level=?,topic=?,source_url=?,tags_json=?,updated_at=? WHERE corpus_id=? AND work_id=?`,
      [w.title,w.artist,w.level,w.topic,w.sourceUrl,w.tagsJson,now,corpus.corpus_id,w.workId]);
    await exec(db(), "COMMIT");
  } catch (e) { try { await exec(db(), "ROLLBACK"); } catch (_) {} throw e; }
  return { corpus_id: corpus.corpus_id, updated: clean.length };
}

async function listBackupFiles(userId, corpusId) {
  const corpus = await ownerCorpus(userId, corpusId);
  const works = await all(db(), `SELECT work_id,bundle_path,bundle_sha256 FROM group_corpus_works WHERE corpus_id=? AND rights_status!='REMOVED' ORDER BY work_id`, [corpus.corpus_id]);
  const audio = await all(db(), `SELECT work_id,asset_key,revision,relative_path,bytes,sha256,timing_relative_path,timing_bytes,timing_sha256 FROM group_corpus_audio WHERE corpus_id=? ORDER BY work_id,revision,asset_key`, [corpus.corpus_id]);
  const files = [];
  for (const w of works) files.push({ kind:"work", archive_path:"works/"+w.work_id+".json", storage_path:w.bundle_path, sha256:w.bundle_sha256, bytes:null });
  for (const a of audio) {
    files.push({ kind:"audio", archive_path:"audio/r"+(Number(a.revision)||1)+"/"+a.work_id+"/"+a.asset_key+".mp3", storage_path:a.relative_path, sha256:a.sha256, bytes:Number(a.bytes)||0 });
    if (a.timing_relative_path && a.timing_sha256) files.push({ kind:"timing", archive_path:"timing/r"+(Number(a.revision)||1)+"/"+a.work_id+"/"+a.asset_key+".json", storage_path:a.timing_relative_path, sha256:a.timing_sha256, bytes:Number(a.timing_bytes)||0 });
  }
  return { corpus, files };
}

module.exports = { listCorpora, accessibleCorpus, ownerCorpus, listWorks, getWork, getAudio, getAudioTiming, updateCatalogMetadata, listBackupFiles, privatePath };
