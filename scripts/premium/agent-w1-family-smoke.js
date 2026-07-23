#!/usr/bin/env node
"use strict";

const assert = require("assert");
const T = require("./lib/cp0-test-db");
const contracts = require("../../agent/access/contracts");
const proposals = require("../../db/agentProposalsRepo");
const tickets = require("../../db/agentProposalTicketsRepo");
const goals = require("../../db/weeklyGoalsRepo");

const AT = "2026-07-23T12:00:00.000Z";
async function code(fn, expected) { try { await fn(); assert.fail(`expected ${expected}`); } catch (e) { assert.strictEqual(e.code || e.message, expected); } }

(async()=>{
  const ctx=await T.setup("cp0-h23"); let checks=0;
  try{
    await ctx.run(`INSERT INTO agent_oauth_clients (oauth_client_id,display_name,software_id,software_version,client_type,redirect_uris_json,status,registration_version,created_at,updated_at)
      VALUES ('h','Hermes','h','1','PUBLIC','["https://example.invalid/cb"]','ACTIVE','1',?,?)`,[AT,AT]);
    await ctx.run(`INSERT INTO agent_connections (connection_id,user_id,oauth_client_id,display_label,status,consent_version,capability_version,retention_notice_version,created_at,activated_at,updated_at)
      VALUES ('c','u1','h','Hermes','ACTIVE','v','aa-v0.1','v',?,?,?)`,[AT,AT,AT]);

    const importArgs={source:{title:"שיר",origin:"OWNER_SUPPLIED"},body_preview:"שלום\nעולם",language:"he",niqqud_status:"NONE",reason:"לימוד"};
    contracts.validateInput("propose_import_text",importArgs); checks++;
    await code(()=>Promise.resolve(contracts.validateInput("propose_import_text",{...importArgs,source:{title:"x",origin:"LRCLIB"}})),"AA_INVALID_INPUT");checks++;
    await code(()=>Promise.resolve(contracts.validateInput("propose_import_text",{...importArgs,body_preview:"א".repeat(4001)})),"AA_INVALID_INPUT");checks++;
    await code(()=>Promise.resolve(contracts.validateInput("propose_track_word",{items:Array.from({length:11},()=>({surface:"מילה",evidence:"USER_ASKED_ABOUT",reason:"r"}))})),"AA_INVALID_INPUT");checks++;
    const nonHeb=contracts.validateInput("propose_track_word",{items:[{surface:"junk",evidence:"USER_ASKED_ABOUT",reason:"r"}]});assert.strictEqual(nonHeb.items[0].surface,"junk");checks++;
    await code(()=>Promise.resolve(contracts.validateInput("propose_goal",{statement:"x",goal_type:"PROCESS",period_days:6,reason:"r"})),"AA_INVALID_INPUT");checks++;
    assert.strictEqual((await goals.getCurrent("u1")),null);checks++;

    const imp=await proposals.create("u1",{oauthClientId:"h",connectionId:"c",kind:"import_text",payload:importArgs,displayTitle:"שיר",nowIso:AT});
    const imp2=await proposals.create("u1",{oauthClientId:"h",connectionId:"c",kind:"import_text",payload:importArgs,displayTitle:"שיר",nowIso:AT});
    assert.strictEqual(imp2.proposal_id,imp.proposal_id);assert.strictEqual(imp2.reused,true);assert.strictEqual(imp.expires_at,"2026-08-06T12:00:00.000Z");checks+=3;
    const impRow=await proposals.getPending("u1",imp.proposal_id,{nowIso:AT});
    const it=await tickets.issue("u1",impRow,0,Date.parse(AT));assert.strictEqual(it.action.type,"IMPORT_TEXT");assert.ok(it.action.provenance.includes(imp.proposal_id));checks+=2;
    const consumed=await tickets.consume("u1",imp.proposal_id,it.ticket,it.action_digest,{type:"IMPORT_TEXT",text_key:it.action.text_key,rows_written:2},1,Date.parse(AT)+1000);assert.strictEqual(consumed.complete,true);checks++;
    assert.strictEqual((await tickets.state("u1",imp.proposal_id))[0].consumed_at!=null,true);checks++;
    await code(()=>tickets.issue("u1",impRow,0,Date.parse(AT)+2000),"AA_PROPOSAL_ITEM_ALREADY_EXECUTED");checks++;
    await code(()=>proposals.getPending("u1",imp.proposal_id,{nowIso:"2026-07-23T12:00:03.000Z"}),"AA_PROPOSAL_NOT_PENDING");checks++;

    const trackPayload={items:[{surface:"מילה",evidence:"USER_ASKED_ABOUT",reason:"r",item_key:"lp_lemma_123"},{surface:"zzz",evidence:"AGENT_SHOWN_ONLY",reason:"r",item_key:null}]};
    const tr=await proposals.create("u1",{oauthClientId:"h",connectionId:"c",kind:"track_word",payload:trackPayload,nowIso:AT});
    const trRow=await proposals.getPending("u1",tr.proposal_id,{nowIso:AT});const tt=await tickets.issue("u1",trRow,0,Date.parse(AT));
    assert.deepStrictEqual({type:tt.action.type,item_key:tt.action.item_key,status:tt.action.status},{type:"TRACK_WORD",item_key:"lp_lemma_123",status:"new"});checks++;
    await code(()=>tickets.issue("u1",trRow,1,Date.parse(AT)),"AA_PROPOSAL_ITEM_NOT_EXECUTABLE");checks++;
    await proposals.decide("u1",tr.proposal_id,"REJECTED",{nowIso:AT});await code(()=>proposals.getPending("u1",tr.proposal_id,{nowIso:AT}),"AA_PROPOSAL_NOT_PENDING");checks++;

    const gp={statement:"Read ten minutes",goal_type:"PROCESS",anchor:"after coffee",period_days:7,reason:"reflection"};
    const g=await proposals.create("u1",{oauthClientId:"h",connectionId:"c",kind:"goal",payload:gp,nowIso:AT});const gr=await proposals.getPending("u1",g.proposal_id,{nowIso:AT});
    const stored=await goals.createFromProposal("u1",gr,AT);assert.strictEqual(stored.source,"AGENT_PROPOSED_OWNER_CONFIRMED");assert.strictEqual(stored.status,"ACTIVE");checks+=2;
    await proposals.decide("u1",g.proposal_id,"CONFIRMED",{nowIso:AT});const current=await goals.getCurrent("u1");assert.strictEqual(current.statement,gp.statement);checks++;
    await goals.close("u1",current.id,"COMPLETED_SELF_REPORT");assert.strictEqual(await goals.getCurrent("u1"),null);checks++;
    await goals.remove("u1",current.id);checks++;

    const old=await proposals.create("u1",{oauthClientId:"h",connectionId:"c",kind:"goal",payload:{...gp,statement:"old"},nowIso:"2026-06-01T00:00:00.000Z"});
    const pending=await proposals.listPending("u1",{nowIso:"2026-07-23T00:00:00.000Z"});assert.ok(!pending.some(x=>x.proposal_id===old.proposal_id));checks++;
    console.log(JSON.stringify({ok:true,checks,ttl_days:14,browser_ticket_ttl_minutes:5,server_goal_store:true,opfs_writes:0,llm_calls:0,provider_calls:0}));
  }finally{await T.cleanup(ctx);}
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
