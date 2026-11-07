'use strict';
// Full material only. Owner state lives outside these roots and is never read.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const {createReadStream,createWriteStream} = require('node:fs');
const {pipeline} = require('node:stream/promises');
const archiver = require('archiver');
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fail(code) { throw Object.assign(new Error(code), {code}); }
function safe(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some(p=>!p || p==='.' || p==='..')) fail('INVALID_PATH');
  return name;
}
async function read(root,name) {
  safe(name);
  if((await fs.lstat(root)).isSymbolicLink())fail('LINK_FORBIDDEN');
  let p=root;
  for (const part of name.split('/')) {p=path.join(p,part);if((await fs.lstat(p)).isSymbolicLink())fail('LINK_FORBIDDEN');}
  const st=await fs.stat(p);if(!st.isFile() || st.size>512*1024*1024)fail('INVALID_FILE');
  return fs.readFile(p);
}
async function walk(root,prefix='') {
  if((await fs.lstat(root)).isSymbolicLink())fail('LINK_FORBIDDEN');
  const names=[];
  for(const e of await fs.readdir(root,{withFileTypes:true})) {
    const n=prefix+e.name;safe(n);
    if(e.isSymbolicLink())fail('LINK_FORBIDDEN');
    if(e.isDirectory())names.push(...await walk(path.join(root,e.name),n+'/'));
    else if(e.isFile())names.push(n);else fail('INVALID_FILE');
  }
  return names.sort();
}
async function manifestFiles(root,manifestName,expectedHash) {
  const bytes=await read(root,manifestName);
  if(expectedHash && sha(bytes)!==expectedHash)fail('MANIFEST_MISMATCH');
  const m=JSON.parse(bytes),files=m.files;
  if(!files || typeof files!=='object' || Array.isArray(files))fail('INVALID_MANIFEST');
  return {m,files,bytes};
}
function createService({dataDir,contextDir,pins={}}) {
  async function inventory(id) {
    if(!ID.test(id))fail('UNKNOWN_CORPUS');
    const pin=pins[id],root=pin ? path.join(dataDir,'atlas-editions',id,pin.revision) : path.join(dataDir,'atlas',id);
    const indexBytes=await read(root,'index.json'),index=JSON.parse(indexBytes);
    if(index.atlas_id!==id || !String(index.schema).startsWith('linguistpro.atlas-reader-index.') || !Array.isArray(index.sections))fail('UNSUPPORTED_CORPUS');
    const entries=[];
    const add=(folder,name,target,expected)=>entries.push({folder,name,target,expected});
    if(pin) {
      const {files}=await manifestFiles(root,'manifest.json',pin.manifest_sha256);
      add(root,'manifest.json','edition/manifest.json');
      for(const [n,v] of Object.entries(files))add(root,safe(n),'edition/'+n,v);
      const context=path.join(contextDir,id,pin.context_sha256);
      const cm=await manifestFiles(context,'manifest.json',pin.context_sha256);
      if(cm.m.edition_manifest_sha256!==pin.manifest_sha256)fail('CONTEXT_MISMATCH');
      add(context,'manifest.json','context/manifest.json');
      for(const [n,v] of Object.entries(cm.files))add(context,safe(n),'context/'+n,v);
    } else {
      for(const n of await walk(root))add(root,n,'edition/'+n);
    }
    // Required source descriptor is outside public routes. Missing PDF must not
    // silently turn a runtime-only archive into a "full material" export.
    const source=path.join(dataDir,'atlas-sources',id);
    let sm;
    try {sm=await manifestFiles(source,'manifest.json');} catch(e) {if(e.code==='ENOENT')fail('SOURCE_PACKAGE_REQUIRED');throw e;}
    if(sm.m.atlas_id!==id || !sm.m.pdf || !sm.files[sm.m.pdf] || !sm.m.pdf.endsWith('.pdf'))fail('SOURCE_PACKAGE_REQUIRED');
    add(source,'manifest.json','sources/manifest.json');
    for(const [n,v] of Object.entries(sm.files))add(source,safe(n),'sources/'+n,v);
    const names=new Set(entries.map(e=>e.target));
    if(names.size!==entries.length)fail('DUPLICATE_PATH');
    for(const section of index.sections)if(!names.has('edition/sections/'+safe(section.id)+'.json'))fail('SECTION_MISSING');
    return {id,index,root,pin,entries,indexSha:sha(indexBytes),pdfSha:sm.files[sm.m.pdf].sha256};
  }
  async function build(id,destination) {
    const inv=await inventory(id),files={};let total=0;
    const payload=path.join(destination,'payload');await fs.mkdir(payload,{recursive:true});
    // Copy bytes once; ZIP reads only the frozen copy, never live files.
    for(const e of inv.entries) {
      const b=await read(e.folder,e.name),v={sha256:sha(b),bytes:b.length};
      total+=b.length;if(total>2*1024**3)fail('EXPORT_TOO_LARGE');
      if(e.expected && (v.sha256!==e.expected.sha256 || v.bytes!==e.expected.bytes))fail('FILE_MISMATCH');
      files[e.target]=v;const target=path.join(payload,e.target);
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,b,{flag:'wx'});
      if(e.target.startsWith('edition/sections/')) {
        const d=JSON.parse(b);if(d.atlas_id!==id)fail('SECTION_ID_MISMATCH');
        if(d.structure_provenance?.pdf_sha256 && d.structure_provenance.pdf_sha256!==inv.pdfSha)fail('PDF_MISMATCH');
        const visit=v=>{if(typeof v==='string' && v.startsWith('/data/atlas/'+id+'/')){
          if(!inv.entries.some(e=>e.target==='edition/'+v.slice(('/data/atlas/'+id+'/').length)))fail('ASSET_MISSING');
        } else if(v && typeof v==='object')Object.values(v).forEach(visit);};visit(d);
      }
    }
    // Mutable legacy corpora: reject concurrent edits/additions/removals.
    const after=await inventory(id);
    if(after.indexSha!==inv.indexSha || JSON.stringify(after.entries.map(e=>e.target))!==JSON.stringify(inv.entries.map(e=>e.target)))fail('SOURCE_CHANGED');
    for(const e of inv.entries)if(sha(await read(e.folder,e.name))!==files[e.target].sha256)fail('SOURCE_CHANGED');
    const dependencies=Object.fromEntries(Object.entries(files).filter(([n])=>n.startsWith('edition/sections/') || n.startsWith('edition/assets/') || n.startsWith('sources/')));
    const manifest={schema:'linguistpro.atlas-material.1',atlas_id:id,revision:inv.pin?.revision || sha(Buffer.from(JSON.stringify(files))),index_sha256:inv.indexSha,pdf_sha256:inv.pdfSha,learner_data_included:false,
      ai_dependencies_sha256:sha(Buffer.from(JSON.stringify(dependencies))),
      ai_dependency_state:inv.pin?'pinned_dependencies_unchanged':'unverified_requires_review',
      ai_policy:'Changes to section text, PDF or images require AI revalidation. Export preserves evidence and never grants editorial approval.',files};
    await fs.writeFile(path.join(payload,'manifest.json'),JSON.stringify(manifest,null,2));
    await fs.writeFile(path.join(payload,'README.txt'),'Full atlas material snapshot. All source files are unchanged. Verify files against manifest.json (SHA-256 and bytes). Import only into a NEW draft; never overwrite live material or learner state. Changed text requires revalidation of dependent AI. No publication is performed by this archive.\n');
    const zipPath=path.join(destination,'material.zip'),zip=archiver('zip',{zlib:{level:6}});
    const writing=pipeline(zip,createWriteStream(zipPath,{flags:'wx'}));
    zip.directory(payload,false);await Promise.all([zip.finalize(),writing]);
    return {zipPath,manifest};
  }
  return {inventory,build};
}
function installRoutes(app,{requireUser,limiter,...options}) {
  const service=createService(options);let busy=false;
  const guards=limiter?[limiter]:[];
  async function owner(req,res){const auth=await requireUser(req,res);if(!auth)return false;if(auth.user.role!=='owner'){res.status(403).json({ok:false,error:'OWNER_ONLY'});return false;}return true;}
  const error=(res,e)=>res.status(e.code==='SOURCE_PACKAGE_REQUIRED'?409:422).json({ok:false,error:e.code || 'EXPORT_UNAVAILABLE'});
  app.get('/api/atlas/:id/material-export',...guards,async(req,res)=>{
    res.set('Cache-Control','no-store');if(!await owner(req,res))return;
    try {const v=await service.inventory(req.params.id);res.json({ok:true,atlas_id:v.id,files:v.entries.length,index_sha256:v.indexSha});}catch(e){error(res,e);}
  });
  app.get('/api/atlas/:id/material-export.zip',...guards,async(req,res)=>{
    res.set('Cache-Control','no-store');if(!await owner(req,res))return;
    if(busy)return res.status(429).json({ok:false,error:'EXPORT_BUSY'});busy=true;let temporary;
    try {
      const parent=path.join(options.dataDir,'atlas-export-tmp');await fs.mkdir(parent,{recursive:true});
      temporary=await fs.mkdtemp(path.join(parent,'export-'));
      const result=await service.build(req.params.id,temporary);
      res.attachment(req.params.id+'-full-material.zip');res.type('zip');
      await pipeline(createReadStream(result.zipPath),res);
    }catch(e){if(!res.headersSent)error(res,e);else res.destroy();}
    finally{if(temporary)await fs.rm(temporary,{recursive:true,force:true});busy=false;}
  });
  return service;
}
module.exports={createService,installRoutes};
