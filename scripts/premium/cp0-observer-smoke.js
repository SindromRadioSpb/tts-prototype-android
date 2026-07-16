#!/usr/bin/env node
"use strict";
process.env.CP0_OBSERVER_ENABLED="1";process.env.CP0_OBSERVER_OWNER_IDS="u1";
const dbh=require("./lib/cp0-test-db"),cp0=require("../../agent/controlPlane/observer"),repo=require("../../db/cp0ObservationRepo");
(async()=>{const ctx=await dbh.setup("cp0-observer");try{const sentinel="CP0_HE_שלום_RU_секрет_EN_secret_AQ.fake";
  const out=await cp0.observe({userId:"u1",surface:"pwa"},{scenarioId:"agent.plan"},async()=>{cp0.noteCapability("tool:get_due_words");cp0.noteConsent("AGENT_READ_TEXTS_GRANTED");cp0.noteArtifact("mentor.plan_task.v1","at_fixture","DERIVED_HISTORY");return{ok:true,text:sentinel};});
  if(out.text!==sentinel)throw new Error("observer changed live output");await cp0.shutdownForEvidence();const rows=await repo.listForUser("u1");
  if(rows.length!==2||rows[0].record_kind!=="RUN_STARTED"||rows[1].record_kind!=="RUN_TERMINAL")throw new Error("expected start+terminal");
  if(rows.some(r=>JSON.stringify(r).includes(sentinel)))throw new Error("content sentinel leaked");const terminal=rows.find(r=>r.record_kind==="RUN_TERMINAL");
  if(terminal.shadow_decision!=="ALLOW"||terminal.live_outcome_code!=="OK")throw new Error("bad terminal classification");if((await repo.listForUser("u2")).length)throw new Error("cross-user leak");
  const snap=cp0.snapshot();if(snap.stats.eligible_runs_total!==1||snap.stats.start_persisted_total!==1||snap.stats.terminal_persisted_total!==1)throw new Error("bad denominator");
  console.log(JSON.stringify({ok:true,rows:rows.length,stats:snap.stats,sentinel_leaks:0}));}finally{await dbh.cleanup(ctx);}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
