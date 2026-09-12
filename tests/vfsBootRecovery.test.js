'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
async function harness(failures = {}) {
 const { computeVfsOrder } = await import(pathToFileURL(path.join(__dirname,'../public/db/vfs-order.js')).href);
 const source = fs.readFileSync(path.join(__dirname,'../public/db/db-worker.js'),'utf8');
 const calls = [], closed = [], writes = [];
 const open = name => async () => {
  calls.push(name);
  if (failures[name] > 0) { failures[name]--; throw Error('fixture storage lock'); }
  return { sqlite: { close: async () => closed.push(name) }, db: name, vfs: { close: async () => {} }, vfsName: name, vfsKind: name==='AccessHandlePool'?'sync':'async' };
 };
 const ctx = vm.createContext({ db:null,sqlite3:null,vfs:null,vfsName:null,vfsKind:null,computeVfsOrder,
  initWithAccessHandlePool:open('AccessHandlePool'),initWithIDB:open('tts-opfs-idb'),
  execMulti:async()=>{},runMigrations:async()=>writes.push(ctx.db),console:{warn:()=>{}},setTimeout:fn=>fn() });
 vm.runInContext(source.slice(source.indexOf('async function initDBOnce('),source.indexOf('// ── message handler')),ctx);
 return { boot: pref=>ctx.initDB(pref), calls,closed,writes,ctx };
}
for (const preferred of ['AccessHandlePool','tts-opfs-idb']) {
 test(`transient ${preferred} failure retries original store before reporting success`,async()=>{
  const h=await harness({[preferred]:2});await h.boot(preferred);
  assert.deepEqual(h.calls,[preferred,preferred,preferred]);assert.equal(h.ctx.db,preferred);
  assert.deepEqual(h.writes,[preferred]);
 });
 test(`persistent ${preferred} failure never opens or migrates the other physical store`,async()=>{
  const h=await harness({[preferred]:99});await assert.rejects(h.boot(preferred),/DB_PREFERRED_STORAGE_UNAVAILABLE/);
  assert.deepEqual(h.calls,[preferred,preferred,preferred]);assert.equal(h.ctx.db,null);assert.deepEqual(h.writes,[]);
 });
}
test('first installation retains capability fallback when no library identity exists',async()=>{
 const h=await harness({AccessHandlePool:99});await h.boot(null);
 assert.deepEqual(h.calls,['AccessHandlePool','tts-opfs-idb']);assert.equal(h.ctx.db,'tts-opfs-idb');
});
test('unknown stored identity is not silently replaced',async()=>{
 const h=await harness();await assert.rejects(h.boot('future-store'),/DB_PREFERRED_STORAGE_UNAVAILABLE/);
 assert.deepEqual(h.calls,[]);assert.deepEqual(h.writes,[]);
});
