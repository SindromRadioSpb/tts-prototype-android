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
  async function readyRepository() {
    if (repositoryOverride) return repositoryOverride;
    if (typeof window !== 'undefined' && !window.__localDB && typeof window.ensureLocalDB === 'function') {
      await window.ensureLocalDB();
    }
    return repository();
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
  async function buildMaterialFiles(materialId,mode,options){const snapshot=await (await readyRepository()).snapshotForMaterial(materialId);await validateNativeSnapshot(snapshot);return core().buildPackageFiles(snapshot,{mode:mode||'snapshot',app_version:typeof window!=='undefined'?window.APP_VERSION:null,...(options||{})});}
  async function exportMaterial(materialId,mode,options){
    const files=await buildMaterialFiles(materialId,mode,options),manifest=JSON.parse(files['manifest.json']),blob=await zipFiles(files,typeof window!=='undefined'?'blob':'uint8array');
    if(typeof window!=='undefined'&&!(options&&options.no_download)){const title=JSON.parse(files['learning/material.json']).text.title||'material',safe=String(title).replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,60)||'material',a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`linguistpro-learning-${safe}-${manifest.content_root_sha256.slice(0,12)}-${mode||'snapshot'}.lplp.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
    return {files,manifest,blob};
  }
  async function dryRunFile(file){const verified=await verifyZip(file),plan=await (await readyRepository()).dryRun(verified);pending={verified,plan};return plan;}
  async function applyPending(planSha){if(!pending||pending.plan.plan_sha256!==planSha)fail('IMPORT_PLAN_STALE');const result=await (await readyRepository()).applyVerified(pending.verified,{plan_sha256:planSha});pending=null;return result;}
  async function relinkReceiptMedia(receiptId,file){
    if(!file)fail('MEDIA_FILE_REQUIRED');const receipt=await (await readyRepository()).getReceipt(receiptId),local=receipt&&receipt.id_map&&receipt.id_map.media_package&&receipt.id_map.media_package.local_id;
    if(!local)fail('RECEIPT_MEDIA_PACKAGE_MISSING');if(typeof window==='undefined'||!window.StudioMediaPackage||!window.StudioMediaPackage.relinkFile)fail('MEDIA_RELINK_UNAVAILABLE');
    return window.StudioMediaPackage.relinkFile(local,file);
  }

  async function enrichMedia(row){
    if(!row)return null;let live=null;
    try{if(typeof window!=='undefined'&&window.StudioMediaPackage&&window.StudioMediaPackage.browserRepository)live=await window.StudioMediaPackage.browserRepository().getPackage(row.package_id);}catch(_){}
    return {...row,
      media_available:!!(live&&live.opfs_path||row.opfs_path),
      opfs_path:live&&live.opfs_path||row.opfs_path||null,
      original_name:live&&live.original_name||row.original_name||null,
      size_bytes:live&&live.size_bytes!=null?live.size_bytes:row.size_bytes,
    };
  }
  async function mediaForText(textId){return enrichMedia(await (await readyRepository()).mediaForText(textId));}
  async function mediaForReceipt(receiptId){return enrichMedia(await (await readyRepository()).mediaForReceipt(receiptId));}
  async function relinkTextMedia(textId,file){const media=await mediaForText(textId);if(!media)fail('TEXT_MEDIA_BINDING_MISSING');if(typeof window==='undefined'||!window.StudioMediaPackage||!window.StudioMediaPackage.relinkFile)fail('MEDIA_RELINK_UNAVAILABLE');return window.StudioMediaPackage.relinkFile(media.package_id,file);}

  async function listMaterials(){return (await readyRepository()).listMaterials();}
  async function listReceipts(){return (await readyRepository()).listReceipts();}
  async function materialForText(textId){const materials=await listMaterials();return materials.find(item=>String(item.text_id)===String(textId))||null;}
  async function undoReceipt(receiptId){return (await readyRepository()).undo(receiptId,{confirm:true});}
  async function restoreLibraryProjection(receiptId){return (await readyRepository()).restoreLibraryProjection(receiptId);}
  async function repairTextMediaBinding(receiptId){return (await readyRepository()).repairTextMediaBinding(receiptId);}
  function tr(key,fallback){try{const value=typeof window.t==='function'?window.t(key):'';return value&&value!==key?value:fallback;}catch(_){return fallback;}}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function shortSha(value){const text=String(value||'');return text?text.slice(0,8)+'…'+text.slice(-6):'—';}
  function formatBytes(value){const bytes=Number(value);if(!Number.isFinite(bytes)||bytes<0)return '—';if(bytes<1024)return bytes+' B';if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';return (bytes/1024/1024).toFixed(1)+' MB';}
  function fill(template,values){return String(template).replace(/\{(\w+)\}/g,(_,key)=>values[key]==null?'':String(values[key]));}
  function formatPortableError(error,file,expected){
    const code=error&&error.code||error&&error.message||'UNKNOWN_ERROR';
    if(String(code).includes('MEDIA_SHA_MISMATCH'))return [
      tr('studio.portable.mediaMismatch','Выбран другой файл: его SHA-256 не совпадает с исходным медиа.'),
      fill(tr('studio.portable.mediaExpected','Ожидается: {name} · {size} · SHA {sha}'),{name:error.expected_name||expected&&expected.original_name||'media',size:formatBytes(error.expected_size==null?expected&&expected.size_bytes:error.expected_size),sha:shortSha(error.expected_sha||expected&&expected.sha256)}),
      fill(tr('studio.portable.mediaSelected','Выбран: {name} · {size} · SHA {sha}'),{name:error.file_name||file&&file.name||'media',size:formatBytes(error.file_size==null?file&&file.size:error.file_size),sha:shortSha(error.actual_sha)}),
      tr('studio.portable.mediaTelegram','Если файл пересылался через Telegram, отправьте его как файл без сжатия, а не как видео.'),
    ].join('\n');
    if(String(code).includes('UNIQUE constraint failed: studio_media_packages.media_sha256'))return tr('studio.portable.mediaReuseConflict','Точное медиа уже есть в этой библиотеке, но его пакет не удалось безопасно переиспользовать. Ничего не записано.');
    if(String(code).includes('TEXT_KEY_CONTENT_CONFLICT'))return tr('studio.portable.textConflict','В библиотеке уже есть другой текст с тем же переносимым идентификатором. Импорт остановлен без изменений.');
    if(String(code).includes('RECOVERY_PACKAGE_MISMATCH'))return tr('studio.portable.recoveryPackageMismatch','Выбран другой пакет. Для восстановления выберите исходный .lplp.zip, указанный в этой записи Истории.');
    if(String(code).includes('SOURCE_PACKAGE_REQUIRED'))return tr('studio.portable.sourcePackageRequired','Для восстановления удалённой карточки и таблицы нужен исходный .lplp.zip. Receipt подтверждает импорт, но не хранит копию содержимого.');
    return fill(tr('studio.portable.errorWithCode','Операция остановлена без частичных изменений. Код: {code}'),{code});
  }
  function closeModal(modal){modal.hidden=true;pending=null;}
  function formatDate(value){try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch(_){return String(value||'');}}
  function ensureModal(){
    let el=document.getElementById('p2PortableModal');if(el)return el;
    el=document.createElement('div');el.id='p2PortableModal';el.className='p2-portable-backdrop';el.hidden=true;el.innerHTML=`<section class="p2-portable-dialog" role="dialog" aria-modal="true" aria-labelledby="p2PortableTitle"><header><div><span class="p2-portable-kicker">LOCAL · VERIFIED · ZERO PROVIDER CALLS</span><h3 id="p2PortableTitle"></h3></div><button type="button" class="p2-portable-close" aria-label="Close">×</button></header><p id="p2PortablePrivacy" class="p2-portable-privacy"></p><div class="p2-format-help-row"><button type="button" id="p2FormatHelpToggle" class="p2-format-help-toggle" aria-expanded="false" aria-controls="p2FormatHelp"></button><span id="p2FormatHelpHint" class="p2-format-help-hint"></span></div><section id="p2FormatHelp" class="p2-format-help" tabindex="-1" hidden></section><nav id="p2PortableTabs" class="p2-portable-tabs" aria-label="Portability scope"><button type="button" data-view="library"></button><button type="button" data-view="material"></button><button type="button" data-view="import"></button><button type="button" data-view="history"></button></nav><div id="p2PortableBody"></div><footer id="p2PortableActions"></footer></section>`;document.body.appendChild(el);el.querySelector('.p2-portable-close').onclick=()=>closeModal(el);const dialog=el.querySelector('.p2-portable-dialog'),helpToggle=el.querySelector('#p2FormatHelpToggle'),help=el.querySelector('#p2FormatHelp');helpToggle.onclick=()=>{const expanded=helpToggle.getAttribute('aria-expanded')!=='true';helpToggle.setAttribute('aria-expanded',expanded?'true':'false');help.hidden=!expanded;dialog.classList.toggle('p2-help-open',expanded);};return el;
  }
  function setActiveTab(modal,view){for(const button of modal.querySelectorAll('#p2PortableTabs button'))button.setAttribute('aria-current',button.dataset.view===view?'page':'false');}
  async function renderLibrary(modal,state){
    const body=modal.querySelector('#p2PortableBody'),actions=modal.querySelector('#p2PortableActions');actions.innerHTML='';
    body.innerHTML=`<div class="p2-scope-map"><section class="p2-scope-card p2-scope-recommended"><span class="p2-scope-eyebrow">${tr('studio.portable.complete','COMPLETE')}</span><h4>${tr('studio.portable.fullBackup','Full library backup')}</h4><p>${tr('studio.portable.fullBackupHelp','Texts, notes, audio and every promoted learning-material archive. Recommended for moving to another device.')}</p><div class="p2-scope-actions"><button type="button" data-action="library-export-zip">${tr('studio.portable.downloadFull','Download full ZIP')}</button><button type="button" data-action="library-import-zip">${tr('studio.portable.restoreFull','Restore full ZIP')}</button></div></section><section class="p2-scope-card"><span class="p2-scope-eyebrow">${tr('studio.portable.compatibility','COMPATIBILITY')}</span><h4>${tr('studio.portable.compatibilityJson','Compatibility JSON')}</h4><p>${tr('studio.portable.compatibilityHelp','Texts and table projections only. No audio and no immutable Studio history.')}</p><div class="p2-scope-actions"><button type="button" data-action="library-export-json">${tr('studio.portable.downloadJson','Download JSON')}</button><button type="button" data-action="library-import-json">${tr('studio.portable.importJson','Import JSON')}</button></div></section></div>`;
    body.onclick=event=>{const action=event.target&&event.target.dataset.action;if(!action)return;const names={'library-export-zip':'v3LibraryExportBundle','library-import-zip':'v3LibraryImportBundle','library-export-json':'v3LibraryExport','library-import-json':'v3LibraryImport'};const fn=typeof window!=='undefined'&&window[names[action]];if(typeof fn==='function'){closeModal(modal);fn();}};
  }
  async function renderMaterial(modal,state){
    const materials=state.materials,body=modal.querySelector('#p2PortableBody'),actions=modal.querySelector('#p2PortableActions');
    const selected=materials.some(item=>String(item.material_id)===String(state.materialId))?String(state.materialId):(materials[0]?String(materials[0].material_id):'');state.materialId=selected||null;
    body.innerHTML=`<section class="p2-scope-card p2-material-scope"><span class="p2-scope-eyebrow">${tr('studio.portable.oneMaterial','ONE MATERIAL')}</span><label>${tr('studio.portable.material','Learning material')}<select id="p2PortableMaterial" ${materials.length?'':'disabled'}>${materials.map(m=>`<option value="${esc(m.material_id)}"${String(m.material_id)===selected?' selected':''}>${esc(m.title||m.portable_text_key)}</option>`).join('')}</select></label><div class="p2-format-grid"><article><b>${tr('studio.portable.snapshot','Export snapshot')}</b><span>${tr('studio.portable.snapshotHelp','Current selected transcript and table versions; compact hand-off.')}</span></article><article><b>${tr('studio.portable.archive','Export archive')}</b><span>${tr('studio.portable.archiveHelp','Complete reachable transcript and table history; recommended for migration.')}</span></article></div><div class="p2-portable-status" id="p2PortableStatus">${materials.length?tr('studio.portable.ready','Ready for a media-free export.'):tr('studio.portable.emptyMaterial','There are no versioned learning materials yet. You can still import one from the Import tab.')}</div></section>`;
    actions.innerHTML=`<button type="button" data-act="snapshot" ${materials.length?'':'disabled'}>${tr('studio.portable.snapshot','Export snapshot')}</button><button type="button" data-act="archive" class="p2-portable-primary" ${materials.length?'':'disabled'}>${tr('studio.portable.archive','Export archive')}</button>`;
    const status=body.querySelector('#p2PortableStatus'),select=body.querySelector('#p2PortableMaterial');if(select)select.onchange=()=>{state.materialId=select.value;};
    actions.onclick=async event=>{const act=event.target&&event.target.dataset.act;if(!act||!select||!select.value)return;try{status.textContent=tr('studio.portable.working','Building canonical package…');await exportMaterial(select.value,act);status.textContent=tr('studio.portable.exported','Exported. Media bytes were not included.');}catch(error){status.textContent=error.code||error.message;}};
  }
  async function renderImport(modal,state){
    const body=modal.querySelector('#p2PortableBody'),actions=modal.querySelector('#p2PortableActions');
    body.innerHTML=`<section class="p2-scope-card p2-import-scope"><span class="p2-scope-eyebrow">${tr('studio.portable.verifyFirst','VERIFY FIRST')}</span><h4>${tr('studio.portable.importTitle','Import a learning package')}</h4><p>${tr('studio.portable.importHelp','Select a .lplp.zip file. Verification and dry-run make no writes; Apply appears only for an unchanged safe plan.')}</p><div class="p2-portable-status" id="p2PortableStatus">${tr('studio.portable.importReady','No file selected. Your local library is unchanged.')}</div><input id="p2PortableFile" type="file" accept=".zip,.lplp.zip,application/zip" hidden><input id="p2PortableRelink" type="file" accept="audio/*,video/*" hidden></section>`;
    actions.innerHTML=`<button type="button" data-act="import" class="p2-portable-primary">${tr('studio.portable.import','Choose and verify package')}</button>`;
    const status=body.querySelector('#p2PortableStatus'),file=body.querySelector('#p2PortableFile'),relink=body.querySelector('#p2PortableRelink');
    actions.onclick=event=>{if(event.target&&event.target.dataset.act==='import'){file.value='';delete file.dataset.expectedReceipt;file.click();}};
    file.onchange=async()=>{
      const selected=file.files[0];if(!selected)return;let plan=null;
      try{
        status.classList.remove('p2-portable-error');status.textContent=tr('studio.portable.verifying','Verifying before any writes…');plan=await dryRunFile(selected);
        if(file.dataset.expectedReceipt&&(!plan.recovery||String(plan.recovery.receipt_id)!==String(file.dataset.expectedReceipt)))fail('RECOVERY_PACKAGE_MISMATCH');
        const recovery=plan.recovery||{state:'new',missing:[]};
        const title=recovery.state==='repairable'?tr('studio.portable.repairVerified','Verified — recovery is available'):recovery.state==='archived'?tr('studio.portable.archivedVerified','Verified — card can be returned to the Library'):recovery.state==='complete'?tr('studio.portable.completeVerified','Verified — the material is complete'):plan.can_apply?tr('studio.portable.verified','Verified — ready to apply'):tr('studio.portable.blocked','Blocked');
        const mediaState=plan.media.status==='exact'?tr('studio.portable.mediaExact','Media is already available on this device'):plan.media.status==='missing'?tr('studio.portable.mediaMissing','Relink the source media after import'):tr('studio.portable.mediaUnbound','This package does not require media');
        const recoveryLine=recovery.state==='repairable'?`<div class="p2-recovery-summary" data-recovery="repairable"><b>${esc(tr('studio.portable.repairNeeded','The package is known, but its Library card or learning table is missing.'))}</b><span>${esc(tr('studio.portable.repairSourceRequired','The selected source package will restore the missing projection without duplicating surviving history.'))}</span></div>`:recovery.state==='archived'?`<div class="p2-recovery-summary" data-recovery="archived"><b>${esc(tr('studio.portable.cardArchived','The learning material is safe in Archive.'))}</b><span>${esc(tr('studio.portable.cardArchivedHelp','Applying returns its card to the regular Library; immutable history stays unchanged.'))}</span></div>`:'';
        status.innerHTML=`<b>${esc(title)}</b>${recoveryLine}<div class="p2-plan-grid"><span><strong>${Number(plan.estimated.cue_count)}</strong>${tr('studio.portable.cues','transcript cues')}</span><span><strong>${Number(plan.estimated.row_count)}</strong>${tr('studio.portable.currentRows','current table rows')}</span><span><strong>${Number(plan.estimated.caption_revision_count)}</strong>${tr('studio.portable.captionVersions','transcript versions')}</span><span><strong>${Number(plan.estimated.table_revision_count)}</strong>${tr('studio.portable.tableVersions','table versions')}</span></div><div class="p2-media-summary"><b>${esc(mediaState)}</b><span>${esc(plan.media.original_name||tr('studio.portable.unnamedMedia','media file'))} · ${esc(formatBytes(plan.media.size_bytes))} · SHA ${esc(shortSha(plan.media.sha256))}</span></div><span>${Number(plan.conflicts.length)} ${tr('studio.portable.conflicts','conflicts')}</span>`;
        if(plan.can_apply){
          const apply=document.createElement('button');apply.type='button';apply.className='p2-portable-apply';
          apply.textContent=recovery.state==='repairable'?tr('studio.portable.repairApply','Restore card and learning table'):recovery.state==='archived'?tr('studio.portable.restoreCard','Return card to Library'):recovery.state==='complete'?tr('studio.portable.confirmComplete','Confirm — no changes needed'):tr('studio.portable.apply','Apply verified package');
          apply.onclick=async()=>{apply.disabled=true;status.textContent=tr('studio.portable.applying','Applying in one local transaction…');try{const result=await applyPending(plan.plan_sha256);status.classList.remove('p2-portable-error');status.textContent=result.repaired?tr('studio.portable.repaired','Card, learning table, exact bindings and history were restored.'):result.duplicate?tr('studio.portable.reused','Already present — zero duplicates.'):tr('studio.portable.applied','Imported locally. Durable receipt saved.');try{if(typeof window.v3LibraryRefresh==='function')window.v3LibraryRefresh();}catch(_){}if(plan.media.status==='missing'){const button=document.createElement('button');button.type='button';button.className='p2-portable-apply';button.textContent=tr('studio.portable.relink','Relink exact media file');button.onclick=()=>{relink.value='';relink.dataset.receipt=result.receipt.receipt_id;relink.click();};status.appendChild(document.createElement('br'));status.appendChild(button);}}catch(error){status.classList.add('p2-portable-error');status.textContent=formatPortableError(error,selected,plan.media);apply.disabled=false;}};
          status.appendChild(document.createElement('br'));status.appendChild(apply);
        }
      }catch(error){status.classList.add('p2-portable-error');status.textContent=formatPortableError(error,selected,plan&&plan.media);}
    };
    relink.onchange=async()=>{const selected=relink.files[0];if(!selected)return;try{await relinkReceiptMedia(relink.dataset.receipt,selected);status.classList.remove('p2-portable-error');status.textContent=tr('studio.portable.relinked','Media relinked by exact SHA-256.');}catch(error){status.classList.add('p2-portable-error');status.textContent=formatPortableError(error,selected,pending&&pending.plan&&pending.plan.media);}};
    if(state.repairReceiptId){file.dataset.expectedReceipt=state.repairReceiptId;state.repairReceiptId=null;file.click();}
  }
  async function confirmUndo(){if(typeof window!=='undefined'&&typeof window.v3ConfirmModal==='function')return window.v3ConfirmModal({title:tr('studio.portable.undoTitle','Undo this import?'),body:tr('studio.portable.undoConfirm','Only objects created by this import and still unreferenced will be removed. Reused data and media stay intact.'),okText:tr('studio.portable.undo','Undo import'),cancelText:tr('studio.portable.cancel','Cancel')});return typeof window!=='undefined'&&typeof window.confirm==='function'?window.confirm(tr('studio.portable.undoConfirm','Undo this import?')):false;}
  async function renderHistory(modal,state){
    const body=modal.querySelector('#p2PortableBody'),actions=modal.querySelector('#p2PortableActions'),receipts=await listReceipts();actions.innerHTML='';
    for(const item of receipts)item._media=await mediaForReceipt(item.receipt_id);
    const cards=receipts.map(item=>{
      const media=item._media,integrity=item._integrity||{state:item.status==='committed'?'complete':'rolled_back',missing:[]};
      const lifecycle=item.status==='committed'?integrity.state:'rolled_back';
      const stateText={complete:tr('studio.portable.committed','Active'),archived:tr('studio.portable.archivedState','In Archive'),repairable:tr('studio.portable.repairState','Recovery required'),conflict:tr('studio.portable.conflictState','Integrity conflict'),rolled_back:tr('studio.portable.rolledBack','Undone')}[lifecycle]||lifecycle;
      const mediaLine=media?(media.media_available?tr('studio.portable.mediaConnected','Media is linked and available on this device'):tr('studio.portable.mediaMissingShort','Media is missing on this device'))+' · '+(media.original_name||tr('studio.portable.unnamedMedia','media file'))+' · SHA '+shortSha(media.media_sha256):tr('studio.portable.mediaNotRequired','No media was declared');
      const bindingOnly=lifecycle==='repairable'&&integrity.requires_source_package===false&&(integrity.missing||[]).length===1&&integrity.missing[0]==='text_media_binding_target';
      const healthLine=bindingOnly?tr('studio.portable.bindingRepairHistoryHelp','The card and history are intact, but the exact media link points to an obsolete imported track. Repair uses the verified immutable revision already on this device.'):lifecycle==='repairable'?tr('studio.portable.repairHistoryHelp','The receipt is proof of the import, not a content backup. Select the original Source package to restore the missing card and table.'):lifecycle==='archived'?tr('studio.portable.archivedHistoryHelp','The card is hidden from the regular Library; its Studio history and media are intact.'):lifecycle==='complete'?tr('studio.portable.completeHistoryHelp','Card, learning table, bindings and immutable history are available.') : '';
      const relink=item.status==='committed'&&media&&!media.media_available?`<button type="button" class="p2-media-relink" data-action="relink-media" data-receipt="${esc(item.receipt_id)}">${tr('studio.portable.relink','Relink exact media file')}</button>`:'';
      const recovery=lifecycle==='archived'?`<button type="button" class="p2-recovery-action" data-action="restore-library" data-receipt="${esc(item.receipt_id)}">${tr('studio.portable.restoreCard','Return card to Library')}</button>`:bindingOnly?`<button type="button" class="p2-recovery-action" data-action="repair-binding" data-receipt="${esc(item.receipt_id)}">${tr('studio.portable.repairExactMediaBinding','Repair exact media link')}</button>`:lifecycle==='repairable'?`<button type="button" class="p2-recovery-action" data-action="choose-repair-package" data-receipt="${esc(item.receipt_id)}">${tr('studio.portable.chooseRepairPackage','Choose Source package and restore')}</button>`:'';
      const undo=item.status==='committed'&&lifecycle!=='repairable'?`<button type="button" data-action="inspect-undo" data-receipt="${esc(item.receipt_id)}">${tr('studio.portable.checkUndo','Check complete deletion')}</button>`:'';
      return `<article class="p2-receipt-card" data-receipt-card="${esc(item.receipt_id)}" data-integrity="${esc(lifecycle)}"><div><b>${esc(item.title||tr('studio.portable.importedMaterial','Imported learning material'))}</b><span>${esc(item.package_mode)} · ${esc(formatDate(item.created_at))}</span><code>${esc(String(item.content_root_sha256||'').slice(0,16))}…</code><span class="p2-receipt-media" data-available="${media&&media.media_available?'true':'false'}">${esc(mediaLine)}</span>${healthLine?`<span class="p2-receipt-health">${esc(healthLine)}</span>`:''}</div><span class="p2-receipt-state" data-state="${esc(lifecycle)}">${esc(stateText)}</span>${relink}${recovery}${undo}<p class="p2-receipt-result" aria-live="polite"></p></article>`;
    }).join('');
    body.innerHTML=`<section class="p2-receipt-section"><div class="p2-receipt-intro"><span class="p2-scope-eyebrow">${tr('studio.portable.localHistory','LOCAL HISTORY')}</span><h4>${tr('studio.portable.historyTitle','Import history')}</h4><p>${tr('studio.portable.historyHelp','Each entry shows whether the card, exact table, immutable history and media are still usable. Complete deletion remains a separate verified action.')}</p></div><div id="p2ReceiptList">${cards||`<div class="p2-portable-status">${tr('studio.portable.noReceipts','No imported learning packages yet.')}</div>`}</div><input id="p2HistoryRelink" type="file" accept="audio/*,video/*" hidden></section>`;
    const relink=body.querySelector('#p2HistoryRelink');
    relink.onchange=async()=>{const file=relink.files[0],receiptId=relink.dataset.receipt,card=body.querySelector(`[data-receipt-card="${CSS.escape(receiptId||'')}"]`),result=card&&card.querySelector('.p2-receipt-result');if(!file||!receiptId||!result)return;try{result.classList.remove('p2-portable-error');result.textContent=tr('studio.portable.hashingMedia','Проверяем SHA-256 и сохраняем медиа локально…');await relinkReceiptMedia(receiptId,file);await renderHistory(modal,state);}catch(error){result.classList.add('p2-portable-error');result.textContent=formatPortableError(error,file,await mediaForReceipt(receiptId));}};
    body.onclick=async event=>{const button=event.target&&event.target.closest&&event.target.closest('button[data-action]');if(!button)return;const card=button.closest('[data-receipt-card]'),result=card&&card.querySelector('.p2-receipt-result'),receiptId=button.dataset.receipt;if(!card||!result||!receiptId)return;if(button.dataset.action==='relink-media'){relink.value='';relink.dataset.receipt=receiptId;relink.click();return;}if(button.dataset.action==='choose-repair-package'){state.repairReceiptId=receiptId;await renderView(modal,state,'import');return;}button.disabled=true;try{if(button.dataset.action==='restore-library'){result.textContent=tr('studio.portable.restoringCard','Returning the card to the Library…');await restoreLibraryProjection(receiptId);try{if(typeof window.v3LibraryRefresh==='function')window.v3LibraryRefresh();}catch(_){}await renderHistory(modal,state);return;}if(button.dataset.action==='repair-binding'){result.textContent=tr('studio.portable.repairingExactMediaBinding','Repairing the exact media link…');await repairTextMediaBinding(receiptId);try{if(typeof window.v3LibraryRefresh==='function')window.v3LibraryRefresh();}catch(_){}await renderHistory(modal,state);return;}if(button.dataset.action==='inspect-undo'){result.textContent=tr('studio.portable.checkingUndo','Checking references…');const plan=await (await readyRepository()).reverseReferencePlan(receiptId);if(!plan.can_delete){result.textContent=tr('studio.portable.undoBlocked','Undo is blocked because later data references this import. Nothing was changed.');button.disabled=false;return;}result.textContent=tr('studio.portable.undoSafe','Safe to undo. Reused data and media will stay intact.');button.dataset.action='undo';button.textContent=tr('studio.portable.undo','Undo import');button.disabled=false;return;}if(button.dataset.action==='undo'){if(!(await confirmUndo())){button.disabled=false;return;}result.textContent=tr('studio.portable.undoing','Undoing in one local transaction…');await undoReceipt(receiptId);try{if(typeof window.v3LibraryRefresh==='function')window.v3LibraryRefresh();}catch(_){}await renderHistory(modal,state);}}catch(error){result.textContent=formatPortableError(error);button.disabled=false;}};
  }
  async function renderView(modal,state,view){state.view=view;setActiveTab(modal,view);if(view==='library')return renderLibrary(modal,state);if(view==='material')return renderMaterial(modal,state);if(view==='import')return renderImport(modal,state);return renderHistory(modal,state);}
  async function open(options){
    options=options||{};const modal=ensureModal(),tabs=modal.querySelector('#p2PortableTabs'),helpToggle=modal.querySelector('#p2FormatHelpToggle'),help=modal.querySelector('#p2FormatHelp');modal.querySelector('#p2PortableTitle').textContent=tr('studio.portable.hub','Transfer & backups');modal.querySelector('#p2PortablePrivacy').textContent=tr('studio.portable.privacy','Everything stays in this browser unless you explicitly download or choose a file. Provider secrets are never included.');helpToggle.textContent=tr('studio.portable.helpButton','How do I choose a format?');modal.querySelector('#p2FormatHelpHint').textContent=tr('studio.portable.helpHint','A 30-second guide: what is preserved and why.');helpToggle.setAttribute('aria-expanded','false');help.hidden=true;modal.querySelector('.p2-portable-dialog').classList.remove('p2-help-open');help.innerHTML=`<h4>${tr('studio.portable.helpTitle','Choose by what you need to preserve')}</h4><p class="p2-format-help-intro">${tr('studio.portable.helpIntro','Use the narrowest format that still carries your source of truth.')}</p><div class="p2-format-help-paths"><article class="p2-format-help-path"><b>${tr('studio.portable.helpFullMove','Full device move')}</b><span>${tr('studio.portable.helpFullMoveText','Full library, notes, audio and every material history.')}</span><code>${tr('studio.portable.helpFullMoveFormat','Full ZIP')}</code></article><article class="p2-format-help-path"><b>${tr('studio.portable.helpMaterialHistory','One material with history')}</b><span>${tr('studio.portable.helpMaterialHistoryText','Immutable transcript/table revisions and exact mappings; no media bytes.')}</span><code>${tr('studio.portable.helpMaterialHistoryFormat','Archive .lplp.zip')}</code></article><article class="p2-format-help-path"><b>${tr('studio.portable.helpSnapshot','Compact current state')}</b><span>${tr('studio.portable.helpSnapshotText','Only the selected current revisions; no media bytes.')}</span><code>${tr('studio.portable.helpSnapshotFormat','Snapshot .lplp.zip')}</code></article><article class="p2-format-help-path"><b>${tr('studio.portable.helpCompatibility','Compatibility only')}</b><span>${tr('studio.portable.helpCompatibilityText','Texts and table projections for older flows; not a complete backup.')}</span><code>${tr('studio.portable.helpCompatibilityFormat','JSON')}</code></article></div><p class="p2-format-help-note">${tr('studio.portable.helpMediaNote','Portable material packages identify media by SHA-256. Move actual audio with Full ZIP or a text-card ZIP with audio.')}</p>`;
    const materials=await listMaterials(),byText=options.textId?materials.find(item=>String(item.text_id)===String(options.textId)):null,state={materials,materialId:options.materialId||(byText&&byText.material_id)||null,view:options.view||'library'};
    const labels={library:tr('studio.portable.libraryTab','Library'),material:tr('studio.portable.materialTab','One material'),import:tr('studio.portable.importTab','Import'),history:tr('studio.portable.historyTab','History')};for(const button of tabs.querySelectorAll('button'))button.textContent=labels[button.dataset.view];tabs.onclick=event=>{const view=event.target&&event.target.dataset.view;if(view)renderView(modal,state,view);};modal.hidden=false;await renderView(modal,state,state.view);if(options.help)helpToggle.click();return {materials:materials.length,view:state.view};
  }
  async function openForText(textId){return open({view:'material',textId});}

  async function appendMaterialArchives(zip,manifest,materials){
    const index={schema:'linguistpro-learning-packages-backup-index-v1',packages:[]};
    for(const material of materials){const built=await exportMaterial(material.material_id,'archive',{no_download:true}),bytes=await zipFiles(built.files,'uint8array'),path=`learning-packages/${built.manifest.content_root_sha256}.lplp.zip`;zip.file(path,bytes);index.packages.push({portable_material_id:built.manifest.roots.learning_material,text_key:material.portable_text_key,content_root_sha256:built.manifest.content_root_sha256,path,coverage_status:'COMPLETE'});}
    zip.file('learning-packages/index.json',core().canonicalJson(index));if(manifest){manifest.portable_learning_packages_count=index.packages.length;manifest.portable_learning_packages_complete=true;}return index;
  }
  async function augmentFullBackupZip(zip,payload){
    return appendMaterialArchives(zip,payload&&payload.manifest,await listMaterials());
  }
  async function augmentTextBackupZip(zip,manifest,textId){
    const material=await materialForText(textId);return appendMaterialArchives(zip,manifest,material?[material]:[]);
  }
  async function restoreEmbeddedPackages(zip){
    const indexFile=zip&&zip.file&&zip.file('learning-packages/index.json');if(!indexFile)return {present:false,imported:0,reused:0};
    const index=core().parseJsonStrict(await indexFile.async('string'));let imported=0,reused=0;
    const repo=await readyRepository();for(const item of index.packages||[]){const entry=zip.file(item.path);if(!entry)fail('BACKUP_PORTABLE_PACKAGE_MISSING',item.path);const verified=await verifyZip(await entry.async('uint8array'));if(verified.manifest.content_root_sha256!==item.content_root_sha256)fail('BACKUP_PORTABLE_ROOT_MISMATCH');const plan=await repo.dryRun(verified);if(!plan.can_apply)fail('BACKUP_PORTABLE_DRY_RUN_BLOCKED');const result=await repo.applyVerified(verified,{plan_sha256:plan.plan_sha256});result.duplicate?reused++:imported++;}
    return {present:true,imported,reused,total:(index.packages||[]).length};
  }

  return { inspectZipCentralDirectory, zipFiles, readZip, verifyZip, buildMaterialFiles, exportMaterial, dryRunFile, applyPending, relinkReceiptMedia, relinkTextMedia, mediaForText, mediaForReceipt, formatPortableError, listMaterials, listReceipts, materialForText, restoreLibraryProjection, repairTextMediaBinding, undoReceipt, augmentFullBackupZip, augmentTextBackupZip, restoreEmbeddedPackages, open, openForText, setRepositoryForTests(value){repositoryOverride=value;}, getPendingForTests(){return pending;} };
});
