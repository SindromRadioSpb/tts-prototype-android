#!/usr/bin/env node
'use strict';
// Read-only release proof: no login, owner data, model invocation or state mutation.
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
const version=arg('--version'),commit=arg('--commit');
if(!/^3\.\d+\.\d+$/.test(version||'')||!/^[a-f0-9]{8,40}$/.test(commit||''))throw Error('VERSION_AND_COMMIT_REQUIRED');
const root='https://linguistpro.kolosei.com',hash=b=>createHash('sha256').update(b).digest('hex');
async function get(path){const res=await fetch(root+path+(path.includes('?')?'&':'?')+'verify='+Date.now(),{headers:{'Cache-Control':'no-cache'}});if(!res.ok)throw Error('HTTP_'+res.status+'_'+path);return res;}
async function main(){
 const configs=[],health=[];
 for(let i=0;i<2;i++){
  const c=await(await get('/api/client-config')).json();if(c.version!==version)throw Error('VERSION_'+c.version);configs.push(c);
  const h=await(await get('/healthz')).json();if(!h.ok||!h.db?.ready||!h.migrations?.ready)throw Error('HEALTH');health.push(h);
 }
 const cap=await(await get('/api/tutor/capabilities')).json();if(cap.enabled!==false)throw Error('GUEST_CAPABILITY_EXPOSED');
 const paths=Object.keys(configs[1].shellIntegrity).filter(p=>/^\/js\/tutor-/.test(p)||/^\/js\/library-ui\.js/.test(p)||/^\/css\/tutor-connect/.test(p)||/^\/tutor-connect\.html/.test(p));
 const assets=[];
 for(const url of [...paths,'/sw.js']){
  const body=Buffer.from(await(await get(url)).arrayBuffer()),file='public'+url.split('?')[0];
  const expected=execFileSync('git',['show',commit+':'+file],{maxBuffer:12*1024*1024});
  if(hash(body)!==hash(expected))throw Error('SERVED_COMMIT_MISMATCH_'+url);
  if(url!=='/sw.js'&&hash(body)!==configs[1].shellIntegrity[url])throw Error('INTEGRITY_'+url);
  assets.push({url,sha256:hash(body)});
 }
 const hidden=await fetch(root+'/api/tutor/connection',{headers:{'Cache-Control':'no-cache'}});if(hidden.status!==(args.includes('--pilot')?401:404))throw Error('CLOSED_ROUTE_'+hidden.status);
 const result={date:new Date().toISOString(),evidence:'PRODUCTION_READ_ONLY',version,commit,guest_capability_enabled:cap.enabled,pilot_expected:args.includes('--pilot'),health,assets,closed_route_status:hidden.status};
 if(args.includes('--out'))fs.writeFileSync(arg('--out'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
