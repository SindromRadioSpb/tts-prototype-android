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
  text.rows=table.rows.map((r,i)=>({order_index:i,hebrew_plain:r.he_plain,hebrew_niqqud:r.he_niqqud,translit:r.translit,translit_ru:r.translit_ru,russian:r.ru}));
  if(!text.rows.length)fail('MATERIAL_ARCHIVE_INVALID');
  return {snapshot:{library:{texts:[text]}},packageBytes,media:options.mode==='youtube'?null:media,contentRoot:m.content_root_sha256,
    expectedMedia:{sha256:m.media.sha256,mime:m.media.mime,sizeBytes:m.media.size_bytes},
    title:text.title||p.material.text.title||'Untitled',rowCount:text.rows.length,videoId:passport.video?.videoId||null};
}
module.exports={inspectArchive,sha};
