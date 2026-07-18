"use strict";

const C = require("./contracts");
const agentRepo = require("../../db/agentRepo");
const agentSentenceRepo = require("../../db/agentSentenceRepo");
const corpusSentenceRepo = require("../../db/corpusSentenceRepo");
const { getDb } = require("../../db/sqlite");

function get(db,sql,p=[]){return new Promise((resolve,reject)=>db.get(sql,p,(e,r)=>e?reject(e):resolve(r||null)));}

async function validate(userId, raw) {
  const s = C.validateSource(raw);
  if (s.source_kind === "USER_ACTION") return s;
  if (s.source_kind === "AGENT_TASK") {
    const row = await agentRepo.getTaskById(userId, s.source_ref);
    if (!row || !["plan", "read_next"].includes(String(row.kind))) throw new Error("SOURCE_UNAVAILABLE");
    if (String(row.status) !== "open") throw new Error("SOURCE_REVOKED");
    s.anchor = { task_kind: row.kind, action_target: "mentor_home" }; s.anchor_json = C.canonicalJson(s.anchor);
    return s;
  }
  if (s.source_kind === "AGENT_EXPLANATION") {
    const row = await agentRepo.getExplanationById(userId, s.source_ref);
    if (!row) throw new Error("SOURCE_UNAVAILABLE");
    let body={};try{body=JSON.parse(row.body_json||"{}");}catch(_){}
    if(body.purge_reason)throw new Error("SOURCE_REVOKED");
    s.anchor = { action_target:"explanation" }; s.anchor_json=C.canonicalJson(s.anchor);
    return s;
  }
  if (s.source_kind === "PUBLIC_CORPUS_ANCHOR") {
    const a=s.anchor||{};const row=await corpusSentenceRepo.getCorpusSentenceContext({corpus:a.corpus||"benyehuda",work_id:a.work_id,text_key:a.text_key,order_index:a.order_index});
    if(!row)throw new Error("SOURCE_UNAVAILABLE");
    const currentRevision=String(row.source_version||row.corpus_version||"current");
    if(s.source_revision_ref&&s.source_revision_ref!==currentRevision)throw new Error("SOURCE_DRIFT");
    s.source_revision_ref=currentRevision;
    const currentDigest=C.digest(userId,{source_ref:s.source_ref,source_revision_ref:s.source_revision_ref,anchor:s.anchor});
    if(s.keyed_digest&&s.keyed_digest!==currentDigest)throw new Error("SOURCE_DRIFT");
    s.keyed_digest=currentDigest;
    return s;
  }
  if (s.source_kind === "PERSONAL_TEXT_ANCHOR") {
    const db=getDb();if(!db)throw new Error("SOURCE_UNAVAILABLE");
    // P1 gate-sweep (критика F2-7): cloud_texts — через единую истину learnerArtifactsRepo.hasConsent
    // (any-version: это иерархический пре-чек «данные есть на сервере»; карта ЧТЕНИЯ = agent_read_texts).
    if(!(await require("../../db/learnerArtifactsRepo").hasConsent(userId)))throw new Error("SOURCE_REVOKED");
    {const grant=await get(db,`SELECT granted FROM consent_records WHERE user_id=? AND consent_key=? ORDER BY created_at DESC,id DESC LIMIT 1`,[userId,"agent_read_texts"]);if(!grant||Number(grant.granted)!==1)throw new Error("SOURCE_REVOKED");}
    const a=s.anchor||{};const row=await agentSentenceRepo.getSentenceContext(userId,{text_key:a.text_key,order_index:a.order_index,row_id:a.row_id});
    if(!row)throw new Error("SOURCE_REVOKED");
    const d=C.digest(userId,{text_key:a.text_key,order_index:a.order_index,row_id:a.row_id||null,he:row.he||row.sentence_he||"",ru:row.ru||row.sentence_ru||""});
    if(s.keyed_digest&&s.keyed_digest!==d)throw new Error("SOURCE_DRIFT");
    s.keyed_digest=d;s.source_revision_ref=s.source_revision_ref||String(row.updated_at||"current");
    return s;
  }
  if (s.source_kind === "CANONICAL_EVENT_REF") {
    const db=getDb();if(!db)throw new Error("SOURCE_UNAVAILABLE");
    const row=await get(db,`SELECT id FROM review_log WHERE user_id=? AND id=?`,[userId,s.source_ref]);
    if(!row)throw new Error("SOURCE_UNAVAILABLE");
    return s; // existence/provenance only; F1 never interprets grade, mastery, or schedule truth
  }
  throw new Error("SOURCE_UNAVAILABLE");
}

async function recheck(userId, source) {
  try { await validate(userId, source); return {ok:true,code:"AVAILABLE"}; }
  catch(e){const code=String(e&&e.message||"SOURCE_UNAVAILABLE");return {ok:false,code:["SOURCE_DRIFT","SOURCE_REVOKED"].includes(code)?code:"SOURCE_UNAVAILABLE"};}
}

module.exports={validate,recheck};
