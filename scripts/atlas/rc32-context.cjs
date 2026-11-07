'use strict';
// All RC3.2 CLI stages use the same verified supplier bytes, projection and runtime contract.
// No writes to an edition, learner database, owner profile or network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('../../public/js/atlas-edition'),C=require('../../public/js/atlas-context-contract');
const A=require('../../public/js/atlas-context-addressed'),L=require('../../public/js/atlas-context-rc32-loader');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(p,m)=>{if(!p)throw Error('RC32_CONTEXT_'+m);};
function safe(root,file){assert(typeof file==='string'&&!file.includes('\\')&&!file.includes(':')&&!file.startsWith('/')&&file.split('/').every(s=>s&&s!=='.'&&s!=='..'),'PATH');const p=path.join(root,file);let at=root;assert(!fs.lstatSync(at).isSymbolicLink(),'LINK');for(const part of file.split('/')){at=path.join(at,part);assert(!fs.lstatSync(at).isSymbolicLink(),'LINK');}return p;}
function verifiedSource(root){
 const bytes=fs.readFileSync(safe(root,'manifest.json')),m=JSON.parse(bytes),pin=E.pinFor('a97001rc32');
 assert(m.schema==='linguistpro.atlas-material.1'&&m.atlas_id==='a97001rc32'&&m.source_atlas_id==='a97001','SOURCE_ID');
 assert(m.revision===pin.revision&&m.edition_manifest_sha256===pin.manifest_sha256&&m.pdf_sha256===E.rc32SourceBinding.source_pdf_sha256,'SOURCE_BINDING');
 for(const [name,e] of Object.entries(m.files)){const b=fs.readFileSync(safe(root,name));assert(b.length===e.bytes&&sha(b)===e.sha256,'SOURCE_FILE_'+name);}
 const deps=Object.fromEntries(Object.entries(m.files).filter(([n])=>n.startsWith('edition/sections/')||n.startsWith('edition/assets/')||n.startsWith('sources/')));
 assert(sha(Buffer.from(JSON.stringify(deps)))===m.ai_dependencies_sha256&&m.ai_dependencies_sha256===E.rc32SourceBinding.ai_dependencies_sha256,'DEPENDENCIES');
 const editionBytes=fs.readFileSync(safe(root,'edition/manifest.json')),edition=JSON.parse(editionBytes);
 assert(sha(editionBytes)===pin.manifest_sha256&&edition.structure_revision===pin.revision&&edition.atlas_id==='a97001','EDITION');
 for(const [name,e] of Object.entries(edition.files))assert(JSON.stringify(e)===JSON.stringify(m.files['edition/'+name]),'EDITION_FILE_'+name);
 return {manifest:m,edition,root};
}
function reader(){
 const {window,document}=require('linkedom').parseHTML('<html><body></body></html>');global.window=window;global.document=document;window.indexedDB=undefined;
 window.ReaderMorph=require('../../public/js/reader-morph');require('../../public/js/word-gloss-ai');
 return {AI:window.WordGlossAI,RM:window.ReaderMorph,W:require('../../public/js/atlas-words')};
}
async function prepare(sourceRoot,contextRoot){
 const source=verifiedSource(sourceRoot),{AI,RM,W}=reader();
 const fetch=async url=>{const name=url.split('/').pop();return new Response(fs.readFileSync(safe(contextRoot,name)));};
 const loader=L.create({contextPin:E.contextPinFor('a97001rc32'),sourceBinding:E.rc32SourceBinding,fetch,crypto:crypto.webcrypto,contract:C,ai:AI,addressed:A});
 const manifest=await loader.manifest(),index=JSON.parse(fs.readFileSync(safe(sourceRoot,'edition/index.json'))),sections=[];
 assert(Object.keys(manifest.files).length===index.sections.length,'SECTION_COUNT');
 for(const section of index.sections){
  const raw=JSON.parse(fs.readFileSync(safe(sourceRoot,'edition/sections/'+section.id+'.json')));
  const data=E.projectCorpus(raw,E.base('a97001rc32'));
  const rows=W.glossRows(W.sectionContext('a97001rc32',data,RM,{purpose:'inspection'}));
  const loaded=await loader.load(section.id,rows),expected=loaded.adapter.describe(rows);
  sections.push({id:section.id,rows,expected,loaded});
 }
 return {source,manifest,sections};
}
async function run(operation){
 const argv=process.argv.slice(2),opt=n=>argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3),dry=argv.includes('--dry-run');
 assert(opt('source-export')&&opt('context-package'),'ARGS_REQUIRE_SOURCE_EXPORT_AND_CONTEXT_PACKAGE');
 const source=path.resolve(opt('source-export')),context=path.resolve(opt('context-package'));
 const prepared=await prepare(source,context),pin=E.contextPinFor('a97001rc32');
 const out=opt('out')?path.resolve(opt('out')):operation==='package'?path.resolve(__dirname,'../../atlas-context/a97001rc32',pin):null;
 assert(out,'OUT_REQUIRED');
 assert(out!==source&&!out.startsWith(source+path.sep)&&out!==context&&!out.startsWith(context+path.sep),'OUTPUT_OVERLAPS_SOURCE');
 if(!dry){
  assert(!fs.existsSync(out),'DESTINATION_EXISTS');fs.mkdirSync(out,{recursive:true});
  if(operation==='export'){
   const zip=new (require('jszip'))(),manifest={schema:'atlas-context-export-v2',atlas:'a97001rc32',purpose:'inspection',source_binding:E.rc32SourceBinding,context_pin:pin,sections:[]};
   for(const s of prepared.sections){const body=s.expected.map(r=>JSON.stringify(r)).join('\n')+'\n';zip.file('rows/'+s.id+'.jsonl',body);manifest.sections.push({id:s.id,rows:s.expected.length,source_revision:await C.revision(s.expected),rows_sha256:sha(Buffer.from(body))});}
   zip.file('manifest.json',JSON.stringify(manifest,null,2));zip.file('FORMAT.ru.md',fs.readFileSync(path.join(__dirname,'CONTEXT_CONTRACT_97001.md')));
   fs.writeFileSync(path.join(out,'atlas-a97001rc32-context-export.zip'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  }else{
   // Freeze the exact validated candidate, including partial/uncertain/provenance and map bytes.
   for(const name of ['manifest.json',prepared.manifest.alignment_adapter.path,...Object.keys(prepared.manifest.files)])fs.copyFileSync(safe(context,name),path.join(out,name),fs.constants.COPYFILE_EXCL);
  }
 }
 const report={operation,dry_run:dry,context_pin:pin,destination:out,source_files:Object.keys(prepared.source.manifest.files).length,
  sections:prepared.sections.map(s=>({id:s.id,expected:s.expected.length,accepted:s.loaded.checked.accepted,missing:s.loaded.checked.missing.length,complete:s.loaded.checked.complete})),
  expected:prepared.sections.reduce((n,s)=>n+s.expected.length,0),accepted:prepared.sections.reduce((n,s)=>n+s.loaded.checked.accepted,0),scientific_acceptance:false,production_changed:false};
 console.log(JSON.stringify(report,null,2));return report;
}
module.exports={prepare,verifiedSource,reader,run};
