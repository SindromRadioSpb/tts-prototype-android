'use strict';
const crypto=require('node:crypto');
const Zip=require('adm-zip');
const Portable=require('../public/js/studio-portable-learning-package');
const Bundle=require('../public/js/media-bundle-io');
const Playback=require('../public/js/playback-source');
const Projection=require('../public/js/studio-media-package');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code,status:400});}
async function inspectArchive(bytes, options={}) {
  if(!['youtube','media'].includes(options.mode||'youtube'))fail('MATERIAL_ARCHIVE_INVALID');
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>512*1024*1024)fail('MATERIAL_ARCHIVE_INVALID');
  let packageBytes=bytes,media=null;
  // Inspect bounded central-directory metadata before decompressing any entry.
  const zip=new Zip(bytes),entries=zip.getEntries();
  if(entries.length>4096)fail('MATERIAL_ARCHIVE_INVALID');
  const manifestEntry=entries.find(e=>e.entryName==='manifest.json');
  if(!manifestEntry||manifestEntry.header.size>1024*1024||manifestEntry.header.size>Math.max(4096,manifestEntry.header.compressedSize*200))fail('MATERIAL_ARCHIVE_INVALID');
  const manifest=JSON.parse(manifestEntry.getData().toString('utf8'));
  // «Библиотека → Отправить или сохранить → Сохранить ZIP» — учебный архив карточки. Архив
  // материала лежит в нём целиком (learning-packages/<root>.lplp.zip) — тот же, что даёт
  // «Импорт-центр → Скачать копию материала». Принимаем его, а не отдельный третий формат.
  const indexEntry=entries.find(e=>e.entryName==='learning-packages/index.json');
  if(manifest.format==='linguistpro-bundle'||indexEntry){
    if(options.nested)fail('MATERIAL_ARCHIVE_INVALID');
    if(!indexEntry||indexEntry.header.size>1024*1024)fail('MATERIAL_ARCHIVE_NO_MATERIAL');
    const index=JSON.parse(indexEntry.getData().toString('utf8'));
    const packages=Array.isArray(index.packages)?index.packages:[];
    if(!packages.length)fail('MATERIAL_ARCHIVE_NO_MATERIAL');
    if(packages.length!==1||!/^learning-packages\/[a-f0-9]{64}\.lplp\.zip$/.test(String(packages[0].path||'')))fail('MATERIAL_ARCHIVE_INVALID');
    const inner=entries.find(e=>e.entryName===packages[0].path);
    if(!inner||inner.header.size>512*1024*1024)fail('MATERIAL_ARCHIVE_INVALID');
    return inspectArchive(inner.getData(),{...options,nested:true});
  }
  if(manifest.schema==='lplp-media-bundle-v1') {
    const file={size:bytes.length,slice:(start,end)=>new Blob([bytes.subarray(start,end)])};
    const bundle=await Bundle.readBundle({file});
    packageBytes=bytes.subarray(bundle.package.data_offset,bundle.package.data_offset+bundle.package.size);
    if(sha(packageBytes)!==bundle.manifest.package.sha256)fail('MATERIAL_ARCHIVE_INVALID');
    const data=bytes.subarray(bundle.media.data_offset,bundle.media.data_offset+bundle.media.size);
    if(sha(data)!==bundle.manifest.media.sha256)fail('MATERIAL_MEDIA_MISMATCH');
    media={bytes:data,sha256:bundle.manifest.media.sha256,mime:bundle.manifest.media.mime,canonicalSha:bundle.manifest.media.canonical_sha256||bundle.manifest.media.sha256};
  }
  const verified=await Portable.verifyZip(packageBytes);
  const p=verified.payload,m=verified.manifest;
  const table=p.table_revisions.find(t=>t.portable_table_revision_id===m.roots.table_revision);
  const caption=p.caption_revisions.find(c=>c.portable_revision_id===table.bound_caption_revision_id);
  if(!caption||caption.revision.canonical_sha256!==table.bound_caption_revision_sha256)fail('MATERIAL_ARCHIVE_INVALID');
  const originalPlayback=p.playback_source||null;
  const suppliedId=options.youtubeUrl?Playback.parseVideoId(options.youtubeUrl):null;
  if(options.youtubeUrl&&!suppliedId)fail('PLAYBACK_SOURCE_INVALID');
  const selected=originalPlayback&&Playback.selected(originalPlayback);
  if(suppliedId&&selected?.source&&selected.source.video_id!==suppliedId)fail('MATERIAL_SOURCE_MISMATCH');
  let playback=options.mode==='media'?null:originalPlayback||(suppliedId?Playback.append(null,{url:options.youtubeUrl}):null);
  if(media&&m.media.sha256&&media.canonicalSha!==m.media.sha256)fail('MATERIAL_MEDIA_MISMATCH');
  const revision={...caption.revision,revision_id:caption.portable_revision_id,track_id:p.corrected_track.portable_track_id};
  const binding={package_id:m.roots.media_package,track_id:revision.track_id,revision_id:revision.revision_id,revision_sha256:revision.canonical_sha256,
    mapping:{rows:table.rows.map((r,i)=>({row_index:i,caption_segment_id:r.caption_segment_id}))}};
  const passport=Projection.buildExactBindingPassport(revision,binding,{package_id:binding.package_id,...p.media_ref});
  // Отпечаток в архиве снят с разметки Библиотеки, а карточка получит проекцию ревизии архива.
  playback=await Playback.rebindBasis(playback,passport,table.rows);
  const sourceMeta={source:{audio:passport},publication_archive:{content_root_sha256:m.content_root_sha256,package_sha256:sha(packageBytes),caption_revision_sha256:revision.canonical_sha256,original_playback:originalPlayback}};
  if(playback)sourceMeta.playback_source=playback;
  if(playback&&Playback.selected(playback).source)passport.video={videoId:Playback.selected(playback).source.video_id,url:Playback.selected(playback).source.url};
  const text={...p.text_card.card,text_key:'publication:'+m.content_root_sha256,source_meta:sourceMeta,table_model_meta:null};
  delete text.source_meta_json;delete text.table_model_meta_json;
  text.rows=table.rows.map((r,i)=>({order_index:i,hebrew_plain:r.he_plain,hebrew_niqqud:r.he_niqqud,translit:r.translit,translit_ru:r.translit_ru,russian:r.ru,
    edit_meta:{_studio_material:{schema:'material-projection-v1',imported:true,field_meta:boundedFieldMeta(r.field_meta)}}}));
  if(!text.rows.length)fail('MATERIAL_ARCHIVE_INVALID');
  // Ф3б: the owner's paid AI word glosses travel to public readers (owner decision 2026-10-12).
  // Bounded shape only here; every reader re-proves each row's content key before showing it.
  const glossReport=wordGlossLayerReport(p.word_gloss_ai_layer,text.rows.length),wordGloss=glossReport.layer;
  if(wordGloss)text.word_gloss_ai_layer=wordGloss;
  return {snapshot:{library:{texts:[text]}},packageBytes,media:options.mode==='youtube'?null:media,contentRoot:m.content_root_sha256,
    expectedMedia:{sha256:m.media.sha256,mime:m.media.mime,sizeBytes:m.media.size_bytes},
    title:text.title||p.material.text.title||'Untitled',rowCount:text.rows.length,wordGlossRows:wordGloss?wordGloss.rows.length:0,wordGlossRejected:glossReport.rejected.length,wordGlossRejectedReasons:rejectedReasons(glossReport.rejected),videoId:passport.video?.videoId||null};
}
const str=(v,max)=>typeof v==='string'&&v.length<=max;
function boundedFieldMeta(input) {
  const out={};
  for(const key of ['he_plain','he_niqqud','translit','translit_ru','ru']){
    const m=input&&input[key];if(!m||typeof m!=='object')continue;
    out[key]={authority:['source','provider','user','imported'].includes(m.authority)?m.authority:'imported',
      locked:!!m.locked,status:['current','invalidated','conflict'].includes(m.status)?m.status:'current'};
    for(const f of ['provider','model','profile','input_sha256'])if(str(m[f],100))out[key][f]=m[f];
  }
  return out;
}
// Additive read evidence for archives published before field_meta was carried. Never change snapshot/hash.
async function fieldEvidence(bytes,snapshot) {
  const verified=await Portable.verifyZip(bytes),p=verified.payload;
  const table=p.table_revisions.find(t=>t.portable_table_revision_id===verified.manifest.roots.table_revision);
  const rows=snapshot?.library?.texts?.[0]?.rows||[];
  if(!table||rows.length!==table.rows.length)return null;
  const keys={he_plain:'hebrew_plain',he_niqqud:'hebrew_niqqud',ru:'russian',translit:'translit',translit_ru:'translit_ru'};
  return {schema:'published-field-evidence-v1',rows:rows.map((r,i)=>{
    const source=table.rows[i],meta=boundedFieldMeta(source.field_meta),fields={};
    for(const [field,alias] of Object.entries(keys))if(String(r[alias]??r[field]??'')===String(source[field]??'')&&meta[field])fields[field]=meta[field];
    return {order_index:i,field_meta:fields};
  })};
}
// The row key ends with the row's word count («r2<hash>:<n>», word-gloss-ai.js keyOf), so the shape is
// checked against the row itself instead of fixed caps: long literary rows (up to ~800 words) keep their
// paid layer. Every dropped row is returned with a reason — a text import never hides a lost layer row.
const LAYER_KEY=/^[A-Za-z0-9]{1,48}:(\d{1,5})$/;
function layerRowProblem(r,rowCount){
  if(!r||!Number.isInteger(r.order_index)||r.order_index<0)return 'ROW_INVALID';
  if(r.order_index>=rowCount)return 'ROW_OUTSIDE_CARD';
  const m=typeof r.key==='string'&&r.key.match(LAYER_KEY);
  if(!m)return 'KEY_INVALID';
  if(!str(r.model||'',80))return 'MODEL_INVALID';
  const words=Number(m[1]);
  if(!Array.isArray(r.glosses)||!r.glosses.length||r.glosses.length!==words)return 'GLOSS_COUNT_MISMATCH';
  if(!r.glosses.every(g=>g&&typeof g.gloss==='string'))return 'GLOSS_INVALID';
  if(!r.glosses.every(g=>str(g.gloss,120)&&(g.ai_gloss==null||str(g.ai_gloss,120))))return 'GLOSS_TOO_LONG';
  if(!Array.isArray(r.mwe||[]))return 'MWE_INVALID';
  if(!(r.mwe||[]).every(x=>x&&Number.isInteger(x.from)&&Number.isInteger(x.to)&&x.from>=0&&x.from<=x.to&&x.to<words))return 'MWE_OUT_OF_ROW';
  if(!(r.mwe||[]).every(x=>str(x.gloss,120)))return 'GLOSS_TOO_LONG';
  return null;
}
function wordGlossLayerReport(layer,rowCount){
  if(!layer||layer.schema!=='word-gloss-ai-layer-v1'||!Array.isArray(layer.rows))
    return {layer:null,rejected:layer&&Array.isArray(layer.rows)?layer.rows.map(r=>({order_index:r&&r.order_index,reason:'SCHEMA_INVALID'})):[]};
  const rows=[],rejected=[],seen=new Set();
  for(const r of layer.rows){
    const problem=layerRowProblem(r,rowCount)||(seen.has(r.order_index)?'ROW_DUPLICATE':null);
    if(problem){rejected.push({order_index:r&&r.order_index,reason:problem});continue;}
    seen.add(r.order_index);
    rows.push({order_index:r.order_index,key:r.key,...(r.shared===true?{shared:true}:{}),model:String(r.model||''),glosses:r.glosses.map(g=>g.manual?{gloss:g.gloss,wrong_hint:!!g.wrong_hint,manual:true,ai_gloss:String(g.ai_gloss||''),ai_wrong_hint:!!g.ai_wrong_hint}:{gloss:g.gloss,wrong_hint:!!g.wrong_hint}),mwe:(r.mwe||[]).map(m=>({from:m.from,to:m.to,gloss:m.gloss}))});
  }
  return {layer:rows.length?{schema:layer.schema,rows}:null,rejected};
}
function rejectedReasons(rejected){
  const out={};for(const r of rejected)out[r.reason]=(out[r.reason]||0)+1;return out;
}
function wordGlossLayer(layer,rowCount){
  return wordGlossLayerReport(layer,rowCount).layer;
}
module.exports={inspectArchive,sha,wordGlossLayer,wordGlossLayerReport,fieldEvidence,boundedFieldMeta};
