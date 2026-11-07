'use strict';
// Synthetic, read-only compatibility probes. No corpus or learner data is read.
const path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../../..');
const {window,document}=require('linkedom').parseHTML('<html><body></body></html>');
global.window=window;global.document=document;window.indexedDB=undefined;
window.ReaderMorph=require(path.join(repo,'public/js/reader-morph'));
require(path.join(repo,'public/js/word-gloss-ai'));
const AI=window.WordGlossAI,C=require(path.join(repo,'public/js/atlas-context-contract')),
 E=require(path.join(repo,'public/js/atlas-edition')),W=require(path.join(repo,'public/js/atlas-words'));
function section(atlas,he,niqqud){return {atlas_id:atlas,id:'s01-test',terms:{},pages:[{page:1,items:[{id:atlas+':p1:b001',he,he_niqqud:niqqud,ru:'Синтетический пример'}]}]};}
function describe(atlas,he,niqqud){return C.describe(W.glossRows(W.sectionContext(atlas,section(atlas,he,niqqud),window.ReaderMorph,{purpose:'inspection'})),AI);}
async function main(){
 const cases=[['marks_only','כוח','כּוֹחַ',true],['existing_reviewed_spelling','חוקים','חֻקִּים',true],
  ['unlisted_defective_spelling','כוחות','כֹּחוֹת',false],['changed_word','כוח','מַסָּה',false],['changed_word_count','ביתספר','בֵּית סֵפֶר',false]];
 const results=cases.map(([name,he,niqqud,expected])=>{let accepted=true,error=null;try{describe('a97001rc32',he,niqqud);}catch(e){accepted=false;error=e.message;}assert.equal(accepted,expected,name);return{name,he,niqqud,accepted,error};});
 const source=describe('a97001','כוח','כּוֹחַ'),projected=describe('a97001rc32','כוח','כּוֹחַ');
 assert.equal(source[0].key,projected[0].key);
 const sourceRevision=await C.revision(source),projectedRevision=await C.revision(projected);assert.notEqual(sourceRevision,projectedRevision);
 let fetches=0;const client=E.createClient('a97001rc32',{fetch:async()=>{fetches++;throw Error('unexpected fetch');}});
 await assert.rejects(client.contextJson('s01-test.json'),/ATLAS_CONTEXT_NOT_PUBLISHED/);assert.equal(fetches,0);
 console.log(JSON.stringify({status:'baseline_only_integration_pending',source_commit:'1ae74d9e1f0c0396dbcf0c66acdfc8da4a074cf0',synthetic:true,cases:results,
  projection:{word_key_unchanged:true,source_revision:sourceRevision,projected_revision:projectedRevision},loader:{code:'ATLAS_CONTEXT_NOT_PUBLISHED',fetches}},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
