'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../public/js/atlas-search.js');
const {buildTermsIndex}=require('../scripts/atlas/build-train-bank.cjs');
const term='a97001:term:stainless-austenitic',table='a97001:p165:t-types',ref=table+':cell:1:0';
function fixture(){return {atlas_id:'a97001',id:'s17-steels',terms:{[term]:{lemma_he:'פלדה אוסטניטית',senses:[{sense:'technical',ru:'аустенитная сталь'}],definition_refs:[ref],reading_status:'not_in_snapshot'}},pages:[{page:165,items:[],tables:[{id:table,cells:[{row:1,col:0,he:'פלדה אוסטניטית',ru:'Аустенитная сталь',terms:[term+'#technical']}]}]}]};}
test('a glossary concept defined only in a table has its exact cell as search target',()=>{
 const ix=S.buildIndex([fixture()],{}),doc=ix.docs.find(d=>d[0]==='term');
 assert(doc);assert.equal(doc[3],ref);assert.deepEqual(doc[6],[['s17-steels',165,ref]]);
});
test('dictionary index preserves exact definition refs and explicit absent reading status',()=>{
 const ix=buildTermsIndex([fixture()],'a97001'),entry=ix.terms[term];
 assert.equal(entry.niqqud,'');assert.deepEqual(entry.definition_refs,[ref]);assert.equal(entry.reading_status,'not_in_snapshot');
 assert.equal(entry.places.technical.block,ref);
});

test('source table cell IDs take precedence over synthesized coordinates in search',()=>{
 const f=fixture(),cell=f.pages[0].tables[0].cells[0],stable='a97001:p165:t-stainless-types:s02';cell.id=stable;f.terms[term].definition_refs=[stable];
 const ix=S.buildIndex([f],{}),doc=ix.docs.find(d=>d[0]==='term');
 assert.equal(doc[3],stable);assert.deepEqual(doc[6],[['s17-steels',165,stable]]);
});
