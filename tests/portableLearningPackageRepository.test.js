const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const Core = require('../public/js/portable-learning-package-core.js');
const ImportCenterCore = require('../public/js/import-center-core.js');
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
  assert.ok(MIGRATIONS.length >= 49);
  db.run(MIGRATIONS[44]); db.run(MIGRATIONS[45]); db.run(MIGRATIONS[46]); db.run(MIGRATIONS[47]);
  const rows=(sql,params=[])=>{const s=db.prepare(sql);s.bind(params);const out=[];while(s.step())out.push(s.getAsObject());s.free();return out;};
  const adapter={dbQuery:async(sql,p)=>rows(sql,p),dbRun:async(sql,p)=>{const s=db.prepare(sql);s.run(p||[]);s.free();return{changes:db.getRowsModified()};},execRaw:async(sql)=>db.run(sql)};
  return {db,rows,repo:Repository.createRepository(adapter,Core,ImportCenterCore)};
}

async function verified() { return Core.verifyPackageFiles(await Core.buildPackageFiles(fixture(),{mode:'archive'})); }
function count(h,table){return h.rows(`SELECT COUNT(*) n FROM ${table}`)[0].n;}

function localRevisionId(portableId) {
  const match = /([a-f0-9]{64})$/.exec(String(portableId));
  assert.ok(match, `portable revision id must end with a SHA-256: ${portableId}`);
  return `rev:${match[1]}`;
}

function seedExactCaptionHistory(h, v) {
  const payload = v.payload, sha = v.manifest.media.sha256;
  h.db.run(`INSERT INTO studio_media_packages(package_id,media_sha256,mime,duration_ms,original_name,opfs_path,size_bytes,external_ref_json,created_at,updated_at,deleted_at)
    VALUES('existing-package',?,'video/mp4',120000,'existing.mp4',?,987654,'{}','t','t',NULL)`, [sha, `media/${sha}.mp4`]);
  h.db.run("INSERT INTO studio_caption_tracks(track_id,package_id,role,language,created_at,updated_at) VALUES('existing-raw','existing-package','raw_original','he','t','t')");
  h.db.run("INSERT INTO studio_caption_tracks(track_id,package_id,role,language,parent_track_id,created_at,updated_at) VALUES('existing-corrected','existing-package','user_corrected','he','existing-raw','t','t')");
  for (const doc of payload.caption_revisions) {
    const isRaw = doc.portable_revision_id === payload.raw_track.current_revision_id;
    const trackId = isRaw ? 'existing-raw' : 'existing-corrected';
    const revision = doc.revision, revisionId = localRevisionId(doc.portable_revision_id);
    h.db.run(`INSERT INTO studio_caption_revisions(revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
      VALUES(?,?,NULL,?,?,?,?,?,?,?)`, [revisionId, trackId, Number(revision.revision_no), JSON.stringify(revision.segments || []), JSON.stringify(revision.operations || []), revision.canonical_sha256, revision.author_kind || 'user', JSON.stringify(revision.provenance || {}), revision.created_at || 't']);
    h.db.run('UPDATE studio_caption_tracks SET current_revision_id=? WHERE track_id=?', [revisionId, trackId]);
  }
}

test('v47 import and v48 export receipts are metadata-only; dry-run performs no writes', async () => {
  const h=await harness(), names=h.rows("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'studio_portable_%'").map(x=>x.name);
  assert.deepEqual(names.sort(),['studio_portable_export_receipts','studio_portable_import_receipts']);
  const before=count(h,'studio_portable_import_receipts'), plan=await h.repo.dryRun(await verified());
  assert.equal(plan.can_apply,true); assert.equal(plan.media.status,'missing'); assert.equal(count(h,'studio_portable_import_receipts'),before);
});

test('v48 records generated bytes first and owner-saved only by explicit parent assertion', async () => {
  const h=await harness(), event={
    scope_kind:'material',portable_scope_id:'learning-material:sha256:'+ 'a'.repeat(64),
    format_kind:'archive_lplp',source_state_sha256:'b'.repeat(64),artifact_sha256:'c'.repeat(64),
    size_bytes:321,app_version:'3.11.296',created_at:'2026-08-02T10:00:00.000Z',
  };
  const generated=await h.repo.recordExportGenerated(event);
  assert.equal(generated.event_kind,'generated');assert.equal(generated.destination_kind,null);
  const saved=await h.repo.confirmExportSaved(generated.receipt_id,'files_icloud',{created_at:'2026-08-02T10:01:00.000Z'});
  assert.equal(saved.event_kind,'owner_saved');assert.equal(saved.parent_receipt_id,generated.receipt_id);
  assert.equal(saved.source_state_sha256,event.source_state_sha256);
  assert.equal((await h.repo.listExportReceipts('material',event.portable_scope_id)).length,2);
});

test('v48 owner-saved cannot reference a missing generated event and receipt fault rolls back alone', async () => {
  const h=await harness(), event={
    scope_kind:'material',portable_scope_id:'scope',format_kind:'snapshot_lplp',
    source_state_sha256:'d'.repeat(64),artifact_sha256:'e'.repeat(64),size_bytes:1,app_version:'test',
  };
  await assert.rejects(()=>h.repo.confirmExportSaved('missing','other'),/EXPORT_GENERATED_RECEIPT_NOT_FOUND/);
  await assert.rejects(()=>h.repo.recordExportGenerated(event,{fault_inject:'after_export_receipt'}),/FAULT_INJECT/);
  assert.equal(count(h,'studio_portable_export_receipts'),0);
  assert.equal(count(h,'studio_portable_import_receipts'),0);
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

test('Import Center reads verified codec state from existing JSON metadata without a migration', async () => {
  const h=await harness(),input=fixture();
  input.package.codec_hint='avc1.4D0020,mp4a.40.5';
  input.package.compatibility={contract:'linguistpro-mobile-v1',outcome:'READY',canonical_sha256:input.package.media_sha256,codec_hint:input.package.codec_hint,codec_summary:{video_codec:'h264',declared_level:32}};
  const v=await Core.verifyPackageFiles(await Core.buildPackageFiles(input,{mode:'archive'}));
  const plan=await h.repo.dryRun(v);
  await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  const [item]=await h.repo.lifecycleInventory();
  assert.equal(item.media_codec_supported,true);
  assert.equal(h.rows('SELECT json_extract(external_ref_json,\'$.compatibility.outcome\') AS outcome FROM studio_media_packages')[0].outcome,'READY');
});

test('archive preflight reports a selected caption revision detached from its material package',async()=>{
  const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v);
  const applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  const materialId=applied.receipt.id_map.material.local_id;
  h.db.run("UPDATE studio_table_revisions SET bound_caption_revision_id='missing-caption-revision' WHERE material_id=?",[materialId]);
  await assert.rejects(
    async()=>Core.buildPackageFiles(await h.repo.snapshotForMaterial(materialId),{mode:'archive'}),
    /SELECTED_CAPTION_REVISION_MISSING/,
    'fixture must reproduce the owner-visible export failure',
  );
  assert.deepEqual(await h.repo.materialArchiveGaps(),[{
    material_id:String(materialId),
    text_key:'owner-lesson-1',
    title:'שיעור Мия',
    reason:'SELECTED_CAPTION_REVISION_MISSING',
  }]);
});

test('snapshot follows the selected table revision to its exact corrected sibling track',async()=>{
  const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v);
  const applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  const materialId=applied.receipt.id_map.material.local_id;
  const material=h.rows('SELECT package_id,current_table_revision_id FROM studio_learning_materials WHERE material_id=?',[materialId])[0];
  const rawTrack=h.rows("SELECT track_id FROM studio_caption_tracks WHERE package_id=? AND role='raw_original' LIMIT 1",[material.package_id])[0].track_id;
  const current=h.rows("SELECT r.* FROM studio_caption_revisions r JOIN studio_caption_tracks t ON t.track_id=r.track_id WHERE t.package_id=? AND t.role='user_corrected' LIMIT 1",[material.package_id])[0];
  h.db.run("INSERT INTO studio_caption_tracks(track_id,package_id,role,language,parent_track_id,current_revision_id,created_at,updated_at) VALUES('corrected-sibling',?,'user_corrected','he',?,'corrected-sibling-revision','t','t')",[material.package_id,rawTrack]);
  h.db.run(`INSERT INTO studio_caption_revisions(revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
    VALUES('corrected-sibling-revision','corrected-sibling',NULL,1,?,?,?,?,?,'t')`,[current.segments_json,current.operations_json,current.canonical_sha256,current.author_kind,current.provenance_json]);
  h.db.run("UPDATE studio_table_revisions SET bound_caption_revision_id='corrected-sibling-revision' WHERE table_revision_id=?",[material.current_table_revision_id]);
  assert.deepEqual(await h.repo.materialArchiveGaps(),[],'a valid corrected sibling in the same package is not a backup gap');
  const snapshot=await h.repo.snapshotForMaterial(materialId);
  assert.equal(snapshot.corrected_track.track_id,'corrected-sibling');
  assert.equal(snapshot.selected_caption_revision_id,'corrected-sibling-revision');
  const built=await Core.buildPackageFiles(snapshot,{mode:'archive'});
  assert.equal(JSON.parse(built['manifest.json']).roots.caption_revision,'caption-revision:sha256:'+current.canonical_sha256);
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

test('complete deletion blocks when the import reused pre-existing text canon',async()=>{
  const h=await harness();h.db.run("INSERT INTO texts(id,text_key,title,source_text,created_at,updated_at) VALUES('library-text','owner-lesson-1','שיעור Мия','שלום','t','t')");
  h.db.run("INSERT INTO sentences(id,text_id,order_index,he_plain,he_niqqud,translit,translit_ru,ru,created_at) VALUES('library-row','library-text',0,'שלום','שָׁלוֹם','shalom','шалом','привет','t')");
  const v=await verified(),plan=await h.repo.dryRun(v),applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  const reverse=await h.repo.reverseReferencePlan(applied.receipt.receipt_id);
  assert.equal(reverse.can_delete,false);assert.equal(reverse.blockers.some(item=>item.code==='REUSED_TEXT_CANON'),true);
  await assert.rejects(()=>h.repo.undo(applied.receipt.receipt_id,{confirm:true}),/UNDO_EXTERNAL_REFERENCE_CONFLICT/);
  assert.equal(count(h,'texts'),1);assert.equal(count(h,'studio_learning_materials'),1);
  assert.equal(h.rows('SELECT status FROM studio_portable_import_receipts')[0].status,'committed');
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

test('complete deletion stays available after media-package deletion and accepts proven text cascades',async()=>{
  const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v);
  const applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256}),textId=applied.receipt.id_map.text.local_id;
  h.db.run(`CREATE TABLE text_progress(
    text_id TEXT PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
    last_row_idx INTEGER
  )`);
  h.db.run(`CREATE TABLE sentence_note(
    id TEXT PRIMARY KEY,
    sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    note TEXT
  )`);
  h.db.run('CREATE TABLE events(id TEXT PRIMARY KEY,text_id TEXT,sentence_id TEXT)');
  h.db.run('CREATE TABLE note_occurrences(id INTEGER PRIMARY KEY,text_id TEXT,sentence_id TEXT)');
  const sentenceId=Object.values(applied.receipt.id_map.rows)[0];
  h.db.run('INSERT INTO text_progress(text_id,last_row_idx) VALUES(?,?)',[textId,17]);
  h.db.run('INSERT INTO sentence_note(id,sentence_id,note) VALUES(?,?,?)',['note-1',sentenceId,'owner note']);
  h.db.run('INSERT INTO events(id,text_id,sentence_id) VALUES(?,?,?)',['event-1',textId,sentenceId]);
  h.db.run('INSERT INTO note_occurrences(id,text_id,sentence_id) VALUES(?,?,?)',[1,textId,sentenceId]);
  h.db.run('DELETE FROM studio_media_packages WHERE package_id=?',[applied.receipt.id_map.media_package.local_id]);
  assert.equal((await h.repo.receiptIntegrity(applied.receipt.receipt_id)).state,'repairable');

  const reverse=await h.repo.reverseReferencePlan(applied.receipt.receipt_id);
  assert.equal(reverse.can_delete,true);
  assert.deepEqual(reverse.blockers,[]);
  assert.deepEqual(reverse.cascade_refs.map(ref=>[ref.table,ref.column,ref.count]),[['sentence_note','sentence_id',1],['text_progress','text_id',1]]);
  assert.deepEqual(reverse.explicit_delete_refs.map(ref=>[ref.table,ref.column,ref.count]),[
    ['events','sentence_id',1],['events','text_id',1],['note_occurrences','sentence_id',1],['note_occurrences','text_id',1],
  ]);

  await assert.rejects(()=>h.repo.undo(applied.receipt.receipt_id,{confirm:true,fault_inject:'before_receipt_update'}),/FAULT_INJECT/);
  assert.equal(count(h,'texts'),1);assert.equal(count(h,'events'),1);assert.equal(count(h,'note_occurrences'),1);
  assert.equal(h.rows('SELECT status FROM studio_portable_import_receipts')[0].status,'committed');

  const result=await h.repo.undo(applied.receipt.receipt_id,{confirm:true});
  assert.equal(result.undone,true);
  assert.equal(count(h,'texts'),0);assert.equal(count(h,'text_progress'),0);assert.equal(count(h,'sentence_note'),0);
  assert.equal(count(h,'events'),0);assert.equal(count(h,'note_occurrences'),0);
  assert.equal(count(h,'studio_learning_materials'),0);assert.equal(count(h,'studio_portable_import_receipts'),1);
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

test('import reuses an existing exact caption history without a cross-track media binding',async()=>{
  const h=await harness(),v=await verified();seedExactCaptionHistory(h,v);
  const plan=await h.repo.dryRun(v),result=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  const binding=h.rows('SELECT package_id,track_id,revision_id,revision_sha256 FROM studio_text_media_bindings')[0];
  assert.equal(binding.package_id,'existing-package');
  assert.equal(binding.track_id,'existing-corrected');
  assert.equal(h.rows('SELECT track_id FROM studio_caption_revisions WHERE revision_id=?',[binding.revision_id])[0].track_id,binding.track_id);
  assert.equal(result.receipt.id_map.nodes[v.payload.corrected_track.portable_track_id].local_id,'existing-corrected');
  assert.equal(count(h,'studio_caption_tracks'),2,'reuse must not leave empty duplicate portable tracks');
  assert.deepEqual(h.rows('PRAGMA foreign_key_check'),[]);
});

test('History can repair a legacy cross-track binding without the Source package',async()=>{
  const h=await harness(),v=await verified(),plan=await h.repo.dryRun(v),applied=await h.repo.applyVerified(v,{plan_sha256:plan.plan_sha256});
  const correctedPortable=v.payload.corrected_track.portable_track_id;
  const binding=h.rows('SELECT * FROM studio_text_media_bindings')[0],actualTrack='existing-corrected';
  h.db.run("INSERT INTO studio_caption_tracks(track_id,package_id,role,language,created_at,updated_at) VALUES(?,?,'user_corrected','he','t','t')",[actualTrack,binding.package_id]);
  h.db.run('UPDATE studio_caption_revisions SET track_id=? WHERE revision_id=?',[actualTrack,binding.revision_id]);
  const before=await h.repo.receiptIntegrity(applied.receipt.receipt_id);
  assert.equal(before.state,'repairable');
  assert.deepEqual(before.missing,['text_media_binding_target']);
  assert.equal(before.requires_source_package,false);
  const repaired=await h.repo.repairTextMediaBinding(applied.receipt.receipt_id);
  assert.equal(repaired.repaired,true);
  assert.equal(h.rows('SELECT track_id FROM studio_text_media_bindings')[0].track_id,actualTrack);
  assert.equal(repaired.receipt.id_map.nodes[correctedPortable].local_id,actualTrack);
  assert.equal(count(h,'studio_caption_tracks'),2,'repair removes only the empty obsolete imported track');
  assert.equal((await h.repo.receiptIntegrity(applied.receipt.receipt_id)).state,'complete');
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
