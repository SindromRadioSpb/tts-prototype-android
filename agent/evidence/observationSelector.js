"use strict";
const log=require("../../db/learnerLogRepo");
const projections=require("../../db/learnerProjectionRepo");
const keying=require("../../db/keyingService");
const corpus=require("../../db/f2CorpusTargetRepo");
const audio=require("../../db/audioRepo");
const {computeDictateAssetKey}=require("../../db/premium/ttsAssetKey");
const C=require("./contracts");

function parsed(row){try{return JSON.parse(row.meta_json||"{}");}catch(_){return {};}}
function fold(rows){const annulled=new Set((rows||[]).filter(r=>r.kind==="annul").map(r=>String(parsed(r).annul_of||"")));return (rows||[]).filter(r=>r.kind!=="annul"&&!annulled.has(String(r.id)));}
function day(iso){return String(iso||"").slice(0,10);}
function receptive(row){const c=String(row&&row.channel||"");return c==="read"||c.startsWith("read:")||c==="reading:tap"||c==="listen"||c.startsWith("listen:");}
async function selectB1(userId,nowMs=Date.now()){
  const keys=(await projections.distinctItemKeys(userId)).filter(k=>k.startsWith("pid:")).sort();
  const exclusions={},eligible=[];
  for(const item_key of keys){
    const rows=fold(await log.itemRows(userId,item_key));
    const recent=rows.filter(r=>nowMs-Date.parse(r.reviewed_at)<=60*86400000&&r.kind==="review"&&Number(r.grade)>=3&&receptive(r));
    const dates=new Set(recent.map(r=>day(r.reviewed_at)));
    const dictate=rows.some(r=>nowMs-Date.parse(r.reviewed_at)<=90*86400000&&r.kind==="review"&&Number(r.grade)>=3&&String(r.channel||"").includes("dictate")&&!parsed(r).hint_kind);
    let code=dates.size<2?"B1_RECEPTIVE_DATES_LT2":dictate?"B1_DICTATE_ALREADY_SUPPORTED":(!recent.length||nowMs-Date.parse(recent[recent.length-1].reviewed_at)<86400000)?"B1_TOO_RECENT":null;
    const projection=await projections.getProjection(userId,item_key);if(!code&&!projection)code="B1_PROJECTION_MISSING";
    const form=code?null:await keying.dictateFormForItemKey(item_key);if(!code&&!form)code="B1_ASSET_OR_AMBIGUITY";
    if(!code){const assetKey=computeDictateAssetKey(form.vocalized);if(!await audio.hasAsset(assetKey))code="B1_AUDIO_ASSET_MISSING";}
    if(code){exclusions[code]=(exclusions[code]||0)+1;continue;}
    eligible.push({construct_id:C.CONSTRUCTS.B1,item_key,authority_class:"CANONICAL_PATTERN",canonical_event_refs:recent.map(r=>r.id).slice(-5),source_a:{event_ids:recent.map(r=>r.id).slice(-5)},predicate_version:C.B1_PREDICATE_VERSION,observed_at:recent[recent.length-1].reviewed_at,form});
  }
  return {denominator:keys.length,eligible,exclusions};
}
async function selectB2(userId,nowMs=Date.now()){
  const keys=(await projections.distinctItemKeys(userId)).filter(k=>k.startsWith("pid:")).sort();const exclusions={},eligible=[];
  for(const item_key of keys){
    const rows=fold(await log.itemRows(userId,item_key));
    for(const r of rows.filter(x=>x.kind==="review"&&Number(x.grade)>=3&&x.source==="reading-tap"&&x.channel==="reading:tap"&&nowMs-Date.parse(x.reviewed_at)<=30*86400000)){
      const meta=parsed(r),anchor=corpus.publicAnchor(meta.text_key);if(!anchor){exclusions.B2_PUBLIC_SOURCE_UNRESOLVED=(exclusions.B2_PUBLIC_SOURCE_UNRESOLVED||0)+1;continue;}
      eligible.push({construct_id:C.CONSTRUCTS.B2,item_key,authority_class:"SELF_REPORTED_RETRIEVAL",canonical_event_refs:[r.id],source_a:{...anchor,event_id:r.id},predicate_version:C.B2_PREDICATE_VERSION,observed_at:r.reviewed_at});
    }
  }
  return {denominator:keys.length,eligible,exclusions};
}
module.exports={fold,receptive,selectB1,selectB2};
