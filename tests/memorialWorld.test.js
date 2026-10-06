"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {core}=require('../public/js/world-engine'),{clockState}=require('../public/js/memorial-adapter');
const root=path.resolve(__dirname,'../public/worlds/memorial-three-scenes'),read=f=>fs.readFileSync(path.join(root,f)),pack=JSON.parse(read('manifest.json')),atlas=JSON.parse(read('atlas.json'));
test('native memorial pack validates in the current engine and preserves source PNG bytes',()=>{
 assert.deepEqual(core.validatePack(pack,atlas,pack.id),{ok:true,errors:[]});assert.equal(core.REGISTRY[pack.id].pack,'1.0.0');
 const originals=['21db6cc061f5efb49ff172c95c150d06c1256b435eaf7334a6e8ff6c2f156b36','0c8fb5d752c8fd989430f37ce2a5c8c0ca86381b9959cd3cc76487c22d647d7e','6ac3a46c0c9ba326aab5246985dc724ea21d34109559ebecc4d960fdc5636f4b'];
 originals.forEach((hash,i)=>assert.equal(crypto.createHash('sha256').update(read(`scene-${i+1}-original.png`)).digest('hex'),hash));
 for(const asset of Object.values(atlas.atlases)){const bytes=read(asset.file);assert.equal(bytes.length,asset.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
 for(const name of fs.readdirSync(root))assert.match(name,/\.(json|png)$/);
 assert.doesNotMatch(JSON.stringify({pack,atlas}),/timsah|https?:|\.js|audio|rewards/i);
 for(const surface of Object.values(pack.surfaces))assert.equal(surface.route,false);
});
test('carousel counts active time, preserves manual hold, and never catches up hidden time',()=>{
 const c=clockState();c.tick(0,false);for(let t=1000;t<=89000;t+=1000)assert.equal(c.tick(t,false),null);assert.equal(c.tick(90000,false),2);
 c.manual(3);for(let t=91000;t<200000;t+=1000)assert.equal(c.tick(t,false),null);assert.equal(c.value().scene,3);
 c.auto();c.tick(200000,false);c.tick(201000,false);const elapsed=c.value().elapsed;c.resetClock();c.tick(999999,false);assert.equal(c.value().elapsed,elapsed);
 c.pause(true);assert.equal(c.tick(1000999,false),null);assert.equal(c.value().elapsed,elapsed);
});
