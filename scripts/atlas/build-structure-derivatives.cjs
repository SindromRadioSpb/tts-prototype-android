#!/usr/bin/env node
'use strict';
// Rebuild existing search and glossary indexes only. No exercises, AI or audio.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {buildTermsIndex}=require('./build-train-bank.cjs');
const dir=path.resolve(process.argv[2]||'data/atlas/a97001');
const sections=fs.readdirSync(path.join(dir,'sections')).filter(f=>f.endsWith('.json')).sort().map(f=>JSON.parse(fs.readFileSync(path.join(dir,'sections',f))));
if(sections.some(s=>s.atlas_id!=='a97001'||!s.structure_revision))throw Error('Expected a complete 97001 semantic edition');
execFileSync(process.execPath,[path.join(__dirname,'build-search-index.cjs'),dir],{stdio:'inherit'});
const out=path.join(dir,'train');fs.mkdirSync(out,{recursive:true});
const terms=buildTermsIndex(sections,'a97001');
fs.writeFileSync(path.join(out,'terms.json'),JSON.stringify(terms));
fs.writeFileSync(path.join(dir,'structure-migration.json'),JSON.stringify({
 schema:'linguistpro.atlas-structure-migration.1',atlas_id:'a97001',revision:sections[0].structure_revision,
 groups:sections.flatMap(s=>s.pages.flatMap(p=>(p.legacy_groups||[]).map(g=>({section:s.id,page:p.page,legacy_ref:g.id,children:g.children})))),
 learner_state:'Never mutate review_log or copy a parent grade into new child rows. Existing term keys are unchanged.',
 prepared_layers:'Previous prepared context revisions no longer match. Do not regenerate without a separate request.',
 find_bank:'Not regenerated. Existing source-bound exercises require their normal stale-source validation.',
 generated_ai_content:false,generated_exercises:false
}));
console.log(JSON.stringify({glossary_terms:Object.keys(terms.terms).length,generated_exercises:false,generated_ai_content:false}));
