"use strict";
const repo=require("../../db/learnerMemoryRepo");
const adapters=require("./sourceAdapters");

async function selectContinue(userId, consentRef) {
  const items=await repo.eligibleThreads(userId);const exclusions={};const checks={};let selected=null;
  for(const item of items){let ok=Buffer.byteLength(JSON.stringify(item),"utf8")<=1024;const links=await repo.sourceLinksForRevision(userId,item.id,item.current_revision_id);if(!ok){exclusions.CONTEXT_TOO_LARGE=(exclusions.CONTEXT_TOO_LARGE||0)+1;continue;}for(const source of links){const r=await adapters.recheck(userId,{source_kind:source.source_kind,relation_kind:source.relation_kind,source_ref:source.source_ref,source_revision_ref:source.source_revision_ref,source_authority:source.source_authority,anchor:JSON.parse(source.anchor_json||"{}"),keyed_digest:source.keyed_digest});checks[r.code]=(checks[r.code]||0)+1;if(!r.ok){ok=false;exclusions[r.code]=(exclusions[r.code]||0)+1;await repo.sourceStatus(userId,item.id,source.id,r.code==="SOURCE_DRIFT"?"DRIFTED":r.code==="SOURCE_REVOKED"?"REVOKED":"PURGED");break;}}if(ok){selected=item;break;}}
  const receipt=await repo.writeQueryReceipt(userId,{purpose:"MENTOR_HOME_CONTINUE",consent_snapshot_ref:consentRef,eligible_count:items.length,selected_ids:selected?[selected.id]:[],exclusions,source_checks:checks,terminal_code:selected?"SELECTED":"NO_ELIGIBLE"});
  return {item:selected,query_id:receipt,reason_code:selected?(selected.authority_class==="USER_DECLARED"?"USER_SAVED_UNFINISHED":"USER_KEPT_PROPOSAL"):"NO_ELIGIBLE"};
}
module.exports={selectContinue};
