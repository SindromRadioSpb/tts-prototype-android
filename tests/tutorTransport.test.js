"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const sqlite3 = require("sqlite3");
const express = require("express");
const { createStore, LEASE_MS } = require("../agent/tutor/store");
const { installRoutes } = require("../agent/tutor/routes");
const nonce = "n".repeat(43);
const context = (surface = "studio") => ({ surface, locale: "ru", instructional_intent: "explain", source: {
  kind: "local_snapshot", material_id: "local:text1", revision_id: "snapshot:123", sentence_id: "row:1", excerpt: "כשהייתי ילד גרתי בחיפה",
} });
const request = conn => ({ connection_id: conn.connection_id, request_key: "request_key_00001", context: context(), question: "Почему הייתי?", consent: "selected_fragment_v1" });
const reply = job => ({ schema_version: "lp-tutor-response.1", context_id: job.context.context_id, excerpt_digest: job.context.excerpt_digest, text: "הייתי — я был." });
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code);
async function fixture(t) {
  const db = new sqlite3.Database(":memory:");
  await new Promise((r, j) => db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('A'),('B');" + fs.readFileSync("migrations/070_tutor_transport.sql", "utf8")+fs.readFileSync("migrations/071_tutor_practice.sql", "utf8"), e => e ? j(e) : r()));
  t.after(() => new Promise(resolve => db.close(resolve)));
  let now = 100000;
  const store = createStore(() => db, () => now);
  async function pair(user = "A") { const p = await store.pair(user); return store.claim({ pairing_code: p.pairing_code, client_nonce: nonce }); }
  return { db, store, pair, advance: delta => { now += delta; } };
}
test("two users: context delivery, results, cancellation and sessions are isolated", async t => {
  const { store, pair } = await fixture(t); const a = await pair(), b = await pair("B");
  await store.next(a.token); await store.next(b.token);
  const s = await store.create("A", request(a));
  assert.equal((await store.next(b.token)).job, null);
  await rejects(store.read("B", s.id), "context_unavailable");
  await rejects(store.cancel("B", s.id), "context_unavailable");
  const { job } = await store.next(a.token);
  assert.equal(job.context.source.excerpt, context().source.excerpt);
  assert.equal(job.context.principal_binding, undefined);
  await rejects(store.complete(b.token, s.id, job.lease, reply(job)), "context_unavailable");
  await store.complete(a.token, s.id, job.lease, reply(job));
  assert.equal((await store.read("A", s.id)).result.text, "הייתי — я был.");
});
test("pairing is single-use, expiring and stores hashes only", async t => {
  const { store, db, advance } = await fixture(t); const p = await store.pair("A");
  const c = await store.claim({ pairing_code: p.pairing_code, client_nonce: nonce });
  await rejects(store.claim({ pairing_code: p.pairing_code, client_nonce: nonce }), "pairing_expired");
  const row = await new Promise((r,j) => db.get("SELECT * FROM tutor_connections", (e,x) => e?j(e):r(x)));
  assert.equal(JSON.stringify(row).includes(c.token), false);
  const expired = await store.pair("B"); advance(300001);
  await rejects(store.claim({ pairing_code: expired.pairing_code, client_nonce: nonce }), "pairing_expired");
});
test("offline/busy, idempotency and immutable source survive reconnect", async t => {
  const { store, pair } = await fixture(t); const conn = await pair();
  await rejects(store.create("A", request(conn)), "agent_offline");
  await store.next(conn.token);
  const req = request(conn), first = await store.create("A", req);
  assert.equal((await store.create("A", req)).id, first.id);
  await rejects(store.create("A", { ...req, question: "Другая редакция" }), "request_conflict");
  await rejects(store.create("A", { ...req, request_key: "request_key_00002" }), "session_busy");
  req.context.source.excerpt = "injection";
  const { job } = await store.next(conn.token);
  assert.equal(job.context.source.excerpt, context().source.excerpt);
  assert.equal((await store.next(conn.token)).job, null);
  await store.complete(conn.token, first.id, job.lease, reply(job));
  assert.deepEqual(await store.complete(conn.token, first.id, job.lease, reply(job)), { accepted: true, state: "completed" });
  assert.equal((await store.read("A", first.id)).version, 3);
});
test("cancel, revoke, old lease and expired context reject late results", async t => {
  const { store, pair, advance } = await fixture(t); let conn = await pair(); await store.next(conn.token);
  let s = await store.create("A", request(conn)), { job } = await store.next(conn.token);
  await rejects(store.complete(conn.token,s.id,nonce,reply(job)), "lease_invalid");
  await store.cancel("A", s.id);
  assert.equal((await store.heartbeat(conn.token,s.id,job.lease)).state, "cancelled");
  await rejects(store.complete(conn.token,s.id,job.lease,reply(job)), "result_rejected");
  await store.revoke("A");
  await rejects(store.next(conn.token), "connection_required");
  await rejects(store.read("A",s.id), "context_unavailable");
  conn = await pair(); await store.next(conn.token);
  s = await store.create("A",request(conn)); job = (await store.next(conn.token)).job;
  advance(LEASE_MS + 1);
  await rejects(store.complete(conn.token,s.id,job.lease,reply(job)), "result_rejected");
  assert.equal((await store.read("A",s.id)).error, "agent_disconnected");
  advance(900001); await store.sweep();
  await rejects(store.read("A",s.id), "context_unavailable");
});
test("runtime output cannot create actions, grades, HTML execution or rebind context", async t => {
  const { store,pair } = await fixture(t); const conn=await pair(); await store.next(conn.token);
  const s=await store.create("A", request(conn)); const { job }=await store.next(conn.token);
  for (const patch of [{ grade: 5 }, { actions: [{type:"write"}] }, { context_id:"foreign" }, { excerpt_digest:"wrong" }, { text:"" }]) {
    await rejects(store.complete(conn.token,s.id,job.lease,{...reply(job),...patch}), "invalid_output");
  }
  // Text is display-only; UI must use textContent (verified by browser smoke).
  await store.complete(conn.token,s.id,job.lease,{...reply(job),text:'<img src=x onerror="alert(1)">'});
  assert.match((await store.read("A",s.id)).result.text,/onerror/);
});
test("HTTP boundary: disabled flag, cookie/CSRF, bearer, no-store, cursor and account switch", async t => {
  const { store }=await fixture(t); let enabled=false;
  const app=express(); app.use(express.json({limit:"40kb"}));
  installRoutes(app,{store,enabled:()=>enabled,limiter:(_q,_s,n)=>n(),
    requireUser:async(req,res)=>{const id=req.get("X-Test-User"); if(!["A","B"].includes(id)){res.status(401).json({error:"UNAUTHENTICATED"});return null;} return {user:{id},session:{csrf:"fixture"}};},
    requireCsrf:(req,res)=>{if(req.get("X-LP-CSRF")!=="fixture"){res.status(403).json({error:"BAD_CSRF"});return false;}return true;},
  });
  const server=await new Promise(r=>{const s=app.listen(0,"127.0.0.1",()=>r(s));});
  t.after(()=>new Promise(r=>server.close(r)));
  const root=`http://127.0.0.1:${server.address().port}/api/tutor`;
  const call=async(path,body,headers={})=>{const r=await fetch(root+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,cache:r.headers.get("cache-control"),data:await r.json()};};
  assert.equal((await call("/connection")).status,404); enabled=true;
  assert.equal((await call("/pair",{})).status,401);
  assert.equal((await call("/pair",{},{"X-Test-User":"A"})).status,403);
  const owner={"X-Test-User":"A","X-LP-CSRF":"fixture"};
  const p=await call("/pair",{},owner); assert.equal(p.cache,"no-store");
  const c=(await call("/connector/pair",{pairing_code:p.data.pairing_code,client_nonce:nonce})).data;
  assert.equal((await call("/connector/next",{},owner)).status,401);
  await call("/connector/next",{},{Authorization:`Bearer ${c.token}`});
  const s=(await call("/sessions",request(c),owner)).data;
  assert.equal((await call(`/sessions/${s.id}?since=1`,undefined,owner)).data.unchanged,true);
  assert.equal((await call(`/sessions/${s.id}`,undefined,{"X-Test-User":"B"})).status,404);
  const worker={Authorization:`Bearer ${c.token}`};
  const job=(await call("/connector/next",{},worker)).data.job;
  await call(`/connector/${s.id}/complete`,{lease:job.lease,response:reply(job)},worker);
  assert.equal((await call(`/sessions/${s.id}/practice`,{},{"X-Test-User":"A"})).status,403);
  assert.equal((await call(`/sessions/${s.id}/practice`,{},{"X-Test-User":"B","X-LP-CSRF":"fixture"})).status,404);
  const exercise=await call(`/sessions/${s.id}/practice`,{},owner);
  assert.equal(exercise.status,200);assert.equal(exercise.data.practice.expected,undefined);
  const attempt=await call(`/sessions/${s.id}/practice/attempt`,{answer:"כשהייתי",skipped:false,attempt_key:"http_attempt_0001"},owner);
  assert.equal(attempt.data.practice.receipt.outcome,"source_match");
  await call("/revoke",{},owner);
  assert.equal((await call("/connector/next",{},{Authorization:`Bearer ${c.token}`})).status,401);
});

test("SQLite restart retains result and never redelivers an uncertain run", async t => {
  const os=require('node:os'),path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-tutor-restart-'));
  const file=path.join(dir,'fixture.sqlite');let db=new sqlite3.Database(file);
  const close=()=>new Promise((r,j)=>db.close(e=>e?j(e):r()));
  t.after(async()=>{await close();fs.rmSync(dir,{recursive:true,force:true});});
  await new Promise((r,j)=>db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('A');"+fs.readFileSync('migrations/070_tutor_transport.sql','utf8')+fs.readFileSync('migrations/071_tutor_practice.sql','utf8'),e=>e?j(e):r()));
  let store=createStore(()=>db);const p=await store.pair('A');const c=await store.claim({pairing_code:p.pairing_code,client_nonce:nonce});
  await store.next(c.token);const s=await store.create('A',request(c));const {job}=await store.next(c.token);
  await close();db=new sqlite3.Database(file);store=createStore(()=>db);
  assert.equal((await store.next(c.token)).job,null);
  await store.complete(c.token,s.id,job.lease,reply(job));
  await close();db=new sqlite3.Database(file);store=createStore(()=>db);
  assert.equal((await store.read('A',s.id)).result.text,reply(job).text);
  assert.equal((await store.next(c.token)).job,null);
});

test("source recall: masked answer, exact-source comparison, hints, idempotency and no cross-user writes", async t=>{
 const {store,pair}=await fixture(t),c=await pair();await store.next(c.token);
 const s=await store.create('A',request(c));
 await rejects(store.practice('A',s.id),'practice_unavailable');
 const {job}=await store.next(c.token);await store.complete(c.token,s.id,job.lease,reply(job));
 const first=(await store.practice('A',s.id)).practice;
 assert.equal(first.expected,undefined);assert.equal(first.receipt,null);assert.equal(first.masked,'＿＿＿ ילד גרתי בחיפה');
 assert.equal((await store.practice('A',s.id)).practice.id,first.id);
 await rejects(store.practice('B',s.id),'context_unavailable');
 await rejects(store.practiceHint('B',s.id),'context_unavailable');
 const answer={answer:'כשהייתי',skipped:false,attempt_key:'m2_attempt_000001'};
 await rejects(store.practiceAttempt('B',s.id,answer),'context_unavailable');
 await rejects(store.practiceAttempt('A',s.id,{...answer,grade:5}),'invalid_output');
 const result=await store.practiceAttempt('A',s.id,answer);
 assert.equal(result.practice.receipt.outcome,'source_match');assert.equal(result.practice.receipt.hint_seen,false);
 assert.equal(result.practice.receipt.canonical_review_written,false);
 assert.deepEqual(await store.practiceAttempt('A',s.id,answer),result);
 await rejects(store.practiceAttempt('A',s.id,{...answer,answer:'היה'}),'attempt_closed');
 assert.deepEqual((await store.practiceHint('A',s.id)).practice.receipt,result.practice.receipt,'later hint cannot alter provenance');
 await store.revoke('A');await rejects(store.practice('A',s.id),'context_unavailable');
});

test("practice records help and expires with its original source",async t=>{
 const {store,pair,advance}=await fixture(t),c=await pair();await store.next(c.token);
 const s=await store.create('A',request(c)),{job}=await store.next(c.token);await store.complete(c.token,s.id,job.lease,reply(job));
 await store.practice('A',s.id);assert.equal((await store.practiceHint('A',s.id)).practice.expected,'כשהייתי');
 const result=await store.practiceAttempt('A',s.id,{answer:'כשהיה',skipped:false,attempt_key:'m2_attempt_000002'});
 assert.equal(result.practice.receipt.outcome,'source_diff');assert.equal(result.practice.receipt.hint_seen,true);
 advance(900001);await rejects(store.practiceAttempt('A',s.id,{answer:'כשהייתי',skipped:false,attempt_key:'m2_attempt_000003'}),'context_unavailable');
});

test("practice source checker ignores only niqqud, masks repeats, never claims semantic correctness",()=>{
 const {build,evaluate}=require('../agent/tutor/practice');
 const ctx={context_id:'c',excerpt_digest:'d',source:{excerpt:'שָׁלוֹם חבר שלום לך',revision_id:'r'}};
 const c=build(ctx,'שלום');assert.equal(c.masked,'＿＿＿ חבר ＿＿＿ לך');
 assert.equal(evaluate(c,{answer:'שלום',skipped:false},false).outcome,'source_match');
 assert.equal(evaluate(c,{answer:'שלומ',skipped:false},false).outcome,'source_diff');
 assert.equal(evaluate(c,{answer:'',skipped:true},true).outcome,'skipped');
 assert.throws(()=>build({...ctx,source:{...ctx.source,excerpt:'שלום'}},''),e=>e.code==='practice_unavailable');
 assert.throws(()=>build({...ctx,source:{...ctx.source,excerpt:'א'.repeat(601)}},''),e=>e.code==='practice_unavailable');
});
