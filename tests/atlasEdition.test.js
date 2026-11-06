'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),express=require('express');
const P=require('../lib/atlasEdition'),E=require('../public/js/atlas-edition'),B=require('../scripts/atlas/build-train-bank.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-edition-test-')),source=path.join(root,'source'),dest=path.join(root,'published');
 t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('atlas-edition-test-'));fs.rmSync(root,{recursive:true,force:true});});
 const write=(name,v)=>{const p=path.join(source,name);fs.mkdirSync(path.dirname(p),{recursive:true});const b=Buffer.isBuffer(v)?v:Buffer.from(JSON.stringify(v));fs.writeFileSync(p,b);return P.sha(b);};
 const rev='a'.repeat(64),sections=Array.from({length:21},(_,i)=>({id:'s'+String(i).padStart(2,'0')+'-fixture',atlas_id:'a97001',structure_revision:rev,terms:{},pages:[{page:i+1,image:'/data/atlas/a97001/assets/p1.png',items:[]}]}));
 const shas=Object.fromEntries(sections.map(s=>[s.id,write('sections/'+s.id+'.json',s)]));
 const shards={};for(const n of ['search-details.json','search-previews.json'])shards[n]=write(n,{});
 const search={schema:'linguistpro.atlas-search.1',sections_sha256:shas,shards};
 const searchSha=write('search.json',search);write('index.json',{atlas_id:'a97001',sections:sections.map(s=>({id:s.id})),sections_sha256:shas,search_sha256:searchSha});
 write('train/terms.json',B.buildTermsIndex(sections,'a97001'));write('train/find.json',B.buildFindBank(sections,shas,'a97001'));write('structure-migration.json',{revision:rev});write('assets/p1.png',Buffer.from('fixture-image'));
 return {root,source,dest,rev,write};
}
test('publication is immutable, idempotent and keeps legacy data untouched; interrupted install retries safely',async t=>{
 const f=fixture(t),legacy=path.join(f.root,'legacy');fs.mkdirSync(legacy);fs.writeFileSync(path.join(legacy,'index.json'),'legacy-867');
 assert.throws(()=>P.stage(f.source,f.dest,{interruptAfter:2}),/INTERRUPTED/);
 assert(!fs.existsSync(path.join(f.dest,'a97001',f.rev)));
 const staged=P.stage(f.source,f.dest);assert.equal(staged.unchanged,false);assert.equal(P.stage(f.source,f.dest).unchanged,true);
 assert.equal(fs.readFileSync(path.join(legacy,'index.json'),'utf8'),'legacy-867');assert.equal(P.verifyDirectory(staged.destination,staged.manifest_sha256).structure_revision,f.rev);
 fs.writeFileSync(path.join(staged.destination,'index.json'),'corrupt');assert.throws(()=>P.stage(f.source,f.dest),/HASH/);assert.equal(fs.readFileSync(path.join(staged.destination,'index.json'),'utf8'),'corrupt','no overwrite or deletion on collision');
});
test('server serves only ready namespaces, keeps legacy routes and asset content type, and exposes no staging files',async t=>{
 const f=fixture(t),app=express();P.installRoutes(app,{dir:f.dest});app.get('/data/atlas/a97001/index.json',(_,res)=>res.json({edition:'867'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const url=base+'/data/atlas-editions/a97001/'+f.rev+'/';assert.equal((await fetch(url+'index.json')).status,503);
 const staged=P.stage(f.source,f.dest);const response=await fetch(url+'index.json');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/immutable/);
 assert.equal((await fetch(url+'assets/p1.png')).headers.get('content-type'),'image/png');assert.equal((await fetch(url+'READY.json')).status,404);
 assert.deepEqual(await (await fetch(base+'/data/atlas/a97001/index.json')).json(),{edition:'867'});
 assert.equal((await fetch(base+'/data/atlas-editions/a97001/.install-unused/index.json')).status,404);
 assert.equal(P.verifyDirectory(staged.destination,staged.manifest_sha256).structure_revision,f.rev);
});
test('pinned client rejects old/mixed cached bytes and wrong manifest, retries transient failure without legacy fallback',async t=>{
 const f=fixture(t),built=P.build(f.source),pin={atlas_id:'a97001',revision:f.rev,manifest_sha256:built.manifestSha},calls=[];let mode='offline';
 const fake=async url=>{calls.push(url);const name=url.slice(url.indexOf(f.rev+'/')+f.rev.length+1);if(mode==='offline')return new Response('',{status:503});if(name==='manifest.json')return new Response(mode==='bad-manifest'?'{}':built.manifestBytes);if(mode==='old-section'&&name.startsWith('sections/'))return new Response('{"edition":"867"}');return new Response(built.buffers[name]);};
 const client=E.createClient('a97001',{pin,fetch:fake,crypto:crypto.webcrypto});await assert.rejects(client.json('index.json'),/UNAVAILABLE/);
 mode='bad-manifest';await assert.rejects(client.json('index.json'),/MANIFEST_HASH/);mode='online';assert.equal((await client.json('index.json')).atlas_id,'a97001');
 mode='old-section';await assert.rejects(client.json('sections/s00-fixture.json'),/FILE_HASH/);mode='online';assert.equal((await client.json('sections/s00-fixture.json')).structure_revision,f.rev);
 await assert.rejects(client.url('/data/atlas/a97001/index.json'),/ROOT/);await assert.rejects(client.json('../index.json'),/PATH/);await assert.rejects(client.json('context-ai/old.json'),/NOT_PUBLISHED/);
 assert(calls.every(u=>u.startsWith('/data/atlas-editions/a97001/'+f.rev+'/')));
});
test('the edition requires the complete semantic renderer/word/train/search contract',()=>{
 const scope={AtlasReader:require('../public/js/atlas-reader'),AtlasWords:require('../public/js/atlas-words'),AtlasTrain:require('../public/js/atlas-train'),AtlasSearch:require('../public/js/atlas-search')};
 assert.equal(E.componentsReady(scope),true);
 for(const key of Object.keys(scope))assert.equal(E.componentsReady({...scope,[key]:{}}),false,key+' cannot silently be an older cached component');
});
