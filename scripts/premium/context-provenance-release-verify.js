'use strict';
// Anonymous read-only deployment convergence and exact served asset hashes. No models or learner data.
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const args=process.argv.slice(2),arg=(name,defaultValue)=>args.includes(name)?args[args.indexOf(name)+1]:defaultValue;
const commit=arg('--commit'),version=arg('--version','3.11.800'),base=arg('--base','https://linguistpro.kolosei.com');
if(!/^[a-f0-9]{8,40}$/.test(commit||''))throw Error('--commit required');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fresh(url){const r=await fetch(base+url+(url.includes('?')?'&':'?')+'verify='+Date.now(),{headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error('HTTP_'+r.status+'_'+url);return r;}
(async()=>{
 const configs=[],health=[];
 for(let i=0;i<2;i++){
  const c=await(await fresh('/api/client-config')).json();if(c.version!==version)throw Error('VERSION_'+c.version);configs.push(c);
  const h=await(await fresh('/healthz')).json();if(!h.ok||!h.db?.ready||!h.migrations?.ready)throw Error('HEALTH');health.push(h);
 }
 const changed=execFileSync('git',['diff','--name-only','030f2437',commit],{encoding:'utf8'}).trim().split(/\r?\n/).filter(x=>x.startsWith('public/'));
 const assets=[];
 for(const file of changed){
  const publicPath=file.slice(6),url=Object.keys(configs[1].shellIntegrity).find(x=>x.split('?')[0]===publicPath)||publicPath;
  const served=Buffer.from(await(await fresh(url)).arrayBuffer());
  const source=execFileSync('git',['show',commit+':'+file],{maxBuffer:20*1024*1024});
  if(hash(served)!==hash(source))throw Error('ASSET_MISMATCH_'+url);
  if(configs[1].shellIntegrity[url]&&hash(served)!==configs[1].shellIntegrity[url])throw Error('INTEGRITY_'+url);
  assets.push({url,sha256:hash(served)});
 }
 const corpus=arg('--public-corpus'),work=arg('--public-work');let evidence=null;
 if(corpus&&work){
  const response=await(await fresh('/api/public-corpora/'+encodeURIComponent(corpus)+'/works/'+encodeURIComponent(work)+'?evidence=1')).json();
  const rows=response.field_evidence?.rows||[];
  evidence={rows:rows.length,attributedNiqqud:rows.filter(r=>r.field_meta?.he_niqqud?.provider==='OpenAI assistant').length,snapshot:response.item.snapshot_sha256};
  if(evidence.rows!==499||evidence.attributedNiqqud!==499)throw Error('ARCHIVED_FIELD_EVIDENCE');
 }
 const result={evidence:'PRODUCTION_ANONYMOUS_READ_ONLY',date:new Date().toISOString(),version,commit,health,assets,fieldEvidence:evidence};
 const out=arg('--out');if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({version,commit,assets:assets.length,health:health.map(h=>({ok:h.ok,disk:h.disk_pct_used,warn:h.disk_warn})),fieldEvidence:evidence,pass:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
