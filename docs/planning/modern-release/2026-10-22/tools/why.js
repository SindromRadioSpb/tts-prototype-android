const fs=require('fs'),path=require('path');const AdmZip=require('E:/projects/tts-prototype-android/node_modules/adm-zip');
const root=process.argv[2];const C={};const add=k=>C[k]=(C[k]||0)+1;let maxG=0,maxLen=0,maxMwe=0;
function* zips(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(e.name!=='AntiGravity')yield*zips(p)}else if(e.name.endsWith('.zip'))yield p}}
for(const z of zips(root)){let zip;try{zip=new AdmZip(z)}catch{continue}const e=zip.getEntries().find(x=>x.entryName.endsWith('library.json'));if(!e)continue;
for(const t of (JSON.parse(e.getData().toString('utf8')).texts||[])){const L=t.word_gloss_ai_layer;if(!L)continue;for(const r of L.rows){
maxG=Math.max(maxG,r.glosses.length);maxMwe=Math.max(maxMwe,(r.mwe||[]).length);for(const g of r.glosses)maxLen=Math.max(maxLen,(g.gloss||'').length);
if(r.glosses.length>80)add('glosses>80');if(r.glosses.some(g=>!g||typeof g.gloss!=='string'||g.gloss.length>120))add('gloss>120 or bad');if(r.glosses.some(g=>g&&g.gloss==='' ))add('empty gloss');
if((r.mwe||[]).length>40)add('mwe>40');if((r.mwe||[]).some(m=>typeof m.gloss!=='string'||m.gloss.length>120))add('mwe gloss>120');if(String(r.model||'').length>80)add('model>80');}}}
console.log(C,{maxG,maxLen,maxMwe});
