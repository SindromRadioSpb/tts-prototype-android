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
const MIGRATIONS=['020_identity.sql','056_group_song_corpus_p0.sql','057_group_corpus_audio_revisions.sql','058_group_corpus_catalog_metadata.sql','063_publication_domain.sql','067_mediatheque_structure.sql','068_mediatheque_material_purge.sql'];
const exec=(db,s)=>new Promise((resolve,reject)=>db.exec(s,e=>e?reject(e):resolve()));
const all=(db,s,p=[])=>new Promise((resolve,reject)=>db.all(s,p,(e,r)=>e?reject(e):resolve(r)));
const run=(db,s,p=[])=>new Promise((resolve,reject)=>db.run(s,p,e=>e?reject(e):resolve()));
async function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-material-'));
  const db=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(':memory:',e=>e?reject(e):resolve(d));});
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
  for(const code of ['MATERIAL_NOT_MANAGED','MATERIAL_NOT_FOUND','MATERIAL_CHANGED','MATERIAL_ARCHIVE_UNAVAILABLE','EDITION_PURGED'])assert.ok(src.includes('"'+code+'"'),code);
});
