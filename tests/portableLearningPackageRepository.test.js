const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const Core = require('../public/js/portable-learning-package-core.js');
const Repository = require('../public/js/portable-learning-package-repository.js');

let SQL;
test.before(async () => { SQL = await initSqlJs(); });

function fixture() {
  const mediaSha='a'.repeat(64), rawSha='b'.repeat(64), correctedSha='c'.repeat(64);
  return {
    package:{media_sha256:mediaSha,mime:'video/mp4',duration_ms:120000,size_bytes:987654,original_name:'שיעור Мия.mp4'},
    raw_track:{role:'raw_original',language:'he',current_revision_id:'raw-1'},
    raw_revisions:[{revision_id:'raw-1',parent_revision_id:null,revision_no:1,canonical_sha256:rawSha,author_kind:'import',segments:[{source_segment_id:'src:0',start_ms:0,end_ms:1000,text:'שלום'}],operations:[],provenance:{source:'fixture'}}],
    corrected_track:{role:'user_corrected',language:'he',current_revision_id:'corrected-1'},
    corrected_revisions:[{revision_id:'corrected-1',parent_revision_id:null,revision_no:1,canonical_sha256:correctedSha,author_kind:'user',segments:[{caption_segment_id:'caption:0',source_segment_ids:['src:0'],start_ms:0,end_ms:1000,text:'שלום'}],operations:[],provenance:{}}],
    material:{portable_text_key:'owner-lesson-1',current_table_revision_id:'table-1'},
    table_revisions:[{table_revision_id:'table-1',revision_no:1,parent_revision_id:null,bound_caption_revision_id:'corrected-1',bound_caption_revision_sha256:correctedSha,content_sha256:'d'.repeat(64),mapping_sha256:'e'.repeat(64),provider_context:{},impact:{zero_provider_calls:true},rows:[{stable_row_id:'local-row',he_plain:'שלום',he_niqqud:'שָׁלוֹם',translit:'shalom',translit_ru:'шалом',ru:'привет',caption_segment_id:'caption:0',source_segment_ids:['src:0'],field_meta:{ru:{authority:'user',locked:true,status:'current'}},mapping_meta:{authority:'aligned-offline'}}]}],
    selected_caption_revision_id:'corrected-1',selected_table_revision_id:'table-1',
    text:{text_key:'owner-lesson-1',title:'שיעור Мия',source_text:'שלום',tags_json:'[]'},
    text_card:{format:'linguistpro-text-card-v2',card:{title:'שיעור Мия',source_text:'שלום',rows:[{order_index:0,hebrew_plain:'שלום',hebrew_niqqud:'שָׁלוֹם',translit:'shalom',translit_ru:'шалом',russian:'привет'}]}},
    import_run:{provider:'local',warnings:[]},quality_report:{ok:true,row_count:1},
  };
}

async function harness() {
  const db = new SQL.Database();
  db.run(`PRAGMA foreign_keys=ON;
    CREATE TABLE texts(id TEXT PRIMARY KEY,text_key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,source_text TEXT NOT NULL,level TEXT,tags_json TEXT,source TEXT,topic TEXT,source_meta_json TEXT,table_model_meta_json TEXT,tts_profile_json TEXT,is_archived INTEGER NOT NULL DEFAULT 0,updated_at TEXT,created_at TEXT);
    CREATE TABLE sentences(id TEXT PRIMARY KEY,text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,order_index INTEGER NOT NULL,he_plain TEXT,he_niqqud TEXT,translit TEXT,translit_ru TEXT,ru TEXT,meta_json TEXT,edit_meta_json TEXT,translation_provider TEXT,translation_meta_json TEXT,created_at TEXT,UNIQUE(text_id,order_index));`);
  const { MIGRATIONS } = await import('../public/db/migrations.js');
  assert.equal(MIGRATIONS.length,47);
  db.run(MIGRATIONS[44]); db.run(MIGRATIONS[45]); db.run(MIGRATIONS[46]);
  const rows=(sql,params=[])=>{const s=db.prepare(sql);s.bind(params);const out=[];while(s.step())out.push(s.getAsObject());s.free();return out;};
  const adapter={dbQuery:async(sql,p)=>rows(sql,p),dbRun:async(sql,p)=>{const s=db.prepare(sql);s.run(p||[]);s.free();return{changes:db.getRowsModified()};},execRaw:async(sql)=>db.run(sql)};
  return {db,rows,repo:Repository.createRepository(adapter,Core)};
}

async function verified() { return Core.verifyPackageFiles(await Core.buildPackageFiles(fixture(),{mode:'archive'})); }
function count(h,table){return h.rows(`SELECT COUNT(*) n FROM ${table}`)[0].n;}

test('v47 is receipt-only and dry-run performs no writes', async () => {
  const h=await harness(), names=h.rows("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'studio_portable_%'").map(x=>x.name);
  assert.deepEqual(names,['studio_portable_import_receipts']);
  const before=count(h,'studio_portable_import_receipts'), plan=await h.repo.dryRun(await verified());
  assert.equal(plan.can_apply,true); assert.equal(plan.media.status,'missing'); assert.equal(count(h,'studio_portable_import_receipts'),before);
});

test('apply is one SAVEPOINT, durable and idempotent with manual locks intact', async () => {
  const h=await harness(), v=await verified(), plan=await h.repo.dryRun(v);
  const first=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  assert.equal(first.imported,true); assert.equal(count(h,'studio_portable_import_receipts'),1);
  assert.equal(count(h,'studio_table_revisions'),1); assert.equal(count(h,'sentences'),1);
  const projection=JSON.parse(h.rows('SELECT edit_meta_json FROM sentences')[0].edit_meta_json);
  assert.equal(projection.edited.ru,true); assert.equal(projection._studio_material.field_meta.ru.locked,true);
  const secondPlan=await h.repo.dryRun(v), second=await h.repo.applyVerified(v,{plan_sha256:secondPlan.plan_sha256});
  assert.equal(second.duplicate,true); assert.equal(count(h,'studio_table_revisions'),1); assert.equal(count(h,'sentences'),1);
  const exported=await Core.verifyPackageFiles(await Core.buildPackageFiles(await h.repo.snapshotForMaterial(first.receipt.id_map.material.local_id),{mode:'archive'}));
  assert.equal(exported.manifest.roots.learning_material,v.manifest.roots.learning_material);
});

test('committed receipt repairs a deleted compatibility closure without duplicating surviving canon', async () => {
  const h=await harness(),v=await verified(),firstPlan=await h.repo.dryRun(v);
  const first=await h.repo.applyVerified(v,{plan_sha256:firstPlan.plan_sha256});
  const ids=first.receipt.id_map,captionCount=count(h,'studio_caption_revisions'),packageCount=count(h,'studio_media_packages');
  h.db.run('DELETE FROM texts WHERE id=?',[ids.text.local_id]);
  assert.equal(count(h,'texts'),0);assert.equal(count(h,'studio_learning_materials'),0);assert.equal(count(h,'studio_table_revisions'),0);assert.equal(count(h,'studio_text_media_bindings'),0);
  assert.equal(count(h,'studio_caption_revisions'),captionCount);assert.equal(count(h,'studio_media_packages'),packageCount);assert.equal(count(h,'studio_portable_import_receipts'),1);

  const repairPlan=await h.repo.dryRun(v);
  assert.equal(repairPlan.recovery.state,'repairable');
  assert.ok(repairPlan.recovery.missing.includes('text'));
  assert.ok(repairPlan.recovery.missing.includes('material'));
  assert.ok(repairPlan.recovery.missing.includes('table_revisions'));
  assert.ok(repairPlan.recovery.missing.includes('text_media_binding'));
  const repaired=await h.repo.applyVerified(v,{plan_sha256:repairPlan.plan_sha256});
  assert.equal(repaired.repaired,true);assert.equal(repaired.duplicate,false);assert.equal(repaired.imported,false);
  assert.equal(repaired.receipt.id_map.text.local_id,ids.text.local_id);
  assert.equal(repaired.receipt.id_map.material.local_id,ids.material.local_id);
  assert.deepEqual(repaired.receipt.id_map.rows,ids.rows);
  assert.equal(count(h,'texts'),1);assert.equal(count(h,'studio_learning_materials'),1);assert.equal(count(h,'studio_table_revisions'),1);assert.equal(count(h,'sentences'),1);assert.equal(count(h,'studio_text_media_bindings'),1);
  assert.equal(count(h,'studio_caption_revisions'),captionCount);assert.equal(count(h,'studio_media_packages'),packageCount);assert.equal(count(h,'studio_portable_import_receipts'),1);
  assert.deepEqual(h.rows('PRAGMA foreign_key_check'),[]);

  const duplicatePlan=await h.repo.dryRun(v),duplicate=await h.repo.applyVerified(v,{plan_sha256:duplicatePlan.plan_sha256});
  assert.equal(duplicatePlan.recovery.state,'complete');assert.equal(duplicate.duplicate,true);assert.equal(duplicate.repaired,false);
});

test('archived compatibility card is recoverable without rebuilding immutable graph', async () => {
  const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v),applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  h.db.run('UPDATE texts SET is_archived=1 WHERE id=?',[applied.receipt.id_map.text.local_id]);
  const integrity=await h.repo.receiptIntegrity(applied.receipt.receipt_id);
  assert.equal(integrity.state,'archived');
  const restored=await h.repo.restoreLibraryProjection(applied.receipt.receipt_id);
  assert.equal(restored.restored,true);assert.equal(h.rows('SELECT is_archived FROM texts')[0].is_archived,0);
  assert.equal(count(h,'studio_table_revisions'),1);assert.equal(count(h,'studio_caption_revisions'),2);
});

test('faults after every write phase roll back byte-equivalent counts and pointers', async () => {
  for(const fault of ['after_package','after_tracks','after_caption_revisions','after_material','after_table_revisions','after_projection','after_receipt']){
    const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v);
    const before=['studio_media_packages','studio_caption_tracks','studio_caption_revisions','texts','sentences','studio_learning_materials','studio_table_revisions','studio_learning_row_versions','studio_portable_import_receipts'].map(t=>count(h,t));
    await assert.rejects(()=>h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256,fault_inject:fault}),new RegExp('FAULT_INJECT'));
    const after=['studio_media_packages','studio_caption_tracks','studio_caption_revisions','texts','sentences','studio_learning_materials','studio_table_revisions','studio_learning_row_versions','studio_portable_import_receipts'].map(t=>count(h,t));
    assert.deepEqual(after,before,fault); assert.deepEqual(h.rows('PRAGMA foreign_key_check'),[],fault);
  }
});

test('same text key with unrelated local canon blocks before SAVEPOINT', async () => {
  const h=await harness(); h.db.run("INSERT INTO texts(id,text_key,title,source_text,created_at,updated_at) VALUES('other','owner-lesson-1','other','x','t','t')");
  const v=await verified(), plan=await h.repo.dryRun(v);
  assert.equal(plan.can_apply,true,'pure core sees an unpromoted compatibility text as rebindable');
  await assert.rejects(()=>h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256}),/TEXT_KEY_CONTENT_CONFLICT/);
  assert.equal(count(h,'studio_portable_import_receipts'),0);
});

test('full-backup restore rebinds an exact compatibility text without changing sentence identity',async()=>{
  const h=await harness();h.db.run("INSERT INTO texts(id,text_key,title,source_text,created_at,updated_at) VALUES('library-text','owner-lesson-1','שיעור Мия','שלום','t','t')");
  h.db.run("INSERT INTO sentences(id,text_id,order_index,he_plain,he_niqqud,translit,translit_ru,ru,created_at) VALUES('library-row','library-text',0,'שלום','שָׁלוֹם','shalom','шалом','привет','t')");
  const v=await verified(),plan=await h.repo.dryRun(v),result=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  assert.equal(result.receipt.id_map.text.local_id,'library-text');assert.equal(result.receipt.id_map.text.created,false);
  assert.equal(h.rows('SELECT id FROM sentences')[0].id,'library-row');assert.equal(count(h,'studio_learning_materials'),1);
});

test('explicit receipt undo removes only created closure and keeps the inert receipt', async () => {
  const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v);
  const applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  const result=await h.repo.undo(applied.receipt.receipt_id,{confirm:true});
  assert.equal(result.undone,true); assert.equal(count(h,'texts'),0); assert.equal(count(h,'studio_learning_materials'),0);
  assert.equal(count(h,'studio_media_packages'),0); assert.equal(count(h,'studio_caption_tracks'),0);
  assert.equal(count(h,'studio_portable_import_receipts'),1);
  assert.equal(h.rows('SELECT status FROM studio_portable_import_receipts')[0].status,'rolled_back');
  assert.deepEqual(h.rows('PRAGMA foreign_key_check'),[]);
});

test('the same package can be applied again after explicit Undo and remains idempotent',async()=>{
  const h=await harness(),v=await verified(),firstPlan=await h.repo.dryRun(v);
  const first=await h.repo.applyVerified(v,{plan_sha256:firstPlan.plan_sha256});
  await h.repo.undo(first.receipt.receipt_id,{confirm:true});
  const secondPlan=await h.repo.dryRun(v),second=await h.repo.applyVerified(v,{plan_sha256:secondPlan.plan_sha256});
  assert.equal(second.imported,true);assert.equal(second.receipt.status,'committed');
  assert.equal(count(h,'studio_portable_import_receipts'),1);
  const duplicatePlan=await h.repo.dryRun(v),duplicate=await h.repo.applyVerified(v,{plan_sha256:duplicatePlan.plan_sha256});
  assert.equal(duplicate.duplicate,true);assert.equal(count(h,'texts'),1);assert.equal(count(h,'studio_learning_materials'),1);
});

test('import reuses an existing exact media SHA under a different local package id',async()=>{
  const h=await harness(),v=await verified(),sha=v.manifest.media.sha256;
  h.db.run(`INSERT INTO studio_media_packages(package_id,media_sha256,mime,duration_ms,original_name,opfs_path,size_bytes,external_ref_json,created_at,updated_at,deleted_at)
    VALUES('original-local-package','${sha}','video/mp4',120000,'original.mp4','media/${sha}.mp4',987654,'{}','t','t',NULL)`);
  const plan=await h.repo.dryRun(v);
  assert.equal(plan.media.status,'exact');
  const result=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  assert.equal(result.receipt.id_map.media_package.local_id,'original-local-package');
  assert.equal(result.receipt.id_map.media_package.created,false);
  assert.equal(count(h,'studio_media_packages'),1);
  assert.equal(count(h,'texts'),1);
  assert.deepEqual(h.rows('PRAGMA foreign_key_check'),[]);
});

test('delete/GC plan blocks when imported closure gained an external user reference',async()=>{
  const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v),applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  h.db.run('CREATE TABLE user_marks(id TEXT PRIMARY KEY,text_id TEXT);');
  h.db.run(`INSERT INTO user_marks VALUES('mark-1','${applied.receipt.id_map.text.local_id}')`);
  const reverse=await h.repo.reverseReferencePlan(applied.receipt.receipt_id);assert.equal(reverse.can_delete,false);assert.equal(reverse.media_blob_action,'retained');
  await assert.rejects(()=>h.repo.undo(applied.receipt.receipt_id,{confirm:true}),/UNDO_EXTERNAL_REFERENCE_CONFLICT/);
  assert.equal(count(h,'texts'),1);assert.equal(h.rows('SELECT status FROM studio_portable_import_receipts')[0].status,'committed');
});
