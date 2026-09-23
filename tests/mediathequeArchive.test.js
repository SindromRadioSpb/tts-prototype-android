'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sqlite3=require('sqlite3');
const fixture=require('./helpers/mediathequeArchiveFixture.cjs');
const Core=require('../public/js/portable-learning-package-core');
const Portable=require('../public/js/studio-portable-learning-package');
const Playback=require('../public/js/playback-source');
const Archive=require('../publication/materialArchive');
const {createPublicationRepo}=require('../db/publicationRepo');
async function archive(media){
  const input=fixture();
  if(media){const old=input.package.media_sha256,hash=Archive.sha(media);input.package.media_sha256=hash;input.package.size_bytes=media.length;
    return Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(JSON.parse(JSON.stringify(input).replaceAll(old,hash)),{mode:'snapshot'}),'nodebuffer'));}
  input.playback_source=Playback.append(null,{url:'https://www.youtube.com/watch?v=sYd4zgR7f6w'});
  return Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input,{mode:'snapshot'}),'nodebuffer'));
}
test('verified archive preserves rows and exact caption binding; mismatched video is rejected',async()=>{
  const bytes=await archive(),out=await Archive.inspectArchive(bytes,{mode:'youtube'});
  assert.equal(out.videoId,'sYd4zgR7f6w');assert.equal(out.media,null);assert.equal(out.rowCount,1);
  assert.equal(out.snapshot.library.texts[0].rows[0].russian,'привет');
  assert.ok(out.snapshot.library.texts[0].source_meta.source.audio);
  await assert.rejects(Archive.inspectArchive(bytes,{mode:'youtube',youtubeUrl:'https://youtu.be/lmVm-eqQtGc'}),/MATERIAL_SOURCE_MISMATCH/);
  await assert.rejects(Archive.inspectArchive(Buffer.from('not zip')));
});
const sql=(db,s)=>new Promise((resolve,reject)=>db.exec(s,e=>e?reject(e):resolve()));
test('text-only public corpora stay readable in the Room but do not enter Mediatheque',async t=>{
  const {repo,owner}=await setup(t),opts=name=>({idempotencyKey:'text-only-'+name});
  const corpus=await repo.createCorpus(owner,{slug:'text-only',title:'Text exercises'},opts('create'));
  const copied=await repo.copyMyTextItems(owner,corpus.corpus_id,{expectedVersion:1,items:[{sourceWorkId:'exercise',title:'Exercise',expectedAudioCount:0,snapshot:{library:{texts:[{text_key:'exercise',rows:[{order_index:0,hebrew_plain:'שלום',russian:'Привет'}]}],audio_assets:[]}}}]},opts('copy'));
  const rights=await repo.recordMaterialRights(owner,corpus.corpus_id,{itemIds:copied.items.map(i=>i.item_id),expectedVersion:copied.draft_version,preset:{public_read_allowed:true,public_stream_allowed:false,package_download_allowed:false,basis:'OWNER_ATTESTATION_MEDIA_2026_09_22',asserted_at:'2026-09-22'}},opts('rights'));
  await repo.publish(owner,corpus.corpus_id,{expectedVersion:rights.draft_version},opts('publish'));
  const published=await repo.getPublicCorpus('text-only');assert.equal(published.items.length,1);
  assert.ok(await repo.getPublicWork('text-only',published.items[0].public_work_id));
  assert.equal((await repo.getPublicMediatheque()).items.length,0);
});
async function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-editorial-'));
  const db=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(':memory:',e=>e?reject(e):resolve(d));});
  for(const m of ['020_identity.sql','056_group_song_corpus_p0.sql','057_group_corpus_audio_revisions.sql','058_group_corpus_catalog_metadata.sql','063_publication_domain.sql','067_mediatheque_structure.sql'])await sql(db,fs.readFileSync(path.join(__dirname,'../migrations',m),'utf8'));
  await sql(db,"INSERT INTO users(id,role,display_name) VALUES('owner','owner','Owner'),('other','owner','Other')");
  t.after(async()=>{await new Promise(r=>db.close(r));fs.rmSync(dir,{recursive:true,force:true});});
  return {repo:createPublicationRepo({db,dataDir:dir}),owner:{id:'owner',role:'owner'},dir};
}
for(const mode of ['youtube','media'])test(mode+' archive uses canonical publication with independent download permission',async t=>{
  const {repo,owner,dir}=await setup(t),media=mode==='media'?Buffer.from('fixture-media-bytes'):null;
  const bytes=await archive(media);
  await assert.rejects(repo.prepareMediathequeArchive({id:'owner',role:'member'},bytes,{mode}),/PUBLISHER_FORBIDDEN/);
  const prepared=await repo.prepareMediathequeArchive(owner,bytes,{mode});
  await assert.rejects(repo.attachMediathequeMedia({id:'other',role:'owner'},prepared.token,Buffer.from('bad')),/PUBLISHER_FORBIDDEN/);
  if(media){await assert.rejects(repo.attachMediathequeMedia(owner,prepared.token,Buffer.from('bad')),/MATERIAL_MEDIA_MISMATCH/);await repo.attachMediathequeMedia(owner,prepared.token,media);}
  const opts=name=>({idempotencyKey:'editorial-test-'+mode+'-'+name});
  const corpus=await repo.createCorpus(owner,{slug:'editorial-'+mode,title:'Channel'},opts('create'));
  const copied=await repo.copyMediathequeArchive(owner,corpus.corpus_id,{token:prepared.token,title:'Episode',creator:'Channel',expectedVersion:1},opts('copy'));
  const rights=await repo.recordMaterialRights(owner,corpus.corpus_id,{itemIds:copied.items.map(i=>i.item_id),expectedVersion:copied.draft_version,preset:{public_read_allowed:true,public_stream_allowed:true,package_download_allowed:false,basis:'OWNER_ATTESTATION_MEDIA_2026_09_22',asserted_at:'2026-09-22'}},opts('rights'));
  const validation=await repo.validateDraft(owner,corpus.corpus_id,rights.draft_version);
  assert.equal(validation.ready,true,JSON.stringify(validation));
  const receipt=await repo.publish(owner,corpus.corpus_id,{expectedVersion:rights.draft_version},opts('publish'));
  assert.ok(receipt.edition_id);
  const published=await repo.getPublicCorpus('editorial-'+mode);
  const catalogue=await repo.getPublicMediatheque();
  assert.equal(catalogue.items.length,1);
  assert.equal(catalogue.items[0].media.kind,'video');
  const payload=await repo.getPublicWork('editorial-'+mode,published.items[0].public_work_id);
  assert.equal(payload.assets.length,media?1:0);
  assert.equal(payload.item.package_download_allowed,0);
  if(media){
    const asset=await repo.getPublicAsset('editorial-'+mode,Archive.sha(media),'stream');
    assert.equal(asset.asset.mime,'video/mp4');
    assert.deepEqual(fs.readFileSync(asset.absolute_path),media);
    await assert.rejects(repo.getPublicAsset('editorial-'+mode,Archive.sha(media),'download'));
    const bundle=require('../public/js/public-corpus-adapter').prepareImportBundle(payload);
    assert.ok(JSON.stringify(bundle).includes('/api/public-corpora/editorial-media/assets/'+Archive.sha(media)));
  }
  const files=fs.readdirSync(path.join(dir,'publication-imports/media'));assert.equal(files.length,media?1:0);
});
test('bundled media is verified and omitted in YouTube mode without altering the input archive',async()=>{
  const media=Buffer.from('bundled-media'),bytes=await archive(media),before=Archive.sha(bytes);
  const manifest=require('../public/js/media-bundle-core').buildBundleManifest({
    package:{name:'learning.lplp.zip',size_bytes:bytes.length,sha256:Archive.sha(bytes),content_root_sha256:(await Portable.verifyZip(bytes)).manifest.content_root_sha256},
    media:{name:'episode.mp4',size_bytes:media.length,sha256:Archive.sha(media),mime:'video/mp4',rendition:'full',duration_seconds:120},
    material:{title:'Fixture',rows:1},app_version:'test',created_at:'2026-09-22T00:00:00Z'});
  const parts=[];
  await require('../public/js/media-bundle-io').writeBundle({manifest,sources:{[manifest.package.entry]:new Blob([bytes]),[manifest.media.entry]:new Blob([media])},writable:{write:p=>parts.push(Buffer.from(p)),close:()=>{}}});
  const bundle=Buffer.concat(parts),local=await Archive.inspectArchive(bundle,{mode:'media'});
  assert.deepEqual(local.media.bytes,media);
  const remote=await Archive.inspectArchive(bundle,{mode:'youtube',youtubeUrl:'https://youtu.be/sYd4zgR7f6w'});
  assert.equal(remote.media,null);assert.equal(remote.videoId,'sYd4zgR7f6w');assert.equal(Archive.sha(bytes),before);
});
test('archive playback basis is rebound to the timing the published card actually receives',async()=>{
  // Экспорт хранит отпечаток разметки в форме Библиотеки; публикация пересобирает разметку из
  // ревизии архива (концы, склейки). Без перепривязки публичная карточка сразу теряет все ▶.
  const input=fixture();
  input.playback_source=Playback.append(null,{url:'https://www.youtube.com/watch?v=sYd4zgR7f6w',offset_ms:1200,confirmed:true},{basis_sha256:'f'.repeat(64)});
  const bytes=Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input,{mode:'snapshot'}),'nodebuffer'));
  const out=await Archive.inspectArchive(bytes,{mode:'youtube'}),text=out.snapshot.library.texts[0],meta=text.source_meta;
  const view=await Playback.youtubeView(meta.source.audio,text.rows,meta.playback_source);
  assert.equal(view.reason,null);assert.ok(view.entries.length);
  const current=Playback.selected(meta.playback_source);
  assert.equal(current.offset_ms,1200);assert.equal(current.source.video_id,'sYd4zgR7f6w');
  assert.equal(current.timing.status,'unverified');
  assert.deepEqual(meta.publication_archive.original_playback,input.playback_source);
  const fresh=await Archive.inspectArchive(await archive(),{mode:'youtube'});
  assert.equal(fresh.snapshot.library.texts[0].source_meta.playback_source.revision,1);
});
