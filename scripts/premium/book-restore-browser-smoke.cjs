'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright'),JSZip=require('jszip');
const root=path.resolve(__dirname,'../..'),out=process.argv[2];
if(!out||!path.isAbsolute(out))throw Error('Pass an isolated output directory');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),dbSource=fs.readFileSync(path.join(root,'public/db/local-db.js'),'utf8');
function slice(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i);return s.slice(i,j);}
const dbFn=slice(dbSource,'export async function importBundle(','// Phase 9.1.D: Apply notes_advanced').replace('export async function','async function');
const confirmFn=slice(html,'function v3ConfirmModal(opts)','// ── Multi-select state'),importer=slice(html,'async function v3LibraryOnBundleImportSelected(ev)','window.v3LibraryExportBundle');
const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const fixtureHtml='<html><head><meta charset="utf-8"><style>'+css+'</style></head><body><button id="origin">Open fixture</button><div id="v3ConfirmModal" style="display:none;position:fixed;inset:0;z-index:99999;background:#fff;align-items:center;justify-content:center;"><div><h3 id="v3ConfirmTitle"></h3><p id="v3ConfirmBody"></p><div id="v3ConfirmTypeWrapper"><b id="v3ConfirmTypeWord"></b><input id="v3ConfirmTypeInput"></div><button id="v3ConfirmOk"></button><button id="v3ConfirmCancel"></button></div></div></body></html>';
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(fixtureHtml);}const p=u.pathname==='/sql-wasm.wasm'?require.resolve('sql.js/dist/sql-wasm.wasm'):path.join(root,'public',u.pathname);if(!p.startsWith(root+path.sep)&&u.pathname!=='/sql-wasm.wasm'){res.writeHead(403);return res.end();}if(!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',p.endsWith('.wasm')?'application/wasm':'application/javascript');res.end(fs.readFileSync(p));});
const row={order_index:0,hebrew_plain:'שלום',hebrew_niqqud:'שָׁלוֹם',russian:'привет'};
const book={library:{canon_version:2,texts:[{text_id:'archive-id',text_key:'fixture-book',title:'Fixture book',rows:[row],progress:{last_row_idx:0}}]}};
async function bytes(files){const z=new JSZip();for(const [p,v]of Object.entries(files))z.file(p,typeof v==='string'?v:JSON.stringify(v));return z.generateAsync({type:'nodebuffer'});}
async function setup(){
 const LOCAL_MODE=true,toasts=[];let refreshes=0;
 window.t=k=>k.split('.').reduce((v,p)=>v&&v[p],window.I18N_LOCALES[document.documentElement.lang])||k;
 function showToast(message,kind){toasts.push({message,kind});}
 function v3LibraryRefresh(){refreshes++;}
 window.v3LoadJSZip=async()=>JSZip;
 const SQL=await initSqlJs({locateFile:()=>'/sql-wasm.wasm'}),fixtureDb=new SQL.Database();
 fixtureDb.run("CREATE TABLE texts(id TEXT PRIMARY KEY,text_key TEXT UNIQUE,title TEXT,source_meta_json TEXT,is_archived INTEGER,is_pinned INTEGER,pin_order INTEGER,manual_smart_tag TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE sentences(id TEXT,text_id TEXT,order_index INTEGER,he_plain TEXT,he_niqqud TEXT,ru TEXT);CREATE TABLE text_progress(text_id TEXT PRIMARY KEY,last_row_idx INTEGER,last_step_id TEXT);CREATE TABLE review_log(id TEXT,payload TEXT);CREATE TABLE artifact_sync_intents(op TEXT,artifact_key TEXT);CREATE TABLE shelves(id TEXT,origin TEXT,slug TEXT);");
 const query=(s,p=[])=>{const st=fixtureDb.prepare(s);st.bind(p);const out=[];while(st.step())out.push(st.getAsObject());st.free();return out;};
 const q=async(s,p)=>query(s,p),r=async(s,p=[])=>{fixtureDb.run(s,p);return{changes:fixtureDb.getRowsModified()};},x=async s=>fixtureDb.run(s);
 const CANON_ORIGIN='benyehuda-ingest';
 async function createText(t){await r('INSERT INTO texts(id,text_key,title,source_meta_json) VALUES(?,?,?,?)',[t.id,t.text_key,t.title,t.source_meta_json]);}
 async function addSentences(id,rows){for(const s of rows)await r('INSERT INTO sentences VALUES(?,?,?,?,?,?)',[s.id,id,s.order_index,s.he_plain,s.he_niqqud,s.ru]);}
 async function upsertAudioAssets(){return new Map();}
 async function setProgress(id,p){await r('INSERT OR REPLACE INTO text_progress VALUES(?,?,?)',[id,p.last_row_idx,p.last_step_id]);}
}
function finish(){
 const ldb={importBundle,reconcileAudioLinks:async()=>({})};window.ensureLocalDB=async()=>ldb;
 window.v3LibraryOnBundleImportSelected=v3LibraryOnBundleImportSelected;
 window.__fixture={db:fixtureDb,query,toasts};
 StudioPortableLearningPackage.setRepositoryForTests({lifecycleInventory:async()=>[],listExportReceipts:async()=>[],dryRun:async()=>{throw Error('unexpected LPLP DB access');}});
 window.__ready=true;
}
function body(f){const s=f.toString();return s.slice(s.indexOf('{')+1,s.lastIndexOf('}'));}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{
 browser=await chromium.launch({headless:true});const results=[];
 for(const [lang,width]of [['ru',1280],['ru',380],['en',380],['he',380]]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());await page.goto(origin);
 await page.evaluate(lang=>{document.documentElement.lang=lang;document.documentElement.dir=lang==='he'?'rtl':'ltr';},lang);
 await page.addScriptTag({path:require.resolve('jszip/dist/jszip.min.js')});await page.addScriptTag({path:require.resolve('sql.js/dist/sql-wasm.js')});
 for(const p of ['i18n/locales/'+lang+'.js','js/reader-morph.js','js/word-gloss-ai.js','js/portable-learning-package-core.js','js/import-center-core.js','js/studio-portable-learning-package.js'])await page.addScriptTag({path:path.join(root,'public',p)});
 await page.addScriptTag({content:'(async()=>{'+body(setup)+dbFn+confirmFn+importer+body(finish)+'})().catch(e=>window.__setupError=String(e));'});
 await page.waitForFunction(()=>window.__ready||window.__setupError);assert.equal(await page.evaluate(()=>window.__setupError),undefined);
 const enriched=await page.evaluate(({row,book})=>{const p=WordGlossAI.rowPayloadFromData(row);book.library.texts[0].word_gloss_ai_layer={schema:WordGlossAI.LAYER_SCHEMA,rows:[{order_index:0,key:p.key,glosses:[{gloss:'привет'}],mwe:[]}]};return book;},{row,book});
 const good=await bytes({'library/library.json':enriched});
 async function open(){await page.evaluate(()=>StudioPortableLearningPackage.open({view:'tasks',intent:'restore'}));await page.locator('[data-restore="material"]').click();}
 async function choose(buffer){await page.locator('#p2PortableFile').setInputFiles({name:'book.learning.zip',mimeType:'application/zip',buffer});}
 await open();assert.ok((await page.locator('.p2-import-scope p').first().innerText()).includes('ZIP'));await page.screenshot({path:path.join(out,lang+'-'+width+'.png')});
 await choose(good);await page.locator('#v3ConfirmCancel').click();assert.equal(await page.evaluate(()=>__fixture.query('SELECT * FROM texts').length),0);
 await open();await choose(good);await page.locator('#v3ConfirmOk').click();await page.waitForFunction(()=>__fixture.query('SELECT * FROM texts').length===1);
 const imported=await page.evaluate(()=>({texts:__fixture.query('SELECT * FROM texts'),rows:__fixture.query('SELECT * FROM sentences'),gloss:WordGlossAI._mem.size}));assert.equal(imported.texts[0].text_key,'fixture-book');assert.equal(imported.rows[0].ru,'привет');assert.equal(imported.gloss,1);
 await page.evaluate(()=>{__fixture.db.run("UPDATE sentences SET ru='ручной перевод';UPDATE text_progress SET last_row_idx=7;");[...WordGlossAI._mem.values()][0].glosses[0]={gloss:'ручная подсказка',manual:true,ai_gloss:'привет'};});
 await open();await choose(good);await page.locator('#v3ConfirmOk').click();await page.waitForFunction(()=>__fixture.toasts.filter(t=>t.kind==='success').length===2);
 assert.deepEqual(await page.evaluate(()=>({texts:__fixture.query('SELECT * FROM texts').length,ru:__fixture.query('SELECT * FROM sentences')[0].ru,progress:__fixture.query('SELECT * FROM text_progress')[0].last_row_idx,gloss:[...WordGlossAI._mem.values()][0].glosses[0].gloss})),{texts:1,ru:'ручной перевод',progress:7,gloss:'ручная подсказка'});
 for(const bad of [await bytes({'unrelated.txt':'unknown'}),Buffer.from([1,2,3])]){await open();await choose(bad);await page.waitForFunction(()=>document.querySelector('#p2PortableStatus').classList.contains('p2-portable-error'));assert.equal(await page.evaluate(()=>__fixture.query('SELECT * FROM texts').length),1);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.addScriptTag({path:path.join(root,'public/js/word-gloss-ai.js')});
 const persisted=await page.evaluate(async row=>{await WordGlossAI.estimateDataRows([row]);const p=WordGlossAI.rowPayloadFromData(row);return WordGlossAI._mem.get(p.key)?.glosses[0]?.gloss;},row);assert.equal(persisted,'ручная подсказка');
 results.push({lang,width,cancel_no_writes:true,book_import:true,repeat_manual_progress_gloss_preserved:true,unknown_corrupt_no_writes:true,indexeddb_fresh_module:true,overflow:false});await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({browser:'isolated headless Chromium on user PC',harness:'real renderer, confirmation, import handler and importBundle with fixture SQL adapters; not full OPFS application',results},null,2));console.log(JSON.stringify(results,null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
