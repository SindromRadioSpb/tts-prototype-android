const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Core=require('../public/js/subtitle-material-core');

test('table construction keeps SDH marks separate from forced speech and excludes unknown timing evidence',async()=>{
 const cue=(start,text)=>({start,end:start+1,text});
 const tracks=[
  {index:7,language:'he',cues:[cue(0,'שלום.'),cue(2,'כן.'),cue(4,'[בעברית] בוא.')]},
  {index:4,language:'ru',cues:[cue(0,'Привет.'),cue(2,'Да.'),cue(4,'Иди.')]},
  {index:8,language:'he',disposition:{hearing_impaired:1},cues:[cue(0,'[בערבית] שלום.'),cue(2,'[מוזיקה] כן.'),cue(4,'[באנגלית] בוא.')]},
 ];
 const plan=Core.buildMaterialPlan({tracks,readiness:{audio_selection:{index:2}},targetLanguage:'he',translationLanguage:'ru'});
 assert.deepEqual(plan.signal_track_indexes,[8]);
 let assessed;
 const context={window:{SubtitleMaterialCore:Core,SubtitleMaterialImport:{assessSubtitleSync:async opts=>{assessed=opts.cues;return {status:'unverified'};}},
  MediaReadiness:{compatibilityEvidence:()=>null}},pendingSubtitleMaterial:{},pendingAudio:{mediaJobId:'fixture'},
  localAsrClient:{},subtitlePlanTracks:()=>tracks,subtitleTranslationLanguage:()=>'ru',setSubtitlePlanStatus(){},showPreview(){}};
 const source=fs.readFileSync(path.join(__dirname,'../public/js/studio-import.js'),'utf8');
 const start=source.indexOf('  async function buildSubtitleTable('),end=source.indexOf('  async function applySubtitleMaterial(',start);
 assert.ok(start>0&&end>start);
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const rows=await context.buildSubtitleTable(plan,{opfsPath:'fixture'},{});
 assert.deepEqual(rows.map(r=>r.he),['שלום.','כן.','בוא.']);
 assert.deepEqual(rows.map(r=>r.ru),['Привет.','Да.','Иди.']);
 assert.deepEqual(rows.map(r=>JSON.parse(r.translation_meta_json).speech_language),['other','target_assumed','unknown']);
 assert.deepEqual(Array.from(assessed,c=>c.start),[2]);
});
