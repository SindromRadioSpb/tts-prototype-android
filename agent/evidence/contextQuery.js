"use strict";
const C=require("./contracts");
function handoff(item){
  if(!item||!item.decision||item.decision.status!=="VALID")return null;
  return {handoff_id:C.opaque("f2handoff_"),construct_id:item.construct_id,request_outcome:item.evaluation&&item.evaluation.verdict,shadow_action_code:item.decision.decision_code,confidence_band:item.evaluation&&item.evaluation.confidence,uncertainty_codes:C.parseJson(item.evaluation&&item.evaluation.uncertainty_codes_json,[]),item_ref:item.id,source_ref:item.source_b&&`${item.source_b.work_id}:${item.source_b.text_key}:${item.source_b.order_index}`,policy_version:C.POLICY_VERSION,decision_rule_version:C.DECISION_RULE_VERSION,generated_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()};
}
module.exports={handoff};
