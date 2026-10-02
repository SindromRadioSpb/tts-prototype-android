'use strict';
const assert=require('node:assert/strict'),{fork}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-read-together-server-'));
 const child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:path.resolve(__dirname,'../..'),env:smokeServerEnv(dir,0),stdio:['ignore','pipe','pipe','ipc']});
 let logs='';child.stdout.on('data',b=>{logs+=b;});child.stderr.on('data',b=>{logs+=b;});
 try {
  const port=await waitForSmokeServer(child,30000),base='http://127.0.0.1:'+port;
  let health;
  for(let i=0;i<300;i++){health=await(await fetch(base+'/healthz')).json();if(health.db?.ready&&health.migrations?.ready)break;await new Promise(r=>setTimeout(r,100));}
  assert(health.db?.ready&&health.migrations?.ready,'server/migrations must be ready');
  assert.equal((await fetch(base+'/api/read-together/sessions/missing')).status,401);
  assert.equal((await fetch(base+'/api/read-together/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const marker='PRIVATE_RT_PARSE_SENTINEL';
  const invalid=await fetch(base+'/api/read-together/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"text":"'+marker});assert.equal(invalid.status,400);assert(!(await invalid.text()).includes(marker));
  assert.equal((await fetch(base+'/api/read-together/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(20000)})})).status,413);
  assert(!logs.includes(marker),'source must never enter logs');
  assert.equal((await fetch(base+'/agent-access/mcp')).status,404);
  assert.equal((await fetch(base+'/agent-access/read-together/mcp')).status,404);
  assert.equal((await fetch(base+'/js/read-together.js?v=1')).status,200);
  const config=await(await fetch(base+'/api/client-config')).json();assert(!config.shellIntegrity['/js/read-together.js?v=1']);assert(config.shellIntegrity['/js/library-ui.js?v=717']);
  console.log(JSON.stringify({ok:true,full_server:true,db_ready:true,migrations_ready:true,cookie_auth_denies:true,mcp_default_off:true,shell_integrity:true,external_network_calls:0}));
 }finally{child.kill();await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);});}
})().catch(e=>{console.error(e);process.exitCode=1;});
