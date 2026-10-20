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
  const wordGloss=wordGlossLayer(p.word_gloss_ai_layer,text.rows.length);
  if(wordGloss)text.word_gloss_ai_layer=wordGloss;
  return {snapshot:{library:{texts:[text]}},packageBytes,media:options.mode==='youtube'?null:media,contentRoot:m.content_root_sha256,
    expectedMedia:{sha256:m.media.sha256,mime:m.media.mime,sizeBytes:m.media.size_bytes},
    title:text.title||p.material.text.title||'Untitled',rowCount:text.rows.length,wordGlossRows:wordGloss?wordGloss.rows.length:0,videoId:passport.video?.videoId||null};
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
function wordGlossLayer(layer,rowCount){
  if(!layer||layer.schema!=='word-gloss-ai-layer-v1'||!Array.isArray(layer.rows)||layer.rows.length>rowCount)return null;
  const rows=layer.rows.filter(r=>r&&Number.isInteger(r.order_index)&&r.order_index>=0&&r.order_index<rowCount&&str(r.key,64)&&str(r.model||'',80)
    &&Array.isArray(r.glosses)&&r.glosses.length>0&&r.glosses.length<=80&&r.glosses.every(g=>g&&str(g.gloss,120)&&(g.ai_gloss==null||str(g.ai_gloss,120)))
    &&Array.isArray(r.mwe||[])&&(r.mwe||[]).length<=40&&(r.mwe||[]).every(m=>m&&Number.isInteger(m.from)&&Number.isInteger(m.to)&&str(m.gloss,120)))
    .map(r=>({order_index:r.order_index,key:r.key,...(r.shared===true?{shared:true}:{}),model:String(r.model||''),glosses:r.glosses.map(g=>g.manual?{gloss:g.gloss,wrong_hint:!!g.wrong_hint,manual:true,ai_gloss:String(g.ai_gloss||''),ai_wrong_hint:!!g.ai_wrong_hint}:{gloss:g.gloss,wrong_hint:!!g.wrong_hint}),mwe:(r.mwe||[]).map(m=>({from:m.from,to:m.to,gloss:m.gloss}))}));
  return rows.length?{schema:layer.schema,rows}:null;
}
module.exports={inspectArchive,sha,wordGlossLayer,fieldEvidence,boundedFieldMeta};
