"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
const version=source.match(/CACHE_VERSION = "v([^"]+)"/)[1],origin='https://example.test';
function fixture(urls,{badIntegrity=false,holdNavigation=false}={}){
  const events={},actions=[],body=Buffer.from('verified coherent shell');
  const clients=urls.map((url,index)=>({id:String(index),url,navigate:target=>{actions.push({kind:'navigate',target});return holdNavigation?new Promise(()=>{}):Promise.resolve();}}));
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const self={location:{origin},addEventListener:(type,handler)=>events[type]=handler,
    skipWaiting:async()=>actions.push({kind:'skipWaiting'}),clients:{matchAll:async()=>clients,claim:async()=>actions.push({kind:'claim'})}};
  const cache={add:async()=>{},match:async()=>new Response(body)};
  class BrowserRequest extends Request { constructor(url,options){super(new URL(url,origin),options);} }
  const context=vm.createContext({self,URL,Request:BrowserRequest,Response,crypto:crypto.webcrypto,
    caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},console:{warn(){}},setTimeout,clearTimeout,
    fetch:async()=>({ok:true,json:async()=>({version,shellIntegrity:{'/library.html':badIntegrity?'0'.repeat(64):hash}})})});
  vm.runInContext(source,context);return {actions,run:async type=>{let pending;events[type]({waitUntil:p=>pending=p});await pending;}};
}
test('a legacy confirmed update completes only after the target shell is verified',async()=>{
  const target=origin+'/library.html?room_update='+version+'#room=hub',other=origin+'/library.html#room=benyehuda';
  const f=fixture([target,other]);await f.run('install');assert.deepEqual(f.actions,[{kind:'skipWaiting'}]);
  await f.run('activate');assert.deepEqual(f.actions,[{kind:'skipWaiting'},{kind:'claim'},{kind:'navigate',target}]);
});
test('ordinary, older-release, other-origin and other-surface clients never opt into update',async()=>{
  const urls=[origin+'/library.html#room=hub',origin+'/library.html?room_update=3.11.1',
    'https://other.test/library.html?room_update='+version,origin+'/index.html?room_update='+version,'invalid URL'];
  const f=fixture(urls);await f.run('install');assert.deepEqual(f.actions,[]);await f.run('activate');assert.deepEqual(f.actions,[{kind:'claim'}]);
});
test('even an explicit target marker cannot activate an incoherent shell cohort',async()=>{
  const f=fixture([origin+'/library.html?room_update='+version],{badIntegrity:true});
  await assert.rejects(f.run('install'),/shell integrity mismatch/);assert.deepEqual(f.actions,[]);
});
test('activation finishes while the confirmed navigation still waits for subsequent fetch events',async()=>{
  const target=origin+'/library.html?room_update='+version,f=fixture([target],{holdNavigation:true});
  let timer;try{await Promise.race([f.run('activate'),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('activation waits for navigation')),1000))]);}
  finally{clearTimeout(timer);}assert.deepEqual(f.actions,[{kind:'claim'},{kind:'navigate',target}]);
});
