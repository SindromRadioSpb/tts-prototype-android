// Anonymous served-byte verification, including every uploaded body and layer.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const task=path.resolve('.tmp/context-ai'),base='https://linguistpro.kolosei.com';
const read=p=>JSON.parse(fs.readFileSync(p));const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fresh=async url=>{const r=await fetch(base+url+(url.includes('?')?'&':'?')+'verify='+Date.now(),{headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error('HTTP '+r.status+' '+url);return r;};
const configs=[],health=[];
for(let i=0;i<3;i++){
 const config=await(await fresh('/api/client-config')).json();if(config.version!=='3.11.820')throw Error('Version '+config.version);configs.push({version:config.version});
 const h=await(await fresh('/healthz')).json();if(!h.ok||!h.db?.ready||!h.migrations?.ready)throw Error('Health not ready');health.push(h);
}
const files=read(path.join(task,'catalog-allowlist.json')).map(file=>'data/benyehuda/'+file);
files.push('index.html','library.html','dictionary.html','sw.js','js/library-ui.js','js/corpus-materialize.js','js/work-parts.js','js/word-gloss-ai.js');
const assets=[];
for(const file of files){const b=Buffer.from(await(await fresh('/'+file)).arrayBuffer());const expected=hash(fs.readFileSync(path.join('public',file)));if(hash(b)!==expected)throw Error('Asset hash '+file);assets.push({file,sha256:expected});}
const uploads=read(path.join(task,'upload-allowlist.json'));let cursor=0,verified=0,bytes=0;
await Promise.all(Array.from({length:6},async()=>{
 for(;;){const i=cursor++;if(i>=uploads.length)return;const item=uploads[i];
  const b=Buffer.from(await(await fresh('/data/benyehuda/'+item.file)).arrayBuffer());if(hash(b)!==item.sha256)throw Error('Body hash '+item.file);verified++;bytes+=b.length;
  if(verified%250===0)console.log(JSON.stringify({verified,total:uploads.length}));
 }
}));
const result={result:'PASS',scope:'PRODUCTION_ANONYMOUS_READ_ONLY',verified_at:new Date().toISOString(),configs,health,assets,bodies_and_layers:verified,verified_body_bytes:bytes};
fs.writeFileSync('docs/research/benyehuda-context-ai/2026-10-25/production-http.json',JSON.stringify(result,null,2));console.log(JSON.stringify({result:result.result,assets:assets.length,bodies_and_layers:verified,verified_body_bytes:bytes}));
