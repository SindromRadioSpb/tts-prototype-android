'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const ATLAS='a97001',REV=/^[a-f0-9]{64}$/,FILE=/^(?:(?:index|structure-migration|search(?:-details|-previews)?|sections\/s[0-9]{2}-[a-z0-9-]+|train\/(?:terms|find))\.json|assets\/[A-Za-z0-9_.-]+\.(?:png|jpg|webp))$/;
function build(source,findFile,sharedAssets){
 const read=n=>fs.readFileSync(n==='train/find.json'&&findFile?findFile:path.join(source,n));
 const index=JSON.parse(read('index.json'));if(index.atlas_id!==ATLAS||index.sections.length!==21)throw Error('ATLAS_EDITION_INDEX');
 const names=['index.json','structure-migration.json','search.json','search-details.json','search-previews.json','train/terms.json','train/find.json',...index.sections.map(s=>'sections/'+s.id+'.json')].sort();
 const files={},buffers={};let revision;
 for(const n of names){if(!FILE.test(n))throw Error('ATLAS_EDITION_PATH');const b=read(n),data=JSON.parse(b);buffers[n]=b;files[n]={sha256:sha(b),bytes:b.length};
  if(n.startsWith('sections/')){if(data.atlas_id!==ATLAS||!REV.test(data.structure_revision)||revision&&data.structure_revision!==revision||index.sections_sha256[data.id]!==sha(b))throw Error('ATLAS_EDITION_SECTION');revision=data.structure_revision;}
 }
 const search=JSON.parse(buffers['search.json']);if(index.search_sha256!==files['search.json'].sha256||JSON.stringify(search.sections_sha256)!==JSON.stringify(index.sections_sha256))throw Error('ATLAS_EDITION_SEARCH');
 for(const n of ['search-details.json','search-previews.json'])if(search.shards[n]!==files[n].sha256)throw Error('ATLAS_EDITION_SHARD');
 const bank=JSON.parse(buffers['train/find.json']);if(require('../public/js/atlas-train').findBankStatus(bank,index,ATLAS)!=='ready')throw Error('ATLAS_EDITION_FIND');
 const sections=index.sections.map(s=>JSON.parse(buffers['sections/'+s.id+'.json']));
 if(JSON.stringify(require('../scripts/atlas/build-train-bank.cjs').buildTermsIndex(sections,ATLAS))!==buffers['train/terms.json'].toString())throw Error('ATLAS_EDITION_TERMS');
 const assets=new Set();function visit(v){if(typeof v==='string'&&v.startsWith('/data/atlas/a97001/assets/'))assets.add(v.slice('/data/atlas/a97001/'.length));else if(v&&typeof v==='object')Object.values(v).forEach(visit);}
 sections.forEach(visit);
 for(const n of [...assets].sort()){if(!FILE.test(n))throw Error('ATLAS_EDITION_ASSET_PATH');const own=path.join(source,n),p=fs.existsSync(own)?own:sharedAssets&&path.join(sharedAssets,path.basename(n));if(!p)throw Error('ATLAS_EDITION_ASSET_MISSING');const b=fs.readFileSync(p);if(/^[a-f0-9]{64}\.png$/.test(path.basename(n))&&path.basename(n,'.png')!==sha(b))throw Error('ATLAS_EDITION_ASSET_HASH');buffers[n]=b;files[n]={sha256:sha(b),bytes:b.length};}
 const manifest={schema:'linguistpro.atlas-edition.1',atlas_id:ATLAS,structure_revision:revision,files};
 const manifestBytes=Buffer.from(JSON.stringify(manifest));return {manifest,manifestBytes,manifestSha:sha(manifestBytes),buffers};
}
function verifyDirectory(dir,expectedSha){
 const b=fs.readFileSync(path.join(dir,'manifest.json')),m=JSON.parse(b),ready=JSON.parse(fs.readFileSync(path.join(dir,'READY.json'),'utf8'));
 if(sha(b)!==expectedSha||ready.manifest_sha256!==expectedSha||m.schema!=='linguistpro.atlas-edition.1'||m.atlas_id!==ATLAS||!REV.test(m.structure_revision))throw Error('ATLAS_EDITION_MANIFEST');
 for(const [n,v] of Object.entries(m.files)){if(!FILE.test(n))throw Error('ATLAS_EDITION_PATH');const p=path.join(dir,n),stat=fs.lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink())throw Error('ATLAS_EDITION_FILE');const b=fs.readFileSync(p);if(b.length!==v.bytes||sha(b)!==v.sha256)throw Error('ATLAS_EDITION_HASH');}
 return m;
}
function stage(source,destinationRoot,options={}){
 const b=build(source,options.findFile,options.sharedAssets),dest=path.resolve(destinationRoot,ATLAS,b.manifest.structure_revision);
 if(fs.existsSync(dest)){verifyDirectory(dest,b.manifestSha);return {destination:dest,manifest_sha256:b.manifestSha,unchanged:true};}
 const parent=path.dirname(dest);fs.mkdirSync(parent,{recursive:true});const staging=path.join(parent,'.install-'+crypto.randomUUID());fs.mkdirSync(staging);
 let count=0;
 for(const [n,bytes] of Object.entries(b.buffers)){const p=path.join(staging,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes,{flag:'wx'});if(options.interruptAfter===++count)throw Object.assign(Error('ATLAS_EDITION_INTERRUPTED'),{staging});}
 fs.writeFileSync(path.join(staging,'manifest.json'),b.manifestBytes,{flag:'wx'});fs.writeFileSync(path.join(staging,'READY.json'),JSON.stringify({manifest_sha256:b.manifestSha}),{flag:'wx'});
 verifyDirectory(staging,b.manifestSha);fs.renameSync(staging,dest);return {destination:dest,manifest_sha256:b.manifestSha,unchanged:false};
}
function installRoutes(app,{dir}){
 const cache=new Map();
 app.use('/data/atlas-editions',function(req,res){
  if(!['GET','HEAD'].includes(req.method))return res.sendStatus(405);
  const match=/^\/(a97001)\/([a-f0-9]{64})\/([^?]+)$/.exec(req.path);if(!match||!(match[3]==='manifest.json'||FILE.test(match[3])))return res.sendStatus(404);
  const root=path.join(dir,match[1],match[2]);let manifest;
  try{if(!cache.has(root)){const marker=JSON.parse(fs.readFileSync(path.join(root,'READY.json'),'utf8'));const m=verifyDirectory(root,marker.manifest_sha256);if(m.structure_revision!==match[2])throw Error('REVISION');cache.set(root,m);}manifest=cache.get(root);}catch(_){res.set('Cache-Control','no-store');return res.sendStatus(503);}
  const name=match[3];if(name!=='manifest.json'&&!manifest.files[name])return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=31536000, immutable');res.type(path.extname(name));res.sendFile(path.resolve(root,name));
 });
}
module.exports={build,stage,verifyDirectory,installRoutes,sha};
