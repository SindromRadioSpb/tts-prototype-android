#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path");
const C=require("../../agent/evidence/contracts"),runtime=require("../../agent/evidence/runtime"),registry=require("../../agent/controlPlane/scenarioRegistry");
assert.equal(C.CONSTRUCTS.B1,"UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION");assert.equal(C.CONSTRUCTS.B2,"READING_TO_NEW_CONTEXT_TRANSFER");
for(const f of ["F2_SHADOW_ENABLED","F2_SHADOW_B1_ENABLED","F2_SHADOW_B2_ENABLED","F2_SHADOW_CONTEXT_USE_ENABLED","F2_SHADOW_PLANNER_HANDOFF_ENABLED","F2_SHADOW_EXTERNAL_EVALUATOR_ENABLED"]){delete process.env[f];assert.equal(runtime.baseAccess("x").error,"F2_DISABLED");}
for(const bad of ["*","owner-1,,owner-2","owner 1"]){process.env.F2_SHADOW_OWNER_IDS=bad;assert.throws(()=>runtime.validateStartupConfig(),/F2_BAD_OWNER_ALLOWLIST/);}process.env.F2_SHADOW_OWNER_IDS="owner-1,owner_2";assert.equal(runtime.validateStartupConfig(),true);delete process.env.F2_SHADOW_OWNER_IDS;
const evalSrc=fs.readFileSync(path.resolve(__dirname,"../../agent/evidence/evaluators.js"),"utf8");for(const bad of ["reviewer","planner","llmGate","shadowReducer","f2EvidenceRepo"]){assert(!new RegExp(`require\\([^)]*${bad}`).test(evalSrc),`forbidden evaluator dependency: ${bad}`);}for(const bad of ["fetch(","http.request","https.request"]){assert(!evalSrc.includes(bad),`forbidden evaluator call: ${bad}`);}
const serverSrc=fs.readFileSync(path.resolve(__dirname,"../../server.js"),"utf8");assert(serverSrc.includes('/api/agent/evidence/:id/audio'));assert(serverSrc.includes('evidenceRuntime.audio'));
for(const id of ["evidence.scan","evidence.manage","evidence.attempt","evidence.context_offer","evidence.handoff_preview","evidence.export","evidence.delete"]){assert(registry.get(id),`missing scenario ${id}`);}
console.log("f2-contract-smoke: ok");
