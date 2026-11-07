'use strict';
// Rebind only proven, source-preserving term overlay changes. Never stamp a new
// revision onto unverified answers, mutate an old namespace or write learner state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const E=require('../../public/js/atlas-edition'),C=require('../../public/js/atlas-context-contract'),A=require('../../public/js/atlas-context-addressed'),L=require('../../public/js/atlas-context-rc32-loader');
const {prepare}=require('./rc32-context.cjs'),{createService}=require('../../lib/atlasMaterialExport');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const stable=x=>JSON.stringify(sort(x));function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;}
const args=process.argv.slice(2),opt=n=>{const x=args.find(a=>a.startsWith('--'+n+'='));assert(x,'Missing --'+n);return path.resolve(x.slice(n.length+3));};
async function run(){
 const oldSource=opt('source-export'),stage=read(opt('stage')),candidate=opt('candidate'),runtime=opt('runtime-data'),pkg=opt('package'),archive=opt('archive');
 const oldRelease=E.nativeReleaseFor('420c34275a26fe37cae12a41e77a77dde173de207164f6b5421c5a5dcf1c92bc');assert(oldRelease);
 const oldContext=path.resolve(__dirname,'../../atlas-context/a97001rc32',oldRelease.contextPin),prior=await prepare(oldSource,oldContext);
 assert.equal(prior.release.pin.revision,oldRelease.pin.revision);
 const native=stage.destination,mbytes=fs.readFileSync(path.join(native,'manifest.json')),manifest=JSON.parse(mbytes),revision=manifest.structure_revision;
 assert.equal(sha(mbytes),stage.manifest_sha256);assert.notEqual(revision,oldRelease.pin.revision);
 const overlayBytes=fs.readFileSync(path.join(candidate,'terms-overlay-manifest.json')),overlay=JSON.parse(overlayBytes),overlaySha=sha(overlayBytes);
 assert.equal(sha(fs.readFileSync(archive)),overlay.term_archive_sha256);assert.equal(overlay.accepted_pairs.length,48);assert.equal(overlay.separate_editorial_proposals_activated,false);
 const approved=new Map(overlay.accepted_pairs.map(a=>[a.term_id.replace(/^a97001:/,'a97001rc32:'),a]));
 const correctionById=new Map(overlay.source_reading_corrections.map(r=>[r.source_ref.replace(/^a97001:/,'a97001rc32:'),r]));
 const sources=path.join(runtime,'atlas-sources/a97001rc32'),sourceExists=fs.existsSync(sources);
 if(!sourceExists)fs.cpSync(path.join(oldSource,'sources'),sources,{recursive:true});
 const extras={'terms-addendum-reviewed.zip':fs.readFileSync(archive),'terms-addendum-overlay-manifest.json':overlayBytes,'build-terms-addendum.py':fs.readFileSync(path.join(__dirname,'build-terms-addendum.py'))};
 const descriptor=read(path.join(oldSource,'sources/manifest.json'));
 for(const [name,bytes]of Object.entries(extras)){if(sourceExists)assert(fs.readFileSync(path.join(sources,name)).equals(bytes),'Existing staging source drift');else fs.writeFileSync(path.join(sources,name),bytes,{flag:'wx'});descriptor.files[name]={sha256:sha(bytes),bytes:bytes.length};}
 descriptor.source_atlas_id='a97001';descriptor.edition_revision=revision;descriptor.edition_manifest_sha256=stage.manifest_sha256;
 const index=read(path.join(native,'index.json')),newRows=new Map(),newSections=new Map();
 const {AI,RM,W}=require('./rc32-context.cjs').reader();
 for(const section of index.sections){
  const raw=read(path.join(native,'sections',section.id+'.json'));descriptor.sections[section.id]={source_pack_sha256:raw.source_pack_sha256,content_pack_sha256:raw.content_pack_sha256};
  const projected=E.projectCorpus(raw,'/data/atlas-editions/a97001/'+revision+'/');newSections.set(section.id,{raw,projected});
  newRows.set(section.id,W.glossRows(W.sectionContext('a97001rc32',projected,RM,{purpose:'inspection'})));
 }
 const sourceDescriptorBytes=Buffer.from(JSON.stringify(descriptor,null,2));
 if(sourceExists)assert(fs.readFileSync(path.join(sources,'manifest.json')).equals(sourceDescriptorBytes),'Existing source descriptor drift');else fs.writeFileSync(path.join(sources,'manifest.json'),sourceDescriptorBytes);
 const pin={atlas_id:'a97001',revision,manifest_sha256:stage.manifest_sha256};
 const inventory=await createService({dataDir:runtime,contextDir:path.resolve(__dirname,'../../atlas-context'),pins:{a97001rc32:pin}}).inventory('a97001rc32');
 const deps={};for(const e of inventory.entries)if(e.target.startsWith('edition/sections/')||e.target.startsWith('edition/assets/')||e.target.startsWith('sources/')){const b=fs.readFileSync(path.join(e.folder,e.name));deps[e.target]={sha256:sha(b),bytes:b.length};}
 const binding={edition_revision:revision,edition_manifest_sha256:pin.manifest_sha256,source_pdf_sha256:overlay.source_pdf_sha256,ai_dependencies_sha256:sha(Buffer.from(JSON.stringify(deps))),source_overlay_manifest_sha256:overlaySha};
 const changes=[],oldById=new Map(),newById=new Map();
 for(const s of prior.sections){
  const rows=newRows.get(s.id);assert.equal(rows.length,s.rows.length);
  for(let i=0;i<rows.length;i++){
   const before=s.rows[i],after=rows[i];assert.equal(after.id,before.id);assert.equal(after.order_index,before.order_index);assert.equal(after.he,before.he);assert.equal(after.ru,before.ru);assert.equal(after.row_type,before.row_type);
   const correction=correctionById.get(before.id);
   if(after.he_niqqud!==before.he_niqqud){assert(correction?.changes.he_niqqud,'Unreviewed pointing change '+before.id);assert.equal(before.he_niqqud,correction.changes.he_niqqud.before);assert.equal(after.he_niqqud,correction.changes.he_niqqud.after);}
   const projectAsset=v=>typeof v==='string'&&v.startsWith('/data/atlas-editions/a97001/'+oldRelease.pin.revision+'/assets/')?v.replace(oldRelease.pin.revision,revision):Array.isArray(v)?v.map(projectAsset):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,projectAsset(x)])):v;
   const bc=projectAsset(before.source_context),ac=structuredClone(after.source_context);
   assert.equal(ac.structure_revision,revision);assert.equal(ac.scan,bc.scan);
   for(const r of bc.reviewed_terms)assert(ac.reviewed_terms.some(a=>JSON.stringify(a)===JSON.stringify(r)),'Old reviewed term changed');
   for(const r of ac.reviewed_terms.filter(r=>!bc.reviewed_terms.some(a=>JSON.stringify(a)===JSON.stringify(r)))){
    const a=approved.get(r.id);assert(a&&a.section_id===s.id&&a.sense===r.sense);assert([ac.object_id,after.id].includes(a.source_ref.replace(/^a97001:/,'a97001rc32:')),'Unapproved term source '+after.id);
    assert.equal(r.he,a.canonical_after_patch.lemma_he);assert.equal(r.ru,a.canonical_after_patch.ru);
   }
   for(const k of ['scan','structure_revision','reviewed_terms']){delete bc[k];delete ac[k];}assert.deepEqual(ac,bc,'Unreviewed source context edit '+before.id);
   const bp=AI.rowPayloadFromData(before),ap=AI.rowPayloadFromData(after);assert.equal(ap?.words.length,bp?.words.length,'Offsets changed');
   if(ap&&ap.key!==bp.key){assert(correction?.changes.he_niqqud);changes.push({id:after.id,before_key:bp.key,after_key:ap.key,term_id:correction.term_id,reason:'explicit dictionary-backed reading correction; source HE and meaning unchanged'});}
   oldById.set(before.id,before);newById.set(after.id,after);
  }
 }
 assert.equal(changes.length,0,'Source-preserving addendum must retain every AI text key');
 const oldMapBytes=fs.readFileSync(path.join(oldContext,'addressed-map.json')),map=JSON.parse(oldMapBytes);
 map.edition_revision=revision;map.source_overlay_manifest_sha256=overlaySha;
 map.technical_rebind={base_manifest_sha256:oldRelease.contextPin,baseline_addressed_map_sha256:sha(oldMapBytes),source_overlay_manifest_sha256:overlaySha,review_scope:'Deterministic source metadata/approved reading rebinding; no new linguistic or scientific acceptance'};
 const canon=new Map(fs.readFileSync(path.join(pkg,'inspection/canonical-native-records.jsonl'),'utf8').trim().split('\n').map(JSON.parse).map(r=>[r.record.id,r]));
 for(const e of map.entries){
  const before=oldById.get(e.row_id),after=newById.get(e.row_id),p=AI.rowPayloadFromData(after);assert(after&&before);
  assert.equal(JSON.stringify(e.guard.he),JSON.stringify(before.he));assert.equal(e.guard.key,AI.rowPayloadFromData(before).key);
  e.guard={...after,source_row_id:e.source_row_id,key:p.key,words:p.words.map(w=>w.w)};
  e.pointed_words=p.words.map(w=>w.w);
  for(const seg of e.segments)seg.pointed_tokens=e.pointed_words.slice(seg.pointed_from,seg.pointed_to+1);
  A.validateSegments(e);
  const source=canon.get(e.source_row_id);assert(source,'Missing native record for map '+e.row_id);
  let node=newSections.get(e.section).raw.pages.find(p=>p.page===source.page);for(const part of source.location.split('/'))node=Array.isArray(node)?node[Number(part)]:node[part];assert.equal(node.id,e.source_row_id);
  e.baseline_source_record_sha256=e.source_record_sha256;e.source_record_sha256=sha(Buffer.from(stable(node)));
 }
 const retired=[];
 map.entries=map.entries.filter(e=>{
  try {C.describe([newById.get(e.row_id)],AI);} catch (_) {return true;}
  assert(correctionById.get(e.row_id)?.changes.he_niqqud,'Unexpected retirement of addressed alignment');
  retired.push({row_id:e.row_id,reason:'Explicit reviewed reading correction now passes the unchanged original alignment gate'});return false;
 });
 assert.equal(retired.length,0);map.technical_rebind.retired_alignment_entries=retired;
 const mapBytes=Buffer.from(JSON.stringify(map)),adapter=await A.create({purpose:A.PURPOSE,bytes:mapBytes,sha256:sha(mapBytes),editionRevision:revision,sourcePdfSha256:binding.source_pdf_sha256,sourceOverlayManifestSha256:overlaySha,contract:C,ai:AI,crypto:crypto.webcrypto});
 const buffers=new Map([['addressed-map.json',mapBytes]]),cm=structuredClone(prior.manifest);
 Object.assign(cm,binding);cm.alignment_adapter={path:'addressed-map.json',sha256:sha(mapBytes),bytes:mapBytes.length};
 cm.technical_rebind={from_context_manifest_sha256:oldRelease.contextPin,source_overlay_manifest_sha256:overlaySha,meaning_and_offsets_unchanged:true,changed_payload_keys:changes,scientific_acceptance:false};
 const proof=[];
 for(const s of prior.sections){
  const rows=newRows.get(s.id),expected=adapter.describe(rows),rev=await C.revision(expected),layer=structuredClone(s.loaded.layer);
  layer.source_revision=rev;layer.provenance.technical_rebind=cm.technical_rebind;
  for(const row of layer.rows){const next=newById.get(row.row_id||row.block_id),old=oldById.get(row.row_id||row.block_id);assert.equal(row.key,AI.rowPayloadFromData(old).key);row.key=AI.rowPayloadFromData(next).key;}
  const checked=C.validate(layer,expected,{atlas:'a97001rc32',section:s.id,revision:rev,allowPartial:true});assert(checked.ok,JSON.stringify(checked.errors));
  const bytes=Buffer.from(JSON.stringify(layer));buffers.set(s.id+'.json',bytes);cm.files[s.id+'.json']={sha256:sha(bytes),bytes:bytes.length,source_revision:rev};proof.push({id:s.id,expected:checked.expected,accepted:checked.accepted,missing:checked.missing.length});
 }
 const cmbytes=Buffer.from(JSON.stringify(cm)),contextPin=sha(cmbytes);buffers.set('manifest.json',cmbytes);
 const loader=L.create({contextPin,sourceBinding:binding,contract:C,ai:AI,addressed:A,crypto:crypto.webcrypto,fetch:async url=>new Response(buffers.get(url.split('/').pop()))});
 for(const s of proof)assert((await loader.load(s.id,newRows.get(s.id))).checked.ok);
 const out=path.resolve(__dirname,'../../atlas-context/a97001rc32',contextPin),unchanged=fs.existsSync(out);
 if(unchanged){assert.deepEqual(fs.readdirSync(out).sort(),[...buffers.keys()].sort(),'Existing namespace inventory drift');for(const [name,b]of buffers)assert(fs.readFileSync(path.join(out,name)).equals(b),'Existing immutable context drift '+name);}
 else {fs.mkdirSync(out,{recursive:true});for(const [name,b]of buffers)fs.writeFileSync(path.join(out,name),b,{flag:'wx'});}
 const report={schema:'atlas97001.terms-addendum-context-rebind.1',pin,sourceBinding:binding,contextPin,baselineContextPin:oldRelease.contextPin,map_entries:map.entries.length,changed_payload_keys:changes,sections:proof,unchanged,source_preserved:true,scientific_acceptance:false,production_changed:false};
 fs.writeFileSync(path.join(runtime,'terms-addendum-integration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));return report;
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
