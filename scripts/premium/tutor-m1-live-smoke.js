#!/usr/bin/env node
"use strict";
// Explicit owner subscription smoke: node ... --owner-codex
// A local fixture principal and authored Hebrew sentence; no owner library/state.
if(!process.argv.includes('--owner-codex'))throw new Error('EXPLICIT_OWNER_CODEX_FLAG_REQUIRED');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const sqlite3=require('sqlite3'),express=require('express'),assert=require('node:assert/strict');
const {createStore}=require('../../agent/tutor/store');
const {installRoutes}=require('../../agent/tutor/routes');
function exec(args,input){return new Promise((r,j)=>{const c=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',j);c.on('exit',code=>code?j(new Error('CONNECTOR_PROCESS_FAILED '+code)):r({out,err}));c.stdin.end(input||'');});}
async function main(){
 const db=new sqlite3.Database(':memory:');
 await new Promise((r,j)=>db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('m1-live-fixture');"+fs.readFileSync('migrations/070_tutor_transport.sql','utf8')+fs.readFileSync('migrations/071_tutor_practice.sql','utf8')+fs.readFileSync('migrations/072_tutor_onboarding.sql','utf8')+fs.readFileSync('migrations/073_tutor_practice_proposals.sql','utf8')+fs.readFileSync('migrations/074_tutor_conversation.sql','utf8'),e=>e?j(e):r()));
 const store=createStore(()=>db),app=express();app.use(express.json({limit:'40kb'}));
 const auth={user:{id:'m1-live-fixture'},session:{csrf:'fixture-csrf'}};
 installRoutes(app,{store,enabled:()=>true,requireUser:async(req,res)=>{if(req.get('X-Test-Owner')!=='m1-local-only'){res.sendStatus(401);return null;}return auth;},requireCsrf:(q,s)=>{if(q.get('X-LP-CSRF')!=='fixture-csrf'){s.sendStatus(403);return false;}return true;},limiter:(_q,_s,n)=>n()});
 // Loopback listener remains local; Docker Desktop maps host.docker.internal to it.
 const server=await new Promise(r=>{const s=app.listen(18791,'127.0.0.1',()=>r(s));});
 const origin='http://127.0.0.1:18791';
 const call=async(url,body)=>{const res=await fetch(origin+'/api/tutor'+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Test-Owner':'m1-local-only','X-LP-CSRF':'fixture-csrf'},body:body===undefined?undefined:JSON.stringify(body)});const data=await res.json();assert.equal(res.ok,true,data.error);return data;};
 const python='/opt/hermes/.venv/bin/python',prefix=['exec','-i','--user','hermes','-e','HERMES_HOME=/home/hermes/.hermes','hermes-agent',python,'/tmp/lp-tutor-m1/connector.py','--origin','http://host.docker.internal:18791','--allow-local','--credentials','/tmp/lp-tutor-m1/fixture-credentials.json'];
 try{
  const p=await call('/pair',{});await exec([...prefix,'--pair'],p.pairing_code+'\n');
  await exec([...prefix,'--once','--',python,'/tmp/lp-tutor-m1/hermes_turn.py']);
  const connection=await call('/connection');assert.equal(connection.status,'online');
  const started=await call('/sessions',{connection_id:connection.connection_id,request_key:'m1_live_fixture_0001',consent:'selected_fragment_v1',question:'Почему здесь הייתי, а не היה? Объясни в двух-трёх предложениях.',context:{surface:'room',locale:'ru',instructional_intent:'explain',source:{kind:'local_snapshot',material_id:'local:m1-authored',revision_id:'m1-authored-v1',sentence_id:'row:0',excerpt:'כשהייתי ילד גרתי בחיפה',before:'',after:''}}});
  await exec([...prefix,'--once','--',python,'/tmp/lp-tutor-m1/hermes_turn.py']);
  const result=await call('/sessions/'+started.id);assert.equal(result.state,'completed',JSON.stringify({state:result.state,error:result.error}));
  assert.ok(result.result.text.trim());assert.equal(result.result.context_id,started.context.context_id);
  const evidence={date:new Date().toISOString(),evidence:'OWNER_SUBSCRIPTION_WITH_SYNTHETIC_SOURCE',route:'openai-codex',state:result.state,context_binding:true,response:result.result.text};
  const target='docs/research/mentor-byoa/2026-09-29/M1_LIVE_RESULT.json';fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
  await call('/revoke',{});
 }finally{await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
