'use strict';
// RC3.3: rebind the verified 879 context layer to the corrected edition.
// Rows whose text the audit corrected lose their prepared reading (it was made for the old text);
// every other row keeps its exact payload. Never writes learner state or an old namespace.
//   node scripts/atlas/rc33/rebind-context.cjs --source-export=<879 export> --stage=<stage json>
//     --candidate=<rc33 candidate> --runtime-data=<dir> --package=<dir with inspection/canonical-native-records.jsonl>
//     --audit=<findings.json>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../../..');
const E=require(ROOT+'/public/js/atlas-edition'),C=require(ROOT+'/public/js/atlas-context-contract'),A=require(ROOT+'/public/js/atlas-context-addressed'),L=require(ROOT+'/public/js/atlas-context-rc32-loader');
const {prepare,reader}=require(ROOT+'/scripts/atlas/rc32-context.cjs'),{createService}=require(ROOT+'/lib/atlasMaterialExport');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const stable=x=>JSON.stringify(sort(x));function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;}
const args=process.argv.slice(2),opt=n=>{const x=args.find(a=>a.startsWith('--'+n+'='));assert(x,'Missing --'+n);return path.resolve(x.slice(n.length+3));};
const NOTE_ID='r-a24bf888900dae43cdf5e37f';
function noteOnly(k,[a,b]){return JSON.stringify(a).replace(/Аббревиатуры[^"]*?чтения\./g,'')===JSON.stringify(b).replace(/Аббревиатуры[^"]*?чтения\./g,'').replace(/Аббревиатуры[^"]*?произношения\./g,'')||stableNote(a,b);}
function stableNote(a,b){const s=x=>JSON.stringify(x).replace(/Аббревиатуры טמפ׳\/פלב״ם[^"]*?\./g,'#');return s(a)===s(b);}
const BASE_REVISION='841fd6424e8428ba5ebd1f489f514c5dff058d841e415c5a13a42fe7504b47cc';
async function run(){
 const oldSource=opt('source-export'),stage=read(opt('stage')),candidate=opt('candidate'),runtime=opt('runtime-data'),pkg=opt('package'),audit=opt('audit');
 const oldRelease=E.nativeReleaseFor(BASE_REVISION);assert(oldRelease);
 const oldContext=path.resolve(ROOT,'atlas-context/a97001rc32',oldRelease.contextPin),prior=await prepare(oldSource,oldContext);
 assert.equal(prior.release.pin.revision,BASE_REVISION);
 const native=stage.destination,mbytes=fs.readFileSync(path.join(native,'manifest.json')),manifest=JSON.parse(mbytes),revision=manifest.structure_revision;
 assert.equal(sha(mbytes),stage.manifest_sha256);assert.notEqual(revision,BASE_REVISION);
 const overlayBytes=fs.readFileSync(path.join(candidate,'rc33-corrections-manifest.json')),overlay=JSON.parse(overlayBytes),overlaySha=sha(overlayBytes);
 assert.equal(overlay.base_revision,BASE_REVISION);const auditBytes=fs.readFileSync(audit);assert.equal(sha(auditBytes),overlay.audit_findings_sha256);
 const corrected=new Set(overlay.changes.map(c=>'a97001rc32:'+c.target).filter(t=>!t.includes('term:')));
 const sources=path.join(runtime,'atlas-sources/a97001rc32'),sourceExists=fs.existsSync(sources);
 if(!sourceExists)fs.cpSync(path.join(oldSource,'sources'),sources,{recursive:true});
 const tool=n=>fs.readFileSync(path.join(__dirname,n));
 const extras={'rc33-corrections-manifest.json':overlayBytes,'rc33-audit-findings.json':auditBytes,'rc33-build_rc33.py':tool('build_rc33.py'),'rc33-apply.py':tool('apply.py'),'rc33-corrections.py':tool('corrections.py'),'rc33-locate.py':tool('locate.py')};
 const descriptor=read(path.join(oldSource,'sources/manifest.json'));
 for(const [name,bytes]of Object.entries(extras)){if(sourceExists)assert(fs.readFileSync(path.join(sources,name)).equals(bytes),'Existing staging source drift '+name);else fs.writeFileSync(path.join(sources,name),bytes,{flag:'wx'});descriptor.files[name]={sha256:sha(bytes),bytes:bytes.length};}
 descriptor.source_atlas_id='a97001';descriptor.edition_revision=revision;descriptor.edition_manifest_sha256=stage.manifest_sha256;
 const index=read(path.join(native,'index.json')),newRows=new Map(),newSections=new Map();
 const {AI,RM,W}=reader();
 for(const section of index.sections){
  const raw=read(path.join(native,'sections',section.id+'.json'));descriptor.sections[section.id]={source_pack_sha256:raw.source_pack_sha256,content_pack_sha256:raw.content_pack_sha256};
  const projected=E.projectCorpus(raw,'/data/atlas-editions/a97001/'+revision+'/');newSections.set(section.id,{raw,projected});
  newRows.set(section.id,W.glossRows(W.sectionContext('a97001rc32',projected,RM,{purpose:'inspection'})));
 }
 const sourceDescriptorBytes=Buffer.from(JSON.stringify(descriptor,null,2));
 if(sourceExists)assert(fs.readFileSync(path.join(sources,'manifest.json')).equals(sourceDescriptorBytes),'Existing source descriptor drift');else fs.writeFileSync(path.join(sources,'manifest.json'),sourceDescriptorBytes);
 const pin={atlas_id:'a97001',revision,manifest_sha256:stage.manifest_sha256};
 const inventory=await createService({dataDir:runtime,contextDir:path.resolve(ROOT,'atlas-context'),pins:{a97001rc32:pin}}).inventory('a97001rc32');
 const deps={};for(const e of inventory.entries)if(e.target.startsWith('edition/sections/')||e.target.startsWith('edition/assets/')||e.target.startsWith('sources/')){const b=fs.readFileSync(path.join(e.folder,e.name));deps[e.target]={sha256:sha(b),bytes:b.length};}
 const binding={edition_revision:revision,edition_manifest_sha256:pin.manifest_sha256,source_pdf_sha256:prior.release.sourceBinding.source_pdf_sha256,ai_dependencies_sha256:sha(Buffer.from(JSON.stringify(deps))),source_overlay_manifest_sha256:overlaySha};
 const stale=[],repointed=[],oldById=new Map(),newById=new Map(),strip=c=>{const x=structuredClone(c);for(const k of ['scan','structure_revision','reviewed_terms'])delete x[k];return x;};
 const projectAsset=v=>typeof v==='string'&&v.startsWith('/data/atlas-editions/a97001/'+BASE_REVISION+'/assets/')?v.replace(BASE_REVISION,revision):Array.isArray(v)?v.map(projectAsset):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,projectAsset(x)])):v;
 for(const s of prior.sections){
  const rows=newRows.get(s.id);assert.equal(rows.length,s.rows.length,'Row count '+s.id);
  for(let i=0;i<rows.length;i++){
   const before=s.rows[i],after=rows[i];assert.equal(after.id,before.id);assert.equal(after.order_index,before.order_index);assert.equal(after.row_type,before.row_type);
   const textChanged=after.he!==before.he||after.he_niqqud!==before.he_niqqud||after.ru!==before.ru;
   const bc=projectAsset(before.source_context),ac=structuredClone(after.source_context);
   assert.equal(ac.structure_revision,revision);assert.equal(ac.scan,bc.scan);
   for(const r of bc.reviewed_terms)assert(ac.reviewed_terms.some(a=>a.id===r.id&&a.sense===r.sense),'Reviewed term lost '+after.id);
   const contextChanged=stable(strip(ac))!==stable(strip(bc));
   if(textChanged||contextChanged){
    if(!corrected.has(after.id)){const diff={};for(const k of new Set([...Object.keys(strip(ac)),...Object.keys(strip(bc))]))if(stable(strip(ac)[k])!==stable(strip(bc)[k]))diff[k]=[strip(bc)[k],strip(ac)[k]];if(process.env.RC33_DEBUG>1)console.error('DIFF',after.id,textChanged,JSON.stringify(diff).slice(0,1500));assert(!textChanged&&Object.keys(diff).every(k=>noteOnly(k,diff[k])),'Unreviewed change '+after.id);}
    const bw=AI.rowPayloadFromData(before),aw=AI.rowPayloadFromData(after),keep=after.he===before.he&&bw&&aw&&bw.words.length===aw.words.length;
    (keep?repointed:stale).push({id:after.id,section:s.id,order_index:after.order_index,fields:['he','he_niqqud','ru'].filter(k=>after[k]!==before[k]),source_context_changed:contextChanged,findings:[...new Set(overlay.changes.filter(c=>'a97001rc32:'+c.target===after.id).map(c=>c.finding))]});
   } else {
    const bp=AI.rowPayloadFromData(before),ap=AI.rowPayloadFromData(after);assert.equal(ap?.key,bp?.key,'Key changed without text change '+after.id);
   }
   oldById.set(before.id,before);newById.set(after.id,after);
  }
 }
 const staleIds=new Set([...stale,...repointed].map(r=>r.id)),dropIds=new Set(stale.map(r=>r.id));
 const oldMapBytes=fs.readFileSync(path.join(oldContext,'addressed-map.json')),map=JSON.parse(oldMapBytes);
 map.edition_revision=revision;map.source_overlay_manifest_sha256=overlaySha;
 map.technical_rebind={base_manifest_sha256:oldRelease.contextPin,baseline_addressed_map_sha256:sha(oldMapBytes),source_overlay_manifest_sha256:overlaySha,review_scope:'RC3.3 audit corrections: rows with corrected text lose their prepared reading; other rows rebound byte-for-byte'};
 const canon=new Map(fs.readFileSync(path.join(pkg,'inspection/canonical-native-records.jsonl'),'utf8').trim().split('\n').map(JSON.parse).map(r=>[r.record.id,r]));
 const retired=[],realigned=[];
 for(const e of map.entries){
  const before=oldById.get(e.row_id),after=newById.get(e.row_id),p=AI.rowPayloadFromData(after);assert(after&&before);
  assert.equal(e.guard.key,AI.rowPayloadFromData(before).key);
  if(staleIds.has(e.row_id)){assert.equal(p.words.length,e.pointed_words.length,'Corrected row changed its word count '+e.row_id);realigned.push({row_id:e.row_id,reason:'RC3.3 corrected text; same word positions, pointed tokens refreshed'});}
  e.guard={...after,source_row_id:e.source_row_id,key:p.key,words:p.words.map(w=>w.w)};
  e.pointed_words=p.words.map(w=>w.w);
  for(const seg of e.segments)seg.pointed_tokens=e.pointed_words.slice(seg.pointed_from,seg.pointed_to+1);
  if(staleIds.has(e.row_id)){const src=AI.rowPayloadFromData(Object.assign({},after,{he_niqqud:'',hebrew_niqqud:'',meta_json:null,meta:null}));const sw=src?src.words.map(w=>w.w):[];assert.equal(sw.length,e.source_words.length,'Corrected row changed its source word count '+e.row_id);e.source_words=sw;for(const seg of e.segments)if(seg.source_from!==null)seg.source_tokens=sw.slice(seg.source_from,seg.source_to+1);}
  A.validateSegments(e);
  const source=canon.get(e.source_row_id);assert(source,'Missing native record for map '+e.row_id);
  let node=newSections.get(e.section).raw.pages.find(p=>p.page===source.page);for(const part of source.location.split('/'))node=Array.isArray(node)?node[Number(part)]:node[part];assert.equal(node.id,e.source_row_id);
  e.baseline_source_record_sha256=e.source_record_sha256;e.source_record_sha256=sha(Buffer.from(stable(node)));
 }
 map.technical_rebind.retired_alignment_entries=retired;map.technical_rebind.realigned_corrected_entries=realigned;
 const mapBytes=Buffer.from(JSON.stringify(map)),adapter=await A.create({purpose:A.PURPOSE,bytes:mapBytes,sha256:sha(mapBytes),editionRevision:revision,sourcePdfSha256:binding.source_pdf_sha256,sourceOverlayManifestSha256:overlaySha,contract:C,ai:AI,crypto:crypto.webcrypto});
 const buffers=new Map([['addressed-map.json',mapBytes]]),cm=structuredClone(prior.manifest);
 Object.assign(cm,binding);cm.alignment_adapter={path:'addressed-map.json',sha256:sha(mapBytes),bytes:mapBytes.length};
 cm.technical_rebind={from_context_manifest_sha256:oldRelease.contextPin,source_overlay_manifest_sha256:overlaySha,unchanged_rows_rebound_byte_for_byte:true,stale_rows_without_prepared_reading:stale.length,repointed_rows_reading_kept:repointed.length,scientific_acceptance:false};
 const proof=[];let dropped=0;
 for(const s of prior.sections){
  const rows=newRows.get(s.id),expected=adapter.describe(rows),rev=await C.revision(expected),layer=structuredClone(s.loaded.layer);
  layer.source_revision=rev;layer.provenance.technical_rebind=cm.technical_rebind;
  const kept=[];
  for(const row of layer.rows){const id=row.row_id||row.block_id;if(dropIds.has(id)){dropped++;continue;}const next=newById.get(id),old=oldById.get(id);assert.equal(row.key,AI.rowPayloadFromData(old).key);row.key=AI.rowPayloadFromData(next).key;kept.push(row);}
  layer.rows=kept;if(stale.some(r=>r.section===s.id))layer.coverage_mode='partial';
  const checked=C.validate(layer,expected,{atlas:'a97001rc32',section:s.id,revision:rev,allowPartial:true});assert(checked.ok,s.id+' '+JSON.stringify(checked.errors.slice(0,5)));
  const bytes=Buffer.from(JSON.stringify(layer));buffers.set(s.id+'.json',bytes);cm.files[s.id+'.json']={sha256:sha(bytes),bytes:bytes.length,source_revision:rev};proof.push({id:s.id,expected:checked.expected,accepted:checked.accepted,missing:checked.missing.length});
 }
 const cmbytes=Buffer.from(JSON.stringify(cm)),contextPin=sha(cmbytes);buffers.set('manifest.json',cmbytes);
 const loader=L.create({contextPin,sourceBinding:binding,contract:C,ai:AI,addressed:A,crypto:crypto.webcrypto,fetch:async url=>new Response(buffers.get(url.split('/').pop()))});
 for(const s of proof)assert((await loader.load(s.id,newRows.get(s.id))).checked.ok);
 const out=path.resolve(ROOT,'atlas-context/a97001rc32',contextPin),unchanged=fs.existsSync(out);
 if(unchanged){assert.deepEqual(fs.readdirSync(out).sort(),[...buffers.keys()].sort(),'Existing namespace inventory drift');for(const [name,b]of buffers)assert(fs.readFileSync(path.join(out,name)).equals(b),'Existing immutable context drift '+name);}
 else {fs.mkdirSync(out,{recursive:true});for(const [name,b]of buffers)fs.writeFileSync(path.join(out,name),b,{flag:'wx'});}
 const report={schema:'atlas97001.rc33-context-rebind.1',pin,sourceBinding:binding,contextPin,baselineContextPin:oldRelease.contextPin,map_entries:map.entries.length,retired_map_entries:retired.length,realigned_map_entries:realigned,stale_rows:stale,repointed_rows:repointed,dropped_prepared_rows:dropped,sections:proof,unchanged,scientific_acceptance:false,production_changed:false};
 fs.writeFileSync(path.join(runtime,'rc33-context-rebind.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({contextPin,binding,repointed:repointed.length,stale:stale.length,dropped,retired:retired.length,map_entries:map.entries.length},null,1));return report;
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
