"use strict";

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function db() { const x = getDb(); if (!x) fail("DB_NOT_AVAILABLE"); return x; }
function isoDay(value) { return String(value).slice(0, 10); }

async function createFromProposal(userId, proposal, nowIso = new Date().toISOString()) {
  if (!proposal || proposal.kind !== "goal" || !proposal.payload) fail("AA_GOAL_PROPOSAL_INVALID");
  const p = proposal.payload;
  return withTxnLock(async () => {
    const d = db(); await run(d, "BEGIN IMMEDIATE");
    try {
      const prior = await get(d, `SELECT * FROM weekly_goals WHERE user_id=? AND proposal_id=?`, [String(userId), proposal.proposal_id]);
      if (prior) { await run(d, "COMMIT"); return prior; }
      await run(d, `UPDATE weekly_goals SET status='DROPPED',closed_at=?,updated_at=? WHERE user_id=? AND status='ACTIVE'`, [nowIso, nowIso, String(userId)]);
      const id = "wg_" + crypto.randomBytes(16).toString("hex");
      await run(d, `INSERT INTO weekly_goals
        (id,user_id,week_start,period_days,statement,goal_type,anchor,source,proposal_id,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'AGENT_PROPOSED_OWNER_CONFIRMED',?,'ACTIVE',?,?)`,
        [id, String(userId), isoDay(nowIso), p.period_days, p.statement, p.goal_type, p.anchor || null, proposal.proposal_id, nowIso, nowIso]);
      const row = await get(d, `SELECT * FROM weekly_goals WHERE id=?`, [id]);
      await run(d, "COMMIT"); return row;
    } catch (e) { try { await run(d, "ROLLBACK"); } catch (_) {} throw e; }
  });
}

async function getCurrent(userId) {
  return get(db(), `SELECT id,week_start,period_days,statement,goal_type,anchor,source,status,created_at
    FROM weekly_goals WHERE user_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [String(userId)]);
}
async function close(userId, id, status) {
  if (!['COMPLETED_SELF_REPORT','DROPPED'].includes(status)) fail("AA_GOAL_STATUS_INVALID");
  const at = new Date().toISOString();
  const r = await withTxnLock(() => run(db(), `UPDATE weekly_goals SET status=?,closed_at=?,updated_at=? WHERE user_id=? AND id=? AND status='ACTIVE'`, [status, at, at, String(userId), String(id)]));
  if (r.changes !== 1) fail("AA_GOAL_NOT_FOUND"); return { id: String(id), status };
}
async function remove(userId, id) {
  const r = await withTxnLock(() => run(db(), `DELETE FROM weekly_goals WHERE user_id=? AND id=?`, [String(userId), String(id)]));
  if (r.changes !== 1) fail("AA_GOAL_NOT_FOUND"); return { id: String(id), deleted: true };
}
module.exports = { createFromProposal, getCurrent, close, remove };
