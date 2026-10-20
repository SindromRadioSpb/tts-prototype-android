'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const JSZip=require('jszip'),initSqlJs=require('sql.js'),Core=require('../public/js/portable-learning-package-core'),Studio=require('../public/js/studio-portable-learning-package');
const fixture=require('./helpers/mediathequeArchiveFixture.cjs');
const root=path.join(__dirname,'..');
async function archive(files){const z=new JSZip();for(const [p,s]of Object.entries(files))z.file(p,typeof s==='string'?s:JSON.stringify(s));return z.generateAsync({type:'uint8array',compression:'DEFLATE'});}
const row={order_index:0,hebrew_plain:'שלום',hebrew_niqqud:'שָׁלוֹם',russian:'привет'};
const item={text_id:'from-archive',text_key:'book-one',title:'Book',rows:[row]};
test('book ZIPs are recognized by contents, without relaxing the LPLP whitelist',async()=>{
 for(const name of ['library/library.json','library.json']){
  const bytes=await archive({[name]:{library:{texts:[item]}}});
  assert.equal(await Studio.detectLibraryZip(bytes),true);
  assert.throws(()=>Studio.inspectZipCentralDirectory(bytes),/PACKAGE_PATH_UNMANIFESTED/);
 }
 const files=await Core.buildPackageFiles(fixture(),{mode:'snapshot'}),bytes=await Studio.zipFiles(files,'uint8array');
 assert.equal(await Studio.detectLibraryZip(bytes),false);
 assert.ok((await Studio.verifyZip(bytes)).manifest);
});
test('unsupported, malformed, corrupt, mixed and unsafe archives cannot route as books',async()=>{
 assert.equal(await Studio.detectLibraryZip(await archive({'unrelated.txt':'unknown'})),false);
 await assert.rejects(()=>Studio.detectLibraryZip(new Uint8Array([1,2,3])),/ZIP_EOCD_MISSING/);
 for(const files of [
  {'library/library.json':'{broken'},
  {'library/library.json':{texts:'invalid'}},
  {'library/library.json':{texts:[{}]}},
  {'library/library.json':{texts:[item]},'library.json':{texts:[item]}},
  {'library/library.json':{texts:[item]},'manifest.json':{schema:Core.SCHEMA}},
  {'../library/library.json':{texts:[item]}},
  {'library/library.json':{texts:[item]},'../escape':'bad'},
 ]) { const bytes=await archive(files); await assert.rejects(()=>Studio.detectLibraryZip(bytes)); }

});
test('book payload corruption is caught by CRC before any import',async()=>{
 const bytes=await archive({'library/library.json':{texts:[item]}});
 const nameLength=bytes[26]|bytes[27]<<8,extraLength=bytes[28]|bytes[29]<<8;
 bytes[30+nameLength+extraLength+3]^=255;
 await assert.rejects(()=>Studio.detectLibraryZip(bytes));
});
test('routing forwards the same File to the existing confirmation importer; stale and recovery selections do not route',async()=>{
 const file=new Blob([await archive({'library/library.json':{texts:[item]}})]);
 const saved=global.window;let routed=0,before=0;
 global.window={v3LoadJSZip:async()=>JSZip,v3LibraryOnBundleImportSelected:async e=>{assert.equal(e.target.files[0],file);routed++;}};
 try{
  assert.equal(await Studio.routeLibraryRestore(file,{isCurrent:()=>false}),false);
  assert.equal(await Studio.routeLibraryRestore(file,{expectedReceipt:'receipt'}),false);
  assert.equal(routed,0);
  assert.equal(await Studio.routeLibraryRestore(file,{isCurrent:()=>true,beforeRoute:()=>before++}),true);
  assert.equal(routed,1);assert.equal(before,1);
 }finally{global.window=saved;}
});
test('the existing confirmation can cancel before all DB writes',async()=>{
 const source=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 const start=source.indexOf('async function v3LibraryOnBundleImportSelected(ev)'),end=source.indexOf('window.v3LibraryExportBundle',start);
 const ctx={window:{},v3ConfirmModal:async()=>false,showToast:()=>{throw Error('import started after cancel');},console};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nthis.onImport=v3LibraryOnBundleImportSelected;',ctx);
 await ctx.onImport({target:{files:[{name:'book.zip'}],value:'book.zip'}});
});
function glossApi(){
 const ctx={document:{},window:{ReaderMorph:{words:s=>s.split(/\s+/).filter(Boolean),stripNiqqud:s=>s.replace(/[\u0591-\u05c7]/g,'')}},console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'public/js/word-gloss-ai.js'),'utf8'),ctx);
 return ctx.window.WordGlossAI;
}
async function harness(){
 const SQL=await initSqlJs(),db=new SQL.Database();
 db.run("CREATE TABLE texts(id TEXT PRIMARY KEY,text_key TEXT UNIQUE,title TEXT,source_meta_json TEXT,is_archived INTEGER,is_pinned INTEGER,pin_order INTEGER,manual_smart_tag TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE sentences(id TEXT,text_id TEXT,order_index INTEGER,he_plain TEXT,he_niqqud TEXT,ru TEXT);CREATE TABLE text_progress(text_id TEXT PRIMARY KEY,last_row_idx INTEGER,last_step_id TEXT);CREATE TABLE review_log(id TEXT,payload TEXT);CREATE TABLE artifact_sync_intents(op TEXT,artifact_key TEXT);CREATE TABLE shelves(id TEXT,origin TEXT,slug TEXT);");
 function query(sql,p=[]){const st=db.prepare(sql);st.bind(p);const out=[];while(st.step())out.push(st.getAsObject());st.free();return out;}
 const q=async(s,p)=>query(s,p),r=async(s,p=[])=>{db.run(s,p);return {changes:db.getRowsModified()};};
 const ai=glossApi(),src=fs.readFileSync(path.join(root,'public/db/local-db.js'),'utf8'),start=src.indexOf('export async function importBundle('),end=src.indexOf('// Phase 9.1.D: Apply notes_advanced',start);
 const ctx={q,r,x:async sql=>db.run(sql),globalThis:{WordGlossAI:ai},console,crypto:require('node:crypto').webcrypto,CANON_ORIGIN:'benyehuda-ingest',
  createText:async t=>r('INSERT INTO texts(id,text_key,title,source_meta_json) VALUES(?,?,?,?)',[t.id,t.text_key,t.title,t.source_meta_json]),
  addSentences:async(id,rows)=>{for(const s of rows)await r('INSERT INTO sentences VALUES(?,?,?,?,?,?)',[s.id,id,s.order_index,s.he_plain,s.he_niqqud,s.ru]);},
  getSentences:async id=>query('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index',[id]),
  upsertAudioAssets:async()=>new Map(),
  setProgress:async(id,p)=>r('INSERT OR REPLACE INTO text_progress VALUES(?,?,?)',[id,p.last_row_idx,p.last_step_id]),
 };
 vm.createContext(ctx);vm.runInContext(src.slice(start,end).replace('export async function','async function')+'\nthis.importBundle=importBundle;',ctx);
 return{db,query,ai,importBundle:ctx.importBundle};
}
test('new book import and repeats preserve keys, manual rows, progress, review log and manual contextual gloss',async()=>{
 const h=await harness();try{
 const p=h.ai.rowPayloadFromData(row),layer={schema:h.ai.LAYER_SCHEMA,rows:[{order_index:0,key:p.key,glosses:[{gloss:'привет'}],mwe:[]}]};
 const bundle={library:{texts:[{...item,progress:{last_row_idx:0},word_gloss_ai_layer:layer}]}};
 const first=await h.importBundle(bundle,{userRestore:true});assert.equal(first.imported,1);assert.equal(first.errors.length,0);
 const id=h.query('SELECT id FROM texts')[0].id;
 const restoredPayload=h.ai.rowPayloadFromData(h.query('SELECT * FROM sentences')[0]);
 assert.ok(h.ai._mem.has(restoredPayload.storageKey),'the restored gloss is scoped to its new occurrence');
 h.db.run("UPDATE sentences SET ru='ручной перевод';UPDATE text_progress SET last_row_idx=7;INSERT INTO review_log VALUES('review','unchanged');");
 h.ai._mem.get(restoredPayload.storageKey).glosses[0]={gloss:'ручная подсказка',manual:true,ai_gloss:'привет'};
 const before=JSON.stringify(h.db.exec('SELECT * FROM texts;SELECT * FROM sentences;SELECT * FROM text_progress;SELECT * FROM review_log'));
 for(let i=0;i<2;i++){const result=await h.importBundle(bundle,{userRestore:true});assert.equal(result.skipped,1);assert.equal(result.imported,0);assert.equal(result.errors.length,0);}
 assert.equal(h.query('SELECT id FROM texts')[0].id,id);
 assert.equal(JSON.stringify(h.db.exec('SELECT * FROM texts;SELECT * FROM sentences;SELECT * FROM text_progress;SELECT * FROM review_log')),before);
 assert.equal(h.ai._mem.get(restoredPayload.storageKey).glosses[0].gloss,'ручная подсказка');
 assert.equal((await h.ai.remember(layer,[{...row,russian:'другой перевод'}])).rejected,1);
 }finally{h.db.close();}
});
test('manual partial canon import keeps unrelated works; automatic and explicit complete reconcile remain available',async()=>{
 for(const [options,deleted]of [[{userRestore:true},false],[{},true],[{userRestore:true,reconcileCanon:true},true]]){
  const h=await harness();try{
   h.db.run('INSERT INTO texts(id,text_key,title,source_meta_json) VALUES(?,?,?,?)',['old','unrelated','Other',JSON.stringify({corpus:{byehuda_id:2}})]);
   const result=await h.importBundle({library:{canon_version:2,texts:[]} },options);
   assert.equal(result.errors.length,0);
   assert.equal(h.query('SELECT * FROM texts').length,deleted?0:1);
  }finally{h.db.close();}
 }
});
