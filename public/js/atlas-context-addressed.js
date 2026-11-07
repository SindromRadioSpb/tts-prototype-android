/* RC3.2 prepared-reading adapter. No source mutation, learning admission or SRS writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.AtlasContextAddressed=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const SCHEMA='atlas97001.rc32.addressed-context-map.1',PURPOSE='prepared_context_reading_only';
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),assert=(p,msg)=>{if(!p)throw Error('ATLAS_ADDRESSED_'+msg)};
 const sha=async(bytes,cryptoApi)=>Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 function tuple(r,p){return [String(r.id),r.order_index,p.key,r.he||'',r.he_niqqud||'',r.ru||'',r.row_type||'block',r.source_context||null]}
 function validateSegments(e){
  let nextSource=0,nextPointed=0;
  assert(Array.isArray(e.segments)&&Array.isArray(e.source_words)&&Array.isArray(e.pointed_words),'MAP_ARRAYS');
  for(const s of e.segments){
   assert(Number.isInteger(s.pointed_from)&&Number.isInteger(s.pointed_to)&&s.pointed_from===nextPointed&&s.pointed_to>=s.pointed_from&&s.pointed_to<e.pointed_words.length,'POINTED_RANGE');
   assert(equal(s.pointed_tokens,e.pointed_words.slice(s.pointed_from,s.pointed_to+1)),'POINTED_TOKENS');
   if(s.kind==='tokenizer_punctuation'){
    assert(s.source_from===null&&s.source_to===null&&s.source_tokens.length===0,'PUNCTUATION_SOURCE');
    assert(s.pointed_tokens.every(w=>/^[״]+$/.test(w)),'PUNCTUATION_NOT_WORD');
   }else{
    assert(['identity','addressed_orthographic_pair','acronym_tokenization','expanded_abbreviation','expanded_unit_abbreviation','expanded_singular_plural_alternatives'].includes(s.kind),'SEGMENT_KIND');
    assert(Number.isInteger(s.source_from)&&Number.isInteger(s.source_to)&&s.source_from===nextSource&&s.source_to>=s.source_from&&s.source_to<e.source_words.length,'SOURCE_RANGE');
    assert(equal(s.source_tokens,e.source_words.slice(s.source_from,s.source_to+1)),'SOURCE_TOKENS');nextSource=s.source_to+1;
   }
   nextPointed=s.pointed_to+1;
  }
  assert(nextSource===e.source_words.length&&nextPointed===e.pointed_words.length,'MAP_INCOMPLETE');
 }
 async function create(opts){
  assert(opts&&opts.purpose===PURPOSE,'PURPOSE');const C=opts.contract,AI=opts.ai,cryptoApi=opts.crypto||globalThis.crypto;
  assert(C&&AI&&opts.bytes&&/^[a-f0-9]{64}$/.test(opts.sha256||''),'DEPENDENCIES');
  assert(await sha(opts.bytes,cryptoApi)===opts.sha256,'HASH');const doc=JSON.parse(new TextDecoder().decode(opts.bytes));
  assert(doc.schema===SCHEMA&&doc.atlas_id==='a97001rc32'&&doc.source_atlas_id==='a97001'&&doc.purpose===PURPOSE,'IDENTITY');
  assert(doc.edition_revision===opts.editionRevision,'EDITION');assert((doc.source_overlay_manifest_sha256||null)===(opts.sourceOverlayManifestSha256||null),'SOURCE_OVERLAY');assert(doc.review_status==='independently_reviewed_for_reading_alignment_only','REVIEW');
  const entries=new Map();for(const e of doc.entries){assert(!entries.has(e.row_id),'DUPLICATE_ID');assert(e.scope===PURPOSE&&e.review_status===doc.review_status,'ENTRY_REVIEW');assert(/^[a-f0-9]{64}$/.test(e.source_record_sha256||'')&&e.source_pdf_sha256===opts.sourcePdfSha256,'SOURCE_RECORD_BINDING');validateSegments(e);entries.set(e.row_id,e)}
  function entryFor(row,p){
   const e=entries.get(String(row.id));assert(e,'UNKNOWN_ROW');assert(String(row.id).replace(/^a97001rc32:/,'a97001:')===e.source_row_id,'SOURCE_ID');assert(e.section===row.source_context?.section_id&&row.source_context?.atlas_id==='a97001rc32'&&row.source_context?.structure_revision===doc.edition_revision,'ROW_EDITION');
   assert(equal(tuple(row,p),tuple(e.guard,{key:e.guard.key})),'EXACT_ROW_GUARD');
   const source=AI.rowPayloadFromData(Object.assign({},row,{he_niqqud:'',hebrew_niqqud:'',meta_json:null,meta:null}));
   assert(equal(source?source.words.map(w=>w.w):[],e.source_words)&&equal(p.words.map(w=>w.w),e.pointed_words),'RUNTIME_TOKENS');return e;
  }
  function describe(rows){return (rows||[]).flatMap(row=>{
   if(entries.has(String(row.id)))entryFor(row,AI.rowPayloadFromData(row));
   try{return C.describe([row],AI)}catch(original){const p=AI.rowPayloadFromData(row);assert(p,'PAYLOAD');entryFor(row,p);return [{id:String(row.id),order_index:row.order_index,key:p.key,words:p.words.map(w=>w.w),he:row.he||'',he_niqqud:row.he_niqqud||'',ru:row.ru||'',row_type:row.row_type||'block',source_context:row.source_context||null}]}
  })}
  // For HE cards, map a source position to the expanded reading span. Never reuse a source offset as a pointed offset.
  function lookup(row,answer,column,index){
   assert(Number.isInteger(index)&&index>=0,'LOOKUP_INDEX');const p=AI.rowPayloadFromData(row);assert(p&&answer&&answer.row_id===String(row.id)&&answer.key===p.key&&answer.glosses.length===p.words.length,'LOOKUP_BINDING');
   if(entries.has(String(row.id)))entryFor(row,p);
   function pointedAt(i){
    assert(i<answer.glosses.length,'LOOKUP_RANGE');const g=answer.glosses[i],mwes=(answer.mwe||[]).filter(m=>i>=m.from&&i<=m.to),notes=[...new Set([...(g.uncertain?[g.reason]:[]),...mwes.filter(m=>m.uncertain).map(m=>m.reason)])];
    return {...g,reading_only:true,mwe:mwes.map(m=>m.gloss).join(' · '),...(notes.length?{uncertain:true,reason:notes.join('\n')}:{})};
   }
   if(column==='niqqud')return pointedAt(index);
   assert(column==='he','COLUMN');let e;try{C.describe([row],AI)}catch(_){e=entryFor(row,p)}
   if(!e)return pointedAt(index);
   const s=e.segments.find(s=>s.source_from!==null&&index>=s.source_from&&index<=s.source_to);assert(s,'SOURCE_LOOKUP_RANGE');
   const words=answer.glosses.slice(s.pointed_from,s.pointed_to+1),mwes=(answer.mwe||[]).filter(m=>m.from<=s.pointed_to&&m.to>=s.pointed_from),mwe=mwes.find(m=>m.from===s.pointed_from&&m.to===s.pointed_to),manual=words.some(g=>g.manual===true),notes=[...new Set(words.filter(g=>g.uncertain&&g.reason).map(g=>g.reason).concat(mwes.filter(m=>m.uncertain).map(m=>m.reason)))];
   return {...(words.length===1?words[0]:{}),gloss:mwe&&!manual?mwe.gloss:words.map(g=>g.gloss).join(' · '),manual,reading_only:true,mwe:mwes.map(m=>m.gloss).join(' · '),source_group:[s.source_from,s.source_to],pointed_group:[s.pointed_from,s.pointed_to],mapping_kind:s.kind,...(notes.length?{uncertain:true,reason:notes.join('\n')}:{})};
  }
  return Object.freeze({describe,lookup,purpose:PURPOSE,entryCount:entries.size,editionRevision:doc.edition_revision});
 }
 return {create,validateSegments,SCHEMA,PURPOSE};
});
