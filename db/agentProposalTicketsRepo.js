"use strict";

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");
const { canonicalJson } = require("./agentProposalsRepo");
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const hash = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function database() { const d = getDb(); if (!d) fail("DB_NOT_AVAILABLE"); return d; }
function actionFor(row, itemIndex) {
  const p = row.payload;
  if (row.kind === "import_text" && itemIndex === 0) return {
    type: "IMPORT_TEXT", text_key: "agent-" + hash(row.user_id + "|" + row.proposal_id).slice(0, 32),
    title: p.source.title, author: p.source.author || null, source: p.source, body: p.body_preview,
    niqqud_status: p.niqqud_status, transformation_disclosure: p.transformation_disclosure || null,
    provenance: "imported_via_agent_proposal:" + row.proposal_id,
  };
  if (row.kind === "track_word" && Number.isInteger(itemIndex) && p.items[itemIndex] && p.items[itemIndex].item_key) {
    const x = p.items[itemIndex]; return { type: "TRACK_WORD", surface: x.surface, item_key: x.item_key, status: "new", evidence: x.evidence, caveat: x.caveat || null, provenance: "tracked_via_agent_proposal:" + row.proposal_id };
  }
  fail("AA_PROPOSAL_ITEM_NOT_EXECUTABLE");
}
async function issue(userId, row, itemIndex, nowMs = Date.now()) {
  const index = Number(itemIndex); if (!Number.isInteger(index) || index < 0 || index > 9) fail("AA_PROPOSAL_ITEM_INVALID");
  const action = actionFor(row, index); const actionDigest = hash(canonicalJson(action));
  const raw = crypto.randomBytes(32).toString("base64url"); const tokenHash = hash(raw);
  const issued = new Date(nowMs).toISOString(), expires = new Date(nowMs + 5 * 60000).toISOString();
  await withTxnLock(async () => {
    const d = database();
    const existing = await get(d, `SELECT consumed_at FROM agent_proposal_execution_tickets WHERE proposal_id=? AND item_index=?`, [row.proposal_id,index]);
    if (existing && existing.consumed_at) fail("AA_PROPOSAL_ITEM_ALREADY_EXECUTED");
    await run(d, `INSERT INTO agent_proposal_execution_tickets
      (proposal_id,item_index,user_id,token_hash,action_digest,issued_at,expires_at,consumed_at,receipt_json)
      VALUES (?,?,?,?,?,?,?,NULL,NULL)
      ON CONFLICT(proposal_id,item_index) DO UPDATE SET token_hash=excluded.token_hash,action_digest=excluded.action_digest,issued_at=excluded.issued_at,expires_at=excluded.expires_at,consumed_at=NULL,receipt_json=NULL`,
      [row.proposal_id,index,String(userId),tokenHash,actionDigest,issued,expires]);
  });
  return { ticket: raw, action_digest: actionDigest, expires_at: expires, action };
}
async function consume(userId, proposalId, rawToken, actionDigest, receipt, requiredCount, nowMs = Date.now()) {
  const at = new Date(nowMs).toISOString(); const tokenHash = hash(rawToken);
  return withTxnLock(async () => {
    const d = database(); await run(d, "BEGIN IMMEDIATE");
    try {
      const row = await get(d, `SELECT * FROM agent_proposal_execution_tickets WHERE user_id=? AND proposal_id=? AND token_hash=?`, [String(userId), String(proposalId), tokenHash]);
      if (!row || row.consumed_at || row.expires_at <= at) fail("AA_PROPOSAL_TICKET_INVALID");
      if (row.action_digest !== String(actionDigest)) fail("AA_PROPOSAL_ACTION_DIGEST_MISMATCH");
      const text = JSON.stringify(receipt || {}); if (Buffer.byteLength(text, "utf8") > 2048) fail("AA_PROPOSAL_RECEIPT_TOO_LARGE");
      await run(d, `UPDATE agent_proposal_execution_tickets SET consumed_at=?,receipt_json=? WHERE proposal_id=? AND item_index=? AND consumed_at IS NULL`, [at,text,row.proposal_id,row.item_index]);
      const countRow = await get(d, `SELECT COUNT(*) c FROM agent_proposal_execution_tickets WHERE user_id=? AND proposal_id=? AND consumed_at IS NOT NULL`, [String(userId),String(proposalId)]);
      const complete = Number(requiredCount) > 0 && Number(countRow && countRow.c) >= Number(requiredCount);
      if (complete) {
        const decided = await run(d, `UPDATE agent_proposals SET status='CONFIRMED',authority='USER_CONFIRMED_AGENT_ASSERTED',decided_at=?,updated_at=? WHERE user_id=? AND proposal_id=? AND status='PENDING'`, [at,at,String(userId),String(proposalId)]);
        if (decided.changes !== 1) fail("AA_PROPOSAL_NOT_PENDING");
      }
      await run(d, "COMMIT"); return { proposal_id: row.proposal_id, item_index: row.item_index, consumed_at: at, complete };
    } catch (e) { try { await run(d, "ROLLBACK"); } catch (_) {} throw e; }
  });
}
async function state(userId, proposalId) {
  return all(database(), `SELECT item_index,consumed_at FROM agent_proposal_execution_tickets WHERE user_id=? AND proposal_id=? ORDER BY item_index`, [String(userId),String(proposalId)]);
}
module.exports = { issue, consume, state, actionFor };
