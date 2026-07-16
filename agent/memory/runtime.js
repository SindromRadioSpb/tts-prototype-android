"use strict";

const repo=require("../../db/learnerMemoryRepo");
const adapters=require("./sourceAdapters");
const candidates=require("./candidates");
const context=require("./contextQuery");
const cp0=require("../controlPlane/observer");
const C=require("./contracts");

const CONSENT_STORE="mentor_memory_store";
const CONSENT_UNFINISHED="mentor_memory_unfinished";
const CONSENT_CANDIDATES="mentor_memory_candidates";

function flag(name){return process.env[name]==="1";}
function closed(input,allowed){if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("BAD_MEMORY_INPUT");for(const k of Object.keys(input))if(!allowed.has(k))throw new Error("BAD_MEMORY_INPUT_FIELD");}
function allowSet(){return new Set(String(process.env.F1_MEMORY_OWNER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean));}
function baseAccess(userId){if(!flag("F1_MEMORY_ENABLED"))return {ok:false,error:"F1_DISABLED"};const a=allowSet();if(!a.size||!a.has(String(userId)))return {ok:false,error:"F1_NOT_ALLOWLISTED"};if(String(process.env.F1_MEMORY_DIGEST_SECRET||process.env.AUTH_BOOTSTRAP_SECRET||"").length<16)return {ok:false,error:"F1_DIGEST_SECRET_REQUIRED"};return {ok:true};}
async function consent(userId,key){return repo.currentConsent(userId,key);}
function consentRef(row){return row?`consent:${row.id}:${row.consent_version}`:null;}
async function requireStore(userId){const c=await consent(userId,CONSENT_STORE);return c?{ok:true,row:c,ref:consentRef(c)}:{ok:false,error:"CONSENT_REQUIRED",key:CONSENT_STORE};}

async function list(ctx,opts){const a=baseAccess(ctx.userId);if(!a.ok)return a;const c=await requireStore(ctx.userId);if(!c.ok)return c;cp0.noteCapability("repo:memory");return {ok:true,...await repo.list(ctx.userId,opts)};}
async function create(ctx,input){closed(input,new Set(["kind","payload","sources","ttl_days","priority"]));const a=baseAccess(ctx.userId);if(!a.ok)return a;const c=await requireStore(ctx.userId);if(!c.ok)return c;const kind=String(input.kind||"");if(kind==="unfinished_thread"&&!await consent(ctx.userId,CONSENT_UNFINISHED))return {ok:false,error:"CATEGORY_DISABLED",key:CONSENT_UNFINISHED};const rawSources=kind==="declared_goal"?[{source_kind:"USER_ACTION",relation_kind:"DECLARED_AT",source_ref:C.opaque("ua_"),source_authority:"USER_ACTION",anchor:{action_target:"mentor_home"}}]:(Array.isArray(input.sources)?input.sources:[]);if(kind!=="declared_goal"&&rawSources.some(s=>String(s&&s.source_kind)==="USER_ACTION"))return {ok:false,error:"SOURCE_UNAVAILABLE"};const sources=[];for(const s of rawSources)sources.push(await adapters.validate(ctx.userId,s));const item=await repo.create(ctx.userId,{kind,authority_class:"USER_DECLARED",payload:input.payload,sources,ttl_days:input.ttl_days,priority:input.priority,consent_snapshot_ref:c.ref,reason_code:"DIRECT_SAVE"});cp0.noteCapability("repo:memory");cp0.noteArtifact("mentor.memory_record.v1",item.id,"USER_ASSERTED");return {ok:true,item};}
async function propose(ctx){const a=baseAccess(ctx.userId);if(!a.ok)return a;if(!flag("F1_MEMORY_CANDIDATES_ENABLED"))return {ok:false,error:"F1_CANDIDATES_DISABLED"};const c=await requireStore(ctx.userId);if(!c.ok)return c;if(!await consent(ctx.userId,CONSENT_CANDIDATES))return {ok:false,error:"CATEGORY_DISABLED",key:CONSENT_CANDIDATES};const out=await candidates.propose(ctx.userId,c.ref);cp0.noteCapability("repo:memory");return {ok:true,...out};}
async function action(ctx,id,input){closed(input,new Set(["action","expected_revision_id","payload","reason_code"]));const act=String(input.action||"");if(act!=="DELETE"&&!input.expected_revision_id)throw new Error("STATE_CONFLICT");const a=baseAccess(ctx.userId);if(!a.ok&&act!=="DELETE")return a;const c=await requireStore(ctx.userId);if(!c.ok&&act!=="DELETE")return c;const item=await repo.act(ctx.userId,String(id),act,input);cp0.noteCapability(act==="DELETE"?"repo:memory_delete":"repo:memory");return {ok:true,item};}
async function continueItem(ctx){const a=baseAccess(ctx.userId);if(!a.ok)return a;if(!flag("F1_MEMORY_CONTEXT_USE_ENABLED"))return {ok:false,error:"F1_CONTEXT_DISABLED"};const c=await requireStore(ctx.userId);if(!c.ok)return c;if(!await consent(ctx.userId,CONSENT_UNFINISHED))return {ok:false,error:"CATEGORY_DISABLED",key:CONSENT_UNFINISHED};const out=await context.selectContinue(ctx.userId,c.ref);cp0.noteCapability("repo:memory_query");return {ok:true,...out};}
async function exportMemory(ctx){cp0.noteCapability("repo:memory_export");return {ok:true,data:await repo.exportMemory(ctx.userId)};}
async function deleteAll(ctx,input){closed(input,new Set(["confirm","kind"]));if(String(input.confirm||"")!=="DELETE MEMORY")return {ok:false,error:"CONFIRM_REQUIRED"};const out=await repo.deleteAll(ctx.userId,"USER_DELETE_ALL",input.kind||null);cp0.noteCapability("repo:memory_delete");return {ok:true,...out};}
async function revoke(userId,key){if(key===CONSENT_CANDIDATES)return repo.deletePending(userId,"CONSENT_REVOKED");if(key===CONSENT_UNFINISHED)return repo.deleteAll(userId,"CONSENT_REVOKED","unfinished_thread");if(key===CONSENT_STORE)return repo.deleteAll(userId,"CONSENT_REVOKED");return {deleted:0};}

function observed(id,fn){return (ctx,...args)=>cp0.observe(ctx,{scenarioId:id,surface:"pwa"},()=>fn(ctx,...args));}
module.exports={CONSENT_STORE,CONSENT_UNFINISHED,CONSENT_CANDIDATES,baseAccess,list:observed("memory.manage",list),create:observed("memory.manage",create),propose:observed("memory.propose",propose),action:observed("memory.manage",action),continueItem:observed("memory.context_continue",continueItem),exportMemory:observed("memory.export",exportMemory),deleteAll:observed("memory.delete",deleteAll),revoke};
