const test=require('node:test'),assert=require('node:assert/strict');
const Import=require('../public/js/subtitle-material-import');
const fs=require('node:fs'),vm=require('node:vm');
const keyOptions=()=>({sourceSha256:'a'.repeat(64),plan:{audio:{index:2},text:{index:7},translation:{index:4},signal_track_indexes:[6],plan_sha256:'b'.repeat(64),lite_plan_sha256:'c'.repeat(64)},tracks:[4,6,7].map(index=>({index,sha256:String(index).repeat(64)})),lite:true});
test('repeat identity binds source, selected tracks, preparation and lite choice, not inventory order',async()=>{
 const opts=keyOptions(),key=await Import.materialImportKey(opts);
 assert.match(key,/^[a-f0-9]{64}$/);
 assert.equal(await Import.materialImportKey({...opts,tracks:opts.tracks.slice().reverse()}),key);
 for(const edit of [o=>o.sourceSha256='d'.repeat(64),o=>o.plan.audio.index=3,o=>o.plan.translation=null,o=>o.lite=false,o=>o.tracks[0].sha256='e'.repeat(64)]){
  const changed=keyOptions();edit(changed);assert.notEqual(await Import.materialImportKey(changed),key);
 }
 assert.equal(await Import.materialImportKey({...opts,tracks:[]}),null);
});
test('saved material lookup verifies provenance rather than a text occurrence of the key',async()=>{
 const key=await Import.materialImportKey(keyOptions());let reads=0;
 const db={dbQuery:async(sql,args)=>{reads++;assert.equal(args[0],'%'+key+'%');return [
  {id:'not-a-match',source_meta_json:JSON.stringify({note:key})},
  {id:'saved',source_meta_json:JSON.stringify({source:{captions:{captions:{material_import_key:key}}}})}];}};
 assert.equal(await Import.findSavedMaterial(db,key),'saved');assert.equal(reads,1);
 assert.equal(await Import.findSavedMaterial(db,'invalid'),null);assert.equal(reads,1);
});
test('the real import flow opens an existing card before conversion, OPFS writes or vocalization',async()=>{
 const opts=keyOptions(),key=await Import.materialImportKey(opts),calls=[];
 const source=fs.readFileSync(require.resolve('../public/js/studio-import.js'),'utf8');
 const start=source.indexOf('  async function buildSubtitleMaterial()'),end=source.indexOf('  function renderAudioMeta()',start);
 const material={plan:{...opts.plan,status:'ready'},tracks:opts.tracks};
 const context={pendingSubtitleMaterial:material,pendingAudio:{mediaJobId:'job'},
  localAsrClient:{getMediaJob:async()=>{calls.push('probe');return {source_sha256:opts.sourceSha256};}},
  setBusy(){},setSubtitlePlanStatus(){},renderSubtitlePlan(){},$:()=>({checked:true}),close:()=>calls.push('close'),
  window:{SubtitleMaterialImport:Import,ensureLocalDB:async()=>({dbQuery:async()=>[{id:'existing',source_meta_json:JSON.stringify({source:{captions:{captions:{material_import_key:key}}}})}]}),
   v3LibraryOpenText:async id=>calls.push('open:'+id)}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);await context.buildSubtitleMaterial();
 assert.deepEqual(calls,['probe','open:existing','close']);assert.equal(material.applied,true);assert.equal(material.working,false);
});
