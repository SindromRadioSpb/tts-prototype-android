#!/usr/bin/env node
"use strict";
process.env.CP0_OBSERVER_ENABLED="1";process.env.CP0_OBSERVER_OWNER_IDS="u1";const cp0=require("../../agent/controlPlane/observer");let calls=0;cp0._openCircuit("FIXTURE_FAILURE");
(async()=>{const exact={ok:true,marker:"live-path-survived"};const out=await cp0.observe({userId:"u1",surface:"pwa"},{scenarioId:"agent.plan"},async()=>{calls++;return exact;});if(calls!==1||out!==exact||!cp0.snapshot().circuit_open)throw new Error("fail-open circuit behavior failed");console.log(JSON.stringify({ok:true,live_calls:calls,circuit_open:true,output_unchanged:true}));})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
