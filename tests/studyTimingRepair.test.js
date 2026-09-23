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
const P=require('../public/js/playback-source.js');
const YT='iG9CE55wbtY';
function youtubeCard(){
 const sha='a'.repeat(64),rows=[{he:'שלום'},{he:'עולם'}];
 const audio={media:{sha256:sha},timing:{entries:[{o:0,t:1,end:3},{o:1,t:5,end:8}]}};
 const store={source_meta_json:null};
 const ldb={dbQuery:async sql=>/FROM texts/.test(sql)?[{id:'card',source_meta_json:store.source_meta_json}]:rows,
  dbRun:async(sql,args)=>{if(args[3]===store.source_meta_json)store.source_meta_json=args[0];}};
 return {sha,rows,audio,store,ldb};
}
function repairWith(c,extra={}){
 const browser={document:{documentElement:{lang:'ru'}},PlaybackSource:P,
  StudyVideoSourceUI:{context:async()=>{const card={id:'card',source_meta_json:c.store.source_meta_json};
   return {ldb:c.ldb,card,rows:c.rows,audio:c.audio,record:P.fromText(card,c.audio),basis:await P.timingBasis(c.audio,c.rows)};}},...extra};
 browser.window=browser;vm.runInNewContext(source,browser);return browser.StudyTimingRepair;
}
test('relink restores YouTube playback when intact timing no longer matches an unreproducible confirmed basis',async()=>{
 const c=youtubeCard();
 const stale=P.append(null,{url:`https://youtu.be/${YT}`,offset_ms:1500,confirmed:true},{basis_sha256:'f'.repeat(64)});
 c.store.source_meta_json=JSON.stringify({source:{kind:'captions'},playback_source:stale});
 const api=repairWith(c);
 assert.equal((await api.playbackState('card')).stale,true);
 const result=await api.relinkPlayback('card');
 assert.equal(result.playable,2);
 const saved=JSON.parse(c.store.source_meta_json).playback_source;
 assert.equal(saved.revision,2);assert.equal(saved.history[0].timing.status,'owner-confirmed');
 const current=P.selected(saved);
 // Прежнее подтверждение владельца не переносится на другую разметку.
 assert.deepEqual(current.timing,{status:'unverified',basis_sha256:await P.timingBasis(c.audio,c.rows)});
 assert.equal(current.offset_ms,1500);assert.equal(current.source.video_id,YT);
 assert.equal((await P.youtubeView(c.audio,c.rows,saved)).reason,null);
 assert.equal((await api.playbackState('card')).stale,false);
 await assert.rejects(api.relinkPlayback('card'),/PLAYBACK_RELINK_NOT_NEEDED/);
});
test('relink never rewrites published cards or cards whose timing already plays',async()=>{
 const c=youtubeCard();
 const ok=P.append(null,{url:`https://youtu.be/${YT}`},{basis_sha256:await P.timingBasis(c.audio,c.rows)});
 c.store.source_meta_json=JSON.stringify({playback_source:ok});
 await assert.rejects(repairWith(c).relinkPlayback('card'),/PLAYBACK_RELINK_NOT_NEEDED/);
 const stale=P.append(null,{url:`https://youtu.be/${YT}`,confirmed:true},{basis_sha256:'f'.repeat(64)});
 c.store.source_meta_json=JSON.stringify({corpus:{slug:'x'},playback_source:stale});
 await assert.rejects(repairWith(c).relinkPlayback('card'),/TIMING_REPAIR_READ_ONLY/);
});
test('local repair of a card that plays from YouTube re-binds the YouTube clock to the repaired timing',async()=>{
 const h=setup();let args;
 const record=P.append(null,{url:`https://youtu.be/${YT}`,offset_ms:-500,confirmed:true},{basis_sha256:'f'.repeat(64)});
 const meta={...h.oldMeta,playback_source:record};
 const browser={document:{documentElement:{lang:'ru'}}};
 const sha=h.sha,rows=h.rows,media=h.media,binding={package_id:'p',track_id:'t',revision_id:'r'};
 const revision={revision_id:'r',segments:[{text:'שלום',start_ms:1000,end_ms:2000,authority:{text:'source',timing:'source'}}]};
 const repo={getTextBinding:async()=>binding,getRevision:async()=>revision,getPackage:async()=>media,
  commitTimingRepair:async input=>JSON.parse(await input.prepareSourceMeta({...revision,revision_id:'next'},binding,media))};
 const passport={segments:[{start:1.5,end:2.5,text:'שלום'}],media:{sha256:sha},timing:{entries:[{o:0,t:1.5,end:2.5}]},captions:{format:'srt'}};
 Object.assign(browser,{StudyVideoSourceUI:{context:async()=>({card:{source_meta_json:JSON.stringify(meta)},rows:[{he:'שלום'}],record,ldb:{dbQuery:async()=>rows}})},
  PlaybackSource:{...P,append:(...a)=>{args=a;return P.append(...a);}},
  StudioMediaPackage:{browserRepository:()=>repo,buildCompatibilityProjection:()=>({captions:{segments:revision.segments}}),verifiedRowMapping:()=>({rows:[]}),buildExactBindingPassport:()=>passport},
  MaterialRevisionRepository:{createRepository:()=>({})},MaterialRevisionCore:{}});
 browser.window=browser;vm.runInNewContext(source,browser);
 const api=browser.StudyTimingRepair,ctx=await api.context('card');
 const result=await api.apply(ctx,[{text:'שלום',startSec:1.5,endSec:2.5}],{schema:'timing-manual-v1'},'user');
 const current=P.selected(result.playback_source);
 assert.equal(result.playback_source.revision,2);assert.equal(current.offset_ms,-500);
 assert.deepEqual(current.timing,{status:'unverified',basis_sha256:await P.timingBasis(passport,[{he:'שלום'}])});
 assert.ok(args);
});
