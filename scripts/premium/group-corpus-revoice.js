#!/usr/bin/env node
"use strict";

// Publish a complete immutable TTS+timing edition for restricted group works.
// PLAN is default and makes no provider calls. APPLY requires an explicit cost
// cap, synthesizes into staging, verifies every timing sidecar, then atomically
// flips DB work pointers. Previous editions remain readable for rollback and
// for clients that have not reconciled yet.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const tb = require("./lib/ttsBake");

const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
function args(argv) {
  const o = { apply:false, works:[], voice:"he-IL-Wavenet-A", rate:1, pitch:0, concurrency:2, costCap:0 };
  for (let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(a==="--apply")o.apply=true;
    else if(a==="--db-path")o.dbPath=argv[++i];
    else if(a==="--data-dir")o.dataDir=argv[++i];
    else if(a==="--corpus-id")o.corpusId=argv[++i];
    else if(a==="--work-id")o.works.push(argv[++i]);
    else if(a==="--revision")o.revision=Number(argv[++i]);
    else if(a==="--voice")o.voice=argv[++i];
    else if(a==="--rate")o.rate=Number(argv[++i]);
    else if(a==="--pitch")o.pitch=Number(argv[++i]);
    else if(a==="--concurrency")o.concurrency=Math.max(1,Math.min(4,Number(argv[++i])||2));
    else if(a==="--confirm-cost-max-clips")o.costCap=Number(argv[++i]);
    else throw new Error("UNKNOWN_ARG:"+a);
  }
  for(const k of ["dbPath","dataDir","corpusId"])if(!o[k])throw new Error("MISSING_OPTION:"+k);
  if(!Number.isFinite(o.rate)||o.rate<0.5||o.rate>2)throw new Error("BAD_RATE");
  if(!Number.isFinite(o.pitch)||o.pitch<-20||o.pitch>20)throw new Error("BAD_PITCH");
  return o;
}
const open=(f)=>new Promise((z,r)=>{const d=new sqlite3.Database(f,e=>e?r(e):z(d));});
const all=(d,s,p=[])=>new Promise((z,r)=>d.all(s,p,(e,x)=>e?r(e):z(x||[])));
const run=(d,s,p=[])=>new Promise((z,r)=>d.run(s,p,function(e){e?r(e):z(this);}));
const exec=(d,s)=>new Promise((z,r)=>d.exec(s,e=>e?r(e):z()));
const close=(d)=>new Promise(z=>d.close(z));

function bounded(dataDir, rel) {
  const root=path.resolve(dataDir,"group-corpora"), abs=path.resolve(dataDir,String(rel||""));
  if(!abs.startsWith(root+path.sep))throw new Error("BAD_BOUNDED_PATH"); return abs;
}
// Group editions deliberately salt the universal TTS key with corpus+revision.
// Re-synthesising the same text/profile must never overwrite bytes underneath
// an older browser's key; rollback therefore remains real, not nominal.
function editionAssetKey(baseKey, corpusId, revision) {
  return hash(Buffer.from("group-corpus-audio\0"+corpusId+"\0r"+revision+"\0"+baseKey,"utf8"));
}
function editionPlan(rows,o) {
  if(!rows.length)throw new Error("NO_WORKS");
  const next=o.revision||Math.max(...rows.map(x=>Number(x.audio_revision)||1))+1;
  if(!Number.isInteger(next)||next<2)throw new Error("BAD_REVISION");
  const profile={language:"he-IL",voiceName:String(o.voice),speakingRate:o.rate,pitch:o.pitch};
  const clips=new Map(), works=[];
  for(const w of rows){
    const cur=Number(w.audio_revision)||1;if(next<=cur)throw new Error("REVISION_NOT_NEWER:"+w.work_id);
    const bundle=JSON.parse(fs.readFileSync(bounded(o.dataDir,w.bundle_path),"utf8"));
    const text=bundle&&bundle.library&&bundle.library.texts&&bundle.library.texts[0];
    if(!text||!Array.isArray(text.rows))throw new Error("BAD_WORK_BUNDLE:"+w.work_id);
    const rowKeys=[];
    for(const row of text.rows){const speech=tb.rowText(row);if(!speech){rowKeys.push(null);continue;}const baseKey=tb.keyForText(speech,profile),key=editionAssetKey(baseKey,o.corpusId,next);rowKeys.push(key);if(!clips.has(key))clips.set(key,{key,text:speech,baseKey});}
    works.push({db:w,bundle,text,rowKeys});
  }
  return {revision:next,profile,clips,works};
}
async function pool(items,n,fn){let i=0;async function lane(){for(;;){const j=i++;if(j>=items.length)return;await fn(items[j]);}}await Promise.all(Array.from({length:Math.min(n,items.length)},lane));}
function timingBytes(t) {
  if(!t||t.v!==1||!Number.isInteger(t.n)||t.n<1||t.got!==t.n||!Array.isArray(t.words)||t.words.length!==t.n)throw new Error("TIMING_INCOMPLETE");
  for(let i=0;i<t.words.length;i++)if(t.words[i].o!==i||!Number.isFinite(t.words[i].t)||t.words[i].t<0)throw new Error("TIMING_INVALID");
  return Buffer.from(JSON.stringify(t),"utf8");
}
function writeExact(file,body){fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)){if(hash(fs.readFileSync(file))!==hash(body))throw new Error("STAGING_COLLISION");return;}fs.writeFileSync(file,body,{flag:"wx"});}
function promoteExact(src,dst){
  if(!fs.existsSync(dst)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.renameSync(src,dst);return;}
  const walk=(dir,base="")=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),path.join(base,e.name)):[path.join(base,e.name)]);
  for(const rel of walk(src)){const a=path.join(src,rel),b=path.join(dst,rel);if(!fs.existsSync(b)||hash(fs.readFileSync(a))!==hash(fs.readFileSync(b)))throw new Error("EDITION_TARGET_MISMATCH:"+rel);}
}

async function main(argv){
  const o=args(argv),d=await open(path.resolve(o.dbPath));let stage=null;
  try{
    let sql=`SELECT corpus_id,work_id,bundle_path,bundle_sha256,audio_revision FROM group_corpus_works WHERE corpus_id=? AND rights_status!='REMOVED'`,p=[o.corpusId];
    if(o.works.length){sql+=` AND work_id IN (${o.works.map(()=>"?").join(",")})`;p.push(...o.works);}sql+=" ORDER BY work_id";
    const rows=await all(d,sql,p);if(o.works.length&&rows.length!==new Set(o.works).size)throw new Error("WORK_NOT_FOUND");
    const plan=editionPlan(rows,o), report={ok:true,mode:o.apply?"APPLY":"PLAN",corpus_id:o.corpusId,revision:plan.revision,profile:plan.profile,works:plan.works.map(x=>x.db.work_id),rows:plan.works.reduce((n,x)=>n+x.rowKeys.filter(Boolean).length,0),unique_clips:plan.clips.size};
    if(!o.apply){process.stdout.write(JSON.stringify(report,null,2)+"\n");return report;}
    if(!Number.isInteger(o.costCap)||o.costCap<plan.clips.size)throw new Error("COST_CAP_TOO_LOW:"+plan.clips.size);
    const apiKey=String(process.env.GCP_TTS_API_KEY||"").trim();if(!apiKey)throw new Error("GCP_TTS_API_KEY_REQUIRED");
    const corpusRoot=path.resolve(o.dataDir,"group-corpora",o.corpusId,"v1");stage=path.join(corpusRoot,".staging-audio-r"+plan.revision+"-"+process.pid);
    if(fs.existsSync(stage))throw new Error("STAGING_EXISTS");fs.mkdirSync(stage,{recursive:true});
    const baked=new Map();
    await pool(Array.from(plan.clips.values()),o.concurrency,async c=>{const out=await tb.synthesizeWithTimepoints(apiKey,c.text,plan.profile);if(!out.mp3||!out.mp3.length)throw new Error("EMPTY_MP3");const timing=timingBytes(out.timing);baked.set(c.key,{mp3:out.mp3,timing});writeExact(path.join(stage,"audio",c.key+".mp3"),out.mp3);writeExact(path.join(stage,"audio",c.key+".timing.json"),timing);});
    const bundles=[];
    for(const w of plan.works){
      w.text.rows.forEach((r,i)=>{r.audio_asset_key=w.rowKeys[i];});
      const used=Array.from(new Set(w.rowKeys.filter(Boolean)));
      w.bundle.audio_revision=plan.revision;
      w.text.source_meta=w.text.source_meta||{};w.text.source_meta.group_corpus={...(w.text.source_meta.group_corpus||{}),audio_revision:plan.revision};
      w.bundle.library.audio_assets=used.map(key=>{const b=baked.get(key),clip=plan.clips.get(key);return{asset_key:key,relative_export_path:"audio-r"+plan.revision+"/"+key+".mp3",mime_type:"audio/mpeg",size_bytes:b.mp3.length,provenance:{ttsProfile:plan.profile,audio_revision:plan.revision,timing_schema:1,base_tts_asset_key:clip&&clip.baseKey}};});
      const body=Buffer.from(JSON.stringify(w.bundle),"utf8");writeExact(path.join(stage,"works",w.db.work_id+".json"),body);bundles.push({w,body,sha:hash(body),used});
    }
    promoteExact(path.join(stage,"audio"),path.join(corpusRoot,"audio-r"+plan.revision));
    promoteExact(path.join(stage,"works"),path.join(corpusRoot,"works-r"+plan.revision));
    const now=new Date().toISOString(),profileJson=JSON.stringify(plan.profile);await exec(d,"BEGIN IMMEDIATE");
    try{
      for(const x of bundles){const bundleRel=path.posix.join("group-corpora",o.corpusId,"v1","works-r"+plan.revision,x.w.db.work_id+".json");await run(d,`UPDATE group_corpus_works SET bundle_path=?,bundle_sha256=?,audio_revision=?,audio_profile_json=?,audio_published_at=?,audio_count=?,updated_at=? WHERE corpus_id=? AND work_id=?`,[bundleRel,x.sha,plan.revision,profileJson,now,x.used.length,now,o.corpusId,x.w.db.work_id]);for(const key of x.used){const b=baked.get(key),mp3Rel=path.posix.join("group-corpora",o.corpusId,"v1","audio-r"+plan.revision,key+".mp3"),timRel=path.posix.join("group-corpora",o.corpusId,"v1","audio-r"+plan.revision,key+".timing.json");await run(d,`INSERT INTO group_corpus_audio(corpus_id,work_id,asset_key,relative_path,bytes,sha256,mime,created_at,revision,timing_relative_path,timing_bytes,timing_sha256) VALUES(?,?,?,?,?,?,?, ?,?,?,?,?) ON CONFLICT(corpus_id,work_id,asset_key) DO UPDATE SET relative_path=excluded.relative_path,bytes=excluded.bytes,sha256=excluded.sha256,revision=excluded.revision,timing_relative_path=excluded.timing_relative_path,timing_bytes=excluded.timing_bytes,timing_sha256=excluded.timing_sha256`,[o.corpusId,x.w.db.work_id,key,mp3Rel,b.mp3.length,hash(b.mp3),"audio/mpeg",now,plan.revision,timRel,b.timing.length,hash(b.timing)]);}}
      await exec(d,"COMMIT");
    }catch(e){try{await exec(d,"ROLLBACK");}catch(_){}throw e;}
    report.mode="APPLIED";report.bundle_sha256=Object.fromEntries(bundles.map(x=>[x.w.db.work_id,x.sha]));process.stdout.write(JSON.stringify(report,null,2)+"\n");return report;
  }finally{await close(d);if(stage&&fs.existsSync(stage)){const root=path.resolve(o.dataDir,"group-corpora",o.corpusId,"v1")+path.sep;if(path.resolve(stage).startsWith(root))fs.rmSync(stage,{recursive:true,force:true});}}
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{process.stderr.write("group-corpus-revoice: "+e.message+"\n");process.exitCode=1;});
module.exports={args,editionAssetKey,editionPlan,timingBytes,main};
