const test=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
const Core=require('../public/js/portable-learning-package-core.js');
const Studio=require('../public/js/studio-portable-learning-package.js');

function source(){return{package:{media_sha256:'a'.repeat(64),mime:'audio/mpeg',size_bytes:10},raw_track:{current_revision_id:'r0'},raw_revisions:[{revision_id:'r0',revision_no:1,canonical_sha256:'b'.repeat(64),segments:[]}],corrected_track:{current_revision_id:'r1'},corrected_revisions:[{revision_id:'r1',revision_no:1,canonical_sha256:'c'.repeat(64),segments:[]}],material:{portable_text_key:'backup-key',current_table_revision_id:'t1'},table_revisions:[{table_revision_id:'t1',revision_no:1,bound_caption_revision_id:'r1',bound_caption_revision_sha256:'c'.repeat(64),content_sha256:'d'.repeat(64),mapping_sha256:'e'.repeat(64),rows:[]}],selected_caption_revision_id:'r1',selected_table_revision_id:'t1',text:{text_key:'backup-key',title:'Backup fixture'},text_card:{format:'linguistpro-text-card-v2',card:{rows:[]}}};}

test('full backup embeds every promoted material archive and declares complete coverage',async()=>{
  const fake={listMaterials:async()=>[{material_id:'m1',portable_text_key:'backup-key',title:'Backup fixture'}],snapshotForMaterial:async()=>source()};
  Studio.setRepositoryForTests(fake);const zip=new JSZip(),payload={manifest:{}};
  const index=await Studio.augmentFullBackupZip(zip,payload);
  assert.equal(index.packages.length,1);assert.equal(index.packages[0].coverage_status,'COMPLETE');
  assert.equal(payload.manifest.portable_learning_packages_count,1);assert.equal(payload.manifest.portable_learning_packages_complete,true);
  assert.ok(zip.file('learning-packages/index.json'));assert.ok(zip.file(index.packages[0].path));
});

test('backup restore verifies and dry-runs every embedded package before apply',async()=>{
  const files=await Core.buildPackageFiles(source(),{mode:'archive'}),bytes=await Studio.zipFiles(files,'uint8array'),manifest=JSON.parse(files['manifest.json']);
  const outer=new JSZip(),path=`learning-packages/${manifest.content_root_sha256}.lplp.zip`;outer.file(path,bytes);outer.file('learning-packages/index.json',Core.canonicalJson({schema:'linguistpro-learning-packages-backup-index-v1',packages:[{content_root_sha256:manifest.content_root_sha256,path}]}));
  let writes=0;Studio.setRepositoryForTests({dryRun:async verified=>({can_apply:true,plan_sha256:'plan',root:verified.manifest.content_root_sha256}),applyVerified:async()=>{writes++;return{duplicate:false};}});
  const restored=await Studio.restoreEmbeddedPackages(outer);assert.deepEqual(restored,{present:true,imported:1,reused:0,total:1,export_receipts:{restored:0,reused:0,total:0}});assert.equal(writes,1);
});

test('full backup aborts visibly when any promoted material cannot be archived',async()=>{
  Studio.setRepositoryForTests({listMaterials:async()=>[{material_id:'broken'}],snapshotForMaterial:async()=>{throw new Error('MATERIAL_HEAD_INVALID');}});
  await assert.rejects(()=>Studio.augmentFullBackupZip(new JSZip(),{manifest:{}}),/MATERIAL_HEAD_INVALID/);
});

test('single text-card ZIP embeds its matching portable material archive only',async()=>{
  const fake={
    listMaterials:async()=>[
      {material_id:'m1',text_id:'text-1',portable_text_key:'backup-key',title:'Backup fixture'},
      {material_id:'m2',text_id:'text-2',portable_text_key:'other-key',title:'Other fixture'},
    ],
    snapshotForMaterial:async materialId=>{
      assert.equal(materialId,'m1');
      return source();
    },
  };
  Studio.setRepositoryForTests(fake);
  const zip=new JSZip(),manifest={};
  const index=await Studio.augmentTextBackupZip(zip,manifest,'text-1');
  assert.equal(index.packages.length,1);
  assert.equal(manifest.portable_learning_packages_count,1);
  assert.equal(manifest.portable_learning_packages_complete,true);
  assert.ok(zip.file('learning-packages/index.json'));
  assert.ok(zip.file(index.packages[0].path));
});

test('single legacy text-card ZIP declares zero P2 coverage without inventing a material',async()=>{
  Studio.setRepositoryForTests({listMaterials:async()=>[]});
  const zip=new JSZip(),manifest={};
  const index=await Studio.augmentTextBackupZip(zip,manifest,'legacy-text');
  assert.equal(index.packages.length,0);
  assert.equal(manifest.portable_learning_packages_count,0);
  assert.equal(manifest.portable_learning_packages_complete,true);
  assert.ok(zip.file('learning-packages/index.json'));
});

test('full backup carries content-free v48 provenance and restores it through the repository boundary',async()=>{
  const receipts=[{receipt_id:'export-generated:fixture',event_kind:'generated',parent_receipt_id:null,scope_kind:'material',portable_scope_id:'learning-material:fixture',format_kind:'archive_lplp',source_state_sha256:'a'.repeat(64),artifact_sha256:'b'.repeat(64),size_bytes:42,destination_kind:null,app_version:'test',details:{history_complete:true},created_at:'2026-08-02T00:00:00.000Z'}];
  Studio.setRepositoryForTests({listMaterials:async()=>[],listExportReceipts:async()=>receipts});const zip=new JSZip(),payload={manifest:{}};await Studio.augmentFullBackupZip(zip,payload);assert.equal(payload.manifest.portable_export_receipts_count,1);const saved=JSON.parse(await zip.file('learning-packages/export-receipts.json').async('string'));assert.deepEqual(saved.receipts,receipts);
  let restored=null;Studio.setRepositoryForTests({dryRun:async()=>({can_apply:true}),applyVerified:async()=>({duplicate:true}),restoreExportReceipts:async rows=>(restored=rows,{restored:1,reused:0,total:rows.length})});const result=await Studio.restoreEmbeddedPackages(zip);assert.deepEqual(restored,receipts);assert.deepEqual(result.export_receipts,{restored:1,reused:0,total:1});
});
