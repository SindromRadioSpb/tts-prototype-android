#!/usr/bin/env node
// Recover a mixed clip-relative YouTube ASR clock from retained paid evidence.
// Creates a separate portable archive; never changes the input or calls a provider.
'use strict';
const fs=require('node:fs');
const AdmZip=require('adm-zip');
const AT=require('../../public/js/asr-transcript');
const Timing=require('../../public/js/youtube-timing');
const Media=require('../../public/js/media-package-core');
const Core=require('../../public/js/portable-learning-package-core');

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath||inputPath===outputPath)throw Error('usage: node recover-youtube-timing-archive.cjs INPUT.zip OUTPUT.zip');
if(fs.existsSync(outputPath))throw Error('OUTPUT_EXISTS');
const zip=new AdmZip(inputPath);
  const names=zip.getEntries().filter(e=>!e.isDirectory).map(e=>e.entryName);
const read=name=>JSON.parse(zip.readAsText(name));
const one=prefix=>read(names.find(n=>n.startsWith(prefix)&&n.endsWith('.json')));
const text=x=>AT.stitchNormalizeWords(String(x||'')).join(' ');
async function main(){
  const files=Object.fromEntries(names.map(name=>[name,zip.readAsText(name)]));
  const verified=await Core.verifyPackageFiles(files);
  if(verified.manifest.package_mode!=='archive')throw Error('ARCHIVE_REQUIRED');
  for(const prefix of ['tracks/raw/revisions/','tracks/corrected/revisions/','learning/table/revisions/'])
    if(names.filter(n=>n.startsWith(prefix)&&n.endsWith('.json')).length!==1)throw Error('SINGLE_REVISION_SOURCE_REQUIRED');
  const source=read('source/playback.json'),importRun=read('provenance/import-run.json');
  const evidence=importRun.captions?.timing_evidence;
  if(evidence?.schema!=='youtube-asr-timing-evidence-v2'||!Array.isArray(evidence.raw_timeline)||
     evidence.timeline.length!==verified.payload.text_card.card.rows.length)throw Error('TIMING_EVIDENCE_REQUIRED');
  const before=Timing.diagnose(evidence);
  if(before.coverage.playable>=evidence.timeline.length/2)throw Error('NO_MIXED_CLOCK_RECOVERY_NEEDED');
  const timeline=evidence.timeline.map(s=>({...s}));
  const corrections=[];
  for(const record of evidence.raw_timeline){
    const win=record.window;
    if(!win||!win.startSec||!record.raw)continue;
    const parts=record.raw.candidates?.[0]?.content?.parts||[];
    const body=parts.filter(p=>!p.thought).map(p=>p.text||'').join('');
    const parsed=AT.parseAsrResponse(body);
    const normalized=Timing.normalizeWindow(parsed.segments,win);
    if(normalized.kind!=='clip-relative')continue;
    // The retained stitched transcript must contain an uninterrupted exact-text run.
    // Search by the second cue: the first may have been trimmed by the seam stitch.
    const key=text(parsed.segments[1]?.text);
    const hits=timeline.flatMap((s,i)=>text(s.text)===key?[i]:[]);
    if(hits.length!==1)throw Error('RECOVERY_ANCHOR_AMBIGUOUS');
    const start=hits[0];
    for(let j=1;j<parsed.segments.length;j++){
      const i=start+j-1,old=timeline[i],cue=parsed.segments[j];
      if(!old||text(old.text)!==text(cue.text)||old.startSec!==cue.start)throw Error('RECOVERY_TEXT_OR_CLOCK_MISMATCH:'+i);
      old.startSec=normalized.segments[j].start;
    }
    corrections.push({window:win,first_row:start,last_row:start+parsed.segments.length-2,offset_sec:win.startSec});
  }
  if(!corrections.length)throw Error('NO_PROVEN_RELATIVE_WINDOW');
  const repaired=Timing.diagnose({...evidence,timeline});
  if(repaired.coverage.playable<=before.coverage.playable||repaired.reason!=='local-range-invalid')throw Error('RECOVERY_DID_NOT_PASS_CLOCK_CHECK');
  const rawDoc=one('tracks/raw/revisions/');
  const oldCorrected=one('tracks/corrected/revisions/');
  const oldTable=one('learning/table/revisions/');
  const raw=rawDoc.revision,corrected=oldCorrected.revision,table=oldTable;
  const rawId=rawDoc.portable_revision_id,oldCorrectedId=oldCorrected.portable_revision_id;
  const oldTableId=oldTable.portable_table_revision_id;
  if(corrected.segments.length!==repaired.segments.length||table.rows.length!==repaired.segments.length)throw Error('ROW_COUNT_MISMATCH');
  const updatedSegments=corrected.segments.map((s,i)=>{
    const interval=repaired.segments[i];
    if(interval.text!==s.text)throw Error('REPAIR_TEXT_CHANGED:'+i);
    if(interval.startSec==null)return {...s,start_ms:null,end_ms:null,quality_flags:[...new Set([...(s.quality_flags||[]),'blind'])],authority:{...s.authority,timing:'unknown'}};
    return {...s,start_ms:Math.round(interval.startSec*1000),end_ms:Math.round(interval.endSec*1000),
      quality_flags:(s.quality_flags||[]).filter(x=>x!=='blind'),authority:{...s.authority,timing:'derived'}};
  });
  Media.validateSegments(updatedSegments);
  const newHash=await Media.revisionHash('user_corrected',updatedSegments,[]);
  const newCorrectedId='caption-revision:sha256:'+newHash;
  const newTableId='table-recovery:'+newHash;
  const mediaRef=read('source/media-ref.json'),material=read('learning/material.json');
  const card=read('learning/text-card.json');
  const recoveredKey=material.portable_text_key+'-timing-recovered-'+newHash.slice(0,12);
  const recoveredTitle=material.text.title+' (время восстановлено)';
  card.card.text_key=recoveredKey;card.card.title=recoveredTitle;
  const input={
    package:{media_sha256:mediaRef.media_sha256,mime:mediaRef.mime,size_bytes:mediaRef.size_bytes,
      duration_ms:mediaRef.duration_ms,codec_hint:mediaRef.codec_hint,compatibility:mediaRef.compatibility,original_name:mediaRef.original_name},
    raw_track:{language:read('tracks/raw/track.json').language,current_revision_id:rawId},
    raw_revisions:[{...raw,revision_id:rawId}],
    corrected_track:{language:read('tracks/corrected/track.json').language,current_revision_id:newCorrectedId},
    corrected_revisions:[{...corrected,revision_id:oldCorrectedId},
      {revision_id:newCorrectedId,parent_revision_id:oldCorrectedId,revision_no:corrected.revision_no+1,
       canonical_sha256:newHash,author_kind:'import',operations:[],segments:updatedSegments,
       provenance:{timing_recovery:'retained-gemini-window-clock',zero_provider_calls:true,
         source_caption_revision_sha256:corrected.canonical_sha256,coverage:repaired.coverage,corrections}}],
    material:{portable_text_key:recoveredKey,current_table_revision_id:newTableId},
    table_revisions:[{...table,table_revision_id:oldTableId,
      rows:table.rows.map(r=>({...r,stable_row_id:r.portable_row_id,portable_row_id:undefined}))},
      {...table,table_revision_id:newTableId,parent_revision_id:oldTableId,revision_no:table.revision_no+1,
       bound_caption_revision_id:newCorrectedId,bound_caption_revision_sha256:newHash,
       impact:{kind:'timing-only-repair',zero_provider_calls:true,preserves_rows:true},
       rows:table.rows.map(r=>({...r,stable_row_id:r.portable_row_id,portable_row_id:undefined}))}],
    selected_caption_revision_id:newCorrectedId,selected_table_revision_id:newTableId,
    text:{...material.text,text_key:recoveredKey,title:recoveredTitle,tags_json:JSON.stringify(material.text.tags||[])},
    text_card:card,import_run:{...importRun,timing_recovery:{method:'retained-gemini-window-clock',zero_provider_calls:true,
      original_archive_sha256:await Core.sha256Hex(fs.readFileSync(inputPath)),original_coverage:before.coverage,
      recovered_coverage:repaired.coverage,corrections}},quality_report:read('quality/report.json'),
    playback_source:require('../../public/js/playback-source').append(source,
      {url:evidence.source.url,offset_ms:0},{now:new Date().toISOString()}),
  };
  const result=await Core.buildPackageFiles(input,{mode:'archive'});
  await Core.verifyPackageFiles(result);
  const output=new AdmZip();for(const [name,body]of Object.entries(result))output.addFile(name,Buffer.from(body,'utf8'));
  output.writeZip(outputPath);
  const reopened=new AdmZip(outputPath),roundtrip=Object.fromEntries(reopened.getEntries().filter(e=>!e.isDirectory).map(e=>[e.entryName,reopened.readAsText(e.entryName)]));
  await Core.verifyPackageFiles(roundtrip);
  console.log(JSON.stringify({output:outputPath,before:before.coverage,after:repaired.coverage,blind_rows:repaired.segments.flatMap((s,i)=>s.startSec==null?[i+1]:[]),corrections,source_sha256:await Core.sha256Hex(fs.readFileSync(inputPath)),result_sha256:await Core.sha256Hex(fs.readFileSync(outputPath))},null,2));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
