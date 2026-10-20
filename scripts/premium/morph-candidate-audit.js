'use strict';
// Read-only structural audit. No linguistic oracle, providers, profile DB or source mutation.
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const R=require('../../public/js/reader-morph'),NA=require('../../public/js/notes-autogen');
const Archive=require('../../publication/materialArchive');
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
if(!args.includes('--archive'))throw Error('--archive required');
(async()=>{
 const snapshot=(await Archive.inspectArchive(fs.readFileSync(value('--archive')),{mode:'media'})).snapshot;
 const rows=snapshot.library.texts[0].rows;
 const ds=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../../public/data/inflection/pealim-infl-v12.json.gz'))));
 const eng={NA,maps:NA.buildResolverMaps(ds.paradigms),pidMap:new Map(ds.paradigms.map(p=>[String(p.pealim_id),p])),lookup:(k,b)=>ds.paradigms[ds.index[k+' '+(b||'')]]};
 let words=0,withCandidates=0,multipleCandidates=0,withCellLess=0,inconsistentIdPos=0,sourceSame=true;
 const start=performance.now();
 for(const row of rows){
  const text=row.hebrew_niqqud||row.he_niqqud||'';
  for(const form of R.words(text)){
   words++;const c=await R.resolveCore(eng,R.stripNiqqud(form),form);
   if(c.analysisCandidates.length)withCandidates++;
   if(c.analysisCandidates.length>1)multipleCandidates++;
   if(c.analysisCandidates.some(a=>!Object.keys(eng.pidMap.get(a.pealim_id).cells||{}).length))withCellLess++;
   if(c.pealim_id&&eng.pidMap.get(String(c.pealim_id))?.pos!==c.pos)inconsistentIdPos++;
  }
  if(text!==(row.hebrew_niqqud||row.he_niqqud||''))sourceSame=false;
 }
 const result={evidence:'LOCAL_READ_ONLY_STRUCTURAL',rows:rows.length,words,withCandidates,multipleCandidates,withCellLess,inconsistentIdPos,sourceSame,elapsedMs:Math.round(performance.now()-start),independentLinguisticReview:false};
 if(args.includes('--out'))fs.writeFileSync(value('--out'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
 if(inconsistentIdPos||!sourceSame)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
