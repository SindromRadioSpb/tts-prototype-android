"use strict";
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { createContext, assertContextAccess } = require("./context");
const { validateResponse, fail, closed } = require("./response");
const { withTxnLock } = require("../../db/txnLock");
const practice = require("./practice");
const hash = value => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const ONLINE_MS = 20000, LEASE_MS = 30000, RUN_MS = 180000;

function createStore(getDb, clock = Date.now, allowed = async () => true) {
  const run = (sql, p = []) => new Promise((resolve, reject) => getDb().run(sql, p, function (e) { e ? reject(e) : resolve(this); }));
  const get = (sql, p = []) => new Promise((resolve, reject) => getDb().get(sql, p, (e, r) => e ? reject(e) : resolve(r)));
  async function transaction(fn) {
    return withTxnLock(async () => {
      await run("BEGIN IMMEDIATE");
      try { const out = await fn(); await run("COMMIT"); return out; }
      catch (e) { await run("ROLLBACK"); throw e; }
    });
  }
  async function sweep() {
    const now = clock();
    await run("DELETE FROM tutor_enrollments WHERE expires_at<=?", [now]);
    await run("DELETE FROM tutor_pairings WHERE expires_at<=?", [now]);
    // Content expires even if nobody returns to the page; routes and periodic sweep call this.
    await run("DELETE FROM tutor_sessions WHERE expires_at<=?", [now]);
    await run("UPDATE tutor_sessions SET state='failed',error_code='agent_disconnected',version=version+1 WHERE state='running' AND (lease_until<=? OR run_deadline<=?)", [now, now]);
    await run("UPDATE tutor_sessions SET state='failed',error_code='agent_offline',version=version+1 WHERE state='queued' AND created_at<=?", [now - LEASE_MS]);
  }
  async function permit(userId) { if(!await allowed(String(userId)))fail("not_available"); }
  async function connectionForUser(userId) {
    await permit(userId);
    return get("SELECT * FROM tutor_connections WHERE user_id=?", [String(userId)]);
  }
  async function authenticate(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail("connection_required");
    const conn = await get("SELECT * FROM tutor_connections WHERE token_hash=?", [hash(token)]);
    if (!conn) fail("connection_required");
    await permit(conn.user_id);
    return conn;
  }
  function binding(conn, sessionId) {
    return { principal_id: conn.user_id, connection_id: conn.id, consent_revision: conn.consent_revision, session_id: sessionId };
  }
  function view(row) {
    let practiceAvailable=false;
    if(row.state==='completed'){
      try{practice.build(JSON.parse(row.context_json),row.question);practiceAvailable=true;}
      catch(e){if(e.code!=='practice_unavailable')throw e;}
    }
    return { id: row.id, version: row.version, state: row.state, error: row.error_code || null,
      practice_available:practiceAvailable && row.proposal_state!=='dismissed',
      practice_proposal_state:row.proposal_state||null,
      expires_at: row.expires_at, context: JSON.parse(row.context_json), question: row.question, result: row.result_json ? JSON.parse(row.result_json) : null };
  }
  async function owned(userId, id) {
    const row = await get("SELECT s.*,p.proposal_state FROM tutor_sessions s LEFT JOIN tutor_practice p ON p.session_id=s.id WHERE s.user_id=? AND s.id=?", [String(userId), id]);
    if (!row) fail("context_unavailable");
    const conn = await connectionForUser(userId);
    if (!conn || conn.id !== row.connection_id) fail("connection_required");
    assertContextAccess(JSON.parse(row.context_json), binding(conn, id), clock());
    return row;
  }
  return {
    sweep: () => transaction(sweep),
    enroll: input => transaction(async()=>{
      closed(input,["client_nonce","device_name"]);
      if(typeof input.client_nonce!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(input.client_nonce)||typeof input.device_name!=="string"||input.device_name.length<1||input.device_name.length>64||/[\x00-\x1f\x7f]/.test(input.device_name))fail("invalid_request");
      await sweep();
      const count=await get("SELECT count(*) AS n FROM tutor_enrollments");if(count.n>=100)fail("session_limit");
      const device=secret(),code=randomBytes(9).toString("hex"),expires=clock()+300000;
      await run("INSERT INTO tutor_enrollments(device_hash,code_hash,client_nonce,device_name,expires_at) VALUES(?,?,?,?,?)",[hash(device),hash(code),input.client_nonce,input.device_name,expires]);
      return {device_code:device,user_code:code,expires_at:expires,interval:3};
    }),
    enrollment: (userId,input,approve=false)=>transaction(async()=>{
      await permit(userId);closed(input,["user_code"]);
      if(typeof input.user_code!=="string"||!/^[a-f0-9]{18}$/.test(input.user_code))fail("pairing_expired");
      await sweep();const row=await get("SELECT * FROM tutor_enrollments WHERE code_hash=?",[hash(input.user_code)]);
      if(!row||row.user_id&&row.user_id!==String(userId))fail("pairing_expired");
      if(approve&&!row.user_id)await run("UPDATE tutor_enrollments SET user_id=?,approved_at=? WHERE code_hash=?",[String(userId),clock(),row.code_hash]);
      return {device_name:row.device_name,expires_at:row.expires_at,approved:approve||!!row.user_id};
    }),
    enrollmentPoll: input=>transaction(async()=>{
      closed(input,["device_code","client_nonce"]);
      if(![input.device_code,input.client_nonce].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v)))fail("pairing_expired");
      await sweep();const row=await get("SELECT * FROM tutor_enrollments WHERE device_hash=?",[hash(input.device_code)]);
      if(!row||row.client_nonce!==input.client_nonce)fail("pairing_expired");
      if(clock()-row.poll_at<2500)fail("slow_down");
      await run("UPDATE tutor_enrollments SET poll_at=? WHERE device_hash=?",[clock(),row.device_hash]);
      if(!row.user_id)return {pending:true};
      await permit(row.user_id);
      const token=secret(),id=randomUUID();
      await run("DELETE FROM tutor_connections WHERE user_id=?",[row.user_id]);
      await run("DELETE FROM tutor_pairings WHERE user_id=?",[row.user_id]);
      await run("DELETE FROM tutor_enrollments WHERE device_hash=?",[row.device_hash]);
      await run("INSERT INTO tutor_connections(id,user_id,token_hash,consent_revision,created_at,last_seen) VALUES(?,?,?,?,?,?)",[id,row.user_id,hash(token),randomUUID(),clock(),0]);
      return {connection_id:id,token,client_nonce:input.client_nonce};
    }),
    pair: userId => transaction(async () => {
      await permit(userId);
      await sweep();
      const code = secret(), expires_at = clock() + 300000;
      await run("INSERT INTO tutor_pairings(user_id,code_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at", [String(userId), hash(code), expires_at]);
      return { pairing_code: code, expires_at };
    }),
    claim: input => transaction(async () => {
      closed(input, ["pairing_code", "client_nonce"]);
      if (![input.pairing_code, input.client_nonce].every(v => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v))) fail("invalid_request");
      await sweep();
      const pair = await get("SELECT * FROM tutor_pairings WHERE code_hash=?", [hash(input.pairing_code)]);
      if (!pair) fail("pairing_expired");
      await permit(pair.user_id);
      const token = secret(), id = randomUUID();
      // Atomic single-use claim; replacement revokes old jobs and credentials by cascade.
      await run("DELETE FROM tutor_connections WHERE user_id=?", [pair.user_id]);
      await run("DELETE FROM tutor_pairings WHERE user_id=?", [pair.user_id]);
      await run("INSERT INTO tutor_connections(id,user_id,token_hash,consent_revision,created_at,last_seen) VALUES(?,?,?,?,?,?)", [id, pair.user_id, hash(token), randomUUID(), clock(), 0]);
      return { connection_id: id, token, client_nonce: input.client_nonce };
    }),
    status: userId => transaction(async () => {
      await sweep(); const c = await connectionForUser(userId);
      return c ? { connection_id: c.id, status: c.last_seen > 0 && clock() - c.last_seen < ONLINE_MS ? "online" : "agent_offline" } : { status: "connection_required" };
    }),
    revoke: userId => transaction(async () => {
      await permit(userId);
      await run("DELETE FROM tutor_enrollments WHERE user_id=?", [String(userId)]);
      await run("DELETE FROM tutor_connections WHERE user_id=?", [String(userId)]);
      await run("DELETE FROM tutor_pairings WHERE user_id=?", [String(userId)]);
      return { revoked: true };
    }),
    create: (userId, input) => transaction(async () => {
      closed(input, ["connection_id", "request_key", "context", "question", "consent"]);
      if (input.consent !== "selected_fragment_v1" || typeof input.question !== "string" || !input.question.trim() || input.question.length > 1000 ||
          typeof input.request_key !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(input.request_key)) fail("invalid_request");
      // Both local text and exact caption windows are browser snapshots, not server-verified corpus authority.
      if (!["local_snapshot", "caption"].includes(input.context?.source?.kind)) fail("invalid_context");
      await sweep(); const conn = await connectionForUser(userId);
      if (!conn || conn.id !== input.connection_id) fail("connection_required");
      const requestHash = hash(JSON.stringify(input));
      const prior = await get("SELECT * FROM tutor_sessions WHERE user_id=? AND request_key=?", [String(userId), input.request_key]);
      if (prior) {
        if (prior.request_hash !== requestHash) fail("request_conflict");
        return view(await owned(userId, prior.id));
      }
      if (!conn.last_seen || clock() - conn.last_seen >= ONLINE_MS) fail("agent_offline");
      const active = await get("SELECT count(*) AS n FROM tutor_sessions WHERE connection_id=? AND state IN ('queued','running')", [conn.id]);
      if (active.n) fail("session_busy");
      const count = await get("SELECT count(*) AS n FROM tutor_sessions WHERE user_id=?", [String(userId)]);
      if (count.n >= 30) fail("session_limit");
      const id = randomUUID(), context = createContext(input.context, binding(conn, id), clock());
      await run("INSERT INTO tutor_sessions(id,user_id,connection_id,request_key,request_hash,context_json,question,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'queued',?,?)",
        [id, String(userId), conn.id, input.request_key, requestHash, JSON.stringify(context), input.question, clock(), context.expires_at]);
      return view(await owned(userId, id));
    }),
    read: (userId, id) => transaction(async () => { await sweep(); return view(await owned(userId, id)); }),
    cancel: (userId, id) => transaction(async () => {
      await sweep(); await owned(userId, id);
      await run("UPDATE tutor_sessions SET state='cancelled',version=version+1 WHERE id=? AND state IN ('queued','running')", [id]);
      return view(await owned(userId, id));
    }),
    practice: (userId, id) => transaction(async () => {
      await sweep(); const session=await owned(userId,id);
      if(session.state!=="completed")fail("practice_unavailable");
      let row=await get("SELECT * FROM tutor_practice WHERE session_id=?",[id]);
      if(!row){
        const challenge=practice.build(JSON.parse(session.context_json),session.question);
        await run("INSERT INTO tutor_practice(session_id,challenge_json,proposal_state) VALUES(?,?,'proposed')",[id,JSON.stringify(challenge)]);
        row=await get("SELECT * FROM tutor_practice WHERE session_id=?",[id]);
      }
      if(row.proposal_state==='dismissed')fail('practice_dismissed');
      if(row.proposal_state==='proposed'){
        await run("UPDATE tutor_practice SET proposal_state='accepted' WHERE session_id=? AND proposal_state='proposed'",[id]);
        row.proposal_state='accepted';
      }
      return {practice:practice.descriptor(row)};
    }),
    practiceDecision: (userId,id,action)=>transaction(async()=>{
      if(!['cancel','dismiss'].includes(action))fail('invalid_request');
      await sweep();await owned(userId,id);
      const row=await get("SELECT * FROM tutor_practice WHERE session_id=?",[id]);
      if(!row)fail('practice_unavailable');
      if(row.proposal_state==='completed')fail('attempt_closed');
      if(row.proposal_state==='dismissed')return {proposal_state:'dismissed'};
      const next=action==='dismiss'?'dismissed':'proposed';
      if(row.proposal_state!==next)await run("UPDATE tutor_practice SET proposal_state=? WHERE session_id=?",[next,id]);
      return {proposal_state:next};
    }),
    practiceHint: (userId,id) => transaction(async()=>{
      await sweep();await owned(userId,id);
      const row=await get("SELECT * FROM tutor_practice WHERE session_id=?",[id]);
      if(!row||!['accepted','completed'].includes(row.proposal_state))fail("practice_unavailable");
      // A result already exists: never rewrite its provenance after the attempt.
      if(!row.receipt_json){await run("UPDATE tutor_practice SET hint_seen=1 WHERE session_id=?",[id]);row.hint_seen=1;}
      return {practice:practice.descriptor(row)};
    }),
    practiceAttempt: (userId,id,input) => transaction(async()=>{
      closed(input,["answer","skipped","attempt_key"]);
      if(typeof input.answer!=="string"||input.answer.length>160||typeof input.skipped!=="boolean"||
         (!input.skipped&&!input.answer.trim())||typeof input.attempt_key!=="string"||!/^[A-Za-z0-9_-]{16,80}$/.test(input.attempt_key))fail("invalid_request");
      await sweep();await owned(userId,id);
      const row=await get("SELECT * FROM tutor_practice WHERE session_id=?",[id]);
      if(!row||!['accepted','completed'].includes(row.proposal_state))fail("practice_unavailable");
      const attemptHash=hash(JSON.stringify(input));
      if(row.receipt_json){
        if(row.attempt_key!==input.attempt_key||row.attempt_hash!==attemptHash)fail("attempt_closed");
        return {practice:practice.descriptor(row)};
      }
      const receipt=practice.evaluate(JSON.parse(row.challenge_json),input,row.hint_seen);
      await run("UPDATE tutor_practice SET attempt_key=?,attempt_hash=?,receipt_json=?,proposal_state='completed' WHERE session_id=?",[input.attempt_key,attemptHash,JSON.stringify(receipt),id]);
      row.receipt_json=JSON.stringify(receipt);
      row.proposal_state='completed';
      return {practice:practice.descriptor(row)};
    }),
    revokeConnector: token=>transaction(async()=>{
      const conn=await authenticate(token);
      await run("DELETE FROM tutor_connections WHERE id=?",[conn.id]);
      await run("DELETE FROM tutor_pairings WHERE user_id=?",[conn.user_id]);
      await run("DELETE FROM tutor_enrollments WHERE user_id=?",[conn.user_id]);
      return {revoked:true};
    }),
    next: token => transaction(async () => {
      await sweep(); const conn = await authenticate(token);
      await run("UPDATE tutor_connections SET last_seen=? WHERE id=?", [clock(), conn.id]);
      const active = await get("SELECT id FROM tutor_sessions WHERE connection_id=? AND state='running'", [conn.id]);
      if (active) return { job: null }; // never re-execute an uncertain inference after disconnect.
      const row = await get("SELECT * FROM tutor_sessions WHERE connection_id=? AND state='queued' ORDER BY created_at LIMIT 1", [conn.id]);
      if (!row) return { job: null };
      const context = assertContextAccess(JSON.parse(row.context_json), binding(conn, row.id), clock());
      const lease = secret();
      await run("UPDATE tutor_sessions SET state='running',version=version+1,lease_hash=?,lease_until=?,run_deadline=? WHERE id=?", [hash(lease), clock() + LEASE_MS, clock() + RUN_MS, row.id]);
      // Never deliver principal metadata to the model. Connector receives only these fields.
      const { principal_binding, consent_snapshot_ref, ...publicContext } = context;
      return { job: { session_id: row.id, lease, context: publicContext, question: row.question, deadline: clock() + RUN_MS } };
    }),
    heartbeat: (token, id, lease) => transaction(async () => {
      await sweep(); const conn = await authenticate(token);
      const row = await owned(conn.user_id, id);
      if (row.lease_hash !== hash(String(lease))) fail("lease_invalid");
      await run("UPDATE tutor_connections SET last_seen=? WHERE id=?", [clock(), conn.id]);
      if (row.state === "running") await run("UPDATE tutor_sessions SET lease_until=? WHERE id=?", [clock() + LEASE_MS, id]);
      return { state: row.state };
    }),
    complete: (token, id, lease, output) => transaction(async () => {
      await sweep(); const conn = await authenticate(token); const row = await owned(conn.user_id, id);
      if (row.lease_hash !== hash(String(lease))) fail("lease_invalid");
      const response = validateResponse(output, JSON.parse(row.context_json));
      const resultHash = hash(JSON.stringify(response));
      if (row.result_hash === resultHash) return { accepted: true, state: row.state };
      if (row.state !== "running") fail("result_rejected");
      const state = response.error ? "failed" : "completed";
      await run("UPDATE tutor_sessions SET state=?,version=version+1,result_json=?,result_hash=?,error_code=? WHERE id=?", [state, JSON.stringify(response), resultHash, response.error || null, id]);
      if(state==='completed'){
        try{
          const challenge=practice.build(JSON.parse(row.context_json),row.question);
          await run("INSERT OR IGNORE INTO tutor_practice(session_id,challenge_json,proposal_state) VALUES(?,?,'proposed')",[id,JSON.stringify(challenge)]);
        }catch(e){if(e.code!=='practice_unavailable')throw e;}
      }
      return { accepted: true, state };
    }),
  };
}
module.exports = { createStore, ONLINE_MS, LEASE_MS, RUN_MS };
