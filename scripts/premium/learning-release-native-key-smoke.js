'use strict';
// Native owner ZIPs are read-only. Imports and annotations use disposable OPFS only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {fork}=require('node:child_process'),{chromium}=require('playwright'),JSZip=require('../../public/db/jszip.min.js');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'.tmp/learning-release/native-keys'),arg=process.argv.indexOf('--input-root');
if(arg<0||!process.argv[arg+1])throw Error('--input-root required');const INPUT=path.resolve(process.argv[arg+1]);
const inventory=JSON.parse(fs.readFileSync(path.join(ROOT,'.tmp/learning-release/input-inventory.json'))),index=require('../../public/data/benyehuda/corpus-index-v8.json');
async function native(id){const record=inventory.works.find(w=>w.work_id===id),receipt=inventory.archives.find(a=>a.archive===record.archive),bytes=fs.readFileSync(path.join(INPUT,record.archive));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),receipt.sha256);const zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),library=JSON.parse(await zip.file('library/library.json').async('string'));return{record,library};}
async function state(page,id){return page.evaluate(async id=>({identity:await __localDB.dbQuery('SELECT id,text_key,source_meta_json,source_text FROM texts WHERE id=?',[id]),rows:await __localDB.getSentences(id),notes:await __localDB.dbQuery('SELECT * FROM notes_v2 WHERE text_id=? ORDER BY id',[id]),progress:await __localDB.dbQuery('SELECT last_row_idx,last_step_id FROM text_progress WHERE text_id=?',[id]),backups:await __localDB.dbQuery('SELECT * FROM lww_replace_backups',[])}),id);}
async function main(){
 fs.mkdirSync(OUT,{recursive:true});const child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:ROOT,env:smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(),'lp-native-keys-')),0),silent:true,windowsHide:true});child.stdout.resume();child.stderr.resume();let browser;
 const checks=[],errors=[];try{
  const origin='http://127.0.0.1:'+await waitForSmokeServer(child,60000);browser=await chromium.launch({headless:true});
  for(const [id,kind]of [['24249','stored'],['3557','stored'],['28026','stored'],['28026','recomputed'],['24249','foreign']]){
   const card=index.ready.find(c=>c.id===id),{record,library}=await native(id),context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'});
   context.setDefaultTimeout(30000);await context.route('**/*',async route=>{
    if(!route.request().url().startsWith(origin))return route.abort();
    if(new URL(route.request().url()).pathname==='/js/library-ui.js'){const response=await route.fetch();return route.fulfill({response,body:await response.text()+'\nwindow.__releaseReaderSnapshot=()=>({id:readerTextId,key:readerTextKey,rows:readerRows.length});window.__releaseSelectAuthor=(era,author)=>corpusNavToAuthor(era,author);'});}
    return route.continue();
   });
   await context.addInitScript(()=>{localStorage.setItem('app.locale','ru');localStorage.setItem('phase6Decision_v1','declined');localStorage.setItem('onboardingSeen_v1','1');});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/library.html?canon=skip#room=benyehuda');await page.waitForFunction(()=>window.__localDB?.importBundle);
   // Each fixture selects one exact work from the CRC/SHA-verified native ZIP.
   // This tests edition continuity, not whole-archive import performance.
   const original=library.texts.find(t=>String(t.corpus.byehuda_id)===id);library.texts=[original];
   if(kind==='recomputed')original.text_key=record.recomputed_key;
   if(kind==='foreign'){original.corpus.byehuda_id='999999';if(original.source_meta?.corpus)original.source_meta.corpus.byehuda_id='999999';}
   console.log('Verified native ZIP fixture '+id+' '+kind);
   const key=kind==='recomputed'?record.recomputed_key:record.stored_key;
   const localId=await page.evaluate(async({library,key})=>{const result=await __localDB.importBundle({library},{mode:'skip'});if(result.errors.length)throw Error(JSON.stringify(result.errors));const text=(await __localDB.dbQuery('SELECT id FROM texts WHERE text_key=?',[key]))[0];if(!text)throw Error('Native import key missing');const rows=await __localDB.getSentences(text.id),now='2026-10-05T00:00:00Z';await __localDB.setProgress(text.id,{last_row_idx:2,last_step_id:'translation'});await __localDB.dbRun('UPDATE sentences SET edit_meta_json=? WHERE id=?',[JSON.stringify({edited:{ru:true}}),rows[0].id]);await __localDB.dbRun('INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',['native-note','sentence',rows[0].id,text.id,'free','Native fixture','{"markdown":"Keep native notes"}',now,now]);return text.id;},{library,key});
   const before=await state(page,localId);
   await page.evaluate(({era,author})=>window.__releaseSelectAuthor(era,author),card);
   const row=page.locator('.corpus-work-row[data-work-id="'+id+'"]').first();await row.waitFor();await row.locator('.corpus-work-open').click();await page.locator('#roomDeviceEdition').waitFor();await page.waitForTimeout(1000);
   const active=await page.evaluate(()=>window.__releaseReaderSnapshot().id);assert.deepEqual(await state(page,localId),before);
   if(kind==='foreign')assert.notEqual(active,localId);
   else{
    assert.equal(active,localId);assert.ok((await page.locator('#roomDeviceEdition').innerText()).includes('Сохранена прежняя редакция'));
    assert.equal((await page.evaluate(key=>__localDB.dbQuery('SELECT id FROM texts WHERE text_key=?',[key]),card.text_key)).length,0);
    await page.reload();await page.locator('#roomDeviceEdition').waitFor();await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.__releaseReaderSnapshot().id),localId);assert.deepEqual(await state(page,localId),before);
    await page.getByRole('button',{name:'Открыть новую редакцию отдельно',exact:true}).click();await page.waitForFunction(previous=>window.__releaseReaderSnapshot().id!==previous,localId);await page.locator('#roomDeviceEdition').waitFor();
    const publishedId=await page.evaluate(()=>window.__releaseReaderSnapshot().id);assert.deepEqual(await state(page,localId),before);assert.equal(await page.evaluate(()=>window.__releaseReaderSnapshot().rows),card.segments);
    await page.reload();await page.locator('#roomDeviceEdition').waitFor();assert.equal(await page.evaluate(()=>window.__releaseReaderSnapshot().id),publishedId);assert.deepEqual(await state(page,localId),before);
   }
   checks.push({work_id:id,case:kind,result:'pass',native_rows:before.rows.length,source_key:key,foreign_reused:false});console.log('PASS native '+id+' '+kind);await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({checks,pageerrors:errors,fixture_scope:'One exact work selected from each freshly verified owner ZIP, native import into disposable OPFS; locks, notes and progress; not a whole-archive throughput test; appended read-only reader observer and author-navigation bridge, no owner profile or external calls'},null,2));
 }finally{await browser?.close();child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
