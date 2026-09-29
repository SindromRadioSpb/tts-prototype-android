"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const sqlite3 = require("sqlite3");
const { createStore } = require("../agent/tutor/store");
const { createTutorMcpStore, CONSENT_VERSION, SCOPES } = require("../agent/access/tutorMcpStore");
const { validateInput, validateOutput } = require("../agent/access/contracts");

const dbExec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const dbRun = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
const rejects = (promise, code) => assert.rejects(promise, error => error?.code === code);

test("one explicit handoff gates four MCP operations by owner, connection, consent and expiry", async t => {
  const db = new sqlite3.Database(":memory:");
  t.after(() => new Promise(resolve => db.close(resolve)));
  await dbExec(db, `PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('A'),('B');
    CREATE TABLE consent_records(id TEXT PRIMARY KEY);
    CREATE TABLE agent_connections(connection_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE agent_connection_grants(grant_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,connection_id TEXT NOT NULL,
      scope TEXT NOT NULL,status TEXT NOT NULL,consent_record_id TEXT NOT NULL,consent_version TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revoked_at TEXT,UNIQUE(connection_id,scope));
    ${[70,71,72,73,74].map(n => fs.readFileSync(`migrations/${String(n).padStart(3,"0")}_${({70:"tutor_transport",71:"tutor_practice",72:"tutor_onboarding",73:"tutor_practice_proposals",74:"tutor_conversation"})[n]}.sql`, "utf8")).join("\n")}
    ${fs.readFileSync("migrations/075_tutor_agent_access.sql", "utf8")}`);
  await dbRun(db, `INSERT INTO agent_connections VALUES('aa-A','A','ACTIVE'),('aa-B','B','ACTIVE')`);
  let clock = 100000;
  const grants = new Map([['A', SCOPES.map(scope => ({scope,status:'ACTIVE',consent_version:CONSENT_VERSION}))],
    ['B', SCOPES.map(scope => ({scope,status:'ACTIVE',consent_version:CONSENT_VERSION}))]]);
  const oauthRepo = { loadConnection: async (user, connection) => {
    if (connection !== `aa-${user}`) throw Error("not found");
    return { user_id:user, connection_id:connection, status:'ACTIVE', grants:grants.get(user) };
  } };
  const saved = [];
  const proposalsRepo = { create: async (user, payload) => { saved.push({user,payload}); return {proposal_id:'proposal-1',status:'PENDING',expires_at:new Date(clock+86400000).toISOString()}; } };
  const mcp = createTutorMcpStore({getDb:()=>db,oauthRepo,proposalsRepo,now:()=>clock});
  const tutor = createStore(()=>db,()=>clock);
  const pair = await tutor.pair('A');
  const connection = await tutor.claim({pairing_code:pair.pairing_code,client_nonce:'n'.repeat(43)});
  await tutor.next(connection.token);
  const session = await tutor.create('A',{connection_id:connection.connection_id,request_key:'request-key-00001',consent:'selected_fragment_v1',
    question:'Почему эта форма?',context:{surface:'room',locale:'ru',instructional_intent:'explain',source:{kind:'local_snapshot',material_id:'material-1',revision_id:'revision-1',sentence_id:'sentence-1',excerpt:'שלום'}}});
  const job = (await tutor.next(connection.token)).job;
  await tutor.complete(connection.token,session.id,job.lease,{schema_version:'lp-tutor-response.1',context_id:job.context.context_id,excerpt_digest:job.context.excerpt_digest,text:'Потому что так построено предложение.'});
  const principal = {user_id:'A',connection_id:'aa-A',oauth_client_id:'hermes',request_id:'request-1'};
  const issued = await mcp.issue('A','aa-A',session.id);
  assert.equal((await mcp.issue('A','aa-A',session.id)).context_id,issued.context_id);
  await rejects(mcp.issue('B','aa-B',session.id),'AA_TUTOR_SESSION_UNAVAILABLE');
  await rejects(mcp.context({...principal,user_id:'B',connection_id:'aa-B'},issued.context_id),'AA_TUTOR_HANDOFF_UNAVAILABLE');
  const c = await mcp.context(principal,issued.context_id);
  assert.equal(c.source.excerpt,'שלום');
  assert.equal(c.source.revision_id,'revision-1');
  validateOutput('get_active_learning_context',c);
  const result = await mcp.session(principal,session.id);
  assert.equal(result.answer,'Потому что так построено предложение.');
  validateOutput('get_tutor_session',result);
  const caps = await mcp.capabilities(principal);
  validateOutput('get_tutor_capabilities',caps);
  const input = validateInput('propose_learning_artifact',{session_id:session.id,idempotency_key:'unique-key-000001',kind:'note',title:'О форме',body:'Разбор формы',source_digest:c.excerpt_digest});
  const proposed = await mcp.propose(principal,input);
  validateOutput('propose_learning_artifact',proposed);
  assert.equal(saved[0].payload.payload.context_id,issued.context_id);
  await rejects(mcp.propose(principal,{...input,source_digest:'a'.repeat(64)}),'AA_TUTOR_SOURCE_CHANGED');
  grants.set('A',SCOPES.map(scope=>({scope,status:'ACTIVE',consent_version:'agent-access-consent-v5'})));
  await rejects(mcp.context(principal,issued.context_id),'AA_TUTOR_SCOPE_REQUIRED');
  grants.set('A',SCOPES.map(scope=>({scope,status:'ACTIVE',consent_version:CONSENT_VERSION})));
  clock += 15*60*1000;
  await rejects(mcp.context(principal,issued.context_id),'AA_TUTOR_HANDOFF_UNAVAILABLE');
});
