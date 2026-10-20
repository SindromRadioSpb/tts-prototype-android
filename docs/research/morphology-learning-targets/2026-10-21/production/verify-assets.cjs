'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=process.cwd(),base='https://linguistpro.kolosei.com',out=path.join(root,'.tmp/learning-targets-production');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function get(url){const r=await fetch(base+url+(url.includes('?')?'&':'?')+'release_verify='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200,url);return r;}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const cfg=await(await get('/api/client-config')).json();assert.equal(cfg.version,'3.11.804');
 const source=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const block=source.match(/const SHELL_INTEGRITY_PATHS = \[([\s\S]*?)\n\];/);assert.ok(block);
 const urls=[...block[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);urls.push('/sw.js','/index.html','/library.html','/dictionary.html');
 const pending=[...new Set(urls)],results=[];let next=0;
 await Promise.all(Array.from({length:6},async()=>{for(;;){const i=next++;if(i>=pending.length)return;const url=pending[i];let filename=new URL(url,base).pathname;filename=({'/study-studio.html':'/index.html','/study-library.html':'/library.html'})[filename]||filename;
   const expected=sha(execFileSync('git',['show','b3ebc514169a9f6039653316cfbeea2e7b461a05:public'+filename],{cwd:root,maxBuffer:20*1024*1024})),actual=sha(Buffer.from(await(await get(url)).arrayBuffer()));
   const advertised=cfg.shellIntegrity[url];results.push({url,sha256:actual,match:expected===actual,integrityMatch:advertised==null?null:advertised===expected});
 }}));
 assert.deepEqual(results.filter(r=>!r.match||r.integrityMatch===false),[]);
 const health=await(await get('/healthz')).json();assert.equal(health.ok,true);assert.equal(health.db.ready,true);assert.equal(health.migrations.ready,true);
 for(let i=0;i<2;i++)assert.equal((await(await get('/api/client-config')).json()).version,'3.11.804');
 const result={at:new Date().toISOString(),version:cfg.version,releaseCommit:'b3ebc514169a9f6039653316cfbeea2e7b461a05',count:results.length,health,assets:results.sort((a,b)=>a.url.localeCompare(b.url))};
 fs.writeFileSync(path.join(out,'served-assets.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({version:result.version,count:result.count,allMatch:true,health}));
})().catch(e=>{console.error(e);process.exitCode=1;});
