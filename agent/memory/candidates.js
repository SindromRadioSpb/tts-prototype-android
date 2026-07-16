"use strict";

const repo=require("../../db/learnerMemoryRepo");
const agentRepo=require("../../db/agentRepo");
const adapters=require("./sourceAdapters");
const C=require("./contracts");

async function propose(userId, consentRef) {
  const created=[];const cutoff=Date.now()-7*86400000;
  const tasks=await agentRepo.listTasks(userId,{status:"open",limit:20});
  for(const row of tasks){
    if(created.length>=3)break;if(Date.parse(row.created_at||0)<cutoff||!["plan","read_next"].includes(String(row.kind)))continue;
    const source=await adapters.validate(userId,{source_kind:"AGENT_TASK",relation_kind:"DERIVED_FROM",source_ref:row.id,source_authority:"DERIVED",anchor:{task_kind:row.kind,action_target:"mentor_home"}});
    const item=await repo.create(userId,{kind:"unfinished_thread",authority_class:"DERIVED_CANDIDATE",payload:{next_action:"OPEN_TASK",label:"Continue an unfinished mentor task"},sources:[source],consent_snapshot_ref:consentRef,reason_code:"OPEN_TASK_RECENT",dedupe_key:C.digest(userId,{source:"task",id:row.id,action:"OPEN_TASK"})});created.push(item);
  }
  if(created.length<3){
    const ex=await agentRepo.listExplanations(userId,{limit:20});
    for(const row of ex.rows||[]){
      if(created.length>=3)break;if(Date.parse(row.created_at||0)<cutoff)continue;let b={};try{b=JSON.parse(row.body_json||"{}");}catch(_){}if(b.purge_reason)continue;
      try{const source=await adapters.validate(userId,{source_kind:"AGENT_EXPLANATION",relation_kind:"DERIVED_FROM",source_ref:row.id,source_authority:"DERIVED",anchor:{action_target:"explanation"}});const item=await repo.create(userId,{kind:"unfinished_thread",authority_class:"DERIVED_CANDIDATE",payload:{next_action:"OPEN_EXPLANATION",label:"Return to a recent explanation"},sources:[source],consent_snapshot_ref:consentRef,reason_code:"RECENT_EXPLANATION",dedupe_key:C.digest(userId,{source:"explanation",id:row.id,action:"OPEN_EXPLANATION"})});created.push(item);}catch(_){}
    }
  }
  return {items:created.slice(0,3)};
}
module.exports={propose};
