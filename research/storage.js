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
// ALSO removes the student from outcomes.csv if present — withdrawal must
// purge ALL server-side data, including outcome scores, per the consent
// promise («Запросить удаление всех ваших ранее загруженных данных»).
// Returns count of removed records (jsonl lines + outcome rows). Audit-
// logs to deletions.log.
function deleteStudentFromCohort(cohortCode, studentId) {
  const dir = cohortDir(cohortCode);
  if (!fs.existsSync(dir)) return 0;
  let removedJsonl = 0;
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
        removedJsonl += 1;
      } else {
        kept.push(line);
      }
    }
    const tmp = full + ".tmp";
    fs.writeFileSync(tmp, kept.length ? kept.join("\n") + "\n" : "", "utf8");
    fs.renameSync(tmp, full);
  }

  // Strip from outcomes.csv (Phase 11.6 path). Rewritten only if at least
  // one row matched — otherwise the file is left untouched.
  let removedOutcomes = 0;
  const outcomesPath = path.join(dir, "outcomes.csv");
  if (fs.existsSync(outcomesPath)) {
    let existing = [];
    try { existing = readOutcomesCsv(cohortCode); } catch (_) { /* malformed → leave untouched */ }
    const kept = existing.filter((r) => r.student_id !== studentId);
    removedOutcomes = existing.length - kept.length;
    if (removedOutcomes > 0) {
      const lines = ["student_id,pre_test_score,post_test_score,exam_date,uploaded_by"];
      for (const r of kept) {
        lines.push([
          r.student_id,
          r.pre_test_score  != null ? r.pre_test_score  : "",
          r.post_test_score != null ? r.post_test_score : "",
          r.exam_date || "",
          r.uploaded_by || "",
        ].join(","));
      }
      const tmp = outcomesPath + ".tmp";
      fs.writeFileSync(tmp, lines.join("\n") + "\n", "utf8");
      fs.renameSync(tmp, outcomesPath);
    }
  }

  const totalRemoved = removedJsonl + removedOutcomes;
  if (totalRemoved > 0) {
    const audit = `${new Date().toISOString()} student_id=${studentId} reason=user_withdrawal records_removed=${removedJsonl} outcomes_removed=${removedOutcomes}\n`;
    fs.appendFileSync(deletionsLogPath(cohortCode), audit, "utf8");
  }
  return totalRemoved;
}

// Try to find which cohort a student_id has uploaded to. Scans both
// .jsonl payloads AND outcomes.csv so a student that exists ONLY in
// outcomes (e.g. teacher pre-uploaded scores before student joined, or
// after a partial-purge edge case) is still findable for DELETE.
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
    let hit = false;
    const jsonlFiles = fs.readdirSync(cdir).filter((f) => f.endsWith(".jsonl"));
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
    // outcomes.csv fallback — student might exist only there.
    if (!hit) {
      try {
        const outcomes = readOutcomesCsv(fname);
        if (outcomes.some((r) => r.student_id === studentId)) hit = true;
      } catch (_) {}
    }
    if (hit) cohorts.push(fname);
  }
  return cohorts;
}

// Aggregate all uploads in a cohort into per-student summaries + per-day
// time series. Returns:
//   {
//     cohort_meta,
//     cohort_size,
//     k_anonymity_met,
//     days_observed,
//     daily_aggregates,        // cohort-wide totals per day (no per-student
//                              // breakdown — always returned)
//     students,                // per-student totals + outcomes joined
//                              // (hidden when cohort < k)
//     per_student_daily,       // per-student per-day metrics
//                              // (hidden when cohort < k)
//   }
// k_anonymity_met = (distinct student_id count >= cohort_meta.k_anonymity_threshold).
function aggregateCohort(cohortCode) {
  const meta = readCohortMeta(cohortCode);
  const dir = cohortDir(cohortCode);
  const perStudent = new Map();
  const perStudentDaily = new Map();   // sid -> Map<date, daily-totals>
  const cohortDaily = new Map();       // date -> cohort-wide daily-totals
  const days = new Set();
  // Self-report outcomes harvested from payload.metrics.outcome — latest
  // upload_ts wins per student. CSV file overrides these (teacher-authoritative).
  const selfReports = new Map(); // sid -> { upload_ts, outcome }

  function blankTotals() {
    return {
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
    };
  }
  function blankDaily(date) {
    return {
      date,
      active_minutes_real: 0,
      audio_play_ms_total: 0,
      sessions_count: 0,
      cards_reviewed: 0,
      notes_created: 0,
      students_active: 0,
    };
  }
  function addInto(target, m) {
    target.active_minutes_real += Number(m.active_minutes_real) || 0;
    target.audio_play_ms_total += Number(m.audio_play_ms_total) || 0;
    target.sessions_count += Number(m.sessions_count) || 0;
    target.cards_reviewed += Number(m.cards_reviewed) || 0;
    if ("cards_correct" in target) target.cards_correct += Number(m.cards_correct) || 0;
    if ("cards_again" in target) target.cards_again += Number(m.cards_again) || 0;
    if ("cards_added_to_srs" in target) target.cards_added_to_srs += Number(m.cards_added_to_srs) || 0;
    target.notes_created += Number(m.notes_created) || 0;
    if ("notes_edited" in target) target.notes_edited += Number(m.notes_edited) || 0;
    if ("search_queries_count" in target) target.search_queries_count += Number(m.search_queries_count) || 0;
    if ("smart_tag_overrides_count" in target) target.smart_tag_overrides_count += Number(m.smart_tag_overrides_count) || 0;
    if ("translit_toggles_count" in target) target.translit_toggles_count += Number(m.translit_toggles_count) || 0;
  }

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
        const dateKey = row.upload_ts;
        const m = row.metrics || {};

        // Per-student totals.
        if (!perStudent.has(sid)) {
          perStudent.set(sid, {
            student_id: sid,
            uploads_count: 0,
            first_upload_ts: row.upload_ts,
            last_upload_ts: row.upload_ts,
            totals: blankTotals(),
          });
        }
        const acc = perStudent.get(sid);
        acc.uploads_count += 1;
        if (row.upload_ts < acc.first_upload_ts) acc.first_upload_ts = row.upload_ts;
        if (row.upload_ts > acc.last_upload_ts) acc.last_upload_ts = row.upload_ts;
        addInto(acc.totals, m);
        if (Number(m.texts_opened_distinct) > acc.totals.texts_opened_distinct_max)
          acc.totals.texts_opened_distinct_max = Number(m.texts_opened_distinct);
        if (Number(m.sentences_read_distinct) > acc.totals.sentences_read_distinct_max)
          acc.totals.sentences_read_distinct_max = Number(m.sentences_read_distinct);

        // Per-student daily (one row per upload day; uploads typically
        // cover [since_ts, upload_ts] — we attribute to upload_ts).
        if (!perStudentDaily.has(sid)) perStudentDaily.set(sid, new Map());
        const studDays = perStudentDaily.get(sid);
        if (!studDays.has(dateKey)) studDays.set(dateKey, blankDaily(dateKey));
        addInto(studDays.get(dateKey), m);

        // Cohort-wide daily (sum across students).
        if (!cohortDaily.has(dateKey)) cohortDaily.set(dateKey, blankDaily(dateKey));
        addInto(cohortDaily.get(dateKey), m);

        // Self-report outcome harvest (Phase 11.6 §11.6.1)
        // — extended to catch calibrated-quiz uploads (v3.3.5 §9).
        if (m.outcome && (
              m.outcome.post_test_score != null ||
              m.outcome.confidence_self_report != null ||
              m.outcome.quiz_score_normalized != null
            )) {
          const existing = selfReports.get(sid);
          if (!existing || row.upload_ts >= existing.upload_ts) {
            selfReports.set(sid, { upload_ts: row.upload_ts, outcome: m.outcome });
          }
        }
      }
    }
  }

  // Count students_active per day.
  for (const [date, total] of cohortDaily) {
    let active = 0;
    for (const [, studDays] of perStudentDaily) if (studDays.has(date)) active++;
    total.students_active = active;
  }

  // Outcome merge: self-report (from payload.metrics.outcome) first, then
  // outcomes.csv overrides (teacher-authoritative).
  for (const [sid, sr] of selfReports) {
    const acc = perStudent.get(sid);
    if (acc) {
      const isQuiz = sr.outcome.outcome_capture_method === "calibrated-quiz" ||
                     sr.outcome.quiz_score_normalized != null;
      acc.outcome = {
        pre_test_score:  sr.outcome.pre_test_score != null ? Number(sr.outcome.pre_test_score) : null,
        post_test_score: sr.outcome.post_test_score != null ? Number(sr.outcome.post_test_score) : null,
        confidence_self_report: sr.outcome.confidence_self_report != null ? Number(sr.outcome.confidence_self_report) : null,
        // v3.3.5 calibrated-quiz fields — passed through unchanged
        // so teacher dashboard can render quiz score + CEFR + SE.
        quiz_score_normalized: sr.outcome.quiz_score_normalized != null ? Number(sr.outcome.quiz_score_normalized) : null,
        quiz_cefr_band: sr.outcome.quiz_cefr_band || null,
        quiz_se: sr.outcome.quiz_se != null ? Number(sr.outcome.quiz_se) : null,
        quiz_completed_at: sr.outcome.quiz_completed_at || null,
        quiz_version: sr.outcome.quiz_version || null,
        exam_date: sr.upload_ts,
        uploaded_by: isQuiz ? "calibrated-quiz" : "self-report",
      };
    }
  }
  let outcomes = [];
  try { outcomes = readOutcomesCsv(cohortCode); } catch (e) {
    // Malformed CSV at rest is a deployment problem — log and continue
    // with self-report-only outcomes rather than failing the whole GET.
    console.warn("[research] readOutcomesCsv failed for", cohortCode, e.message);
  }
  for (const row of outcomes) {
    const acc = perStudent.get(row.student_id);
    if (acc) {
      // Teacher CSV is authoritative for post_test_score / pre_test_score
      // (the "score" hierarchy per consent rule). Quiz fields measure a
      // different thing (instrument-derived diagnostic), so we MERGE
      // rather than REPLACE to preserve quiz_score_normalized / quiz_se
      // / quiz_cefr_band when both sources exist.
      const prior = acc.outcome || {};
      acc.outcome = {
        ...prior,
        pre_test_score:  row.pre_test_score,
        post_test_score: row.post_test_score,
        exam_date:       row.exam_date,
        uploaded_by:     row.uploaded_by,
      };
    }
  }

  const students = Array.from(perStudent.values());
  const cohortSize = students.length;
  const kThreshold = meta.k_anonymity_threshold || 5;
  const kMet = cohortSize >= kThreshold;

  // daily_aggregates is always returned (cohort-wide totals; no individual
  // student data exposed). Sort by date ascending for chart rendering.
  const dailyAggregates = Array.from(cohortDaily.values())
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // per_student_daily is hidden when cohort < k.
  const perStudentDailyOut = kMet
    ? Array.from(perStudentDaily.entries()).map(([sid, mp]) => ({
        student_id: sid,
        days: Array.from(mp.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
      }))
    : [];

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
    k_anonymity_met: kMet,
    days_observed: days.size,
    daily_aggregates: dailyAggregates,
    students: kMet ? students : [],
    per_student_daily: perStudentDailyOut,
  };
}

// Read outcomes.csv if present in cohort dir. Returns array of
// { student_id, pre_test_score, post_test_score, exam_date, uploaded_by }.
// Header row is REQUIRED. Numeric fields parsed; empty cells = null.
function readOutcomesCsv(cohortCode) {
  const p = path.join(cohortDir(cohortCode), "outcomes.csv");
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, "utf8");
  return parseOutcomesCsvText(text);
}

// Parse outcomes CSV text → array of { student_id, pre_test_score,
// post_test_score, exam_date, uploaded_by }. Throws CsvParseError with
// .lineNumber on header issues. Skips fully blank lines silently.
class CsvParseError extends Error {
  constructor(message, lineNumber) {
    super(message);
    this.code = "BAD_CSV";
    this.lineNumber = lineNumber;
  }
}
function parseOutcomesCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) {
    throw new CsvParseError("CSV is empty", 0);
  }
  const header = lines[0].split(",").map((s) => s.trim());
  const idxOf = (name) => header.indexOf(name);
  const iSid = idxOf("student_id");
  const iPre = idxOf("pre_test_score");
  const iPost = idxOf("post_test_score");
  const iDate = idxOf("exam_date");
  const iBy = idxOf("uploaded_by");
  if (iSid < 0) {
    throw new CsvParseError("CSV header must include 'student_id'", 1);
  }
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((s) => s.trim());
    const sid = cells[iSid];
    if (!sid) continue;
    const num = (j) => {
      if (j < 0) return null;
      const v = cells[j];
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    out.push({
      student_id: sid,
      pre_test_score: num(iPre),
      post_test_score: num(iPost),
      exam_date: iDate >= 0 ? (cells[iDate] || null) : null,
      uploaded_by: iBy >= 0 ? (cells[iBy] || null) : null,
    });
  }
  return out;
}

// Persist a list of outcome rows to <cohort>/outcomes.csv. Merges with
// existing rows by student_id (incoming wins on conflict). Returns
// { inserted, updated, total }. Audit-log line appended to deletions.log.
function writeOutcomesCsv(cohortCode, incomingRows) {
  if (!cohortExists(cohortCode)) {
    const err = new Error(`COHORT_NOT_FOUND: ${cohortCode}`);
    err.code = "COHORT_NOT_FOUND";
    throw err;
  }
  ensureDirSync(cohortDir(cohortCode));
  const existing = readOutcomesCsv(cohortCode);
  const byId = new Map(existing.map((r) => [r.student_id, r]));
  let inserted = 0, updated = 0;
  for (const row of incomingRows) {
    if (!row || !row.student_id) continue;
    if (byId.has(row.student_id)) updated++;
    else inserted++;
    byId.set(row.student_id, {
      student_id: row.student_id,
      pre_test_score:  row.pre_test_score  != null ? Number(row.pre_test_score)  : null,
      post_test_score: row.post_test_score != null ? Number(row.post_test_score) : null,
      exam_date: row.exam_date || null,
      uploaded_by: row.uploaded_by || null,
    });
  }
  const merged = Array.from(byId.values());
  const lines = ["student_id,pre_test_score,post_test_score,exam_date,uploaded_by"];
  for (const r of merged) {
    lines.push([
      r.student_id,
      r.pre_test_score  != null ? r.pre_test_score  : "",
      r.post_test_score != null ? r.post_test_score : "",
      r.exam_date || "",
      r.uploaded_by || "",
    ].join(","));
  }
  fs.writeFileSync(path.join(cohortDir(cohortCode), "outcomes.csv"), lines.join("\n") + "\n", "utf8");
  // Audit (so the cohort log captures who-touched-what without exposing
  // the actual scores in plaintext to the regular event stream).
  const audit = `${new Date().toISOString()} outcomes_upload inserted=${inserted} updated=${updated} total=${merged.length}\n`;
  fs.appendFileSync(deletionsLogPath(cohortCode), audit, "utf8");
  return { inserted, updated, total: merged.length };
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
  readOutcomesCsv,
  parseOutcomesCsvText,
  writeOutcomesCsv,
  CsvParseError,
};
