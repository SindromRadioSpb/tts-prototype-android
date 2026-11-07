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
