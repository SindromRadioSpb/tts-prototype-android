"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const ui = read("public/js/library-ui.js");
const shell = read("public/library.html");
const ru = read("public/i18n/locales/ru.js");
const en = read("public/i18n/locales/en.js");
const he = read("public/i18n/locales/he.js");

test("Ben sort never activates a hidden Ready filter and sorts the visible preview", () => {
  assert.doesNotMatch(ui, /if\s*\(corpusL1Sort\s*===\s*['"]familiar_desc['"]\)\s*\{\s*corpusFilter\.readyOnly\s*=\s*true/);
  assert.match(ui, /function corpusSortedReadyPreview\(/);
  assert.match(ui, /corpusSortedReadyPreview\(ready\)\.slice\(0,\s*ROOM_PREVIEW\)/);
  assert.match(ui, /hits\.sort\(corpusL1Comparator\(corpusL1Sort,/);
});

test("profile fit is a bounded typed reader, not a new recommendation writer", () => {
  assert.match(ui, /const ROOM_PROFILE_FIT_PREVIEW = 4/);
  assert.match(ui, /function buildProfileFitSection\(/);
  assert.match(ui, /paintBenProfileFit\(/);
  assert.match(ui, /paintMyTextsProfileFit\(/);
  assert.match(ui, /paintGroupProfileFit\(/);
  assert.match(ui, /ensureFinishedSet\(\)/);
  assert.match(ui, /excludeIds/);
  assert.doesNotMatch(ui, /(?:put|save|create|write)(?:Recommendation|ProfileFit|NextForYou)/);
});

test("Ben search precedes optional profile fit inside its explicit catalog region", () => {
  assert.match(ui, /function corpusCatalogRegion\(/);
  assert.match(ui, /class:\s*['"]corpus-catalog-region/);
  const ben = ui.slice(ui.indexOf('async function renderCorpusHome'), ui.indexOf('async function corpusRefreshL1Body'));
  assert.ok(ben.indexOf('catalogRegion.appendChild(filterChrome)') < ben.indexOf("const profileFitHost"));
  assert.match(ben, /corpusBrowseMode === 'read'.*paintBenProfileFit/);
  assert.match(ui, /groupProfileFitHost[\s\S]{0,1600}groupCatalogRegion/);
  assert.match(ui, /myProfileFitHost[\s\S]{0,1800}myCatalogRegion/);
  assert.match(shell, /\.corpus-profile-fit\b/);
  assert.match(shell, /\.corpus-catalog-region\b/);
});

test("public corpora use the shared catalog search filter sort and bounded-page contract", () => {
  assert.match(ui, /const publicCorpusBrowseStates = new Map\(\)/);
  assert.match(ui, /corpusCatalogRegion\(['"]public-/);
  assert.match(ui, /CatalogDiscoveryUI\.create\(\{\s*id: ['"]roomPublicCorpus/);
  assert.match(ui, /roomPublicCorpusSearch/);
  assert.match(ui, /roomPublicCorpusScope/);
  assert.match(ui, /roomPublicCorpusAudio/);
  assert.match(ui, /roomPublicCorpusSort/);
  assert.match(ui, /ROOM_BROWSE_PAGE/);
  assert.match(ui, /public-corpus-page-prev/);
  assert.match(ui, /public-corpus-page-next/);
});

test("RU EN HE copy names recorded profile fit and rejects comprehension claims", () => {
  for (const [locale, source] of [["ru", ru], ["en", en], ["he", he]]) {
    assert.match(source, /profileFitTitle\s*:/, `${locale}: profileFitTitle missing`);
    assert.match(source, /profileFitIntro\s*:/, `${locale}: profileFitIntro missing`);
    assert.match(source, /catalogTitle\s*:/, `${locale}: catalogTitle missing`);
    assert.match(source, /catalogIntro\s*:/, `${locale}: catalogIntro missing`);
  }
  assert.match(ru, /не оценка понимания текста/);
  assert.match(en, /not a comprehension estimate/i);
  assert.match(he, /אינה הערכה של הבנת הנקרא/);
});

test("RU EN HE public corpus copy names source-specific search filter and sort controls", () => {
  for (const [locale, source] of [["ru", ru], ["en", en], ["he", he]]) {
    for (const key of ["scopeLabel", "scopeAll", "scopeTitle", "scopeCreator", "audioFilterLabel", "audioAll", "audioComplete", "audioMissingOnly", "sortPosition", "sortTitleAZ", "sortTitleZA", "sortCreator", "materials", "empty", "previousPage", "nextPage"]) {
      assert.match(source, new RegExp(key + "\\s*:"), `${locale}: ${key} missing`);
    }
  }
});

test("late bookmark reads after Back cannot decorate another reader or dereference its cleared cache", async () => {
  const start = ui.indexOf('async function loadBookmarkSet('), end = ui.indexOf('async function toggleBookmark(', start);
  const context = vm.createContext({ Set });
  vm.runInContext(`let readerTextId='first', readerOpenEpoch=1, readerRows=[{_v3_sentenceId:'old'}], _bookmarkSet=null;
    let resolveRows, decorations=0; const localDb={listBookmarks:()=>new Promise(r=>resolveRows=r)};
    const cell={querySelector:()=>null,appendChild:()=>decorations++};
    const mount={isConnected:true,querySelectorAll:()=>[{getAttribute:()=>0,querySelector:()=>cell}]};
    function el(){return {appendChild(){},addEventListener(){}};} function tt(){return '';}
    ${ui.slice(start,end)}
    globalThis.run=async()=>{
      const stale=attachBookmarks(mount); readerTextId=null; readerOpenEpoch++; _bookmarkSet=null;
      resolveRows([]); await stale;
      if(decorations!==0 || _bookmarkSet!==null) throw new Error('Closed reader was decorated');
      readerTextId='second'; readerOpenEpoch++; readerRows=[{_v3_sentenceId:'current'}];
      const current=attachBookmarks(mount); resolveRows([{sentence_id:'current'}]); await current;
      return {decorations, bookmarked:_bookmarkSet.has('current')};
    };`, context);
  const result = await context.run(); assert.equal(result.decorations,1); assert.equal(result.bookmarked,true);
});

test("Room update targets the registration's waiting worker and reloads once after its activation", async () => {
  const applyStart=ui.indexOf('async function applyRoomUpdate('), applyEnd=ui.indexOf('function showRoomUpdateToast(',applyStart);
  const registerStart=ui.indexOf('function registerRoomServiceWorker('), registerEnd=ui.indexOf('async function loadRoomVersion(',registerStart);
  const context=vm.createContext({ WeakSet, setTimeout:()=>0 });
  vm.runInContext(`const old={state:'activated',postMessage:()=>{throw new Error('Stale active worker was targeted');}};
    const messages=[], target={state:'installed',postMessage:message=>messages.push(message.type)};
    const registration={waiting:target}; let listener, reloads=0;
    let roomWaitingWorker=old, roomUpdateActivationRequested=false, roomReloadingForUpdate=false, roomVersionMismatch=true;
    const roomWatchedWorkers=new WeakSet();
    const navigator={serviceWorker:{controller:old,addEventListener:(name,fn)=>listener=fn,
      getRegistration:async()=>registration,register:()=>({then:()=>({catch(){}})})}};
    const location={reload:()=>reloads++};
    const prepareRoomUpdateSafePoint=async()=>({ok:true,readerOpen:false});
    function dismissRoomUpdateToast(){} function roomDiagPush(){}
    ${ui.slice(applyStart,applyEnd)}
    ${ui.slice(registerStart,registerEnd)}
    globalThis.run=async()=>{
      registerRoomServiceWorker(); await applyRoomUpdate(); listener();
      if(reloads!==0) throw new Error('Prior controller notification reloaded its old shell');
      navigator.serviceWorker.controller=target; listener(); listener();
      return {reloads,messages};
    };`,context);
  const result=await context.run();assert.equal(result.reloads,1);assert.deepEqual(Array.from(result.messages),['SKIP_WAITING']);
});
