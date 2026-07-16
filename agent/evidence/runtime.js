"use strict";
const repo=require("../../db/f2EvidenceRepo");
const corpus=require("../../db/f2CorpusTargetRepo");
const selector=require("./observationSelector");
const builder=require("./requestBuilder");
const evaluators=require("./evaluators");
const reducer=require("./shadowReducer");
const sources=require("./sourceAdapters");
const queries=require("./contextQuery");
const cp0=require("../controlPlane/observer");
const C=require("./contracts");

const CONSENT_STORE="f2_shadow_store",CONSENT_B1="f2_shadow_b1_dictation",CONSENT_B2="f2_shadow_b2_context_transfer",CONSENT_HANDOFF="f2_shadow_planner_handoff",CONSENT_EXTERNAL="f2_shadow_external_evaluator";
function flag(n){return process.env[n]==="1";}
function allowSet(){return new Set(String(process.env.F2_SHADOW_OWNER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean));}
function validateStartupConfig(){const raw=String(process.env.F2_SHADOW_OWNER_IDS||"");if(!raw.trim())return true;const ids=raw.split(",").map(x=>x.trim());if(ids.some(x=>!x||x==="*"||!/^[A-Za-z0-9._:@-]{1,200}$/.test(x)))throw new Error("F2_BAD_OWNER_ALLOWLIST");return true;}
function baseAccess(userId){if(!flag("F2_SHADOW_ENABLED"))return {ok:false,error:"F2_DISABLED"};const a=allowSet();if(!a.size||!a.has(String(userId)))return {ok:false,error:"F2_NOT_ALLOWLISTED"};if(String(process.env.F2_SHADOW_DIGEST_SECRET||process.env.F1_MEMORY_DIGEST_SECRET||process.env.AUTH_BOOTSTRAP_SECRET||"").length<16)return {ok:false,error:"F2_DIGEST_SECRET_REQUIRED"};return {ok:true};}
async function consent(userId,key){return repo.currentConsent(userId,key);}
function cref(c){return c?`consent:${c.id}:${c.consent_version}`:null;}
async function store(userId){const c=await consent(userId,CONSENT_STORE);return c?{ok:true,row:c,ref:cref(c)}:{ok:false,error:"CONSENT_REQUIRED",key:CONSENT_STORE};}
function closed(input,allowed,code="BAD_F2_INPUT"){C.closed(input,new Set(allowed),code);}
function safeRequest(r){if(!r)return r;const x={...r};delete x.expected;delete x.expected_json;delete x.expected_digest;return x;}
async function requireUse(userId){const a=baseAccess(userId);if(!a.ok)return a;return store(userId);}

async function list(ctx,opts){const a=await requireUse(ctx.userId);if(!a.ok)return a;cp0.noteCapability("repo:evidence");return {ok:true,...await repo.list(ctx.userId,opts)};}
async function scan(ctx,input={}){
  closed(input,["construct_id"]);const a=await requireUse(ctx.userId);if(!a.ok)return a;
  const cap=await repo.counts(ctx.userId);if(cap.created_today>=1)return {ok:false,error:"F2_DAILY_LIMIT"};
  const requested=input.construct_id?String(input.construct_id):null;const order=requested?[requested]:[C.CONSTRUCTS.B1,C.CONSTRUCTS.B2];let denominator=0,exclusions={};
  for(const construct of order){
    if(construct===C.CONSTRUCTS.B1){if(!flag("F2_SHADOW_B1_ENABLED"))continue;if(!await consent(ctx.userId,CONSENT_B1))continue;const found=await selector.selectB1(ctx.userId);denominator+=found.denominator;Object.assign(exclusions,found.exclusions);if(found.eligible.length){const req=await repo.createChain(ctx.userId,builder.buildB1(found.eligible[0],a.ref));await repo.writeQueryReceipt(ctx.userId,{purpose:"F2_MANAGEMENT",consent_snapshot_ref:a.ref,eligible_count:found.eligible.length,selected_ids:[req.id],exclusions,terminal_code:"CREATED"});cp0.noteCapability("repo:evidence_read");return {ok:true,created:safeRequest(req),denominator,exclusions};}}
    if(construct===C.CONSTRUCTS.B2){if(!flag("F2_SHADOW_B2_ENABLED"))continue;if(!await consent(ctx.userId,CONSENT_B2))continue;const found=await selector.selectB2(ctx.userId);denominator+=found.denominator;Object.assign(exclusions,found.exclusions);for(const obs of found.eligible){const target=await corpus.selectTarget(obs.item_key,{source_a_text_key:obs.source_a.text_key});if(!target.ok){exclusions[target.reason||target.error]=(exclusions[target.reason||target.error]||0)+1;continue;}const req=await repo.createChain(ctx.userId,builder.buildB2(obs,target.target,a.ref));await repo.writeQueryReceipt(ctx.userId,{purpose:"F2_MANAGEMENT",consent_snapshot_ref:a.ref,eligible_count:found.eligible.length,selected_ids:[req.id],exclusions,terminal_code:"CREATED"});cp0.noteCapability("repo:public_corpus_read");return {ok:true,created:safeRequest(req),target_manifest:target.manifest,denominator,exclusions};}}
  }
  await repo.writeQueryReceipt(ctx.userId,{purpose:"F2_MANAGEMENT",consent_snapshot_ref:a.ref,eligible_count:0,selected_ids:[],exclusions,terminal_code:"NO_ELIGIBLE_OBSERVATION"});return {ok:false,error:"NO_ELIGIBLE_OBSERVATION",denominator,exclusions};
}
async function offer(ctx){const a=await requireUse(ctx.userId);if(!a.ok)return a;return {ok:true,item:await repo.offer(ctx.userId,a.ref)};}
async function action(ctx,id,input){closed(input,["action","reason_code"]);const act=String(input.action||"");if(!C.ACTIONS.has(act))throw new Error("BAD_F2_ACTION");if(act!=="DELETE"){const a=await requireUse(ctx.userId);if(!a.ok)return a;}const item=await repo.action(ctx.userId,String(id),act,{reason_code:input.reason_code});cp0.noteCapability(act==="DELETE"?"repo:evidence_delete":"repo:evidence");return {ok:true,item:safeRequest(item)};}
async function attempt(ctx,id,input){const a=await requireUse(ctx.userId);if(!a.ok)return a;const valid=C.validateAttempt(input);const req=await repo.loadRequest(ctx.userId,String(id));if(!req)return {ok:false,error:"F2_NOT_FOUND"};const src=sources.revalidateRequest(req);if(!src.ok)return src;const evaluation=req.construct_id===C.CONSTRUCTS.B1?evaluators.evaluateB1(req.expected,valid):evaluators.evaluateB2(req.expected,valid);const decision=reducer.reduce(evaluation);const out=await repo.submit(ctx.userId,req.id,valid,evaluation,decision);cp0.noteCapability("eval:deterministic");return {ok:true,...out};}
async function handoffPreview(ctx){const a=await requireUse(ctx.userId);if(!a.ok)return a;if(!flag("F2_SHADOW_CONTEXT_USE_ENABLED")||!flag("F2_SHADOW_PLANNER_HANDOFF_ENABLED"))return {ok:false,error:"F2_CONTEXT_DISABLED"};if(!await consent(ctx.userId,CONSENT_HANDOFF))return {ok:false,error:"CONSENT_REQUIRED",key:CONSENT_HANDOFF};const data=await repo.list(ctx.userId,{state:"COMPLETED",limit:5});const item=data.items.map(queries.handoff).find(Boolean)||null;await repo.writeQueryReceipt(ctx.userId,{purpose:"F2_PLANNER_HANDOFF_PREVIEW",consent_snapshot_ref:a.ref,eligible_count:item?1:0,selected_ids:item?[item.item_ref]:[],terminal_code:item?"PREVIEW":"NONE"});return {ok:true,handoff:item};}
async function exportEvidence(ctx){cp0.noteCapability("repo:evidence_export");return {ok:true,data:await repo.exportEvidence(ctx.userId)};}
async function deleteAll(ctx,input){closed(input,["confirm","construct_id"]);if(String(input.confirm||"")!=="DELETE EVIDENCE")return {ok:false,error:"CONFIRM_REQUIRED"};return {ok:true,...await repo.deleteAll(ctx.userId,"USER_DELETE_ALL",input.construct_id||null)};}
async function revoke(userId,key){if(key===CONSENT_B1)return repo.deleteAll(userId,"CONSENT_REVOKED",C.CONSTRUCTS.B1);if(key===CONSENT_B2)return repo.deleteAll(userId,"CONSENT_REVOKED",C.CONSTRUCTS.B2);if(key===CONSENT_STORE)return repo.deleteAll(userId,"CONSENT_REVOKED");if(key===CONSENT_HANDOFF)return {deleted:0};return {deleted:0};}
function observed(id,fn){return (ctx,...args)=>cp0.observe(ctx,{scenarioId:id,surface:"pwa"},()=>fn(ctx,...args));}
module.exports={CONSENT_STORE,CONSENT_B1,CONSENT_B2,CONSENT_HANDOFF,CONSENT_EXTERNAL,validateStartupConfig,baseAccess,list:observed("evidence.manage",list),scan:observed("evidence.scan",scan),offer:observed("evidence.context_offer",offer),action:observed("evidence.manage",action),attempt:observed("evidence.attempt",attempt),handoffPreview:observed("evidence.handoff_preview",handoffPreview),exportEvidence:observed("evidence.export",exportEvidence),deleteAll:observed("evidence.delete",deleteAll),revoke};
