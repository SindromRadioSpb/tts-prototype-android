// Studio Ingest P2 — browser orchestration, strict ZIP boundary and premium local UI.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StudioPortableLearningPackage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  let repositoryOverride = null, pending = null;
  const utf8 = (value) => typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(String(value)) : new Uint8Array(Buffer.from(String(value),'utf8'));
  const fail = (code, detail) => { const error=new Error(code+(detail?':'+detail:''));error.code=code;throw error; };

  function core() { if (typeof window !== 'undefined' && window.PortableLearningPackageCore) return window.PortableLearningPackageCore; return require('./portable-learning-package-core.js'); }
  function repository() {
    if (repositoryOverride) return repositoryOverride;
    if (typeof window === 'undefined' || !window.__localDB || !window.PortableLearningPackageRepository) fail('PORTABLE_REPOSITORY_UNAVAILABLE');
    repositoryOverride = window.PortableLearningPackageRepository.createRepository(window.__localDB, core());
    return repositoryOverride;
  }
  function u16(bytes,off){return bytes[off]|bytes[off+1]<<8;}
  function u32(bytes,off){return (bytes[off]|bytes[off+1]<<8|bytes[off+2]<<16|bytes[off+3]<<24)>>>0;}
  function decode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){fail('ZIP_FILENAME_UTF8_INVALID');}}

  function inspectZipCentralDirectory(input, limits) {
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input), L=limits||core().LIMITS;
    if(bytes.byteLength>L.archive)fail('PACKAGE_ARCHIVE_TOO_LARGE');
    let eocd=-1; for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(bytes,i)===0x06054b50){eocd=i;break;}
    if(eocd<0)fail('ZIP_EOCD_MISSING');
    const count=u16(bytes,eocd+10),declaredSize=u32(bytes,eocd+12),offset=u32(bytes,eocd+16);
    if(count>L.entries)fail('PACKAGE_FILE_COUNT_EXCEEDED');
    if(offset+declaredSize>eocd)fail('ZIP_CENTRAL_DIRECTORY_INVALID');
    const names=new Set(),entries=[];let pos=offset,totalCompressed=0,totalUncompressed=0;
    for(let index=0;index<count;index++){
      if(u32(bytes,pos)!==0x02014b50)fail('ZIP_CENTRAL_ENTRY_INVALID');
      const flags=u16(bytes,pos+8),method=u16(bytes,pos+10),crc32=u32(bytes,pos+16),compressed=u32(bytes,pos+20),uncompressed=u32(bytes,pos+24),nameLen=u16(bytes,pos+28),extraLen=u16(bytes,pos+30),commentLen=u16(bytes,pos+32),external=u32(bytes,pos+38),localOffset=u32(bytes,pos+42);
      if(flags&1)fail('ZIP_ENCRYPTED_UNSUPPORTED');
      if(![0,8].includes(method))fail('ZIP_COMPRESSION_UNSUPPORTED');
      const rawName=bytes.slice(pos+46,pos+46+nameLen);if(Array.from(rawName).some((byte)=>byte>0x7f))fail('PACKAGE_INTERNAL_PATH_NON_ASCII');
      const name=decode(rawName); if(names.has(name))fail('PACKAGE_DUPLICATE_PATH',name);names.add(name);
      const directory=name.endsWith('/'),unixMode=(external>>>16)&0xffff,fileType=unixMode&0xf000;
      if(fileType&&fileType!==0x8000&&fileType!==0x4000)fail('PACKAGE_SPECIAL_FILE_FORBIDDEN',name);
      if(!directory&&!core().pathAllowed(name))fail('PACKAGE_PATH_UNMANIFESTED',name);
      if(!directory&&utf8(name).byteLength>L.pathBytes)fail('PACKAGE_PATH_INVALID',name);
      if(uncompressed>L.entry||(name==='manifest.json'&&uncompressed>L.manifest)||(name==='README.txt'&&uncompressed>L.readme))fail('PACKAGE_ENTRY_TOO_LARGE',name);
      if(compressed===0&&uncompressed>0)fail('PACKAGE_COMPRESSION_RATIO_EXCEEDED',name);
      if(compressed>0&&uncompressed/compressed>L.ratio)fail('PACKAGE_COMPRESSION_RATIO_EXCEEDED',name);
      totalCompressed+=compressed;totalUncompressed+=uncompressed;if(totalUncompressed>L.uncompressed)fail('PACKAGE_UNCOMPRESSED_SIZE_EXCEEDED');
      if(localOffset+30>bytes.length||u32(bytes,localOffset)!==0x04034b50)fail('ZIP_LOCAL_ENTRY_INVALID',name);
      entries.push({name,directory,flags,method,crc32,compressed_size:compressed,uncompressed_size:uncompressed,local_offset:localOffset});
      pos+=46+nameLen+extraLen+commentLen;
    }
    if(pos!==offset+declaredSize)fail('ZIP_CENTRAL_DIRECTORY_SIZE_MISMATCH');
    if(totalCompressed>0&&totalUncompressed/totalCompressed>L.ratio)fail('PACKAGE_AGGREGATE_RATIO_EXCEEDED');
    return {entries,total_compressed:totalCompressed,total_uncompressed:totalUncompressed};
  }

  async function zipFiles(files, type) {
    const JSZipCtor=typeof window!=='undefined'?await window.v3LoadJSZip():require('jszip');
    const zip=new JSZipCtor(); for(const path of Object.keys(files))zip.file(path,files[path]);
    return zip.generateAsync({type:type||'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
  }
  async function readZip(input) {
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input instanceof ArrayBuffer?input:await input.arrayBuffer());
    const directory=inspectZipCentralDirectory(bytes,core().LIMITS);
    const JSZipCtor=typeof window!=='undefined'?await window.v3LoadJSZip():require('jszip'),zip=await JSZipCtor.loadAsync(bytes,{checkCRC32:true}),files={};
    for(const entry of directory.entries)if(!entry.directory){const item=zip.file(entry.name);if(!item)fail('PACKAGE_FILE_MISSING',entry.name);files[entry.name]=await item.async('string');if(utf8(files[entry.name]).byteLength!==entry.uncompressed_size)fail('PACKAGE_SIZE_MISMATCH',entry.name);}
    return {files,directory,zip};
  }
  async function verifyZip(input){const read=await readZip(input);return core().verifyPackageFiles(read.files);}

  async function validateNativeSnapshot(snapshot){
    if(typeof window==='undefined'||!window.MediaPackageCore||!window.MaterialRevisionCore)return true;
    for(const [role,revisions] of [['raw_original',snapshot.raw_revisions],['user_corrected',snapshot.corrected_revisions]])for(const revision of revisions||[]){const actual=await window.MediaPackageCore.revisionHash(role,revision.segments||[],revision.operations||[]);if(actual!==revision.canonical_sha256)fail('SOURCE_CAPTION_HASH_MISMATCH',revision.revision_id);}
    if(!snapshot._portable_receipt)for(const revision of snapshot.table_revisions||[]){const actual=await window.MaterialRevisionCore.createTableSnapshot({rows:revision.rows||[],provider_context:revision.provider_context||{}});if(actual.content_sha256!==revision.content_sha256||actual.mapping_sha256!==revision.mapping_sha256)fail('SOURCE_TABLE_HASH_MISMATCH',revision.table_revision_id);}
    return true;
  }
  async function buildMaterialFiles(materialId,mode,options){const snapshot=await repository().snapshotForMaterial(materialId);await validateNativeSnapshot(snapshot);return core().buildPackageFiles(snapshot,{mode:mode||'snapshot',app_version:typeof window!=='undefined'?window.APP_VERSION:null,...(options||{})});}
  async function exportMaterial(materialId,mode,options){
    const files=await buildMaterialFiles(materialId,mode,options),manifest=JSON.parse(files['manifest.json']),blob=await zipFiles(files,typeof window!=='undefined'?'blob':'uint8array');
    if(typeof window!=='undefined'&&!(options&&options.no_download)){const title=JSON.parse(files['learning/material.json']).text.title||'material',safe=String(title).replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,60)||'material',a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`linguistpro-learning-${safe}-${manifest.content_root_sha256.slice(0,12)}-${mode||'snapshot'}.lplp.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
    return {files,manifest,blob};
  }
  async function dryRunFile(file){const verified=await verifyZip(file),plan=await repository().dryRun(verified);pending={verified,plan};return plan;}
  async function applyPending(planSha){if(!pending||pending.plan.plan_sha256!==planSha)fail('IMPORT_PLAN_STALE');const result=await repository().applyVerified(pending.verified,{plan_sha256:planSha});pending=null;return result;}
  async function relinkReceiptMedia(receiptId,file){
    if(!file)fail('MEDIA_FILE_REQUIRED');const receipt=await repository().getReceipt(receiptId),local=receipt&&receipt.id_map&&receipt.id_map.media_package&&receipt.id_map.media_package.local_id;
    if(!local)fail('RECEIPT_MEDIA_PACKAGE_MISSING');if(typeof window==='undefined'||!window.StudioMediaPackage||!window.StudioMediaPackage.relinkFile)fail('MEDIA_RELINK_UNAVAILABLE');
    return window.StudioMediaPackage.relinkFile(local,file);
  }

  async function listMaterials(){return repository().listMaterials();}
  function tr(key,fallback){try{const value=typeof window.t==='function'?window.t(key):'';return value&&value!==key?value:fallback;}catch(_){return fallback;}}
  function ensureModal(){
    let el=document.getElementById('p2PortableModal');if(el)return el;
    el=document.createElement('div');el.id='p2PortableModal';el.className='p2-portable-backdrop';el.hidden=true;el.innerHTML=`<section class="p2-portable-dialog" role="dialog" aria-modal="true" aria-labelledby="p2PortableTitle"><header><div><span class="p2-portable-kicker">LOCAL · MEDIA-FREE · ZERO PROVIDER CALLS</span><h3 id="p2PortableTitle"></h3></div><button type="button" class="p2-portable-close" aria-label="Close">×</button></header><p id="p2PortablePrivacy" class="p2-portable-privacy"></p><div id="p2PortableBody"></div><footer id="p2PortableActions"></footer></section>`;document.body.appendChild(el);el.querySelector('.p2-portable-close').onclick=()=>{el.hidden=true;pending=null;};return el;
  }
  async function open(){
    const modal=ensureModal(),body=modal.querySelector('#p2PortableBody'),actions=modal.querySelector('#p2PortableActions');modal.querySelector('#p2PortableTitle').textContent=tr('studio.portable.title','Portable Learning Package');modal.querySelector('#p2PortablePrivacy').textContent=tr('studio.portable.privacy','Immutable captions and learning revisions only. Media, notes, progress and provider secrets are excluded.');
    const materials=await listMaterials();body.innerHTML=`<label>${tr('studio.portable.material','Learning material')}<select id="p2PortableMaterial">${materials.map(m=>`<option value="${String(m.material_id).replace(/"/g,'&quot;')}">${String(m.title||m.portable_text_key)}</option>`).join('')}</select></label><div class="p2-portable-status" id="p2PortableStatus">${materials.length?tr('studio.portable.ready','Ready for a media-free export or verified dry-run.'):tr('studio.portable.empty','No promoted learning material yet.')}</div><input id="p2PortableFile" type="file" accept=".zip,.lplp.zip,application/zip" hidden><input id="p2PortableRelink" type="file" accept="audio/*,video/*" hidden>`;
    actions.innerHTML=`<button type="button" data-act="snapshot">${tr('studio.portable.snapshot','Export snapshot')}</button><button type="button" data-act="archive">${tr('studio.portable.archive','Export archive')}</button><button type="button" data-act="import">${tr('studio.portable.import','Verify import')}</button>`;
    const status=body.querySelector('#p2PortableStatus'),select=body.querySelector('#p2PortableMaterial'),file=body.querySelector('#p2PortableFile'),relink=body.querySelector('#p2PortableRelink');
    actions.onclick=async(event)=>{const act=event.target&&event.target.dataset.act;if(!act)return;try{if(act==='import'){file.value='';file.click();return;}if(!select.value)fail('MATERIAL_REQUIRED');status.textContent=tr('studio.portable.working','Building canonical package…');await exportMaterial(select.value,act);status.textContent=tr('studio.portable.exported','Exported. Media bytes were not included.');}catch(error){status.textContent=error.code||error.message;}};
    file.onchange=async()=>{if(!file.files[0])return;try{status.textContent=tr('studio.portable.verifying','Verifying before any writes…');const plan=await dryRunFile(file.files[0]);status.innerHTML=`<b>${plan.can_apply?tr('studio.portable.verified','Verified — ready to apply'):tr('studio.portable.blocked','Blocked')}</b><br>${plan.estimated.row_count} rows · ${plan.media.status} media · ${plan.conflicts.length} conflicts`;if(plan.can_apply){const apply=document.createElement('button');apply.type='button';apply.className='p2-portable-apply';apply.textContent=tr('studio.portable.apply','Apply verified package');apply.onclick=async()=>{apply.disabled=true;status.textContent=tr('studio.portable.applying','Applying in one local transaction…');try{const result=await applyPending(plan.plan_sha256);status.textContent=result.duplicate?tr('studio.portable.reused','Already present — zero duplicates.'):tr('studio.portable.applied','Imported locally. Durable receipt saved.');if(plan.media.status==='missing'){const button=document.createElement('button');button.type='button';button.className='p2-portable-apply';button.textContent=tr('studio.portable.relink','Relink exact media file');button.onclick=()=>{relink.value='';relink.dataset.receipt=result.receipt.receipt_id;relink.click();};status.appendChild(document.createElement('br'));status.appendChild(button);}}catch(error){status.textContent=error.code||error.message;apply.disabled=false;}};status.appendChild(document.createElement('br'));status.appendChild(apply);}}catch(error){status.textContent=error.code||error.message;}};
    relink.onchange=async()=>{if(!relink.files[0])return;try{await relinkReceiptMedia(relink.dataset.receipt,relink.files[0]);status.textContent=tr('studio.portable.relinked','Media relinked by exact SHA-256.');}catch(error){status.textContent=error.code||error.message;}};
    modal.hidden=false;return {materials:materials.length};
  }

  async function augmentFullBackupZip(zip,payload){
    const materials=await listMaterials(),index={schema:'linguistpro-learning-packages-backup-index-v1',packages:[]};
    for(const material of materials){const built=await exportMaterial(material.material_id,'archive',{no_download:true}),bytes=await zipFiles(built.files,'uint8array'),path=`learning-packages/${built.manifest.content_root_sha256}.lplp.zip`;zip.file(path,bytes);index.packages.push({portable_material_id:built.manifest.roots.learning_material,text_key:material.portable_text_key,content_root_sha256:built.manifest.content_root_sha256,path,coverage_status:'COMPLETE'});}
    zip.file('learning-packages/index.json',core().canonicalJson(index));if(payload&&payload.manifest){payload.manifest.portable_learning_packages_count=index.packages.length;payload.manifest.portable_learning_packages_complete=true;}return index;
  }
  async function restoreEmbeddedPackages(zip){
    const indexFile=zip&&zip.file&&zip.file('learning-packages/index.json');if(!indexFile)return {present:false,imported:0,reused:0};
    const index=core().parseJsonStrict(await indexFile.async('string'));let imported=0,reused=0;
    for(const item of index.packages||[]){const entry=zip.file(item.path);if(!entry)fail('BACKUP_PORTABLE_PACKAGE_MISSING',item.path);const verified=await verifyZip(await entry.async('uint8array'));if(verified.manifest.content_root_sha256!==item.content_root_sha256)fail('BACKUP_PORTABLE_ROOT_MISMATCH');const plan=await repository().dryRun(verified);if(!plan.can_apply)fail('BACKUP_PORTABLE_DRY_RUN_BLOCKED');const result=await repository().applyVerified(verified,{plan_sha256:plan.plan_sha256});result.duplicate?reused++:imported++;}
    return {present:true,imported,reused,total:(index.packages||[]).length};
  }

  return { inspectZipCentralDirectory, zipFiles, readZip, verifyZip, buildMaterialFiles, exportMaterial, dryRunFile, applyPending, relinkReceiptMedia, augmentFullBackupZip, restoreEmbeddedPackages, open, setRepositoryForTests(value){repositoryOverride=value;}, getPendingForTests(){return pending;} };
});
