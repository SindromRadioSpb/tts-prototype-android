'use strict';
// Disposable server storage and browser profiles. No owner browser or provider calls.
const {spawn}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),port=3340,base='http://127.0.0.1:'+port;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BIND_HOST:'127.0.0.1',DATA_DIR:path.join(root,'.tmp/morph-analysis-gate/server-data')},stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch(_){}await sleep(200);}
  if(!ready)throw Error('Server not ready: '+logs.slice(-2000));
  for(const script of ['morph-card-resolution-browser-smoke.js','context-provenance-browser-smoke.js']){
   await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(__dirname,script)],{cwd:root,env:{...process.env,CONTEXT_BASE:base},stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(script+' exited '+code)));
   });
  }
 }finally{server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
