const fs=require('fs'),path=require('path');const AdmZip=require('E:/projects/tts-prototype-android/node_modules/adm-zip');
const root=process.argv[2];const per={};const top=[];
function* zips(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(e.name!=='AntiGravity')yield*zips(p)}else if(e.name.endsWith('.zip'))yield p}}
for(const z of zips(root)){let zip;try{zip=new AdmZip(z)}catch{continue}const e=zip.getEntries().find(x=>x.entryName.endsWith('library.json'));if(!e)continue;const f=path.relative(root,z).split(/[\/]/)[0].slice(0,2);
for(const t of (JSON.parse(e.getData().toString('utf8')).texts||[])){for(const r of t.rows){const n=(r.hebrew_plain||'').split(/\s+/).filter(Boolean).length;per[f]=per[f]||{rows:0,gt80:0,gt200:0};per[f].rows++;if(n>80)per[f].gt80++;if(n>200)per[f].gt200++;if(n>300)top.push([n,path.basename(z),(r.meta||{}).unit_type||'',(r.hebrew_plain||'').slice(0,40)])}}}
console.log(per);console.log(top.sort((a,b)=>b[0]-a[0]).slice(0,8));
