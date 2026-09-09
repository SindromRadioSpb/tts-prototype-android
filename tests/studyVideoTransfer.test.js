const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../public/js/study-video-transfer');
const input={schema:1,video_id:'djzKaEoqka8',title:'Test',locale:'he',return_path:'/library.html',rows:[{he:'שלום',ru:'Привет',tr:'shalom',profile:{secret:true}}],entries:[{o:0,t:1,end:2}],geminiApiKey:'secret'};
test('handoff only carries bounded reading fields and preserves timing',()=>{const out=T.validate(input);assert.equal(out.geminiApiKey,undefined);assert.equal(out.rows[0].profile,undefined);assert.deepEqual(out.entries,input.entries);assert.equal(out.locale,'he');});
test('handoff rejects malformed row mapping and source; closes redirect surface',()=>{assert.throws(()=>T.validate({...input,video_id:'evil'}));assert.throws(()=>T.validate({...input,entries:[{o:3,t:1}]}));assert.equal(T.validate({...input,return_path:'//evil.example/'}).return_path,'/index.html');assert.throws(()=>T.validate({...input,rows:[]}));});
test('handoff total-size bound refuses large snapshots',()=>{assert.throws(()=>T.validate({...input,rows:Array.from({length:1000},()=>({he:'א'.repeat(20000)}))}),/TOO_LARGE/);});
