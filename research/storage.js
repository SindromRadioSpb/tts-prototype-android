// research/storage.js — file-system layout for /api/research/v1/* (Direction 11.4).
//
// Layout (per docs/RESEARCH_METRICS_SCHEMA.md §10):
//   <RESEARCH_DATA_DIR>/
//     <cohort_code>/
//       cohort_meta.json     — code, schema_version, k_anonymity_threshold,
//                              retention_until, outcome_scale,
//                              researcher_token_hash (sha256),
//                              consent_version_minimum
//       <YYYY-MM-DD>.jsonl   — one daily-upload payload per line
//       outcomes.csv         — teacher-uploaded exam scores (Phase 11.6)
//       deletions.log        — audit log of withdrawal events
//
// Privacy invariants enforced by this module:
//   - Server logs NEVER include payload bodies (only student_id/cohort/upload_ts/bytes).
//   - Idempotent dedupe by (student_id, since_ts, upload_ts) — silent dedup.
//   - DELETE rewrites jsonl files in place (read → filter → write atomically).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { RESEARCH_DATA_DIR, ensureDirSync } = require("../storage");

const SCHEMA_VERSION = "v1";

function cohortDir(cohortCode) {
  return path.join(RESEARCH_DATA_DIR, cohortCode);
}

function cohortMetaPath(cohortCode) {
  return path.join(cohortDir(cohortCode), "cohort_meta.json");
}

function jsonlPath(cohortCode, dateStr) {
  return path.join(cohortDir(cohortCode), `${dateStr}.jsonl`);
}

function deletionsLogPath(cohortCode) {
  return path.join(cohortDir(cohortCode), "deletions.log");
}

function cohortExists(cohortCode) {
  try {
    return fs.existsSync(cohortMetaPath(cohortCode));
  } catch {
    return false;
  }
}

function readCohortMeta(cohortCode) {
  const p = cohortMetaPath(cohortCode);
  if (!fs.existsSync(p)) {
    const err = new Error(`COHORT_NOT_FOUND: ${cohortCode}`);
    err.code = "COHORT_NOT_FOUND";
    throw err;
  }
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function createCohort({
  code,
  researcherTokenPlain,
  retentionUntil,
  outcomeScale,
  kAnonymityThreshold,
  consentVersionMinimum,
}) {
  if (cohortExists(code)) {
    const err = new Error(`COHORT_EXISTS: ${code}`);
    err.code = "COHORT_EXISTS";
    throw err;
  }
  ensureDirSync(cohortDir(code));
  const meta = {
    code,
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    k_anonymity_threshold: Number.isInteger(kAnonymityThreshold) ? kAnonymityThreshold : 5,
    retention_until: retentionUntil || null,
    outcome_scale: outcomeScale || "0-100",
    researcher_token_hash: crypto
      .createHash("sha256")
      .update(String(researcherTokenPlain))
      .digest("hex"),
    consent_version_minimum: consentVersionMinimum || "1.0",
  };
  fs.writeFileSync(cohortMetaPath(code), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

function verifyResearcherToken(cohortCode, tokenPlain) {
  const meta = readCohortMeta(cohortCode);
  const got = crypto.createHash("sha256").update(String(tokenPlain)).digest("hex");
  return got === meta.researcher_token_hash;
}

// Find existing upload line in <upload_ts>.jsonl matching dedupe key.
// Returns true if found (caller treats as idempotent no-op).
function uploadAlreadyRecorded(cohortCode, payload) {
  const p = jsonlPath(cohortCode, payload.upload_ts);
  if (!fs.existsSync(p)) return false;
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (
      row.student_id === payload.student_id &&
      row.since_ts === payload.since_ts &&
      row.upload_ts === payload.upload_ts
    ) {
      return true;
    }
  }
  return false;
}

// Append a validated payload to <upload_ts>.jsonl. Idempotent.
// Returns { stored: bool, dedupe: bool }.
function appendUpload(cohortCode, payload) {
  ensureDirSync(cohortDir(cohortCode));
  if (uploadAlreadyRecorded(cohortCode, payload)) {
    return { stored: false, dedupe: true };
  }
  const line = JSON.stringify(payload) + "\n";
  fs.appendFileSync(jsonlPath(cohortCode, payload.upload_ts), line, "utf8");
  return { stored: true, dedupe: false };
}

// Count uploads from a given student on a given date (rate-limit support).
function countUploadsForStudentOnDate(cohortCode, studentId, dateStr) {
  const p = jsonlPath(cohortCode, dateStr);
  if (!fs.existsSync(p)) return 0;
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  let n = 0;
  for (const line of lines) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.student_id === studentId) n += 1;
  }
  return n;
}

// Scan cohort dir, rewriting all .jsonl files without lines for studentId.
// Returns count of removed records. Appends to deletions.log.
function deleteStudentFromCohort(cohortCode, studentId) {
  const dir = cohortDir(cohortCode);
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  const entries = fs.readdirSync(dir);
  for (const fname of entries) {
    if (!fname.endsWith(".jsonl")) continue;
    const full = path.join(dir, fname);
    const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
    const kept = [];
    for (const line of lines) {
      if (!line) continue;
      let row;
      try { row = JSON.parse(line); } catch { kept.push(line); continue; }
      if (row.student_id === studentId) {
        removed += 1;
      } else {
        kept.push(line);
      }
    }
    // Atomic-ish rewrite: write tmp + rename.
    const tmp = full + ".tmp";
    fs.writeFileSync(tmp, kept.length ? kept.join("\n") + "\n" : "", "utf8");
    fs.renameSync(tmp, full);
  }
  if (removed > 0) {
    const audit = `${new Date().toISOString()} student_id=${studentId} reason=user_withdrawal records_removed=${removed}\n`;
    fs.appendFileSync(deletionsLogPath(cohortCode), audit, "utf8");
  }
  return removed;
}

// Try to find which cohort a student_id has uploaded to.
// Returns array of cohort codes (a student could be in multiple cohorts —
// rare, but the schema does not prevent it).
function findCohortsForStudent(studentId) {
  if (!fs.existsSync(RESEARCH_DATA_DIR)) return [];
  const cohorts = [];
  const entries = fs.readdirSync(RESEARCH_DATA_DIR);
  for (const fname of entries) {
    const cdir = path.join(RESEARCH_DATA_DIR, fname);
    let stat;
    try { stat = fs.statSync(cdir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    if (!fs.existsSync(path.join(cdir, "cohort_meta.json"))) continue;
    const jsonlFiles = fs.readdirSync(cdir).filter((f) => f.endsWith(".jsonl"));
    let hit = false;
    for (const jf of jsonlFiles) {
      const lines = fs.readFileSync(path.join(cdir, jf), "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        if (row.student_id === studentId) { hit = true; break; }
      }
      if (hit) break;
    }
    if (hit) cohorts.push(fname);
  }
  return cohorts;
}

// Aggregate all uploads in a cohort into per-student summaries.
// Returns { cohort_meta, cohort_size, k_anonymity_met, students: [{student_id, ...summary}], days_observed }.
// k_anonymity_met = (distinct student_id count >= cohort_meta.k_anonymity_threshold).
function aggregateCohort(cohortCode) {
  const meta = readCohortMeta(cohortCode);
  const dir = cohortDir(cohortCode);
  const perStudent = new Map();
  const days = new Set();
  if (fs.existsSync(dir)) {
    const jsonlFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    for (const jf of jsonlFiles) {
      const lines = fs.readFileSync(path.join(dir, jf), "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        days.add(row.upload_ts);
        const sid = row.student_id;
        if (!perStudent.has(sid)) {
          perStudent.set(sid, {
            student_id: sid,
            uploads_count: 0,
            first_upload_ts: row.upload_ts,
            last_upload_ts: row.upload_ts,
            totals: {
              active_minutes_real: 0,
              audio_play_ms_total: 0,
              sessions_count: 0,
              cards_reviewed: 0,
              cards_correct: 0,
              cards_again: 0,
              cards_added_to_srs: 0,
              notes_created: 0,
              notes_edited: 0,
              search_queries_count: 0,
              smart_tag_overrides_count: 0,
              texts_opened_distinct_max: 0,
              sentences_read_distinct_max: 0,
              translit_toggles_count: 0,
            },
          });
        }
        const acc = perStudent.get(sid);
        acc.uploads_count += 1;
        if (row.upload_ts < acc.first_upload_ts) acc.first_upload_ts = row.upload_ts;
        if (row.upload_ts > acc.last_upload_ts) acc.last_upload_ts = row.upload_ts;
        const m = row.metrics || {};
        const t = acc.totals;
        t.active_minutes_real += Number(m.active_minutes_real) || 0;
        t.audio_play_ms_total += Number(m.audio_play_ms_total) || 0;
        t.sessions_count += Number(m.sessions_count) || 0;
        t.cards_reviewed += Number(m.cards_reviewed) || 0;
        t.cards_correct += Number(m.cards_correct) || 0;
        t.cards_again += Number(m.cards_again) || 0;
        t.cards_added_to_srs += Number(m.cards_added_to_srs) || 0;
        t.notes_created += Number(m.notes_created) || 0;
        t.notes_edited += Number(m.notes_edited) || 0;
        t.search_queries_count += Number(m.search_queries_count) || 0;
        t.smart_tag_overrides_count += Number(m.smart_tag_overrides_count) || 0;
        t.translit_toggles_count += Number(m.translit_toggles_count) || 0;
        if (Number(m.texts_opened_distinct) > t.texts_opened_distinct_max)
          t.texts_opened_distinct_max = Number(m.texts_opened_distinct);
        if (Number(m.sentences_read_distinct) > t.sentences_read_distinct_max)
          t.sentences_read_distinct_max = Number(m.sentences_read_distinct);
      }
    }
  }
  const students = Array.from(perStudent.values());
  const cohortSize = students.length;
  const kThreshold = meta.k_anonymity_threshold || 5;
  return {
    cohort_meta: {
      code: meta.code,
      schema_version: meta.schema_version,
      created_at: meta.created_at,
      k_anonymity_threshold: kThreshold,
      retention_until: meta.retention_until,
      outcome_scale: meta.outcome_scale,
      consent_version_minimum: meta.consent_version_minimum,
    },
    cohort_size: cohortSize,
    k_anonymity_met: cohortSize >= kThreshold,
    days_observed: days.size,
    students: cohortSize >= kThreshold ? students : [],
  };
}

module.exports = {
  SCHEMA_VERSION,
  cohortDir,
  cohortMetaPath,
  cohortExists,
  readCohortMeta,
  createCohort,
  verifyResearcherToken,
  appendUpload,
  uploadAlreadyRecorded,
  countUploadsForStudentOnDate,
  deleteStudentFromCohort,
  findCohortsForStudent,
  aggregateCohort,
};
