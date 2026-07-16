"use strict";

const crypto = require("crypto");

const SCHEMA_VERSION = "f2-shadow.1.0.0";
const POLICY_VERSION = "f2-shadow-policy.1.0.0";
const B1_PREDICATE_VERSION = "f2-b1-predicate.1.0.0";
const B2_PREDICATE_VERSION = "f2-b2-predicate.1.0.0";
const EVALUATOR_VERSION = "f2-deterministic-evaluator.1.0.0";
const RUBRIC_VERSION = "f2-closed-answer-rubric.1.0.0";
const NORMALIZER_VERSION = "f2-hebrew-strict.1.0.0";
const DECISION_RULE_VERSION = "f2-shadow-rule.1.0.0";

const CONSTRUCTS = Object.freeze({
  B1: "UNSUPPORTED_ORTHOGRAPHIC_PRODUCTION",
  B2: "READING_TO_NEW_CONTEXT_TRANSFER",
});
const ACTIONS = new Set(["ACCEPT","SKIP","DEFER","SUPPRESS","UNSUPPRESS","DISPUTE","ANNUL","DELETE"]);
const REQUEST_STATES = new Set(["PENDING","OFFERED","ACCEPTED","DEFERRED","SUBMITTED","SKIPPED","EXPIRED","ABANDONED","UNAVAILABLE","COMPLETED","SUPPRESSED","ANNULLED"]);
const MNAR_STATES = new Set(["SKIPPED","DEFERRED","EXPIRED","ABANDONED","UNAVAILABLE"]);
const MAX_ANSWER_BYTES = 512;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out={}; for(const k of Object.keys(value).sort()) out[k]=canonical(value[k]); return out;
  }
  return value;
}
function canonicalJson(value){return JSON.stringify(canonical(value));}
function digest(userId,value){
  const root=process.env.F2_SHADOW_DIGEST_SECRET||process.env.F1_MEMORY_DIGEST_SECRET||process.env.AUTH_BOOTSTRAP_SECRET||"";
  if(root.length<16)throw new Error("F2_DIGEST_SECRET_REQUIRED");
  const key=crypto.createHmac("sha256",root).update(String(userId)).digest();
  return "h2:"+crypto.createHmac("sha256",key).update(canonicalJson(value)).digest("hex");
}
function opaque(prefix){return prefix+crypto.randomUUID();}
function closed(value,allowed,code="BAD_F2_INPUT"){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(code);
  for(const k of Object.keys(value))if(!allowed.has(k))throw new Error(code+"_FIELD");
}
function text(value,max,code,optional=false){
  if(value==null&&optional)return null;const s=String(value==null?"":value).trim();
  if((!optional&&!s)||Buffer.byteLength(s,"utf8")>max)throw new Error(code);return s||null;
}
function iso(value){const s=String(value||"");if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(s)||!Number.isFinite(Date.parse(s)))throw new Error("BAD_F2_TIME");return s;}
function parseJson(value,fallback){try{return JSON.parse(value);}catch(_){return fallback;}}
function plusMs(isoValue,ms){return new Date(Date.parse(isoValue)+ms).toISOString();}
function validateAttempt(input){
  closed(input,new Set(["answer","option_id","input_mode","assistance_codes","client_nonce"]),"BAD_F2_ATTEMPT");
  const answer=input.answer==null?null:text(input.answer,MAX_ANSWER_BYTES,"F2_ANSWER_TOO_LARGE",true);
  const option=input.option_id==null?null:text(input.option_id,100,"BAD_F2_OPTION",true);
  if(!answer&&!option)throw new Error("F2_ANSWER_REQUIRED");
  const assistance=Array.isArray(input.assistance_codes)?input.assistance_codes.map((x)=>text(x,40,"BAD_F2_ASSISTANCE")):[];
  if(assistance.length>4)throw new Error("BAD_F2_ASSISTANCE_COUNT");
  return {answer,option_id:option,input_mode:input.input_mode?text(input.input_mode,30,"BAD_F2_INPUT_MODE"):null,assistance_codes:assistance,client_nonce:input.client_nonce?text(input.client_nonce,100,"BAD_F2_NONCE"):null};
}

module.exports={SCHEMA_VERSION,POLICY_VERSION,B1_PREDICATE_VERSION,B2_PREDICATE_VERSION,EVALUATOR_VERSION,RUBRIC_VERSION,NORMALIZER_VERSION,DECISION_RULE_VERSION,CONSTRUCTS,ACTIONS,REQUEST_STATES,MNAR_STATES,MAX_ANSWER_BYTES,canonicalJson,digest,opaque,closed,text,iso,parseJson,plusMs,validateAttempt};
