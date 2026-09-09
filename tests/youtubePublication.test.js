const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../public/js/playback-source'),{sanitizeSnapshot,canonicalJson}=require('../db/publicationRepo');
test('publication retains validated YouTube history and table while stripping private runtime metadata',()=>{
  const record=P.append(null,{url:'https://www.youtube.com/watch?v=djzKaEoqka8'},{now:'2026-09-09T00:00:00Z'});
  const source={playback_source:record,learning_material_task:{id:'private'},audio:{media:{opfsPath:'private-file',sha256:'a'.repeat(64)},timing:{entries:[{o:0,t:1,end:2}]}},geminiApiKey:'secret',review_log:[{grade:3}]};
  const result=sanitizeSnapshot({library:{texts:[{source_meta_json:JSON.stringify(source),table_model_meta_json:JSON.stringify({apiKey:'secret',source}),rows:[{he:'שלום',ru:'Привет'}]}]}});
  const meta=JSON.parse(result.library.texts[0].source_meta_json),table=JSON.parse(result.library.texts[0].table_model_meta_json);
  assert.deepEqual(meta.playback_source,record);assert.equal(meta.audio.media.opfsPath,undefined);assert.equal(meta.learning_material_task,undefined);assert.equal(table.apiKey,undefined);assert.equal(meta.geminiApiKey,undefined);assert.equal(meta.review_log,undefined);assert.equal(result.library.texts[0].rows[0].he,'שלום');
  assert.equal(canonicalJson(result).includes('secret'),false);
});
test('publication rejects invalid playback source including nested JSON metadata',()=>{for(const value of [{playback_source:{url:'https://evil.test'}},{source_meta_json:JSON.stringify({playback_source:{url:'https://evil.test'}})}])assert.throws(()=>sanitizeSnapshot(value),/SOURCE_SNAPSHOT_INVALID/);});
test('text-card video summary honors explicit source and detach without a media passport',()=>{
  const F=require('../public/js/text-card-format');
  const record=P.append(null,{url:'https://www.youtube.com/watch?v=djzKaEoqka8'});
  assert.equal(F.cardMediaSummary({source_meta:{playback_source:record}}).videoId,'djzKaEoqka8');
  const detached=P.append(record,{remove:true});
  assert.equal(F.cardMediaSummary({source_meta:{playback_source:detached,source:{captions:{video:{videoId:'iG9CE55wbtY'}}}}}).videoId,null);
});
