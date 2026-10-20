'use strict';
// Read an original learning ZIP, exercise compatibility import/export in an isolated browser DB.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const Archive=require('../../publication/materialArchive');
const Portable=require('../../public/js/studio-portable-learning-package');
const file=process.argv[process.argv.indexOf('--archive')+1];
if(!process.argv.includes('--archive')||!file)throw Error('--archive PATH required');
(async()=>{
 const bytes=fs.readFileSync(file),verified=await Portable.verifyZip(bytes);
 const table=verified.payload.table_revisions.find(t=>t.portable_table_revision_id===verified.manifest.roots.table_revision);
 const snapshot=(await Archive.inspectArchive(bytes,{mode:'media'})).snapshot;
 snapshot.library.texts[0].text_key='isolated-context-archive-audit';
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  let paid=0;await page.route('**/api/word-gloss-ctx',r=>{paid++;return r.abort();});
  await page.goto((process.env.CONTEXT_BASE||'http://127.0.0.1:3324')+'/library.html?canon=skip&corpus=skip#room=mytexts',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__localDB?.isReady()&&window.WordGlossAI,null,{timeout:60000});
  const result=await page.evaluate(async({snapshot,table})=>{
   const db=window.__localDB,AI=window.WordGlossAI;
   await db.importBundle(snapshot,{mode:'skip'});
   const text=(await db.listTexts({query:snapshot.library.texts[0].title})).find(t=>t.text_key==='isolated-context-archive-audit');
   let rows=await db.getSentences(text.id),mismatches=[],words=0;
   const original=snapshot.library.texts[0].word_gloss_ai_layer;
   for(let i=0;i<rows.length;i++){
    if(rows[i].he_niqqud!==table.rows[i].he_niqqud)mismatches.push({i,field:'he_niqqud'});
    const entry=original.rows.find(r=>r.order_index===i);
    if(entry)for(let k=0;k<entry.glosses.length;k++){words++;if((await AI.wordAtData(rows[i],k))?.gloss!==entry.glosses[k].gloss)mismatches.push({i,k});}
   }
   const reviews=JSON.stringify(await db.dbQuery('SELECT * FROM review_log ORDER BY id'));
   const exported=await AI.portable(rows);
   await AI.remember(exported,rows); // duplicate import, no content/root rewrite
   const exportedAgain=await AI.portable(rows);
   const sameExport=JSON.stringify(exported)===JSON.stringify(exportedAgain);
   const P=LearningFieldProvenance;
   const attributed=rows.filter(r=>P.field(r,'he_niqqud').source==='OpenAI assistant').length;
   // Emulate an old published projection that dropped attribution, then restore from exact archived values.
   await db.dbRun("UPDATE sentences SET edit_meta_json=NULL WHERE text_id=?",[text.id]);
   await db.importBundle(snapshot,{mode:'skip'});
   rows=await db.getSentences(text.id);
   return {rows:rows.length,words,mismatches,attributed,restoredAttribution:rows.filter(r=>P.field(r,'he_niqqud').source==='OpenAI assistant').length,
    sameExport,reviewLogUnchanged:reviews===JSON.stringify(await db.dbQuery('SELECT * FROM review_log ORDER BY id'))};
  },{snapshot,table});
  assert.deepEqual(result.mismatches,[]);assert.equal(result.rows,499);assert.equal(result.words,2193);
  assert.equal(result.attributed,499);assert.equal(result.restoredAttribution,499);
  assert.equal(result.sameExport,true);assert.equal(result.reviewLogUnchanged,true);assert.equal(paid,0);
  console.log(JSON.stringify({...result,paidCalls:paid,pass:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
