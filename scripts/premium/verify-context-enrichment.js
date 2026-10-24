'use strict';
// Independent byte/source-preservation and actual client acceptance of every row.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {loadClient}=require('./build-modern-release.js');
const Edition=require('../../public/js/benyehuda-learning-edition.js');
const dir=path.resolve('.tmp/context-ai'),out=path.join(dir,'candidate'),data=path.resolve('public/data/benyehuda');
const read=p=>JSON.parse(fs.readFileSync(p));const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=p=>{const b=fs.readFileSync(p);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length);};
(async()=>{
 const report=read(path.join(dir,'enrichment-report.json')),W=loadClient();let stored=0,rejected=0,bodies=0;
 const root=read(path.join(out,'corpus-catalog-v12.json'));await Edition.verifyManifest(root,bytes(path.join(out,root.release_manifest)));
 const cards=read(path.join(out,root.index_file)).ready,old=read(path.join(data,'corpus-index-v11.json')).ready;
 assert.deepEqual(cards.map(c=>c.id),old.map(c=>c.id));
 assert.deepEqual(read(path.join(out,root.search_file)),read(path.join(data,'corpus-search-v11.json')));
 for(let i=0;i<cards.length;i++){assert.equal(cards[i].text_key,old[i].text_key);assert.equal(cards[i].learning_edition_id,old[i].learning_edition_id);}
 for(const w of report.works)for(const p of w.parts){
  const before=read(path.join(dir,'baseline',p.old_file));const bodyPath=path.join(p.added?out:path.join(dir,'baseline'),p.file);
  const after=read(bodyPath),text=after.library.texts[0];
  const oldLayer=before.library.texts[0].word_gloss_ai_layer,newLayer=text.word_gloss_ai_layer;
  delete before.library.texts[0].word_gloss_ai_layer;delete after.library.texts[0].word_gloss_ai_layer;assert.deepEqual(after,before);
  for(const entry of oldLayer?.rows||[])assert.deepEqual(newLayer.rows.find(e=>e.order_index===entry.order_index),entry);
  assert.equal(hash(fs.readFileSync(bodyPath)),p.bundle_sha256);
  const result=await W.remember(newLayer,text.rows);stored+=result.stored;rejected+=result.rejected;assert.equal(result.rejected,0,p.file);W._mem.clear();
  const sidecar=read(path.join(out,p.word_gloss_ai.file));assert.equal(hash(fs.readFileSync(path.join(out,p.word_gloss_ai.file))),p.word_gloss_ai.sha256);
  assert.deepEqual(sidecar.library.texts[0].word_gloss_ai_layer,newLayer);bodies++;
 }
 const manifest=read(path.join(out,root.release_manifest));for(const [file,item]of Object.entries(manifest.assets)){const p=path.join(fs.existsSync(path.join(out,file))?out:data,file);assert.equal(hash(fs.readFileSync(p)),item.sha256,file);}
 const result={result:'PASS',works:report.works.length,bodies,client_stored:stored,client_rejected:rejected,unchanged_source_rows:true,unchanged_edition_keys:true,unchanged_search_ordinals:true};
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
