const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/course-evidence.js');
const S = require('../public/js/course-store.js');
const key = 'lp.course.anon.ulpan.v1';
const legacyKey = 'lp.course.ulpan.v1';
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
test('P3: user stores isolate progress and never claim anonymous or legacy progress',()=>{
 const storage=fake(), p=progress(); storage.data.set(legacyKey,JSON.stringify(p));
 const u1=S.localStore(storage,{userKey:'u1'}), u2=S.localStore(storage,{userKey:'u2'});
 assert.deepEqual(u1.load('ulpan').progress,E.emptyProgress('ulpan'));
 assert.deepEqual(u1.save(p),{ok:true});
 assert.deepEqual(u2.load('ulpan').progress,E.emptyProgress('ulpan'));
 assert.deepEqual(u2.save(E.emptyProgress('ulpan')),{ok:true});
 assert.deepEqual(u1.load('ulpan').progress,p);
 assert.equal(storage.data.get('lp.course.u1.ulpan.v1'),JSON.stringify(p));
 assert.equal(storage.data.get(legacyKey),JSON.stringify(p));
});
test('P3: anonymous legacy migration copies before deleting and new data takes precedence',()=>{
 const storage=fake(), p=progress(), raw=JSON.stringify(p); storage.data.set(legacyKey,raw);
 storage.removeItem=function(k) { assert.equal(this.data.get(key),raw); this.data.delete(k); };
 assert.deepEqual(S.localStore(storage).load('ulpan').progress,p);
 assert.equal(storage.data.get(key),raw); assert.equal(storage.data.has(legacyKey),false);
 storage.data.set(legacyKey,JSON.stringify(E.emptyProgress('ulpan')));
 assert.deepEqual(S.localStore(storage,{userKey:'anon'}).load('ulpan').progress,p);
 assert.equal(storage.data.has(legacyKey),true);
});
test('P3: migration quota preserves legacy bytes and loaded progress, then retries',()=>{
 const storage=fake(), p=progress(), raw=JSON.stringify(p); storage.data.set(legacyKey,raw);
 storage.throwOnSet='QuotaExceededError'; const store=S.localStore(storage);
 assert.deepEqual(store.load('ulpan').progress,p);
 assert.equal(storage.data.get(legacyKey),raw); assert.equal(storage.data.has(key),false);
 assert.deepEqual(store.save(p),{ok:false,reason:'quota'});
 storage.throwOnSet=null;
 assert.deepEqual(store.load('ulpan').progress,p); assert.equal(storage.data.has(legacyKey),false);
});
test('P3: key components escape dots and percent signs without collisions',()=>{
 const storage=fake();
 const cases=[['a.b','c'],['a','b.c'],['a%2Eb','c'],[42,'c']];
 for(const [userKey,courseId] of cases) assert.deepEqual(S.localStore(storage,{userKey}).save(E.emptyProgress(courseId)),{ok:true});
 assert.equal(storage.data.size,cases.length);
 assert.ok(storage.data.has('lp.course.a%2Eb.c.v1'));
 assert.ok(storage.data.has('lp.course.42.c.v1'));
 for(const [userKey,courseId] of cases) assert.deepEqual(S.localStore(storage,{userKey}).load(courseId).progress,E.emptyProgress(courseId));
});
test('P3: corrupt legacy bytes retain backup protection',()=>{
 const storage=fake(); storage.data.set(legacyKey,'broken');
 assert.equal(S.localStore(storage).load('ulpan').notice,'reset_corrupt');
 assert.equal(storage.data.get(legacyKey),'broken');
 assert.ok([...storage.data].some(([k,v])=>k.startsWith(legacyKey+':corrupt:')&&v==='broken'));
 storage.throwOnSet='QuotaExceededError'; const store=S.localStore(storage);
 assert.equal(store.load('ulpan').notice,'reset_corrupt'); storage.throwOnSet=null;
 assert.deepEqual(store.save(progress()),{ok:false,reason:'unavailable'});
});
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

test('P2-F2: lexical snapshot round trips and malformed snapshots reset',()=>{
 const p=progress(); p.attempts[0].lexIds=['lx.tea'];
 const storage=fake(), store=S.localStore(storage);
 assert.deepEqual(store.save(p),{ok:true});
 assert.deepEqual(store.load('ulpan').progress.attempts[0].lexIds,['lx.tea']);
 for(const invalid of [null,'lx.tea',[42]]) {
  const bad=structuredClone(p); bad.attempts[0].lexIds=invalid;
  storage.data.set(key,JSON.stringify(bad));
  assert.equal(store.load('ulpan').notice,'reset_corrupt');
 }
});
