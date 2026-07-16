#!/usr/bin/env node
"use strict";
process.env.F1_MEMORY_ENABLED="1";process.env.F1_MEMORY_OWNER_IDS="u1";process.env.F1_MEMORY_DIGEST_SECRET="f1-contract-secret-0123456789";
const dbh=require("./lib/cp0-test-db");const runtime=require("../../agent/memory/runtime");const C=require("../../agent/memory/contracts");const registry=require("../../agent/controlPlane/scenarioRegistry");
(async()=>{const ctx=await dbh.setup("cp0-f1-contract");try{
  await ctx.run(`INSERT INTO consent_records (id,user_id,consent_key,granted,consent_version) VALUES ('c1','u1','mentor_memory_store',1,'f1-v1')`);
  const before=await ctx.get(`SELECT COUNT(*) c FROM review_log WHERE user_id='u1'`);
  const out=await runtime.create({userId:"u1",surface:"pwa"},{kind:"declared_goal",payload:{goal_code:"READ_MORE",text:"Read one story"}});if(!out.ok||out.item.status!=="ACTIVE"||out.item.authority_class!=="USER_DECLARED")throw new Error("direct goal contract");
  const list=await runtime.list({userId:"u1",surface:"pwa"},{status:"ACTIVE"});if(!list.ok||list.items.length!==1||list.items[0].payload.text!=="Read one story")throw new Error("list contract");
  let bad=false;try{C.validatePayload("declared_goal",{goal_code:"READ_MORE",evil:1});}catch(e){bad=e.message==="BAD_GOAL_PAYLOAD_FIELD";}if(!bad)throw new Error("unknown payload field accepted");
  bad=false;try{await runtime.create({userId:"u1",surface:"pwa"},{kind:"declared_goal",payload:{goal_code:"READ_MORE"},evil:1});}catch(e){bad=e.message==="BAD_MEMORY_INPUT_FIELD";}if(!bad)throw new Error("unknown mutation field accepted");
  bad=false;try{await runtime.action({userId:"u1",surface:"pwa"},out.item.id,{action:"SUPPRESS"});}catch(e){bad=e.message==="STATE_CONFLICT";}if(!bad)throw new Error("revision precondition optional");
  const foreign=await runtime.list({userId:"u2",surface:"pwa"},{});if(foreign.error!=="F1_NOT_ALLOWLISTED")throw new Error("allowlist gate");
  for(const id of ["memory.manage","memory.propose","memory.context_continue","memory.export","memory.delete"])if(!registry.get(id))throw new Error("missing registry "+id);
  const after=await ctx.get(`SELECT COUNT(*) c FROM review_log WHERE user_id='u1'`);if(before.c!==after.c)throw new Error("review_log changed");
  const cp=await ctx.get(`SELECT COUNT(*) c FROM cp0_observations`);if(cp.c!==0)throw new Error("CP0 unexpectedly enabled");
  console.log("smoke:f1 contract OK — closed schemas · direct goal · exact owner allowlist · five CP0 registry scenarios · zero canonical write · CP0 off");
}finally{await dbh.cleanup(ctx);}})().catch(e=>{console.error(e.stack||e);process.exit(1);});
