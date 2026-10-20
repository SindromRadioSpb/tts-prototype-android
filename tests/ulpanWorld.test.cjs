'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),PACK=path.join(ROOT,'public/worlds/ulpan-journey');
const read=file=>JSON.parse(fs.readFileSync(path.join(PACK,file),'utf8'));
const {core}=require(path.join(ROOT,'public/js/world-engine.js'));
test('native Ulpan pack validates and all seven stops exist on each surface',()=>{
 const pack=read('manifest.json'),atlas=read('atlas.json');assert.deepEqual(core.validatePack(pack,atlas,pack.id),{ok:true,errors:[]});
 const route=pack.ulpan.story.map(s=>s.id);assert.equal(route.length,7);
 for(const surface of Object.values(pack.surfaces))assert.deepEqual(surface.route,route);
 assert.equal(core.readChoice(null).id,'memorial-three-scenes');
 const bad=structuredClone(pack);bad.locations.reading.symbol='<script>';assert.equal(core.validatePack(bad,atlas,bad.id).ok,false);
});
test('runtime pack is data and PNG only; decoded atlas bounds and exact hashes match',()=>{
 const atlas=read('atlas.json');
 for(const file of fs.readdirSync(PACK))assert.match(file,/^(manifest\.json|atlas\.json|[a-z0-9-]+\.png)$/);
 for(const sheet of Object.values(atlas.atlases)){
  const data=fs.readFileSync(path.join(PACK,sheet.file));assert.equal(data.length,sheet.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),sheet.sha256);
  assert.equal(data.readUInt32BE(16),sheet.width);assert.equal(data.readUInt32BE(20),sheet.height);
  for(const frame of Object.values(sheet.frames)){assert.ok(frame.x>=0&&frame.y>=0);assert.ok(frame.x+frame.w<=sheet.width);assert.ok(frame.y+frame.h<=sheet.height)}
 }
});
test('all 29 lines have complete RU/EN/HE text and belong to characters present in the scene',()=>{
 const pack=read('manifest.json');let count=0;
 for(const scene of pack.ulpan.story){
  const allowed=new Set(['hero','timsah']);if(scene.id==='market')allowed.add('seller');if(scene.id==='workshop')allowed.add('master');if(scene.id==='reading')allowed.add('teacher');
  for(const beat of scene.beats){count++;assert.ok(allowed.has(beat.who));for(const locale of ['ru','he','en']){assert.ok(beat.text[locale].length>5);assert.doesNotMatch(beat.text[locale],/[<>]/)}}
 }
 assert.equal(count,29);
});
test('app-owned Ulpan renderer has no network, learner storage, new audio or independent timer',()=>{
 const source=fs.readFileSync(path.join(ROOT,'public/js/ulpan-world.js'),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|localStorage|indexedDB|review_log|word_study|new Audio|AudioContext|setInterval|setTimeout|requestAnimationFrame/);
 assert.match(source,/opts\.onActor/);assert.match(source,/destroy\(\)/);
});
