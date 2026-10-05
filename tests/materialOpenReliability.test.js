'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const deferred = () => { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
require('../public/js/material-open.js');
const core = () => import('data:text/javascript;base64,'+Buffer.from(read('public/js/reader-core.js')).toString('base64'));
for (const opener of ['openCorpusWork', 'openPublicCorpusWork', 'openGroupCorpusWork']) {
  test(opener + ': latest requested material is queued, never silently dropped', async () => {
    const source = read('public/js/library-ui.js'), start = source.indexOf('async function ' + opener + '(');
    const end = source.indexOf('\n}\n', start) + 2, a = deferred(), opened = [];
    const node = { hidden: true, textContent: '', setAttribute() {}, removeAttribute() {} };
    const context = { console, readerOpenEpoch: 0, corpusImporting: false,
      corpusOpenQueue: require('../public/js/material-open').createSerialQueue(),
      captureReaderReturnContext() {}, $: () => node, HEBREW_RE: /[א-ת]/,
      window: { scrollTo() {}, BenYehudaLearningEdition: require('../public/js/benyehuda-learning-edition'), PublicCorpusAdapter: { localTextKey: (_, id) => id } },
      readerStateBox() {}, roomToast() {}, tt: k => k, invalidatePersonalSets() {},
      localStorage: { getItem: () => 'edition' },
      resolveLocalIdByKey: key => key === 'A' ? a.promise : Promise.resolve(key),
      openReader: async id => opened.push(id) };
    vm.createContext(context); vm.runInContext(source.slice(start, end), context);
    const args = id => {
      const card = { id, text_key: id, public_work_id: id, work_id: id, bundle_sha256: 'edition', title: id };
      return opener === 'openCorpusWork' ? [card] : ['collection', card];
    };
    const first = context[opener](...args('A')); await new Promise(r => setImmediate(r));
    const second = context[opener](...args('B'));
    a.resolve('A'); await Promise.all([first, second]);
    assert.deepEqual(opened, ['B']);
  });
}

test('serial material queue recovers from failures and skips obsolete imports', async () => {
  const queue = require('../public/js/material-open').createSerialQueue(), seen = [];
  await assert.rejects(queue.run(async () => { throw new Error('failed'); }));
  await queue.run(() => seen.push('obsolete'), () => false);
  await queue.run(() => seen.push('current'));
  assert.deepEqual(seen, ['current']);
});
test('late reader result cannot replace a newer table', async()=>{
  const {openText}=await core(), a=deferred(), b=deferred(), mount={innerHTML:''};
  const db={getTextByIdLite:async id=>({id}),getSentences:id=>(id==='A'?a:b).promise};
  const openingA=openText('A',{localDb:db,mount}),openingB=openText('B',{localDb:db,mount});
  b.resolve([{id:'row-B',text_id:'B',he:'BBBB',ru:'material-B'}]); await openingB;
  const accepted=mount.innerHTML;
  a.resolve([{id:'row-A',text_id:'A',he:'AAAA',ru:'material-A'}]);
  assert.equal((await openingA).reason,'superseded'); assert.equal(mount.innerHTML,accepted);
});
test('Back cancels both late reader paint and late error presentation',async()=>{
  const {openText}=await core();
  for(const failure of [false,true]) {
    const a=deferred(),mount={innerHTML:'catalog'},states=[];let current=true;
    const pending=openText('A',{localDb:{getTextByIdLite:async()=>({id:'A'}),getSentences:()=>a.promise},mount,isCurrent:()=>current,onState:s=>states.push(s.kind)});
    current=false;if(failure)a.reject(new Error('late failure'));else a.resolve([{id:'r',he:'AAAA'}]);
    assert.equal((await pending).reason,'superseded');assert.equal(mount.innerHTML,'catalog');assert.deepEqual(states,['loading']);
  }
});
test('reader rejects rows belonging to another material before painting',async()=>{
  const {openText}=await core(),mount={innerHTML:'unchanged'};
  const result=await openText('B',{mount,localDb:{getTextByIdLite:async()=>({id:'B'}),getSentences:async()=>[{id:'r',text_id:'A',he:'AAAA'}]}});
  assert.equal(result.reason,'identity');assert.equal(mount.innerHTML,'unchanged');
});

test('late Studio source hydration cannot replace the active editor or its identity',async()=>{
  const a=deferred(),b=deferred();let active=null,source=null,metadata=null;
  const db={listNotes:async()=>[],getTextByIdLite:async id=>({id,title:id}),getSentences:async id=>[{id:'r-'+id,text_id:id,he:id}],touchOpened:async()=>{},getTextSourceText:id=>(id==='A'?a:b).promise};
  const noop=()=>{};
  const ctx={LOCAL_MODE:true,console,currentTableData:[],window:{v3SetActiveTextId:id=>{active=id;},v3SetActiveLibraryTextMeta:m=>{metadata=m.textId;}},
    ensureLocalDB:async()=>db,v3EmitTextOpenWithClose:noop,v3SessionSet:noop,v3AdoptSavedTableMeta:noop,v3RestoreMediaFromMeta:noop,
    v3MediaBarRefresh:async()=>{},v3LibraryAutoApplyCardProfile:async()=>{},v3MapSentenceApiRowToUiRow:r=>r,v3LibraryCacheSave:noop,
    v3NotesIngest:noop,v3NotesReset:noop,v3PrepareForNewTableRender:noop,v3RenderTableFromLibrary:rows=>{ctx.currentTableData=rows;return 1;},
    v3LazyFillTranslit:async()=>0,v3SetSourceTextFromLibrary:s=>{source=s;},v3RestoreUnboundMediaAfterSourceHydration:async()=>{},
    v3NotesRefreshAllButtons:noop,showToast:noop,v3LibraryClose:noop,v3UiSyncSaveButtons:noop,v3UiUpdateActiveHeader:noop,classicSyncMainPanels:noop,t:k=>k};
  // The production coordinator is installed when present; the pre-fix function needs none.
  const modulePath=path.resolve(__dirname,'../public/js/material-open.js');
  if(fs.existsSync(modulePath)){ctx.MaterialOpen=require(modulePath);ctx.v3MaterialOpens=ctx.MaterialOpen.create();}
  ctx.v3RememberOpenedMaterial=noop;
  const src=read('public/index.html'),start=src.indexOf('async function v3LibraryOpenText(textId, opts)'),end=src.indexOf('\nasync function v3LibraryArchiveText',start);
  vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
  await vm.runInContext('v3LibraryOpenText("A",{})',ctx);await vm.runInContext('v3LibraryOpenText("B",{})',ctx);
  b.resolve('source-B');await new Promise(r=>setImmediate(r));a.resolve('source-A');await new Promise(r=>setImmediate(r));
  assert.equal(active,'B');assert.equal(source,'source-B');assert.equal(metadata,'B');
});
