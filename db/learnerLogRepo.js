"use strict";

// CLG-P2 Cloud Event Log repo (AI_MENTOR_RECON_2026_07_04.md §6/§9 CLG-P2).
// Validation + storage of the two append-only streams. Invariants owned here:
//   • user_id comes from the AUTHENTICATED caller (server.js passes auth.user.id) — a row/batch
//     carrying a different user_id is rejected wholesale BEFORE any write (критика B2);
//   • uniqueness is user-scoped: PK(user_id, id) + INSERT OR IGNORE (критика B1);
//   • meta_json allowlist (§5 B5): identifiers/scheduler facts pass, known CONTENT keys are
//     STRIPPED (client must strip at CLG-P3; server enforces), unknown keys REJECT the row;
//   • canonical time (§6 B10): reviewed_at/created_at_client must be UTC-Z toISOString form;
//     offset forms reject. Future timestamps clamp to now + meta.ts_clamped_server (sanity-bound
//     carve-out; ingested_at stays audit-only);
//   • review-facts live ONLY in review_log: learner_events types review_answered /
//     dictation_answered are rejected with their own reason (критика B7);
//   • batches are transactional; batch idempotency via ingest_batches (replay returns the
//     stored result verbatim).

const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}

const SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_KEYER_VERSION = 1;          // lemma-canon.js KEYER_VERSION; bump = key_alias design (§6)
const MAX_BATCH_ROWS = 5000;
const MAX_META_BYTES = 4096;
const MAX_PAYLOAD_BYTES = 2048;
const FUTURE_SLACK_MS = 5 * 60_000;

// Canonical UTC-Z (toISOString family). Offset forms (+03:00) break lexicographic replay
// ordering (критика B10) → reject, never normalize silently.
const CANON_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// 'mark' (CLG-P3.2, §4.7): ручная ось как append-only событие — grade NULL, status в meta.
const RL_KINDS = { review: 1, skip: 1, seed: 1, annul: 1, mark: 1 };

// §5 B5 — meta allowlist: identifiers + scheduler facts. item_key anchors (text_key/sentence_id/
// order_index) are identifiers per §5; the lemma itself is the item_key and is disclosed in the
// class-A consent copy.
const META_ALLOW = new Set([
  "keyer_version", "scheduler", "scheme", "ts_clamped", "ts_clamped_server",
  "anki_card_id", "anki_type", "postTeach", "mode", "confidence", "grader",
  "interval", "reps", "lapses", "sm2", "fsrs", "d0", "stability", "difficulty",
  "annul_of", "reason", "pos",
  // P7.0b — идентификаторные поля грейдер-провенанса (критика wf_ccbad91d: без них
  // ingest реджектил бы 6 из 7 полей владельца; это версии/enum'ы/item_key — НЕ контент;
  // сырой ответ/скелеты остаются в META_STRIP — privacy-класс сырого ответа = явное
  // решение владельца при P7.0c, не молчаливый провоз)
  "policy_version", "normalizer_version", "resolver_version", "matched_variant", "decision", "expected_form_id",
  "text_key", "sentence_id", "order_index",
  // CLG-P3 sweep of REAL client meta keys (seed rows / Studio sre: rows) — identifiers, not content:
  "seedAlgoVersion", "level", "card_id", "note_id",
  // CLG-P3.2 mark rows (§4.7 manual axis): the asserted status value + the backfill marker
  "status", "backfill",
  // D1 (CLG-P6 prep, §14): провенанс channel-aware грейд-политики — raw_grade = бинарный
  // вердикт ДО политики, grade_policy = версия правила (переинтерпретация задним числом).
  "raw_grade", "grade_policy",
]);
// Known CONTENT keys → stripped (accepted row, cleaned meta). Everything else unknown → reject.
const META_STRIP = new Set([
  "surface", "answer", "expected", "word", "lemma", "usage", "translation", "gloss", "niqqud",
]);

// D2 (owner 2026-07-05): learner_events = server-canon-from-birth telemetry. Closed vocabulary;
// review-facts are FORBIDDEN here (B7 — they live only in review_log).
const EVENT_TYPES = new Set([
  "text_opened", "sentence_read", "word_clicked", "word_marked", "audio_played",
  "message_sent", "message_seen", "agent_task_completed",
]);
const EVENT_TYPES_FORBIDDEN = new Set(["review_answered", "dictation_answered"]);
const PAYLOAD_ALLOW = new Set([
  "text_key", "sentence_id", "order_index", "item_key", "count", "day", "source", "channel",
  "corpus", "work_id", "status",
]);

function cleanObjectKeys(obj, allow, strip) {
  // returns { cleaned, stripped: [k...], unknown: [k...] }
  const cleaned = {}, strippedKeys = [], unknown = [];
  for (const k of Object.keys(obj || {})) {
    if (allow.has(k)) cleaned[k] = obj[k];
    else if (strip.has(k)) strippedKeys.push(k);
    else unknown.push(k);
  }
  return { cleaned, strippedKeys, unknown };
}

function validateTime(s, nowMs) {
  const v = String(s || "");
  if (!CANON_TIME_RE.test(v)) return { ok: false, reason: "time_format" };
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return { ok: false, reason: "time_format" };
  if (t > nowMs + FUTURE_SLACK_MS) return { ok: true, value: new Date(nowMs).toISOString(), clamped: true };
  return { ok: true, value: v, clamped: false };
}

// One review_log row → { ok, row } | { ok:false, reason }. Mirrors the client validator
// (public/db/local-db.js appendReviewLog) + the server-only envelope rules.
function validateReviewRow(raw, nowMs) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  const id = raw.id != null ? String(raw.id).trim() : "";
  const itemKey = raw.item_key != null ? String(raw.item_key).trim() : "";
  const kind = raw.kind != null ? String(raw.kind) : "review";
  const source = raw.source != null ? String(raw.source).trim() : "";
  if (!id || id.length > 200) return { ok: false, reason: "bad_id" };
  if (!itemKey || itemKey.length > 300) return { ok: false, reason: "bad_item_key" };
  if (!RL_KINDS[kind]) return { ok: false, reason: "bad_kind" };
  if (!source || source.length > 60) return { ok: false, reason: "bad_source" };
  const t = validateTime(raw.reviewed_at, nowMs);
  if (!t.ok) return { ok: false, reason: t.reason };
  const grade = raw.grade == null ? null : Number(raw.grade);
  if (kind === "seed" || kind === "annul" || kind === "mark") {
    if (grade != null) return { ok: false, reason: "grade_on_" + kind };
  } else if (!(grade >= 1 && grade <= 4)) return { ok: false, reason: "bad_grade" };
  let meta = raw.meta_json != null ? raw.meta_json : (raw.meta || {});
  if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch (_) { return { ok: false, reason: "bad_meta_json" }; } }
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return { ok: false, reason: "bad_meta_json" };
  const mc = cleanObjectKeys(meta, META_ALLOW, META_STRIP);
  if (mc.unknown.length) return { ok: false, reason: "meta_key:" + mc.unknown[0] };
  if (kind === "annul" && !(mc.cleaned.annul_of && String(mc.cleaned.annul_of).trim())) {
    return { ok: false, reason: "annul_without_target" };
  }
  if (t.clamped) mc.cleaned.ts_clamped_server = 1;
  const metaStr = JSON.stringify(mc.cleaned);
  if (Buffer.byteLength(metaStr, "utf8") > MAX_META_BYTES) return { ok: false, reason: "meta_too_big" };
  return {
    ok: true,
    strippedKeys: mc.strippedKeys,
    row: {
      id, item_key: itemKey, kind, reviewed_at: t.value,
      grade: (kind === "seed" || kind === "annul") ? null : grade,
      source, channel: raw.channel != null ? String(raw.channel).slice(0, 60) : null,
      latency_ms: raw.latency_ms != null ? (Number(raw.latency_ms) || 0) : null,
      meta_json: metaStr,
      rowKeyerVersion: meta.keyer_version != null ? Number(meta.keyer_version) : null,
    },
  };
}

function validateLearnerEvent(raw, nowMs) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  const id = raw.id != null ? String(raw.id).trim() : "";
  const type = raw.type != null ? String(raw.type).trim() : "";
  if (!id || id.length > 200) return { ok: false, reason: "bad_id" };
  if (EVENT_TYPES_FORBIDDEN.has(type)) return { ok: false, reason: "review_fact_in_events" };   // B7
  if (!EVENT_TYPES.has(type)) return { ok: false, reason: "bad_type" };
  const t = validateTime(raw.created_at_client, nowMs);
  if (!t.ok) return { ok: false, reason: t.reason };
  let payload = raw.payload_json != null ? raw.payload_json : (raw.payload || {});
  if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch (_) { return { ok: false, reason: "bad_payload_json" }; } }
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, reason: "bad_payload_json" };
  const pc = cleanObjectKeys(payload, PAYLOAD_ALLOW, META_STRIP);
  if (pc.unknown.length) return { ok: false, reason: "payload_key:" + pc.unknown[0] };
  const payloadStr = JSON.stringify(pc.cleaned);
  if (Buffer.byteLength(payloadStr, "utf8") > MAX_PAYLOAD_BYTES) return { ok: false, reason: "payload_too_big" };
  return { ok: true, strippedKeys: pc.strippedKeys, row: { id, type, created_at_client: t.value, payload_json: payloadStr } };
}

// The ONE ingest step. `userId` = authenticated principal (never from the batch body — the
// endpoint rejects a mismatching body user_id with 403 BEFORE calling this).
// opts.trustedAgentSource (P7.0c, критика R14): source='agent:*' зарезервирован за серверным
// reviewer-путём — провенанс «строку выдал детерминированный грейдер» должен быть аттестован,
// иначе клиентский батч с фальшивым agent-провенансом байт-неотличим от настоящего, а
// annul-скоуп «только свои строки» авторизуется неаттестованным полем. Без флага НОВАЯ
// agent:-строка → reject 'reserved_source'; СУЩЕСТВУЮЩИЙ id → dup (echo-петля cloud-sync,
// re-аплоадящего down-синкнутые agent-строки, остаётся зелёной).
async function ingestBatch(userId, deviceId, batch, opts) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const idem = String((batch && batch.idempotency_key) || "").trim();
  if (!idem || idem.length > 80) return { ok: false, error: "BAD_IDEMPOTENCY_KEY" };

  // batch replay → stored result verbatim
  const prior = await dbGet(db, `SELECT result_json FROM ingest_batches WHERE user_id = ? AND idempotency_key = ?`, [userId, idem]);
  if (prior) { try { return { ok: true, replayed: true, ...JSON.parse(prior.result_json) }; } catch (_) { return { ok: true, replayed: true }; } }

  const schemaVersion = Number((batch && batch.schema_version) || 1);
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) return { ok: false, error: "SCHEMA_VERSION_UNSUPPORTED" };
  const keyerVersion = batch && batch.keyer_version != null ? Number(batch.keyer_version) : null;
  if (keyerVersion != null && keyerVersion !== SUPPORTED_KEYER_VERSION) {
    // §6: пачка с устаревшим/будущим кейером — reject (карантин/translate-стадия = key_alias, до её
    // появления честный отказ вместо молчаливого приёма строк в чужом «диалекте» ключей)
    return { ok: false, error: "KEYER_UNSUPPORTED", keyer_version: keyerVersion };
  }
  const scv = batch && batch.source_client_version != null ? String(batch.source_client_version).slice(0, 40) : null;
  const reviews = Array.isArray(batch && batch.review_log) ? batch.review_log : [];
  const events = Array.isArray(batch && batch.learner_events) ? batch.learner_events : [];
  if (reviews.length + events.length > MAX_BATCH_ROWS) return { ok: false, error: "BATCH_TOO_BIG", max: MAX_BATCH_ROWS };

  const nowMs = Date.now();
  const result = {
    review_log: { total: reviews.length, new: 0, dup: 0, rejected: 0 },
    learner_events: { total: events.length, new: 0, dup: 0, rejected: 0 },
    stripped_meta_keys: 0,
    rejected: [],   // [{id, reason}] capped
  };
  const rejects = (id, reason) => { if (result.rejected.length < 20) result.rejected.push({ id: id || null, reason }); };
  // P4 — item_keys of NEWLY-inserted memory-affecting rows (mark rows excluded: the manual axis
  // never changes memory). NOT persisted into result_json (a replayed batch must not re-trigger
  // the projection recompute) — returned to the caller of THIS live ingest only.
  const newKeys = new Set();

  // Explicit-transaction section: MUST hold the process txn-lock (see db/txnLock.js) — two
  // concurrent ingests otherwise nest BEGINs on the shared connection and 500.
  await withTxnLock(async () => {
  await dbRun(db, `BEGIN IMMEDIATE`);
  try {
    for (const raw of reviews) {
      const v = validateReviewRow(raw, nowMs);
      if (!v.ok) { result.review_log.rejected++; rejects(raw && raw.id, v.reason); continue; }
      // per-row keyer mismatch vs the batch declaration → reject (§6 mixed-keyer gate)
      if (v.row.rowKeyerVersion != null && v.row.rowKeyerVersion !== SUPPORTED_KEYER_VERSION) {
        result.review_log.rejected++; rejects(v.row.id, "row_keyer_version"); continue;
      }
      // P7.0c reserved source (см. шапку ingestBatch): новый agent:-id из недоверенного
      // батча — reject; существующий — проваливается в OR IGNORE и честно считается dup.
      if (!(opts && opts.trustedAgentSource) && v.row.source.indexOf("agent:") === 0) {
        const ex = await dbGet(db, `SELECT 1 x FROM review_log WHERE user_id = ? AND id = ?`, [userId, v.row.id]);
        if (!ex) { result.review_log.rejected++; rejects(v.row.id, "reserved_source"); continue; }
      }
      result.stripped_meta_keys += v.strippedKeys.length;
      const r = await dbRun(db,
        `INSERT OR IGNORE INTO review_log
           (user_id, id, item_key, kind, reviewed_at, grade, source, channel, latency_ms, meta_json,
            device_id, schema_version, source_client_version, keyer_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [userId, v.row.id, v.row.item_key, v.row.kind, v.row.reviewed_at, v.row.grade, v.row.source,
         v.row.channel, v.row.latency_ms, v.row.meta_json, deviceId || null, schemaVersion, scv,
         v.row.rowKeyerVersion != null ? v.row.rowKeyerVersion : keyerVersion]);
      if (r.changes > 0) {
        result.review_log.new++;
        if (v.row.kind !== "mark") newKeys.add(v.row.item_key);
      } else result.review_log.dup++;
    }
    for (const raw of events) {
      const v = validateLearnerEvent(raw, nowMs);
      if (!v.ok) { result.learner_events.rejected++; rejects(raw && raw.id, v.reason); continue; }
      result.stripped_meta_keys += v.strippedKeys.length;
      const r = await dbRun(db,
        `INSERT OR IGNORE INTO learner_events
           (user_id, id, type, payload_json, created_at_client, device_id, schema_version, source_client_version)
         VALUES (?,?,?,?,?,?,?,?)`,
        [userId, v.row.id, v.row.type, v.row.payload_json, v.row.created_at_client,
         deviceId || null, schemaVersion, scv]);
      if (r.changes > 0) result.learner_events.new++; else result.learner_events.dup++;
    }
    await dbRun(db, `INSERT INTO ingest_batches (user_id, idempotency_key, device_id, result_json) VALUES (?,?,?,?)`,
      [userId, idem, deviceId || null, JSON.stringify(result)]);
    await dbRun(db, `COMMIT`);
  } catch (e) {
    try { await dbRun(db, `ROLLBACK`); } catch (_) {}
    throw e;
  }
  });
  return { ok: true, replayed: false, new_item_keys: Array.from(newKeys), ...result };
}

// Down-sync primitive. Cursor = ROWID, not ingested_at: ingested_at is stamped at INSERT
// (inside the transaction) but rows become VISIBLE at COMMIT — a reader paging by timestamp can
// advance its cursor PAST rows that appear later (found live: iPhone synced during the PC's
// multi-batch upload and permanently skipped 11 rows). Under db/txnLock.js writers are
// serialized, so rowid order == commit order and a reader always sees a hole-free PREFIX.
async function readLog(userId, { afterRid, limit } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const lim = Math.max(1, Math.min(2000, Number(limit) || 500));
  const rid = Math.max(0, Number(afterRid) || 0);
  const rows = await dbAll(db,
    `SELECT rowid AS rid, id, item_key, kind, reviewed_at, grade, source, channel, latency_ms, meta_json, device_id, ingested_at
       FROM review_log WHERE user_id = ? AND rowid > ? ORDER BY rowid ASC LIMIT ?`, [userId, rid, lim]);
  return rows || [];
}

async function counts(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rl = await dbGet(db, `SELECT COUNT(*) c FROM review_log WHERE user_id = ?`, [userId]);
  const ev = await dbGet(db, `SELECT COUNT(*) c FROM learner_events WHERE user_id = ?`, [userId]);
  return { review_log: Number(rl && rl.c) || 0, learner_events: Number(ev && ev.c) || 0 };
}

// P7.0c — КАНОНИЧЕСКИЙ per-item срез лога в replay-порядке (reviewed_at ASC, id ASC —
// UTC-Z делает лексикографический == хронологическому). Единственная точка истины этого
// ORDER: learnerProjectionRepo и agent/reviewer читают ОТСЮДА (критика: копипаста SQL
// в два репо = молчаливый дрейф порядка фолда vs rows грейдера).
async function itemRows(userId, itemKey) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbAll(db,
    `SELECT id, item_key, kind, reviewed_at, grade, source, channel, meta_json
       FROM review_log WHERE user_id = ? AND item_key = ? ORDER BY reviewed_at ASC, id ASC`,
    [userId, String(itemKey || "")])) || [];
}

// P7.0c annul-минтер: резолв цели строго по (user_id, id) — user-scope структурный.
async function getRowById(userId, id) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db,
    `SELECT id, item_key, kind, reviewed_at, grade, source, channel, meta_json
       FROM review_log WHERE user_id = ? AND id = ?`, [userId, String(id || "")])) || null;
}

module.exports = {
  ingestBatch, readLog, counts, itemRows, getRowById,
  SUPPORTED_SCHEMA_VERSION, SUPPORTED_KEYER_VERSION, MAX_BATCH_ROWS,
  META_ALLOW,   // P7.0b: read-only для гейта «провенанс-полям грейдера есть где жить»
};
