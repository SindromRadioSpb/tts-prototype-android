"use strict";

// Bounded, read-only reverse occurrence lookup over shipped public corpus assets.
// This is deliberately F2-local: it is not a general recommender or an index writer.
const fs=require("fs");
const path=require("path");
const {buildFormIndex,tokenToPid,detectCatalogVersion}=require("../scripts/premium/build-corpus-vocab");

const ROOT=path.join(__dirname,"..","public","data","benyehuda");
const WORKS=path.join(ROOT,"works");
const MAX_WORKS=24,MAX_ROWS=2000,MAX_MS=150;
let cache=null;
function readJson(p){return JSON.parse(fs.readFileSync(p,"utf8"));}
function decode(ids){let n=0;return (ids||[]).map((d)=>n+=Number(d)||0);}
function load(){
  const version=detectCatalogVersion(ROOT);if(!version)throw new Error("F2_CORPUS_VERSION_MISSING");
  if(cache&&cache.version===version)return cache;
  const vocab=readJson(path.join(ROOT,`corpus-vocab-v${version}.json`));
  const catalog=readJson(path.join(ROOT,`corpus-catalog-v${version}.json`));
  if(vocab.version!==version||vocab.catalog_version!==version||vocab.schema!==1)throw new Error("F2_CORPUS_VERSION_DRIFT");
  const {form2pid,modelVersion}=buildFormIndex();
  if(String(vocab.model_id)!==String(modelVersion))throw new Error("F2_CORPUS_MODEL_DRIFT");
  cache={version,vocab,form2pid,modelVersion,ready:((catalog.pointers&&catalog.pointers.ready)||[]).map(String),byText:null};return cache;
}
function workHasId(profile,dictId){return decode(profile&&profile.ids).includes(dictId);}
function publicAnchor(textKey){const b=load(),wanted=String(textKey||"").toLowerCase();if(!b.byText){b.byText=new Map();for(const wid of b.ready){const p=path.join(WORKS,wid+".json");let body;try{body=readJson(p);}catch(_){continue;}for(const text of (((body||{}).library||{}).texts||[]))if(text&&text.text_key)b.byText.set(String(text.text_key).toLowerCase(),{work_id:wid,text});}}const x=b.byText.get(wanted);if(!x)return null;return {corpus:"benyehuda",work_id:x.work_id,text_key:String(x.text.text_key).toLowerCase(),revision:String((((x.text.source_meta||{}).corpus||{}).content_hash)||"catalog-v"+b.version)};}
function tokens(s){return String(s||"").split(/[^א-ת֑-ׇ]+/).filter(Boolean);}
function optionsFor(pid,surface,b){
  const clean=(x)=>String(x||"").replace(/[֑-ׇ]/g,"");
  const correct=clean(surface),alts=[];
  for(const [form,formPid] of b.form2pid){const s=clean(form);if(String(formPid)===String(pid)&&s&&s!==correct&&!alts.includes(s))alts.push(s);if(alts.length===3)break;}
  if(alts.length<2)return null;
  const values=[correct,...alts.slice(0,3)].sort();
  const opts=values.map((s,i)=>({id:`o${i+1}`,surface:s,correct:s===correct}));
  if(opts.filter(x=>x.correct).length!==1)return null;
  return {options:opts,correct_option_id:opts.find(x=>x.correct).id};
}
async function selectTarget(itemKey,{source_a_text_key,used_refs=[]}={}){
  const b=load(),started=Date.now(),key=String(itemKey||"");
  if(!key.startsWith("pid:"))return {ok:false,error:"TARGET_NOT_FOUND",reason:"NON_PID"};
  const pid=key.slice(4),dictId=b.vocab.dict.map(String).indexOf(pid);if(dictId<0)return {ok:false,error:"TARGET_NOT_FOUND",reason:"PID_NOT_IN_VOCAB"};
  const used=new Set((used_refs||[]).map(String));
  const workIds=Object.keys(b.vocab.works).filter((id)=>workHasId(b.vocab.works[id],dictId)).sort((a,c)=>Number(a)-Number(c)).slice(0,MAX_WORKS);
  let scannedRows=0,scannedWorks=0;
  for(const wid of workIds){
    if(Date.now()-started>MAX_MS||scannedRows>=MAX_ROWS)break;scannedWorks++;
    const p=path.join(WORKS,wid+".json");let body;try{body=readJson(p);}catch(_){continue;}
    for(const text of (((body||{}).library||{}).texts||[])){
      const tk=String(text.text_key||"").toLowerCase();if(!tk||tk===String(source_a_text_key||"").toLowerCase())continue;
      for(const row of (text.rows||[])){
        if(++scannedRows>MAX_ROWS||Date.now()-started>MAX_MS)break;
        const ref=`${wid}:${tk}:${Number(row.order_index)}`;if(used.has(ref))continue;
        const raw=tokens(row.hebrew_niqqud||row.hebrew_plain);
        const matched=raw.filter((t)=>String(tokenToPid(b.form2pid,t)||"")===pid);
        if(matched.length!==1)continue;
        const surface=String(matched[0]).replace(/[֑-ׇ]/g,"");
        const optionSet=optionsFor(pid,surface,b);if(!optionSet)continue;
        const revision=String(((((text||{}).source_meta||{}).corpus||{}).content_hash)||`catalog-v${b.version}`);
        return {ok:true,target:{corpus:"benyehuda",work_id:wid,text_key:tk,order_index:Number(row.order_index),row_id:String(row.row_id||""),revision,sentence:String(row.hebrew_niqqud||row.hebrew_plain),surface,ref,...optionSet},manifest:{catalog_version:b.version,model_id:b.modelVersion,scanned_works:scannedWorks,scanned_rows:scannedRows,elapsed_ms:Date.now()-started,limits:{works:MAX_WORKS,rows:MAX_ROWS,ms:MAX_MS}}};
      }
    }
  }
  return {ok:false,error:"TARGET_NOT_FOUND",reason:(Date.now()-started>MAX_MS||scannedRows>=MAX_ROWS)?"BUDGET":"NO_UNAMBIGUOUS_OCCURRENCE",manifest:{catalog_version:b.version,scanned_works:scannedWorks,scanned_rows:scannedRows,elapsed_ms:Date.now()-started}};
}

module.exports={selectTarget,publicAnchor,MAX_WORKS,MAX_ROWS,MAX_MS,_reset:()=>{cache=null;}};
