'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const JSZip=require('jszip'),express=require('express'),api=require('../lib/atlasMaterialExport');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t,id,pinned=false){
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-export-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
 const revision='a'.repeat(64),root=path.join(tmp,pinned?'atlas-editions':'atlas',id,...(pinned?[revision]:[]));
 async function put(root,n,data){const b=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data));await fs.mkdir(path.dirname(path.join(root,n)),{recursive:true});await fs.writeFile(path.join(root,n),b);return {sha256:hash(b),bytes:b.length};}
 const files={};files['index.json']=await put(root,'index.json',{schema:'linguistpro.atlas-reader-index.1.0.0',atlas_id:id,sections:[{id:'s01-test'}]});
 files['sections/s01-test.json']=await put(root,'sections/s01-test.json',{atlas_id:id,pages:[{page:1,image:'/data/atlas/'+id+'/assets/a.png',items:[{id:id+':p1:b1',he:'שלום',unknown:{keep:true}}]}]});
 files['assets/a.png']=await put(root,'assets/a.png',Buffer.from([0,1,2,255]));
 const source=path.join(tmp,'atlas-sources',id);const pdf=await put(source,'source.pdf',Buffer.from('pdf-fixture'));
 await put(source,'manifest.json',{atlas_id:id,pdf:'source.pdf',files:{'source.pdf':pdf}});
 const pins={};
 if(pinned){
  const manifest=await put(root,'manifest.json',{files});
  const layer=Buffer.from('{"rows":[]}'),cm=Buffer.from(JSON.stringify({edition_manifest_sha256:manifest.sha256,files:{'s01-test.json':{sha256:hash(layer),bytes:layer.length}}}));
  const context=path.join(tmp,'context',id,hash(cm));await put(context,'manifest.json',cm);await put(context,'s01-test.json',layer);
  pins[id]={revision,manifest_sha256:manifest.sha256,context_sha256:hash(cm)};
 }
 return {tmp,root,source,pins,options:{dataDir:tmp,contextDir:path.join(tmp,'context'),pins},put};
}
for(const [id,pinned] of [['a97001',true],['a97002',false],['future-atlas',false]])test('full ZIP preserves '+id,async t=>{
 const f=await fixture(t,id,pinned),service=api.createService(f.options),out=path.join(f.tmp,'result');
 const result=await service.build(id,out),zip=await JSZip.loadAsync(await fs.readFile(result.zipPath));
 assert.equal(result.manifest.learner_data_included,false);
 assert.equal(result.manifest.ai_dependency_state,pinned?'pinned_dependencies_unchanged':'unverified_requires_review');
 assert.match(result.manifest.ai_dependencies_sha256,/^[a-f0-9]{64}$/);
 for(const [n,v] of Object.entries(result.manifest.files)){const b=await zip.file(n).async('nodebuffer');assert.equal(hash(b),v.sha256);assert.equal(b.length,v.bytes);}
 for(const [n,v] of Object.entries(result.manifest.support_files)){const b=await zip.file(n).async('nodebuffer');assert.equal(hash(b),v.sha256);assert.equal(b.length,v.bytes);}
 assert(zip.file('tools/material_package.py'));
 assert.deepEqual(JSON.parse(await zip.file('edition/sections/s01-test.json').async('string')).pages[0].items[0].unknown,{keep:true});
 assert(zip.file('sources/source.pdf'));assert.equal(!!zip.file('context/s01-test.json'),pinned);
});
test('missing source, tampered source and missing image fail closed',async t=>{
 const f=await fixture(t,'a97002'),service=api.createService(f.options);
 await fs.unlink(path.join(f.root,'assets/a.png'));await assert.rejects(service.build('a97002',path.join(f.tmp,'missing-image')),/ASSET_MISSING/);
 await f.put(f.root,'assets/a.png',Buffer.from('image'));
 await fs.writeFile(path.join(f.source,'source.pdf'),'tampered');await assert.rejects(service.build('a97002',path.join(f.tmp,'tampered')),/FILE_MISMATCH/);
 await fs.unlink(path.join(f.source,'manifest.json'));await assert.rejects(service.inventory('a97002'),/SOURCE_PACKAGE_REQUIRED/);
 await assert.rejects(service.inventory('../escape'),/UNKNOWN_CORPUS/);
});
test('API enforces owner and serves native download',async t=>{
 const f=await fixture(t,'a97002'),app=express();
 api.installRoutes(app,{...f.options,requireUser:async(req,res)=>{if(!req.headers['x-role']){res.sendStatus(401);return null;}return {user:{role:req.headers['x-role']}};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 for(const suffix of ['','.zip']){
  assert.equal((await fetch(base+'/api/atlas/a97002/material-export'+suffix)).status,401);
  assert.equal((await fetch(base+'/api/atlas/a97002/material-export'+suffix,{headers:{'x-role':'member'}})).status,403);
 }
 const r=await fetch(base+'/api/atlas/a97002/material-export.zip',{headers:{'x-role':'owner'}});assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);
 const zip=await JSZip.loadAsync(await r.arrayBuffer());assert(zip.file('manifest.json'));
 for(let i=0;i<100 && (await fs.readdir(path.join(f.tmp,'atlas-export-tmp'))).length;i++)await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(await fs.readdir(path.join(f.tmp,'atlas-export-tmp')),[]);
});
test('legacy corpus changed during snapshot is rejected',async t=>{
 const f=await fixture(t,'a97002'),service=api.createService(f.options),original=fs.readFile;let indexReads=0;
 fs.readFile=async function(p,...args){
  if(String(p)===path.join(f.root,'index.json') && ++indexReads===3)
   await fs.writeFile(path.join(f.root,'assets/a.png'),'changed while exporting');
  return original.call(this,p,...args);
 };
 try{await assert.rejects(service.build('a97002',path.join(f.tmp,'race')),/SOURCE_CHANGED/);}
 finally{fs.readFile=original;}
});
test('legacy content must match its registered editorial provenance',async t=>{
 const f=await fixture(t,'a97002'),service=api.createService(f.options);
 const p=path.join(f.root,'sections/s01-test.json'),d=JSON.parse(await fs.readFile(p,'utf8'));
 d.id='s01-test';d.source_pack_sha256='b'.repeat(64);d.content_pack_sha256='c'.repeat(64);await f.put(f.root,'sections/s01-test.json',d);
 await assert.rejects(service.build('a97002',path.join(f.tmp,'unbound')),/SOURCE_BINDING_MISMATCH/);
 const manifest=JSON.parse(await fs.readFile(path.join(f.source,'manifest.json'),'utf8'));manifest.sections={'s01-test':{source_pack_sha256:d.source_pack_sha256,content_pack_sha256:d.content_pack_sha256}};
 await f.put(f.source,'manifest.json',manifest);
 assert((await service.build('a97002',path.join(f.tmp,'bound'))).manifest);
});

async function nativeFixture(t){
 const f=await fixture(t,'a97001',true),id='a97001rc32',pin={...f.pins.a97001,atlas_id:'a97001'};delete pin.context_sha256;f.pins[id]=pin;
 const source=path.join(f.tmp,'atlas-sources',id),pdf=await f.put(source,'source.pdf',Buffer.from('pdf-fixture'));
 const descriptor={atlas_id:id,source_atlas_id:'a97001',edition_revision:pin.revision,edition_manifest_sha256:pin.manifest_sha256,pdf:'source.pdf',files:{'source.pdf':pdf}};
 await f.put(source,'manifest.json',descriptor);return {...f,id,pin,nativeSource:source,descriptor};
}
test('separate RC3.2 corpus exports immutable supplier identity without borrowing the original AI layer',async t=>{
 const f=await nativeFixture(t),service=api.createService(f.options),result=await service.build(f.id,path.join(f.tmp,'native-export'));
 assert.equal(result.manifest.atlas_id,f.id);assert.equal(result.manifest.source_atlas_id,'a97001');
 assert.equal(result.manifest.edition_manifest_sha256,f.pin.manifest_sha256);assert.equal(result.manifest.ai_layer_included,false);
 assert.equal(result.manifest.ai_dependency_state,'no_ai_layer');
 const zip=await JSZip.loadAsync(await fs.readFile(result.zipPath));
 assert.equal(JSON.parse(await zip.file('edition/index.json').async('string')).atlas_id,'a97001');
 assert.equal(await zip.file('edition/sections/s01-test.json').async('string'),await fs.readFile(path.join(f.root,'sections/s01-test.json'),'utf8'));
 assert(!Object.keys(zip.files).some(n=>n.startsWith('context/')));assert(zip.file('sources/source.pdf'));
 assert((await service.inventory('a97001')).pin.context_sha256,'original context pin unchanged');
});
test('RC3.2 sources must bind the exact supplier edition',async t=>{
 const f=await nativeFixture(t),service=api.createService(f.options);
 await f.put(f.nativeSource,'manifest.json',{...f.descriptor,edition_revision:'f'.repeat(64)});
 await assert.rejects(service.inventory(f.id),/SOURCE_BINDING_MISMATCH/);
});

test('RC3.2 full export includes its addressed map and checks context/source dependency binding',async t=>{
 const f=await nativeFixture(t),service=api.createService(f.options),base=await service.build(f.id,path.join(f.tmp,'before-context'));
 const map=Buffer.from('{"synthetic":"address map"}'),layer=Buffer.from('{"synthetic":"candidate"}');
 const cm={schema:'linguistpro.atlas-context.1',atlas_id:f.id,source_atlas_id:'a97001',edition_revision:f.pin.revision,edition_manifest_sha256:f.pin.manifest_sha256,
  source_pdf_sha256:base.manifest.pdf_sha256,ai_dependencies_sha256:base.manifest.ai_dependencies_sha256,
  alignment_adapter:{path:'addressed-map.json',sha256:hash(map),bytes:map.length},files:{'s01-test.json':{sha256:hash(layer),bytes:layer.length}}};
 const bytes=Buffer.from(JSON.stringify(cm)),pin=hash(bytes),dir=path.join(f.options.contextDir,f.id,pin);
 await f.put(dir,'manifest.json',bytes);await f.put(dir,'addressed-map.json',map);await f.put(dir,'s01-test.json',layer);
 f.pin.context_sha256=pin;f.pin.context_source_binding={ai_dependencies_sha256:base.manifest.ai_dependencies_sha256};
 const result=await service.build(f.id,path.join(f.tmp,'with-context')),zip=await JSZip.loadAsync(await fs.readFile(result.zipPath));
 assert.equal(result.manifest.ai_layer_included,true);assert.equal(await zip.file('context/addressed-map.json').async('string'),map.toString());
 assert.equal(result.manifest.ai_dependencies_sha256,base.manifest.ai_dependencies_sha256);
 await f.put(dir,'addressed-map.json',Buffer.from('corrupt'));await assert.rejects(service.build(f.id,path.join(f.tmp,'corrupt-map')),/FILE_MISMATCH/);
 f.pin.context_source_binding.ai_dependencies_sha256='0'.repeat(64);await assert.rejects(service.inventory(f.id),/CONTEXT_SOURCE_BINDING/);
 assert((await service.inventory('a97001')).pin.context_sha256,'original pin retained');
});
test('RC3.2 ZIP API retains owner-only authorization on inventory and download',async t=>{
 const f=await nativeFixture(t),app=express();
 api.installRoutes(app,{...f.options,requireUser:async(req,res)=>{const role=req.headers['x-role'];if(!role){res.sendStatus(401);return null;}return {user:{role}};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 for(const suffix of ['','.zip'])for(const [role,status]of [[null,401],['member',403]])assert.equal((await fetch(base+'/api/atlas/'+f.id+'/material-export'+suffix,{headers:role?{'x-role':role}:{}})).status,status);
 const response=await fetch(base+'/api/atlas/'+f.id+'/material-export.zip',{headers:{'x-role':'owner'}});assert.equal(response.status,200);
 assert.equal(response.headers.get('x-atlas-revision'),f.pin.revision);assert.match(response.headers.get('content-disposition'),/a97001rc32-full-material/);
 const zip=await JSZip.loadAsync(await response.arrayBuffer());assert.equal(JSON.parse(await zip.file('manifest.json').async('string')).atlas_id,f.id);
 for(let i=0;i<100 && (await fs.readdir(path.join(f.tmp,'atlas-export-tmp'))).length;i++)await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(await fs.readdir(path.join(f.tmp,'atlas-export-tmp')),[]);
});
