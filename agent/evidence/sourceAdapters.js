"use strict";
const corpus=require("../../db/f2CorpusTargetRepo");
function revalidateRequest(request){
  if(!request||request.construct_id!=="READING_TO_NEW_CONTEXT_TRANSFER")return {ok:true};
  const b=request.source_b||{};const live=corpus.publicAnchor(b.text_key);
  if(!live||String(live.work_id)!==String(b.work_id)||String(live.revision)!==String(b.revision))return {ok:false,error:"SOURCE_DRIFT"};
  return {ok:true,anchor:live};
}
module.exports={revalidateRequest};
