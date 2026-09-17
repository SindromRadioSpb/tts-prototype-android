const test=require('node:test'),assert=require('node:assert/strict');
const Status=require('../public/js/subtitle-timing-status');
function fixture(status='aligned'){
 const evidence={schema:'subtitle-speech-sync-v1',status,apply_offset_ms:0,input_sha256:'a'.repeat(64),source_sha256:'b'.repeat(64),subtitle_sha256:'c'.repeat(64),audio_stream_index:2};
 const raw={revision_id:'raw',segments:[{text:'שלום',start_ms:1000,end_ms:2000}],provenance:{captions:{origin:'container-track',subtitle_sync:evidence,source_sha256:evidence.source_sha256,subtitle_track_sha256:evidence.subtitle_sha256,audio_stream_index:2}}};
 return {raw,evidence};
}
test('persisted subtitle timing distinguishes unverified, sampled alignment, and review',()=>{
 for(const status of ['unverified','aligned','needs_review']){const {raw}=fixture(status);assert.equal(Status.inspectHistory([{parent_revision_id:'raw',operations:[]},raw]).status,status);}
 const {raw}=fixture();raw.provenance.captions.subtitle_sync.source_sha256='d'.repeat(64);
 assert.equal(Status.inspectHistory([raw]).status,'unverified');assert.equal(Status.inspectHistory([{provenance:{asr:{}}}]),null);
});
test('automatic correction requires bound evidence and the exact recorded shift',()=>{
 const {raw,evidence}=fixture('correctable');evidence.apply_offset_ms=750;
 const corrected={operations:[{type:'offset'}],segments:[{text:'שלום',start_ms:1750,end_ms:2750}],provenance:{surface:'subtitle-speech-sync',subtitle_sync:evidence}};
 assert.deepEqual(Status.inspectHistory([corrected,raw]),{status:'corrected',offset_ms:750});
 corrected.segments[0].start_ms=1800;assert.equal(Status.inspectHistory([corrected,raw]).status,'unverified');
});
test('later manual or text changes never inherit whole-video alignment',()=>{
 const {raw}=fixture();
 assert.equal(Status.inspectHistory([{author_kind:'user',operations:[{type:'timing-repair'}],provenance:{schema:'timing-repair-v1'}},raw]).status,'manual_changes');
 assert.equal(Status.inspectHistory([{operations:[{type:'text'}]},raw]).status,'unverified');
});
test('reopening resolves persisted parent revisions read-only and terminates on cycles',async()=>{
 const {raw}=fixture();const copied={revision_id:'copy',parent_revision_id:'raw',operations:[]};
 const reads=[];const repo={getTextBinding:async()=>({revision_id:'copy'}),getRevision:async id=>{reads.push(id);return id==='copy'?copied:raw;}};
 assert.equal((await Status.forText(repo,'card')).status,'aligned');assert.deepEqual(reads,['copy','raw']);
 copied.parent_revision_id='copy';assert.equal(await Status.forText(repo,'card'),null);
});
