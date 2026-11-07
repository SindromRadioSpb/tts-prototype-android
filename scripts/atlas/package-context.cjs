#!/usr/bin/env node
'use strict';
// Run after import-context has validated and written all 21 sections.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Usage: node package-context.cjs <imported source dir>');
const edition=fs.readFileSync(path.join(source,'PRODUCTION-MANIFEST.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const editionSha='085d33fddbd04a1eaaa4a9e625273591683cdcf9ff19d0b16899d503132ada7a';
const revision='50253381cb255822678b07e0ed41a608a3a701a661527eb796837b2f3ee64edc';
if(sha(edition)!==editionSha)throw Error('Wrong production edition');
const index=JSON.parse(fs.readFileSync(path.join(source,'index.json')));
const manifest={schema:'linguistpro.atlas-context.1',atlas_id:'a97001',edition_revision:revision,edition_manifest_sha256:editionSha,files:{}};
if(index.atlas_id!=='a97001'||index.sections.length!==21)throw Error('Wrong index');
const files=[];
for(const section of index.sections){
 const name=section.id+'.json',bytes=fs.readFileSync(path.join(source,'context-ai',name)),layer=JSON.parse(bytes);
 if(layer.section!==section.id||layer.atlas!=='a97001'||layer.coverage_mode!=='complete'||layer.rows.length===0||!layer.source_revision)throw Error('Invalid layer '+name);
 manifest.files[name]={sha256:sha(bytes),bytes:bytes.length,source_revision:layer.source_revision};files.push([name,bytes]);
}
const manifestBytes=Buffer.from(JSON.stringify(manifest)),hash=sha(manifestBytes);
const dest=path.resolve(__dirname,'../../atlas-context/a97001',hash);
if(fs.existsSync(dest))throw Error('Package already exists: '+dest);
fs.mkdirSync(dest,{recursive:true});for(const [name,bytes] of files)fs.writeFileSync(path.join(dest,name),bytes,{flag:'wx'});
fs.writeFileSync(path.join(dest,'manifest.json'),manifestBytes,{flag:'wx'});
console.log(JSON.stringify({manifest_sha256:hash,edition_revision:revision,files:files.length,destination:dest}));
