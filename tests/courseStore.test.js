const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/course-evidence.js');
const S = require('../public/js/course-store.js');
const key = 'lp.course.ulpan.v1';
function fake() {
 const data = new Map();
 return { data, throwOnAny:false, throwOnSet:null,
 getItem(k) { if(this.throwOnAny) throw new Error('denied'); return data.get(k) ?? null; },
 setItem(k,v) { if(this.throwOnAny) throw new Error('denied'); if(this.throwOnSet) { const e=new Error('full'); e.name=this.throwOnSet; throw e; } data.set(k,v); },
 removeItem(k) { data.delete(k); }
 };
}
function progress() {
 let p=E.openAid(E.emptyProgress('ulpan'),'L001/6','model',0);
 return E.record(p,{lessonId:'L001',lessonVersion:1,task:{id:'6'},channel:'write_he',input:'תה',result:{kind:'accepted'},at:0}).progress;
}
test('local round trip retains aids and supported attempt after reload',()=>{
 const storage=fake(), store=S.localStore(storage), p=progress();
 assert.deepEqual(store.save(p),{ok:true});
 const loaded=store.load('ulpan').progress;
 assert.deepEqual(loaded,p); assert.equal(E.attemptLevel(loaded.attempts[0]),'supported');
 loaded.attempts[0].aids.model=false; assert.equal(store.load('ulpan').progress.attempts[0].aids.model,true);
});
test('corrupt JSON and foreign shapes reset with backup without deleting original',()=>{
 for(const raw of ['{bad','null',JSON.stringify({...E.emptyProgress('other')}),JSON.stringify({schema:1,courseId:'ulpan'}),JSON.stringify({...progress(),attempts:[{}]}),JSON.stringify({...progress(),aids:{x:{hint:-1}}}),JSON.stringify({...progress(),schema:2})]) {
 const storage=fake(); storage.data.set(key,raw);
 const loaded=S.localStore(storage).load('ulpan');
 assert.equal(loaded.notice,'reset_corrupt'); assert.deepEqual(loaded.progress,E.emptyProgress('ulpan'));
 assert.equal(storage.data.get(key),raw);
 assert.ok([...storage.data].some(([k,v])=>k.startsWith(key+':corrupt:')&&v===raw));
 }
});
test('quota returns failure without changing caller progress or previous saved data',()=>{
 const storage=fake(), store=S.localStore(storage), p=progress();
 store.save(p); const original=storage.data.get(key), snapshot=structuredClone(p);
 storage.throwOnSet='QuotaExceededError'; assert.deepEqual(store.save(p),{ok:false,reason:'quota'});
 assert.deepEqual(p,snapshot); assert.equal(storage.data.get(key),original);
});
test('access denial returns reset and makes later saves unavailable',()=>{
 const storage=fake(), store=S.localStore(storage); storage.throwOnAny=true;
 assert.equal(store.load('ulpan').notice,'reset_corrupt'); storage.throwOnAny=false;
 assert.deepEqual(store.save(progress()),{ok:false,reason:'unavailable'});
});
test('throwing default localStorage getter cannot escape factory',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('denied');}});
 try { const store=S.localStore(); assert.equal(store.load('ulpan').notice,'reset_corrupt'); assert.deepEqual(store.save(progress()),{ok:false,reason:'unavailable'}); }
 finally { if(old) Object.defineProperty(globalThis,'localStorage',old); else delete globalThis.localStorage; }
});
test('backup quota preserves corrupt source and returns reset',()=>{
 const storage=fake(); storage.data.set(key,'broken'); storage.throwOnSet='QuotaExceededError';
 assert.equal(S.localStore(storage).load('ulpan').notice,'reset_corrupt'); assert.equal(storage.data.get(key),'broken');
});
test('memory store isolates reads, saves and courses',()=>{
 const store=S.memoryStore(), p=progress(); assert.deepEqual(store.load('ulpan').progress,E.emptyProgress('ulpan'));
 assert.deepEqual(store.save(p),{ok:true}); p.aids['L001/6'].model=false;
 const loaded=store.load('ulpan').progress; assert.equal(loaded.aids['L001/6'].model,true);
 loaded.aids['L001/6'].model=false; assert.equal(store.load('ulpan').progress.aids['L001/6'].model,true);
 assert.deepEqual(store.load('other').progress,E.emptyProgress('other'));
});
test('unserializable or malformed saves return unavailable without throwing',()=>{
 for(const store of [S.memoryStore(),S.localStore(fake())]) {
 const p=progress(); p.cycle=p; assert.deepEqual(store.save(p),{ok:false,reason:'unavailable'});
 assert.deepEqual(store.save(null),{ok:false,reason:'unavailable'});
 }
});

test('malformed nested task snapshot resets before evidence functions can consume it',()=>{
 for (const bad of [{spec:{kind:'order',require:42}}, {spec:{kind:'order',require:['drink'],expect:[]}}, {transfer:'yes'}, {spec:{kind:'confirm',card:{milk:3}}}]) {
 const storage=fake(), p=progress(); Object.assign(p.attempts[0].taskSnapshot,bad);
 const raw=JSON.stringify(p); storage.data.set(key,raw);
 const loaded=S.localStore(storage).load('ulpan'); assert.equal(loaded.notice,'reset_corrupt');
 assert.ok([...storage.data].some(([k,v])=>k.startsWith(key+':corrupt:')&&v===raw));
 }
});
