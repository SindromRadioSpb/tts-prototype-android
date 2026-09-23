'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sqlite3=require('sqlite3');
const fixture=require('./helpers/mediathequeArchiveFixture.cjs');
const Core=require('../public/js/portable-learning-package-core');
const Portable=require('../public/js/studio-portable-learning-package');
const Playback=require('../public/js/playback-source');
const C=require('../public/js/mediatheque-core');
const {createPublicationRepo}=require('../db/publicationRepo');
const MIGRATIONS=['020_identity.sql','056_group_song_corpus_p0.sql','057_group_corpus_audio_revisions.sql','058_group_corpus_catalog_metadata.sql','063_publication_domain.sql','067_mediatheque_structure.sql','068_mediatheque_material_purge.sql','069_mediatheque_purge_sources.sql'];
const exec=(db,s)=>new Promise((resolve,reject)=>db.exec(s,e=>e?reject(e):resolve()));
const all=(db,s,p=[])=>new Promise((resolve,reject)=>db.all(s,p,(e,r)=>e?reject(e):resolve(r)));
const run=(db,s,p=[])=>new Promise((resolve,reject)=>db.run(s,p,e=>e?reject(e):resolve()));
async function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-material-'));
  const db=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(':memory:',e=>e?reject(e):resolve(d));});
  await exec(db,'PRAGMA foreign_keys=ON');// как на проде (db/sqlite.js)
  for(const m of MIGRATIONS)await exec(db,fs.readFileSync(path.join(__dirname,'..','migrations',m),'utf8'));
  await exec(db,"INSERT INTO users(id,role,display_name) VALUES('owner','owner','Owner'),('member','user','Member')");
  t.after(async()=>{await new Promise(r=>db.close(r));fs.rmSync(dir,{recursive:true,force:true});});
  return {db,dir,repo:createPublicationRepo({db,dataDir:dir}),owner:{id:'owner',role:'owner'}};
}
test('edition items accept only the audited purge shape',async t=>{
  const {db}=await setup(t);
  await exec(db,`INSERT INTO published_corpora(corpus_id,slug,title,status,created_by,updated_by,created_at,updated_at) VALUES('pc','media-00000000000000000000','T','DRAFT_ACTIVE','owner','owner','x','x');
    INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at) VALUES('pd','pc',1,1,'PUBLISHED','owner','owner','x','x');
    INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
      VALUES('ed','pc',1,'pd','{}','${'a'.repeat(64)}',1,0,1,'published-corpora/pc/editions/ed/packages/corpus.zip',1,'${'a'.repeat(64)}','owner','x');
    INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
      VALUES('ei','ed','pi','work-1',1,'Title','C','{"a":1}','${'b'.repeat(64)}',1,1,1,'B','2026-09-23',0,0,0,1);`);
  const purge=`UPDATE published_corpus_edition_items SET snapshot_json='{"purged":true}',title='[deleted]',creator=NULL,public_read_allowed=0,public_stream_allowed=0,package_download_allowed=0 WHERE edition_item_id='ei'`;
  await assert.rejects(run(db,purge),/PUBLICATION_EDITION_ITEM_IMMUTABLE/);
  await run(db,`INSERT INTO published_corpus_edition_purges(edition_id,public_work_id,corpus_id,purged_by,purged_at) VALUES('ed','work-1','pc','owner','x')`);
  await assert.rejects(run(db,`UPDATE published_corpus_edition_items SET title='Other' WHERE edition_item_id='ei'`),/PUBLICATION_EDITION_ITEM_IMMUTABLE/);
  await run(db,purge);
  assert.equal((await all(db,"SELECT snapshot_json FROM published_corpus_edition_items"))[0].snapshot_json,'{"purged":true}');
  await assert.rejects(run(db,"DELETE FROM published_corpus_edition_items"),/PUBLICATION_EDITION_ITEM_IMMUTABLE/);
  await assert.rejects(run(db,"DELETE FROM published_corpus_edition_purges"),/PUBLICATION_PURGE_APPEND_ONLY/);
});
async function archiveBytes(variant){
  const input=fixture();
  input.table_revisions[0].rows[0].ru='привет '+variant;input.text_card.card.rows[0].russian='привет '+variant;
  input.playback_source=Playback.append(null,{url:'https://www.youtube.com/watch?v=sYd4zgR7f6w'});
  return Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input,{mode:'snapshot'}),'nodebuffer'));
}
const slug='media-'+'1'.repeat(20);
async function publishArchive(h,title,key){
  const prepared=await h.repo.prepareMediathequeArchive(h.owner,await archiveBytes(title),{mode:'youtube'});
  const o=n=>({idempotencyKey:key+'-'+n});
  let corpus=(await h.repo.listPublisherCorpora(h.owner)).find(c=>c.slug===slug);
  if(!corpus)corpus=await h.repo.createCorpus(h.owner,{slug,title:'Channel'},o('create'));
  let detail=await h.repo.getPublisherCorpus(h.owner,corpus.corpus_id);
  if(!detail.draft){await h.repo.createRevisionDraft(h.owner,corpus.corpus_id,o('rev'));detail=await h.repo.getPublisherCorpus(h.owner,corpus.corpus_id);}
  const copied=await h.repo.copyMediathequeArchive(h.owner,corpus.corpus_id,{token:prepared.token,title,creator:'Channel',expectedVersion:detail.draft.version},o('copy'));
  const rights=await h.repo.recordMaterialRights(h.owner,corpus.corpus_id,{itemIds:copied.items.map(i=>i.item_id),expectedVersion:copied.draft_version,preset:{public_read_allowed:true,public_stream_allowed:true,package_download_allowed:true,basis:'OWNER_ATTESTATION_2026_09_23',asserted_at:'2026-09-23'}},o('rights'));
  await h.repo.publish(h.owner,corpus.corpus_id,{expectedVersion:rights.draft_version},o('publish'));
  const items=(await h.repo.getPublicMediatheque()).items;
  return {corpus,item:items.find(i=>i.title===title),prepared};
}
async function placeOnShowcase(h,refs){
  const draft=await h.repo.getMediathequeDraft(h.owner);let d=draft.structure;
  d=C.command(d,{type:'category.create',id:'topic',title:'Topic',parentId:null},{publicOnly:true});
  d=C.command(d,{type:'items.add',target:'category',id:'topic',references:refs},{publicOnly:true});
  const saved=await h.repo.saveMediathequeDraft(h.owner,{structure:d,expectedVersion:draft.revision},{idempotencyKey:'show-save'});
  await h.repo.publishMediatheque(h.owner,{expectedVersion:saved.revision,expectedEdition:draft.edition_id||null},{idempotencyKey:'show-publish'});
}
const packages=h=>fs.readdirSync(path.join(h.dir,'publication-imports','packages'));
test('deleting one of two materials publishes an edition without it, purges history and files, and drops showcase links',async t=>{
  const h=await setup(t);
  const a=await publishArchive(h,'Keep','a'),b=await publishArchive(h,'Drop','b');
  await placeOnShowcase(h,[a.item.ref,b.item.ref]);
  const before=packages(h).length;
  await assert.rejects(h.repo.deleteMediathequeMaterials({id:'member',role:'user'},{items:[b.item.ref]},{idempotencyKey:'d0'}),/PUBLISHER_FORBIDDEN/);
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[{slug:b.item.ref.slug,workId:b.item.ref.workId}]},{idempotencyKey:'d1'});
  assert.deepEqual(out.failed,[]);assert.equal(out.deleted[0].title,'Drop');assert.equal(out.deleted[0].corpus_archived,false);
  const pub=await h.repo.getPublicMediatheque();
  assert.deepEqual(pub.items.map(i=>i.title),['Keep']);
  assert.equal(JSON.stringify(pub.structure).includes(b.item.ref.workId),false);
  assert.equal(JSON.stringify(pub.structure).includes(a.item.ref.workId),true);
  assert.equal(JSON.stringify((await h.repo.getMediathequeDraft(h.owner)).structure).includes(b.item.ref.workId),false);
  const rows=await all(h.db,'SELECT snapshot_json,title FROM published_corpus_edition_items WHERE public_work_id=?',[b.item.ref.workId]);
  assert.ok(rows.length>=1);assert.ok(rows.every(r=>r.snapshot_json==='{"purged":true}'&&r.title==='[deleted]'));
  assert.equal((await all(h.db,"SELECT COUNT(*) n FROM publication_draft_items WHERE title='Drop'"))[0].n,0);
  const purgedEditions=await all(h.db,'SELECT edition_id FROM published_corpus_edition_purges WHERE public_work_id=?',[b.item.ref.workId]);
  assert.ok(purgedEditions.length>=1);
  for(const {edition_id} of purgedEditions){
    assert.equal(fs.existsSync(path.join(h.dir,'published-corpora',a.corpus.corpus_id,'editions',edition_id)),false);
    await assert.rejects(h.repo.rollback(h.owner,a.corpus.corpus_id,{editionId:edition_id},{idempotencyKey:'rb-'+edition_id}),/EDITION_PURGED/);
  }
  assert.equal(fs.existsSync(path.join(h.dir,'publication-imports',b.prepared.token+'.json')),false);
  assert.equal(packages(h).length,before-1);
  const again=await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'d2'});
  assert.deepEqual(again.failed,[]);
});
test('deleting the last material withdraws its corpus and refuses restore',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Only','only');
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[a.item.ref]},{idempotencyKey:'d1'});
  assert.deepEqual(out.failed,[]);assert.equal(out.deleted[0].corpus_archived,true);
  assert.equal((await h.repo.getPublicMediatheque()).items.length,0);
  const [ed]=await all(h.db,'SELECT edition_id FROM published_corpus_edition_purges');
  await assert.rejects(h.repo.restore(h.owner,a.corpus.corpus_id,{editionId:ed.edition_id},{idempotencyKey:'r1'}),/EDITION_PURGED/);
});
test('last material with an untouched mediatheque draft: draft closed, corpus withdrawn',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Only','only');
  await h.repo.createRevisionDraft(h.owner,a.corpus.corpus_id,{idempotencyKey:'clean-rev'});
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[a.item.ref]},{idempotencyKey:'d'});
  assert.deepEqual(out.failed,[]);assert.equal(out.deleted[0].corpus_archived,true);
  assert.equal((await all(h.db,"SELECT COUNT(*) n FROM publication_drafts WHERE state='ACTIVE'"))[0].n,0);
});
test('bulk delete reports each item; unmanaged and missing items fail without stopping the rest',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'One','one'),b=await publishArchive(h,'Two','two');
  await h.repo.createCorpus(h.owner,{slug:'study-songs',title:'Songs'},{idempotencyKey:'songs'});
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[{slug:'study-songs',workId:'work-x'},a.item.ref,{slug,workId:'work-missing'},b.item.ref]},{idempotencyKey:'bulk'});
  assert.deepEqual(out.deleted.map(d=>d.title).sort(),['One','Two']);
  assert.deepEqual(out.failed.map(f=>f.code).sort(),['MATERIAL_NOT_FOUND','MATERIAL_NOT_MANAGED']);
});
test('foreign active draft blocks deletion and nothing is purged',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Keep','a'),b=await publishArchive(h,'Drop','b');
  const prepared=await h.repo.prepareMediathequeArchive(h.owner,await archiveBytes('Pending'),{mode:'youtube'});
  await h.repo.createRevisionDraft(h.owner,a.corpus.corpus_id,{idempotencyKey:'foreign-rev'});
  const detail=await h.repo.getPublisherCorpus(h.owner,a.corpus.corpus_id);
  await h.repo.copyMediathequeArchive(h.owner,a.corpus.corpus_id,{token:prepared.token,title:'Pending',creator:'C',expectedVersion:detail.draft.version},{idempotencyKey:'foreign-copy'});
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'blocked'});
  assert.deepEqual(out.failed.map(f=>f.code),['DRAFT_VERSION_CONFLICT']);
  assert.equal((await all(h.db,'SELECT COUNT(*) n FROM published_corpus_edition_purges'))[0].n,0);
  assert.deepEqual((await h.repo.getPublicMediatheque()).items.map(i=>i.title).sort(),['Drop','Keep']);
});
test('resume after interruption finishes purge and structure cleanup',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Keep','a'),b=await publishArchive(h,'Drop','b');
  await assert.rejects(h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref],faultAfter:'publish'},{idempotencyKey:'x'}),/FAULT_AFTER_PUBLISH/);
  assert.deepEqual((await h.repo.getPublicMediatheque()).items.map(i=>i.title),['Keep']);
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'y'});
  assert.deepEqual(out.failed,[]);
  assert.ok((await all(h.db,'SELECT snapshot_json FROM published_corpus_edition_items WHERE public_work_id=?',[b.item.ref.workId])).every(r=>r.snapshot_json==='{"purged":true}'));
});
test('edit card publishes a new version that keeps its showcase place',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Old title','a');await publishArchive(h,'Other','b');
  await placeOnShowcase(h,[a.item.ref]);
  const fields={title:'X',description:'',creator:'C',tags:[],download:true};
  await assert.rejects(h.repo.updateMediathequeMaterial({id:'member',role:'user'},{...a.item.ref,expectedSnapshotHash:a.item.ref.snapshotHash,fields},{idempotencyKey:'u0'}),/PUBLISHER_FORBIDDEN/);
  const out=await h.repo.updateMediathequeMaterial(h.owner,{slug:a.item.ref.slug,workId:a.item.ref.workId,expectedSnapshotHash:a.item.ref.snapshotHash,
    fields:{title:'New title',description:'About',creator:'Kan 11',tags:['интервью'],download:false}},{idempotencyKey:'u1'});
  assert.notEqual(out.snapshotHash,a.item.ref.snapshotHash);
  const pub=await h.repo.getPublicMediatheque(),item=pub.items.find(i=>i.ref.workId===a.item.ref.workId);
  assert.equal(item.title,'New title');assert.equal(item.creator,'Kan 11');assert.deepEqual(item.tags,['интервью']);assert.equal(item.topic,'About');
  assert.equal(item.ref.snapshotHash,out.snapshotHash);
  assert.deepEqual(pub.structure.categories.find(c=>c.id==='topic').items,[C.refKey(item.ref)]);
  assert.deepEqual((await h.repo.getMediathequeDraft(h.owner)).structure.categories.find(c=>c.id==='topic').items,[C.refKey(item.ref)]);
  const [row]=await all(h.db,'SELECT package_download_allowed FROM published_corpus_edition_items ei JOIN published_corpora c ON c.current_edition_id=ei.edition_id WHERE ei.public_work_id=?',[a.item.ref.workId]);
  assert.equal(row.package_download_allowed,0);
  await assert.rejects(h.repo.updateMediathequeMaterial(h.owner,{slug:a.item.ref.slug,workId:a.item.ref.workId,expectedSnapshotHash:a.item.ref.snapshotHash,fields},{idempotencyKey:'u2'}),/MATERIAL_CHANGED/);
  await assert.rejects(h.repo.updateMediathequeMaterial(h.owner,{slug:a.item.ref.slug,workId:a.item.ref.workId,expectedSnapshotHash:out.snapshotHash,fields:{...fields,title:''}},{idempotencyKey:'u3'}),/PUBLICATION_INPUT_INVALID/);
});
test('archive download is owner-only and names a missing archive honestly',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Episode','a');
  await assert.rejects(h.repo.mediathequeMaterialArchive({id:'member',role:'user'},{...a.item.ref,part:'package'}),/PUBLISHER_FORBIDDEN/);
  const out=await h.repo.mediathequeMaterialArchive(h.owner,{...a.item.ref,part:'package'});
  assert.ok(fs.existsSync(out.absolute_path));assert.match(out.filename,/\.lplp\.zip$/);assert.equal(out.mime,'application/zip');
  await assert.rejects(h.repo.mediathequeMaterialArchive(h.owner,{...a.item.ref,part:'media'}),/MATERIAL_ARCHIVE_UNAVAILABLE/);
});
test('server wires owner-guarded material routes and exposes their error codes',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.ok(src.includes("app.post('/api/publication/mediatheque/materials\\\\:delete', rlPublicationWrite, requireStrictSameOriginJson,"));
  assert.ok(src.includes("app.post('/api/publication/mediatheque/materials\\\\:update', rlPublicationWrite, requireStrictSameOriginJson,"));
  assert.ok(src.includes("app.get('/api/publication/mediatheque/materials/archive', rlPublicationRead,"));
  assert.ok(!/materials\\\\:delete[^\n]*faultAfter/.test(src));
  assert.ok(src.includes('const { faultAfter, ...body } = req.body || {};'),'update route strips the test fault hook');
  for(const code of ['MATERIAL_NOT_MANAGED','MATERIAL_NOT_FOUND','MATERIAL_CHANGED','MATERIAL_ARCHIVE_UNAVAILABLE','EDITION_PURGED'])assert.ok(src.includes('"'+code+'"'),code);
});
test('catalog tells the editor whether package download is allowed',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Episode','a');
  assert.equal(a.item.download_allowed,1);
  await h.repo.updateMediathequeMaterial(h.owner,{...a.item.ref,expectedSnapshotHash:a.item.ref.snapshotHash,fields:{title:'Episode',description:'',creator:'C',tags:[],download:false}},{idempotencyKey:'dl'});
  assert.equal((await h.repo.getPublicMediatheque()).items[0].download_allowed,0);
});
test('mediatheque UI wires material commands and every new string exists in ru/en/he',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','public/js/mediatheque-ui.js'),'utf8');
  for(const a of ['delete-material','delete-selected','edit-material','download-material','hide-item','hide-selected','unhide-item'])assert.ok(ui.includes("'"+a+"'"),a);
  assert.ok(ui.includes('/api/publication/mediatheque/materials:delete'));assert.ok(ui.includes('/api/publication/mediatheque/materials:update'));
  const saved=global.window;global.window={};
  try{
    for(const l of ['ru','en','he'])require('../public/i18n/locales/'+l+'.js');
    const keys=['deleteMaterial','deleteMaterialHelp','deleteMaterialPlaces','deleteMaterialDevices','deleteForever','deleteSelected','deleteSelectedHelp','deleteSkipped','deleteReport','deleteCleanupPending','downloadArchive','downloadBeforeDelete','archiveUnavailable','editMaterial','materialTitle','materialDescription','materialCreator','materialTags','materialDownload','materialNotManaged','materialNotFound','materialChanged','editionPurged','hideFromMediatheque','hideHelp','hiddenFilter','unhide','hiddenDone','unhiddenDone'];
    for(const l of ['ru','en','he'])for(const k of keys)assert.ok(window.I18N_LOCALES[l].mediatheque[k],l+'.'+k);
  }finally{global.window=saved;}
});
test('review I1: delete interrupted after the draft step is finished by a retry with a new key',async t=>{
  const h=await setup(t);await publishArchive(h,'Keep','a');const b=await publishArchive(h,'Drop','b');
  await assert.rejects(h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref],faultAfter:'draft'},{idempotencyKey:'i1'}),/FAULT_AFTER_DRAFT/);
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'i1-retry'});
  assert.deepEqual(out.failed,[]);
  assert.deepEqual((await h.repo.getPublicMediatheque()).items.map(i=>i.title),['Keep']);
});
test('review I1: edit interrupted after the draft step is finished by a retry with a new key',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Old','a');await publishArchive(h,'Other','b');
  const input={slug:a.item.ref.slug,workId:a.item.ref.workId,expectedSnapshotHash:a.item.ref.snapshotHash,fields:{title:'New',description:'',creator:'C',tags:[],download:true}};
  await assert.rejects(h.repo.updateMediathequeMaterial(h.owner,{...input,faultAfter:'draft'},{idempotencyKey:'e1'}),/FAULT_AFTER_DRAFT/);
  await h.repo.updateMediathequeMaterial(h.owner,input,{idempotencyKey:'e1-retry'});
  assert.ok((await h.repo.getPublicMediatheque()).items.some(i=>i.title==='New'));
});
test('review I2: a retry cleans source files left behind by an earlier cleanup failure',async t=>{
  const h=await setup(t);await publishArchive(h,'Keep','a');const b=await publishArchive(h,'Drop','b');
  const [row]=await all(h.db,'SELECT snapshot_json FROM published_corpus_edition_items ei JOIN published_corpora c ON c.current_edition_id=ei.edition_id WHERE ei.public_work_id=?',[b.item.ref.workId]);
  const sha=JSON.parse(row.snapshot_json).library.texts[0].source_meta.publication_archive.package_sha256;
  await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'i2'});
  const leftover=path.join(h.dir,'publication-imports','packages',sha+'.zip');
  fs.writeFileSync(leftover,'left behind');
  await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'i2-retry'});
  assert.equal(fs.existsSync(leftover),false);
});
test('review I5: editing only the title keeps the full description and tags',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Old','a');
  const long='д'.repeat(1500);
  const first=await h.repo.updateMediathequeMaterial(h.owner,{...a.item.ref,expectedSnapshotHash:a.item.ref.snapshotHash,fields:{title:'Old',description:long,creator:'C',tags:['x'],download:true}},{idempotencyKey:'e5a'});
  await h.repo.updateMediathequeMaterial(h.owner,{...a.item.ref,expectedSnapshotHash:first.snapshotHash,fields:{title:'New title'}},{idempotencyKey:'e5b'});
  const [row]=await all(h.db,'SELECT ei.title,ei.snapshot_json FROM published_corpus_edition_items ei JOIN published_corpora c ON c.current_edition_id=ei.edition_id WHERE ei.public_work_id=?',[a.item.ref.workId]);
  const text=JSON.parse(row.snapshot_json).library.texts[0];
  assert.equal(row.title,'New title');assert.equal(text.topic,long);assert.deepEqual(text.tags,['x']);
});
test('review I8: catalog tells the editor whether an original media file is stored',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Episode','a');
  assert.equal(a.item.has_media_file,0);
});
test('review I3-I8: UI timeouts, conflict text, partial edit, personal follow, core URL, media download',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const ui=read('public/js/mediatheque-ui.js'),sw=read('public/sw.js'),server=read('server.js'),localDb=read('public/db/local-db.js');
  assert.ok(ui.includes("/:publish|materials:/.test(path) ? 300000 : 30000"),'I3 long timeout for material commands');
  const conflict=ui.indexOf("/DRAFT_VERSION_CONFLICT/.test(code)"),generic=ui.indexOf("if (/CONFLICT/.test(code)) return t('conflict');");
  assert.ok(conflict>0&&conflict<generic,'I4 draft conflict matched before the generic conflict');
  assert.ok(ui.includes("/CONFLICT/.test(e.message) && !/DRAFT_VERSION_CONFLICT/.test(e.message)"),'I4 dialog does not offer refresh-structure for a corpus draft conflict');
  assert.ok(!ui.includes("description: String(data.get('description')"),'I5 unchanged description is not sent');
  assert.ok(ui.includes('C.followCurrent(state.personal.structure'),'I6 personal structure follows current public versions');
  const coreImports=[ui.match(/import '\.\/mediatheque-core\.js[^']*'/)[0],localDb.match(/mediatheque-core\.js[^'"]*/)[0]];
  assert.deepEqual(coreImports,["import './mediatheque-core.js'",'mediatheque-core.js'],'I7 one module URL for the core');
  assert.ok(sw.includes('"/js/mediatheque-core.js",')&&server.includes('"/js/mediatheque-core.js",'),'I7 unversioned core precached and integrity-checked');
  assert.ok(ui.includes("data-part=\"media\""),'I8 media download button');
  const saved=global.window;global.window={};
  try{for(const l of ['ru','en','he']){delete require.cache[require.resolve('../public/i18n/locales/'+l+'.js')];require('../public/i18n/locales/'+l+'.js');}
    for(const l of ['ru','en','he'])for(const k of ['draftConflict','downloadMedia','downloadMediaBeforeDelete'])assert.ok(window.I18N_LOCALES[l].mediatheque[k],l+'.'+k);}
  finally{global.window=saved;}
});
test('re-import into a topic whose last material was deleted publishes the corpus again',async t=>{
  // Прод 2026-09-23: «Ворт» был последним в теме → корпус WITHDRAWN без текущей редакции;
  // «Добавить материал» просил новую ревизию и получал CORPUS_NOT_FOUND.
  const h=await setup(t);const a=await publishArchive(h,'Old version','old');
  await h.repo.deleteMediathequeMaterials(h.owner,{items:[a.item.ref]},{idempotencyKey:'del'});
  const again=await publishArchive(h,'Corrected version','new');
  assert.ok(again.item,'re-imported material is in the public catalog');
  assert.deepEqual((await h.repo.getPublicMediatheque()).items.map(i=>i.title),['Corrected version']);
  const [corpus]=await all(h.db,"SELECT status,current_edition_id FROM published_corpora WHERE slug=?",[slug]);
  assert.equal(corpus.status,'PUBLISHED');assert.ok(corpus.current_edition_id);
});
