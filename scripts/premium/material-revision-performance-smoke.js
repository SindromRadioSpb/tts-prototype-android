'use strict';
const {performance}=require('node:perf_hooks');
const initSqlJs=require('sql.js');
const Core=require('../../public/js/material-revision-core.js');
const Repository=require('../../public/js/material-revision-repository.js');
const CEILINGS={snapshot_514:900,promote_514:4500,commit_514:6500,snapshot_2800:2200,impact_2800:250,mapping_2800:500};
const ms=(start)=>Number((performance.now()-start).toFixed(2));
async function main(){
  const SQL=await initSqlJs(),db=new SQL.Database();
  db.run(`PRAGMA foreign_keys=ON;CREATE TABLE texts(id TEXT PRIMARY KEY,text_key TEXT,source_meta_json TEXT,updated_at TEXT);CREATE TABLE sentences(id TEXT PRIMARY KEY,text_id TEXT,order_index INTEGER,he_plain TEXT,he_niqqud TEXT,translit TEXT,translit_ru TEXT,ru TEXT,meta_json TEXT,edit_meta_json TEXT,translation_provider TEXT,translation_meta_json TEXT,created_at TEXT,UNIQUE(text_id,order_index));CREATE TABLE studio_media_packages(package_id TEXT PRIMARY KEY);CREATE TABLE studio_caption_revisions(revision_id TEXT PRIMARY KEY,canonical_sha256 TEXT);CREATE TABLE studio_text_media_bindings(text_id TEXT PRIMARY KEY,package_id TEXT,revision_id TEXT,revision_sha256 TEXT,mapping_json TEXT);`);
  const migrations=await import('../../public/db/migrations.js');if(migrations.MIGRATIONS.length!==47)throw new Error('MIGRATION_COUNT:'+migrations.MIGRATIONS.length);db.run(migrations.MIGRATIONS[45]);
  const query=(sql,p=[])=>{const s=db.prepare(sql);s.bind(p);const out=[];while(s.step())out.push(s.getAsObject());s.free();return out;};
  const repo=Repository.createRepository({dbQuery:async(s,p)=>query(s,p),dbRun:async(s,p)=>{const st=db.prepare(s);st.run(p||[]);st.free();return{changes:db.getRowsModified()};},execRaw:async(s)=>db.run(s)},Core);
  const makeRows=(n)=>Array.from({length:n},(_,i)=>({stable_row_id:'row-'+i,he_plain:'שלום '+i,he_niqqud:'',translit:'shalom '+i,translit_ru:'шалом '+i,ru:'привет '+i,caption_segment_id:'cap-'+i,source_segment_ids:['src-'+i],field_meta:{ru:i%17===0?{authority:'user',locked:true}:{authority:'provider',locked:false,provider:'gcp',model:'nmt'}}}));
  const rows514=makeRows(514),rows2800=makeRows(2800),metrics={};let t=performance.now();await Core.createTableSnapshot({rows:rows514});metrics.snapshot_514=ms(t);
  db.run("INSERT INTO texts VALUES('text-514','perf-514','{\"provider\":\"gcp\"}','2026-08-01T00:00:00Z')");db.run('BEGIN');const insert=db.prepare('INSERT INTO sentences VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)');for(let i=0;i<514;i++){const r=rows514[i];insert.run([r.stable_row_id,'text-514',i,r.he_plain,r.he_niqqud,r.translit,r.translit_ru,r.ru,'gcp','{}','2026-08-01T00:00:00Z']);}insert.free();db.run('COMMIT');
  t=performance.now();const material=await repo.promoteLegacyText('text-514');metrics.promote_514=ms(t);const base=await repo.getCurrentRevision(material.material_id);const next=JSON.parse(JSON.stringify(base.rows));for(let i=0;i<next.length;i+=23){next[i].ru+='!';next[i].field_meta.ru={authority:'user',locked:true};}
  t=performance.now();await repo.commitRevision({material_id:material.material_id,base_table_revision_id:base.table_revision_id,rows:next,impact:{kind:'perf'}});metrics.commit_514=ms(t);
  t=performance.now();await Core.createTableSnapshot({rows:rows2800});metrics.snapshot_2800=ms(t);t=performance.now();const impact=Core.analyzeImpact({rows:rows2800,change:{kind:'provider',fields:['ru','translit']}});metrics.impact_2800=ms(t);
  const legacy2800=rows2800.map(row=>({...row,caption_segment_id:null,source_segment_ids:[]})),segments2800=rows2800.map((row,i)=>({caption_segment_id:'cap-'+i,source_segment_ids:['src-'+i]}));t=performance.now();const mapped=Core.applyExactAlignedMapping({rows:legacy2800,segments:segments2800,row_segment_indexes:rows2800.map((_,i)=>i),provenance:{authority:'aligned-offline',algorithm_version:'perf',bound_caption_revision_id:'perf-revision',bound_caption_revision_sha256:'f'.repeat(64)}});metrics.mapping_2800=ms(t);if(mapped.mapped_count!==2800)throw new Error('MAPPING_COUNT:'+mapped.mapped_count);
  const failures=Object.entries(CEILINGS).filter(([k,v])=>metrics[k]>v).map(([k,v])=>`${k}:${metrics[k]}>${v}`);console.log(JSON.stringify({gate:'L3A3_MATERIAL_514_2800',ceilings_ms:CEILINGS,measured_ms:metrics,impacted:impact.impacted.length,failures},null,2));if(failures.length)process.exitCode=1;
}
main().catch(e=>{console.error(e&&e.stack||e);process.exitCode=1;});
