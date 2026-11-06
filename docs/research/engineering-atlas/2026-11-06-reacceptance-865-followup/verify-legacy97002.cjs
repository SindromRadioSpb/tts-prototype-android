'use strict';
// Public static files only. No provider/generation endpoints or owner browser storage.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto'),{parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'../../../..'),base='https://linguistpro.kolosei.com',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const {window,document}=parseHTML('<html><body></body></html>');global.window=window;global.document=document;window.indexedDB=undefined;
window.ReaderMorph=require(root+'/public/js/reader-morph.js');require(root+'/public/js/word-gloss-ai.js');const AI=window.WordGlossAI,AW=require(root+'/public/js/atlas-words.js');
async function get(file){const r=await fetch(base+'/data/atlas/a97002/'+file,{cache:'no-store'});assert.equal(r.status,200,file);const bytes=Buffer.from(await r.arrayBuffer());return{json:JSON.parse(bytes),sha256:sha(bytes),http:r.status};}
(async()=>{const index=await get('index.json'),report={scope:'all published 97002 static layers with candidate code; no AI generation',checked_at:new Date().toISOString(),sections:[],candidate_code_sha256:Object.fromEntries(['atlas-words.js','reader-morph.js','word-gloss-ai.js'].map(f=>[f,sha(fs.readFileSync(root+'/public/js/'+f))]))};
 for(const s of index.json.sections){const [data,layer]=await Promise.all([get('sections/'+s.id+'.json'),get('context-ai/'+s.id+'.json')]);const rows=AW.glossRows(AW.sectionContext('a97002',data.json,window.ReaderMorph));AI._mem.clear();const accepted=await AI.remember(layer.json,rows);assert.equal(accepted.rejected,0,s.id);assert.equal(accepted.stored,layer.json.rows.length,s.id);report.sections.push({section:s.id,source_http:data.http,layer_http:layer.http,source_sha256:data.sha256,layer_sha256:layer.sha256,source_rows:rows.length,layer_rows:layer.json.rows.length,...accepted});}
 assert.equal(report.sections.length,42);report.layer_rows=report.sections.reduce((n,s)=>n+s.layer_rows,0);report.rejected=0;report.passed=true;
 fs.writeFileSync(root+'/.tmp/atlas97001-source-review/followup-866-legacy97002.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sections:42,layer_rows:report.layer_rows,rejected:0,passed:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
