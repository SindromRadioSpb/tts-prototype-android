'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),sqlite3=require('sqlite3');
const M=require('../public/js/mediatheque-metadata'),P=require('../public/js/playback-source');
test('metadata projection reads actual YouTube ASR passport, omits transcripts and respects detach',async t=>{
 const db=new sqlite3.Database(':memory:');t.after(()=>new Promise(r=>db.close(r)));
 const query=(sql,params)=>new Promise((r,j)=>db.all(sql,params,(e,v)=>e?j(e):r(v)));
 const source={source:{captions:{video:{videoId:'iG9CE55wbtY'},media:{durationSec:480.5},captions:{language:'he'},segments:[{text:'private-transcript'}]}},apiKey:'private-key'};
 const project=async s=>M.normalize((await query(`SELECT ${M.projectionSql('source','tablemeta')} value FROM (SELECT ? source, '{}' tablemeta)`,[JSON.stringify(s)]))[0].value);
 const actual=await project(source);assert.equal(actual.videoId,'iG9CE55wbtY');assert.equal(actual.durationSeconds,480.5);assert.equal(actual.language,'he');assert.equal(actual.hasCaptions,true);
 assert.ok(!JSON.stringify(actual).includes('private'));
 source.playback_source=P.append(null,{url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},{now:'2026-09-12T00:00:00Z'});
 assert.equal((await project(source)).videoId,'dQw4w9WgXcQ');
 source.playback_source=P.append(source.playback_source,{remove:true},{now:'2026-09-12T01:00:00Z'});assert.equal((await project(source)).videoId,null);
 const missing=await project({});assert.equal(missing.durationSeconds,null);assert.equal(missing.language,'');assert.equal(missing.hasCaptions,false);
});
