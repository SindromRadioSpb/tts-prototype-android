"use strict";

const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");
const C = require("../agent/memory/contracts");

const MAX_RECORDS = 100;
const MAX_ACTIVE_KIND = 20;
const MAX_PENDING = 10;
const MAX_REVISIONS = 16;

function all(db, sql, p = []) { return new Promise((resolve, reject) => db.all(sql, p, (e, r) => e ? reject(e) : resolve(r || []))); }
function get(db, sql, p = []) { return new Promise((resolve, reject) => db.get(sql, p, (e, r) => e ? reject(e) : resolve(r || null))); }
function run(db, sql, p = []) { return new Promise((resolve, reject) => db.run(sql, p, function (e) { e ? reject(e) : resolve(this); })); }
const nowIso = () => new Date().toISOString();
const plusDays = (days, now = Date.now()) => new Date(now + days * 86400000).toISOString();

async function currentConsent(userId, key) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await get(db, `SELECT id,granted,consent_version,created_at FROM consent_records WHERE user_id=? AND consent_key=? ORDER BY created_at DESC,id DESC LIMIT 1`, [userId, key]);
  return r && Number(r.granted) === 1 ? r : null;
}

function parseRow(row, sources) {
  if (!row) return null;
  let payload = {}; try { payload = JSON.parse(row.payload_json || "{}"); } catch (_) {}
  return {
    id: row.id, kind: row.kind, authority_class: row.authority_class, status: row.status,
    use_enabled: !!row.use_enabled, priority: Number(row.priority) || 0,
    current_revision_id: row.current_revision_id, revision: Number(row.ordinal) || 0,
    payload, created_at: row.created_at, updated_at: row.updated_at,
    review_at: row.review_at, expires_at: row.expires_at,
    sources: (sources || []).map((s) => ({ id:s.id, source_kind:s.source_kind, relation_kind:s.relation_kind, source_ref:s.source_ref, source_revision_ref:s.source_revision_ref, source_authority:s.source_authority, source_status:s.source_status, anchor: safeJson(s.anchor_json) })),
  };
}
function safeJson(s) { try { return JSON.parse(s || "{}"); } catch (_) { return {}; } }

async function loadOne(db, userId, id) {
  const row = await get(db, `SELECT r.*,v.ordinal,v.payload_json,v.payload_digest FROM learner_memory_records r JOIN learner_memory_revisions v ON v.id=r.current_revision_id AND v.user_id=r.user_id WHERE r.user_id=? AND r.id=?`, [userId, id]);
  if (!row) return null;
  const sources = await all(db, `SELECT * FROM learner_memory_source_links WHERE user_id=? AND memory_id=? AND revision_id=? ORDER BY id`, [userId,id,row.current_revision_id]);
  return parseRow(row, sources);
}

async function create(userId, input) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const kind = String(input.kind || "");
  const authority = String(input.authority_class || "USER_DECLARED");
  if (!C.AUTHORITIES.has(authority)) throw new Error("BAD_MEMORY_AUTHORITY");
  const payload = C.validatePayload(kind, input.payload);
  const sources = C.validateSources(input.sources);
  const status = authority === "DERIVED_CANDIDATE" ? "PENDING" : "ACTIVE";
  const use = status === "ACTIVE" ? 1 : 0;
  const days = status === "PENDING" ? 7 : kind === "declared_goal" ? 365 : Math.max(7, Math.min(90, Number(input.ttl_days) || 30));
  const now = nowIso();
  const consentRef = String(input.consent_snapshot_ref || ""); if (!consentRef) throw new Error("CONSENT_REQUIRED");
  const dedupe = input.dedupe_key || C.digest(userId, {kind,payload,sources:sources.map(s=>({k:s.source_kind,r:s.source_ref,a:s.anchor}))});
  return withTxnLock(async () => {
    await run(db, "BEGIN IMMEDIATE");
    try {
      const counts = await get(db, `SELECT COUNT(*) total,SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending FROM learner_memory_records WHERE user_id=?`, [userId]);
      if (Number(counts.total) >= MAX_RECORDS) throw new Error("MEMORY_LIMIT");
      if (status === "PENDING" && Number(counts.pending) >= MAX_PENDING) throw new Error("PENDING_LIMIT");
      if (status === "ACTIVE") {
        const active = await get(db, `SELECT COUNT(*) c FROM learner_memory_records WHERE user_id=? AND kind=? AND status='ACTIVE'`, [userId,kind]);
        if (Number(active.c) >= MAX_ACTIVE_KIND) throw new Error("MEMORY_KIND_LIMIT");
      }
      const prior = await get(db, `SELECT id FROM learner_memory_records WHERE user_id=? AND dedupe_key=? AND status IN ('PENDING','ACTIVE','SUPPRESSED')`, [userId,dedupe]);
      if (prior) { await run(db,"ROLLBACK"); return loadOne(db,userId,prior.id); }
      const id = C.opaque("mem_"); const rev = C.opaque("mrev_");
      const payloadJson = C.canonicalJson(payload); const payloadDigest = C.digest(userId,payload);
      await run(db, `INSERT INTO learner_memory_records (id,user_id,kind,authority_class,status,use_enabled,priority,current_revision_id,dedupe_key,schema_version,policy_version,consent_snapshot_ref,created_at,updated_at,review_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id,userId,kind,authority,status,use,Math.max(0,Math.min(9,Number(input.priority)||0)),rev,dedupe,C.SCHEMA_VERSION,C.POLICY_VERSION,consentRef,now,now,kind==="declared_goal"?plusDays(180):null,plusDays(days)]);
      await run(db, `INSERT INTO learner_memory_revisions (id,user_id,memory_id,ordinal,operation,actor_class,payload_json,payload_digest,reason_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [rev,userId,id,1,"CREATE",authority==="DERIVED_CANDIDATE"?"DETERMINISTIC_POLICY":"USER",payloadJson,payloadDigest,input.reason_code||null,now]);
      for (const s of sources) await run(db, `INSERT INTO learner_memory_source_links (id,user_id,memory_id,revision_id,source_kind,relation_kind,source_ref,source_revision_ref,source_authority,anchor_json,keyed_digest,source_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [C.opaque("msrc_"),userId,id,rev,s.source_kind,s.relation_kind,s.source_ref,s.source_revision_ref,s.source_authority,s.anchor_json,s.keyed_digest,"AVAILABLE",now]);
      await run(db,"COMMIT");
      return loadOne(db,userId,id);
    } catch (e) { try { await run(db,"ROLLBACK"); } catch (_) {} throw e; }
  });
}

async function list(userId, opts = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const limit = Math.max(1,Math.min(5,Number(opts.limit)||5));
  const allowed = new Set(["ACTIVE","PENDING","SUPPRESSED","EXPIRED","ANNULLED","RESOLVED"]);
  const status = opts.status && allowed.has(String(opts.status)) ? String(opts.status) : null;
  const params=[userId]; let where="r.user_id=?";
  if(status){where+=" AND r.status=?";params.push(status);}
  if(opts.before){where+=" AND r.updated_at<?";params.push(String(opts.before));}
  params.push(limit+1);
  const rows=await all(db,`SELECT r.*,v.ordinal,v.payload_json,v.payload_digest FROM learner_memory_records r JOIN learner_memory_revisions v ON v.id=r.current_revision_id AND v.user_id=r.user_id WHERE ${where} ORDER BY r.updated_at DESC,r.id DESC LIMIT ?`,params);
  const items=[];for(const row of rows.slice(0,limit)){const src=await all(db,`SELECT * FROM learner_memory_source_links WHERE user_id=? AND memory_id=? AND revision_id=? ORDER BY id`,[userId,row.id,row.current_revision_id]);items.push(parseRow(row,src));}
  return {items,has_more:rows.length>limit,next_before:items.length?items[items.length-1].updated_at:null};
}

const transitions = {
  KEEP:{from:["PENDING"],to:"ACTIVE",use:1,op:"KEEP"},
  CORRECT:{from:["ACTIVE","SUPPRESSED","EXPIRED"],to:"ACTIVE",use:1,op:"CORRECT"},
  SUPPRESS:{from:["ACTIVE"],to:"SUPPRESSED",use:0,op:"SUPPRESS"},
  UNSUPPRESS:{from:["SUPPRESSED"],to:"ACTIVE",use:1,op:"UNSUPPRESS"},
  RECONFIRM:{from:["EXPIRED"],to:"ACTIVE",use:1,op:"RECONFIRM"},
  RESOLVE:{from:["ACTIVE","SUPPRESSED"],to:"RESOLVED",use:0,op:"RESOLVE"},
  ANNUL:{from:["PENDING","ACTIVE","SUPPRESSED","EXPIRED"],to:"ANNULLED",use:0,op:"ANNUL"},
};

async function act(userId,id,action,input={}) {
  const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");
  action=String(action||"");if(!C.ACTIONS.has(action))throw new Error("ACTION_INVALID");
  return withTxnLock(async()=>{await run(db,"BEGIN IMMEDIATE");try{
    const row=await get(db,`SELECT r.*,v.ordinal,v.payload_json FROM learner_memory_records r JOIN learner_memory_revisions v ON v.id=r.current_revision_id AND v.user_id=r.user_id WHERE r.user_id=? AND r.id=?`,[userId,id]);
    if(!row)throw new Error("MEMORY_NOT_FOUND");
    if(input.expected_revision_id&&String(input.expected_revision_id)!==row.current_revision_id)throw new Error("STATE_CONFLICT");
    if(action==="DELETE"){
      const now=nowIso();await run(db,`INSERT OR IGNORE INTO memory_erasure_journal (user_id,memory_id,deleted_at,reason_code) VALUES (?,?,?,?)`,[userId,id,now,String(input.reason_code||"USER_DELETE").slice(0,60)]);await run(db,`DELETE FROM memory_context_queries WHERE user_id=? AND selected_ids_json LIKE ?`,[userId,`%${id}%`]);await run(db,`DELETE FROM learner_memory_records WHERE user_id=? AND id=?`,[userId,id]);await run(db,"COMMIT");return {deleted:true,id};
    }
    const tr=transitions[action];if(!tr||!tr.from.includes(row.status))throw new Error("STATE_CONFLICT");
    const ord=Number(row.ordinal)+1;if(ord>MAX_REVISIONS)throw new Error("REVISION_LIMIT");
    const payload=action==="CORRECT"?C.validatePayload(row.kind,input.payload):safeJson(row.payload_json);
    const rev=C.opaque("mrev_");const now=nowIso();const payloadJson=C.canonicalJson(payload);
    const authority=action==="KEEP"&&row.authority_class==="DERIVED_CANDIDATE"?"USER_CONFIRMED_DERIVED":row.authority_class;
    const expiry=action==="RECONFIRM"?plusDays(row.kind==="declared_goal"?365:30):row.expires_at;
    await run(db,`INSERT INTO learner_memory_revisions (id,user_id,memory_id,ordinal,operation,actor_class,payload_json,payload_digest,reason_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,[rev,userId,id,ord,tr.op,"USER",payloadJson,C.digest(userId,payload),input.reason_code?String(input.reason_code).slice(0,60):null,now]);
    const src=await all(db,`SELECT * FROM learner_memory_source_links WHERE user_id=? AND memory_id=? AND revision_id=?`,[userId,id,row.current_revision_id]);
    for(const s of src)await run(db,`INSERT INTO learner_memory_source_links (id,user_id,memory_id,revision_id,source_kind,relation_kind,source_ref,source_revision_ref,source_authority,anchor_json,keyed_digest,source_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[C.opaque("msrc_"),userId,id,rev,s.source_kind,s.relation_kind,s.source_ref,s.source_revision_ref,s.source_authority,s.anchor_json,s.keyed_digest,s.source_status,now]);
    await run(db,`UPDATE learner_memory_records SET authority_class=?,status=?,use_enabled=?,current_revision_id=?,updated_at=?,review_at=?,expires_at=? WHERE user_id=? AND id=?`,[authority,tr.to,tr.use,rev,now,row.kind==="declared_goal"?plusDays(180):row.review_at,expiry,userId,id]);
    await run(db,"COMMIT");return loadOne(db,userId,id);
  }catch(e){try{await run(db,"ROLLBACK");}catch(_){}throw e;}});
}

async function eligibleThreads(userId, now=nowIso()) {
  const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");
  const rows=await all(db,`SELECT r.*,v.ordinal,v.payload_json,v.payload_digest FROM learner_memory_records r JOIN learner_memory_revisions v ON v.id=r.current_revision_id AND v.user_id=r.user_id WHERE r.user_id=? AND r.kind='unfinished_thread' AND r.status='ACTIVE' AND r.use_enabled=1 AND r.expires_at>? ORDER BY CASE r.authority_class WHEN 'USER_DECLARED' THEN 0 ELSE 1 END,r.priority DESC,r.updated_at DESC,r.id ASC LIMIT 100`,[userId,now]);
  const out=[];for(const row of rows){const src=await all(db,`SELECT * FROM learner_memory_source_links WHERE user_id=? AND memory_id=? AND revision_id=? ORDER BY id`,[userId,row.id,row.current_revision_id]);out.push(parseRow(row,src));}return out;
}
async function sourceLinksForRevision(userId,memoryId,revisionId) {
  const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");
  return all(db,`SELECT id,source_kind,relation_kind,source_ref,source_revision_ref,source_authority,anchor_json,keyed_digest,source_status FROM learner_memory_source_links WHERE user_id=? AND memory_id=? AND revision_id=? ORDER BY id`,[userId,memoryId,revisionId]);
}
async function writeQueryReceipt(userId,x){const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");const now=nowIso();const id=C.opaque("mq_");await run(db,`INSERT INTO memory_context_queries (id,user_id,purpose,surface,policy_version,consent_snapshot_ref,eligible_count,selected_ids_json,exclusion_counts_json,source_checks_json,terminal_code,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,userId,x.purpose,"pwa",C.POLICY_VERSION,x.consent_snapshot_ref,Math.min(100,Number(x.eligible_count)||0),JSON.stringify((x.selected_ids||[]).slice(0,5)),JSON.stringify(x.exclusions||{}),JSON.stringify(x.source_checks||{}),String(x.terminal_code||"OK").slice(0,60),now,plusDays(30)]);return id;}
async function exportMemory(userId){const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");const records=await all(db,`SELECT * FROM learner_memory_records WHERE user_id=? ORDER BY created_at,id`,[userId]);const revisions=await all(db,`SELECT id,memory_id,ordinal,operation,actor_class,payload_json,reason_code,created_at FROM learner_memory_revisions WHERE user_id=? ORDER BY memory_id,ordinal`,[userId]);const sources=(await all(db,`SELECT id,memory_id,revision_id,source_kind,relation_kind,source_ref,source_revision_ref,source_authority,anchor_json,source_status,created_at FROM learner_memory_source_links WHERE user_id=? ORDER BY memory_id,revision_id,id`,[userId])).map(r=>({...r,anchor:safeJson(r.anchor_json)}));const queries=await all(db,`SELECT id,purpose,surface,policy_version,eligible_count,selected_ids_json,exclusion_counts_json,source_checks_json,terminal_code,created_at,expires_at FROM memory_context_queries WHERE user_id=? ORDER BY created_at,id`,[userId]);const erasures=await all(db,`SELECT memory_id,deleted_at,reason_code FROM memory_erasure_journal WHERE user_id=? ORDER BY deleted_at,memory_id`,[userId]);return {schema_version:C.SCHEMA_VERSION,exported_at:nowIso(),records,revisions:revisions.map(r=>({...r,payload:safeJson(r.payload_json),payload_json:undefined})),sources,queries,erasures};}
async function deleteAll(userId,reason="USER_DELETE_ALL",kind=null){const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");return withTxnLock(async()=>{await run(db,"BEGIN IMMEDIATE");try{const params=[userId];let w="user_id=?";if(kind){w+=" AND kind=?";params.push(kind);}const ids=(await all(db,`SELECT id FROM learner_memory_records WHERE ${w}`,params)).map(r=>r.id);const now=nowIso();for(const id of ids)await run(db,`INSERT OR IGNORE INTO memory_erasure_journal (user_id,memory_id,deleted_at,reason_code) VALUES (?,?,?,?)`,[userId,id,now,reason]);await run(db,`DELETE FROM learner_memory_records WHERE ${w}`,params);if(!kind)await run(db,`DELETE FROM memory_context_queries WHERE user_id=?`,[userId]);await run(db,"COMMIT");return {deleted:ids.length};}catch(e){try{await run(db,"ROLLBACK");}catch(_){}throw e;}});}
async function deletePending(userId,reason="CONSENT_REVOKED"){const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");return withTxnLock(async()=>{await run(db,"BEGIN IMMEDIATE");try{const ids=(await all(db,`SELECT id FROM learner_memory_records WHERE user_id=? AND status='PENDING'`,[userId])).map(r=>r.id);const now=nowIso();for(const id of ids)await run(db,`INSERT OR IGNORE INTO memory_erasure_journal (user_id,memory_id,deleted_at,reason_code) VALUES (?,?,?,?)`,[userId,id,now,reason]);await run(db,`DELETE FROM learner_memory_records WHERE user_id=? AND status='PENDING'`,[userId]);await run(db,"COMMIT");return {deleted:ids.length};}catch(e){try{await run(db,"ROLLBACK");}catch(_){}throw e;}});}
async function expireAndPurge(now=nowIso()){const db=getDb();if(!db)return {expired:0,records:0,queries:0,journal:0};const a=await run(db,`UPDATE learner_memory_records SET status='EXPIRED',use_enabled=0,updated_at=? WHERE status IN ('PENDING','ACTIVE') AND expires_at<=?`,[now,now]);const recordCutoff=new Date(Date.parse(now)-30*86400000).toISOString();const old=await all(db,`SELECT user_id,id FROM learner_memory_records WHERE status IN ('EXPIRED','ANNULLED','RESOLVED') AND updated_at<=?`,[recordCutoff]);for(const row of old)await run(db,`INSERT OR IGNORE INTO memory_erasure_journal (user_id,memory_id,deleted_at,reason_code) VALUES (?,?,?,'RETENTION_PURGE')`,[row.user_id,row.id,now]);const d=await run(db,`DELETE FROM learner_memory_records WHERE status IN ('EXPIRED','ANNULLED','RESOLVED') AND updated_at<=?`,[recordCutoff]);const q=await run(db,`DELETE FROM memory_context_queries WHERE expires_at<=?`,[now]);const j=await run(db,`DELETE FROM memory_erasure_journal WHERE deleted_at<=?`,[new Date(Date.parse(now)-30*86400000).toISOString()]);return {expired:a.changes,records:d.changes,queries:q.changes,journal:j.changes};}
async function sourceStatus(userId,memoryId,sourceId,status){const db=getDb();if(!db)throw new Error("DB_NOT_AVAILABLE");if(!["AVAILABLE","DRIFTED","REVOKED","PURGED"].includes(status))throw new Error("BAD_SOURCE_STATUS");await run(db,`UPDATE learner_memory_source_links SET source_status=? WHERE user_id=? AND memory_id=? AND id=?`,[status,userId,memoryId,sourceId]);}

module.exports={MAX_RECORDS,MAX_ACTIVE_KIND,MAX_PENDING,MAX_REVISIONS,currentConsent,create,list,act,eligibleThreads,sourceLinksForRevision,writeQueryReceipt,exportMemory,deleteAll,deletePending,expireAndPurge,sourceStatus,loadOne};
