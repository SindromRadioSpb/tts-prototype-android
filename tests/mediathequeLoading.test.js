'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../public/js/mediatheque-core');
const source=fs.readFileSync(path.resolve(__dirname,'../public/js/mediatheque-ui.js'),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const turn=()=>new Promise(r=>setImmediate(r));
test('public catalogue is usable while local data, tutor and owner draft are pending',async()=>{
  const local=deferred(),tutor=deferred(),draft=deferred(),renders=[];
  const state={space:'public',personal:{structure:C.empty()},published:{items:[]},publicReady:false,localReady:false};
  const context={state,C,loadEpoch:0,tutorEnabled:false,pendingPosition:null,externalRefreshDirty:false,
    performance:{now:()=>1,measure(){}},$:()=>({open:false}),localStorage:{setItem(){}},render:()=>renders.push({ready:state.publicReady,loading:state.loading,draft:state.draft}),
    loadPublic:async()=>{state.publicReady=true;},loadLocal:()=>local.promise,
    api:url=>url.includes('capabilities')?tutor.promise:url.includes('publication')?draft.promise:Promise.resolve({user:{role:'owner'}})};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function loadAll()'),source.indexOf('\nasync function save(')),context);
  const pending=vm.runInContext('loadAll()',context);await turn();
  assert.ok(renders.some(r=>r.ready&&!r.loading),'public is rendered before unrelated tasks');assert.equal(state.draft,undefined);
  const publishedDraft={revision:7};draft.resolve(publishedDraft);await turn();assert.equal(state.draft,publishedDraft,'owner banner data arrives independently');
  local.resolve();tutor.resolve({enabled:true});await pending;assert.equal(context.tutorEnabled,true);
});
test('a public material link retains public identity even if its local copy exists',()=>{
  const context={state:{space:'public'},makeHref:()=>'/mediatheque.html',encodeURIComponent};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function materialHref('),source.indexOf('\nfunction publicMaterialLink(')),context);
  context.item={available:true,localId:'private-browser-id',ref:{slug:'video',workId:'episode',snapshotHash:'abc'}};
  const href=vm.runInContext('materialHref(item)',context);
  assert.match(href,/public_corpus=video&public_work=episode&public_snapshot=abc/);assert.doesNotMatch(href,/my_text/);
  context.state.space='personal';assert.match(vm.runInContext('materialHref(item)',context),/my_text=private-browser-id/);
});
