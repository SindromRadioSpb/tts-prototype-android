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

async function listWorks(userId, corpusId) {
  const corpus = await accessibleCorpus(userId, corpusId);
  const rows = await all(db(),
    `SELECT work_id, text_key, position_no, title, artist, source_url,
            rights_status, rows_count, audio_count, notes_count, morph_count,
            bundle_sha256, source_updated_at
       FROM group_corpus_works
      WHERE corpus_id=? AND rights_status!='REMOVED'
      ORDER BY CASE WHEN position_no IS NULL THEN 1 ELSE 0 END, position_no, title`, [corpus.corpus_id]);
  return { corpus, works: rows.map((r) => ({ ...r,
    position_no: r.position_no == null ? null : Number(r.position_no),
    rows_count: Number(r.rows_count) || 0, audio_count: Number(r.audio_count) || 0,
    notes_count: Number(r.notes_count) || 0, morph_count: Number(r.morph_count) || 0,
  })) };
}

async function getWork(userId, corpusId, workId) {
  const corpus = await accessibleCorpus(userId, corpusId);
  const wid = cleanId(workId);
  const row = await get(db(),
    `SELECT work_id, text_key, position_no, title, artist, source_url, rights_status,
            bundle_path, bundle_sha256, rows_count, audio_count, notes_count, morph_count
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
    `SELECT a.work_id, a.asset_key, a.relative_path, a.bytes, a.sha256, a.mime
       FROM group_corpus_audio a
       JOIN group_corpus_works w ON w.corpus_id=a.corpus_id AND w.work_id=a.work_id
      WHERE a.corpus_id=? AND a.asset_key=? AND w.rights_status!='REMOVED'
      LIMIT 1`, [corpus.corpus_id, key]);
  if (!row) fail("GROUP_CORPUS_AUDIO_NOT_FOUND");
  return { corpus, audio: { ...row, bytes: Number(row.bytes) || 0 }, absolute_path: privatePath(row.relative_path) };
}

module.exports = { listCorpora, accessibleCorpus, listWorks, getWork, getAudio, privatePath };
