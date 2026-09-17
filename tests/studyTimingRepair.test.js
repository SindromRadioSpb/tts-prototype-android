const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/js/study-timing-repair.js'),'utf8');
function setup(){
 const sha='a'.repeat(64),rows=[{he_plain:'שלום',translation:'Привет'}];
 const oldMeta={source:{kind:'captions',audio:{captions:{subtitle_sync:{status:'unverified'},subtitle_track_sha256:'b'.repeat(64)},media:{sha256:sha}}},playback_source:{untouched:true}};
 const card={source_meta_json:JSON.stringify(oldMeta)};
 const binding={package_id:'p',track_id:'t',revision_id:'r'},revision={revision_id:'r',segments:[{text:'שלום',start_ms:1000,end_ms:2000,authority:{text:'source',timing:'source'}}]};
 const media={media_sha256:sha,duration_ms:10000,opfs_path:'media/'+sha+'.mp4'};
 let submitted,appended=0;
 const repo={getTextBinding:async()=>binding,getRevision:async()=>revision,getPackage:async()=>media,
  commitTimingRepair:async input=>{submitted=input;return JSON.parse(await input.prepareSourceMeta({...revision,revision_id:'next'},binding,media));}};
 const browser={document:{documentElement:{lang:'ru'}},StudyVideoSourceUI:{context:async()=>({card,rows,record:null,ldb:{dbQuery:async()=>rows}})},
  PlaybackSource:{parseMeta:JSON.parse,isPublished:()=>false,selected:()=>null,append:()=>{appended++;throw Error('unexpected YouTube mutation');}},
  StudioMediaPackage:{browserRepository:()=>repo,buildCompatibilityProjection:()=>({captions:{segments:revision.segments}}),
   verifiedRowMapping:()=>({rows:[]}),buildExactBindingPassport:()=>({segments:revision.segments,media:{sha256:sha},captions:{format:'srt'}})},
  MaterialRevisionRepository:{createRepository:()=>({})},MaterialRevisionCore:{}};
 browser.window=browser;vm.runInNewContext(source,browser);
 return {api:browser.StudyTimingRepair,sha,rows,oldMeta,media,submission:()=>submitted,appended:()=>appended};
}
test('local timing repair binds its journal to media SHA and preserves subtitle provenance without a YouTube source',async()=>{
 const h=setup(),ctx=await h.api.context('card');
 assert.equal(ctx.source.kind,'local');assert.equal(ctx.source.sha256,h.sha);assert.ok(ctx.journalKey.endsWith(h.sha));
 const result=await h.api.apply(ctx,[{text:'שלום',startSec:1.5,endSec:2.5}],{schema:'timing-manual-v1'},'user');
 assert.deepEqual(result.playback_source,h.oldMeta.playback_source);assert.equal(h.appended(),0);
 assert.equal(result.source.audio.media.sha256,h.sha);
 assert.equal(result.source.audio.captions.subtitle_sync.status,'unverified');
 assert.equal(result.source.audio.captions.subtitle_track_sha256,'b'.repeat(64));
 assert.equal(h.submission().segments[0].start_ms,1500);
 assert.equal(h.submission().segments[0].authority.timing,'user');
 assert.equal(h.submission().expected_rows_json,JSON.stringify(h.rows));
});
test('local repair rejects absent media identity or duration',async()=>{
 for(const field of ['media_sha256','duration_ms']){const h=setup();delete h.media[field];await assert.rejects(h.api.context('card'),/TIMING_SOURCE_MISMATCH/);}
});
