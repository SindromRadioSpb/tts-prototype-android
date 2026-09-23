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
