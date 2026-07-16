"use strict";

const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");

function run(db, sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this); })); }
function all(db, sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows || []))); }
function exec(db, sql) { return new Promise((resolve, reject) => db.exec(sql, (e) => e ? reject(e) : resolve())); }

async function insertBatch(records) {
  if (!Array.isArray(records) || !records.length) return 0;
  const db = getDb();
  return withTxnLock(async () => {
    const cols = "id,user_id,run_id,request_id,parent_run_id,process_boot_id,sequence,record_kind,role_id,scenario_id,surface,workflow_version,role_registry_version,observer_schema_version,terminal_status,live_outcome_code,shadow_decision,manifest_json,latency_bucket_ms,created_at,expires_at";
    const one = "(" + new Array(21).fill("?").join(",") + ")";
    const params = [];
    for (const r of records) params.push(r.id,r.user_id,r.run_id,r.request_id,r.parent_run_id,r.process_boot_id,r.sequence,r.record_kind,r.role_id,r.scenario_id,r.surface,r.workflow_version,r.role_registry_version,r.observer_schema_version,r.terminal_status,r.live_outcome_code,r.shadow_decision,r.manifest_json,r.latency_bucket_ms,r.created_at,r.expires_at);
    await run(db, `INSERT INTO cp0_observations (${cols}) VALUES ${records.map(() => one).join(",")}`, params);
    return records.length;
  });
}

async function checkpointBoot(b) {
  const db = getDb();
  await run(db, `INSERT INTO cp0_observer_boots
    (process_boot_id,observer_schema_version,started_at,last_checkpoint_at,finished_at,clean_shutdown,eligible_runs_total,start_enqueued_total,start_persisted_total,terminal_expected_total,terminal_enqueued_total,terminal_persisted_total,dropped_total,rejected_total,circuit_open_total,counters_json,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(process_boot_id) DO UPDATE SET
      last_checkpoint_at=excluded.last_checkpoint_at, finished_at=excluded.finished_at,
      clean_shutdown=excluded.clean_shutdown, eligible_runs_total=excluded.eligible_runs_total,
      start_enqueued_total=excluded.start_enqueued_total, start_persisted_total=excluded.start_persisted_total,
      terminal_expected_total=excluded.terminal_expected_total, terminal_enqueued_total=excluded.terminal_enqueued_total,
      terminal_persisted_total=excluded.terminal_persisted_total, dropped_total=excluded.dropped_total,
      rejected_total=excluded.rejected_total, circuit_open_total=excluded.circuit_open_total,
      counters_json=excluded.counters_json, expires_at=excluded.expires_at`,
    [b.process_boot_id,b.observer_schema_version,b.started_at,b.last_checkpoint_at,b.finished_at,b.clean_shutdown,b.eligible_runs_total,b.start_enqueued_total,b.start_persisted_total,b.terminal_expected_total,b.terminal_enqueued_total,b.terminal_persisted_total,b.dropped_total,b.rejected_total,b.circuit_open_total,b.counters_json,b.expires_at]);
}

async function purgeExpired(nowIso = new Date().toISOString()) {
  const db = getDb();
  const detail = await run(db, "DELETE FROM cp0_observations WHERE expires_at <= ?", [nowIso]);
  const boots = await run(db, "DELETE FROM cp0_observer_boots WHERE expires_at <= ?", [nowIso]);
  return { observations: detail.changes || 0, boots: boots.changes || 0 };
}

async function listForUser(userId) { return all(getDb(), "SELECT * FROM cp0_observations WHERE user_id=? ORDER BY created_at,id", [String(userId)]); }
async function counts() {
  const rows = await all(getDb(), "SELECT record_kind,COUNT(*) c FROM cp0_observations GROUP BY record_kind");
  return Object.fromEntries(rows.map((r) => [r.record_kind, Number(r.c)]));
}

module.exports = { insertBatch, checkpointBoot, purgeExpired, listForUser, counts };
