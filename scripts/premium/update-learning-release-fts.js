// Replace only incoming work postings, keeping all other production search coverage.
// Search work ordinals are verified unchanged. Bodies and FTS shards remain volume-only.
'use strict';
const fs=require('fs'),path=require('path');
const FTS=require('../../public/js/corpus-fts');
const {buildFormIndex,tokenToPid}=require('./build-corpus-vocab');
const dir=path.resolve(process.argv[2]||'.tmp/learning-release');
const old=path.join(dir,'baseline/data/benyehuda'),out=path.join(dir,'candidate');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x));};
const release=read(path.join(out,'learning-release-v8.json'));
const search=read(path.join(out,'corpus-search-v8.json')),previous=read(path.join(old,'corpus-search-v7.json'));
if(JSON.stringify(search.map(x=>x.id))!==JSON.stringify(previous.map(x=>x.id)))throw Error('FTS ordinal drift');
const ords=new Map(search.map((x,i)=>[x.id,i]));
const replaced=new Set(release.works.map(x=>ords.get(x.work_id)));
const manifest=read(path.join(old,'corpus-fts-v7.json'));
const {form2pid}=buildFormIndex();
const addedExact=new Map(),addedLemma=new Map(),newLemmaMap={};
const oldIndexed=new Set(),indexed=new Set();let addedTokens=0,addedMatched=0;
for(const work of release.works){
  const ord=ords.get(work.work_id),body=read(path.join(out,work.body));
  const text=body.library.texts.flatMap(t=>t.rows.map(r=>r.hebrew_niqqud||r.hebrew_plain||'')).join('\n');
  const tokens=FTS.tokenizeText(text);if(tokens.length)indexed.add(ord);
  for(const [position,token] of tokens.entries()){
    addedTokens++;
    const skel=FTS.normalizeToken(token);if(!skel)continue;
    let postings=addedExact.get(skel);if(!postings){postings=new Map();addedExact.set(skel,postings);}
    let positions=postings.get(ord);if(!positions){positions=[];postings.set(ord,positions);}if(positions.length<manifest.max_pos)positions.push(position);
    const pid=tokenToPid(form2pid,token);if(pid){addedMatched++;let counts=addedLemma.get(pid);if(!counts){counts=new Map();addedLemma.set(pid,counts);}counts.set(ord,(counts.get(ord)||0)+1);if(newLemmaMap[skel]==null)newLemmaMap[skel]=pid;}
  }
}
function encode(map,positions){const flat=[];let w=0;for(const [ord,value]of [...map].sort((a,b)=>a[0]-b[0])){flat.push(ord-w);w=ord;if(positions){flat.push(value.length);let p=0;for(const pos of value){flat.push(pos-p);p=pos;}}else flat.push(value);}return flat;}
function merge(flat,extra,positions){const m=new Map();for(const row of (positions?FTS.decodePositions(flat):FTS.decodePostings(flat))){oldIndexed.add(row.w);if(!replaced.has(row.w)){indexed.add(row.w);m.set(row.w,positions?row.pos:row.c);}}for(const [ord,value]of extra||[])m.set(ord,value);return encode(m,positions);}
const newBucketFiles={};let exactKeys=0,storedPositions=0;
const bucketKey=skel=>manifest.sharded_letters.includes(FTS.bucketOf(skel))?skel.slice(0,Math.min(2,skel.length)):FTS.bucketOf(skel);
const pending=new Map();for(const [skel,postings]of addedExact){const key=bucketKey(skel);if(!pending.has(key))pending.set(key,new Map());pending.get(key).set(skel,postings);}
for(const key of [...new Set([...Object.keys(manifest.bucket_files),...pending.keys()])].sort()){
  const merged={};
  for(const file of manifest.bucket_files[key]||[]){for(const [skel,flat]of Object.entries(read(path.join(old,file)))){const extra=pending.get(key)?.get(skel);const value=merge(flat,extra,true);if(value.length)merged[skel]=value;pending.get(key)?.delete(skel);}}
  for(const [skel,postings]of pending.get(key)||[])merged[skel]=encode(postings,true);
  const parts=[];let current={},bytes=0;
  for(const skel of Object.keys(merged).sort()){const value=merged[skel],size=Buffer.byteLength(JSON.stringify({[skel]:value}));if(bytes&&bytes+size>8*1024*1024){parts.push(current);current={};bytes=0;}current[skel]=value;bytes+=size;exactKeys++;storedPositions+=FTS.decodePositions(value).reduce((n,x)=>n+x.pos.length,0);}
  if(bytes)parts.push(current);
  newBucketFiles[key]=parts.map((part,i)=>{const file='fts/ex-'+key+(parts.length>1?'-'+i:'')+'-v8.json';write(path.join(out,file),part);return file;});
}
const lemmas={};let storedMatched=0;
for(const file of manifest.lemma_files){for(const [pid,flat]of Object.entries(read(path.join(old,file)))){const merged=merge(flat,addedLemma.get(pid),false);if(merged.length)lemmas[pid]=merged;addedLemma.delete(pid);}}
for(const [pid,postings]of addedLemma)lemmas[pid]=encode(postings,false);
const parts=[];let current={},bytes=0;
for(const pid of Object.keys(lemmas).sort((a,b)=>Number(a)-Number(b))){const value=lemmas[pid],size=Buffer.byteLength(JSON.stringify({[pid]:value}));if(bytes&&bytes+size>8*1024*1024){parts.push(current);current={};bytes=0;}current[pid]=value;bytes+=size;storedMatched+=FTS.decodePostings(value).reduce((n,x)=>n+x.c,0);}if(bytes)parts.push(current);
const lemmaFiles=parts.map((part,i)=>{const file='fts/lemma-'+i+'-v8.json';write(path.join(out,file),part);return file;});
const lemmaMap=read(path.join(old,manifest.lemmamap_file));
for(const [key,pid]of Object.entries(newLemmaMap))if(lemmaMap[key]==null&&lemmas[pid])lemmaMap[key]=pid;
for(const [form,pid]of form2pid){const key=FTS.normalizeToken(form);if(lemmas[pid]&&/^[א-ת]+$/.test(key)&&lemmaMap[key]==null)lemmaMap[key]=pid;}
const mapFile='fts/lemmamap-v8.json';write(path.join(out,mapFile),lemmaMap);
const untouched=[...oldIndexed].filter(x=>!replaced.has(x));if(untouched.some(x=>!indexed.has(x)))throw Error('Lost unrelated search coverage');
const next={...manifest,version:8,works_file:'corpus-search-v8.json',lemma_files:lemmaFiles,lemmamap_file:mapFile,bucket_files:newBucketFiles,counts:{...manifest.counts,indexed:indexed.size,missing:search.length-indexed.size,exact_keys:exactKeys,lemma_keys:Object.keys(lemmas).length,lemma_shards:lemmaFiles.length,bucket_shards:Object.values(newBucketFiles).flat().length,total_tokens:null,matched_tokens:null,stored_positions:storedPositions,stored_matched_counts:storedMatched},baseline_token_counts:{total_tokens:manifest.counts.total_tokens,matched_tokens:manifest.counts.matched_tokens},update:{schema:'incoming-work-postings-v1',works:release.works.length,new_edition_tokens:addedTokens,new_edition_matched_tokens:addedMatched,unrelated_indexed_works_preserved:untouched.length,ordinal_identity_verified:true}};
write(path.join(out,'corpus-fts-v8.json'),next);write(path.join(dir,'fts-update-report.json'),{before:manifest.counts.indexed,after:indexed.size,untouched_preserved:untouched.length,new_edition_works:release.works.length,shards:next.counts.bucket_shards+lemmaFiles.length+1});
console.log(JSON.stringify(next.update));console.log('FTS indexed',manifest.counts.indexed,'->',indexed.size);
