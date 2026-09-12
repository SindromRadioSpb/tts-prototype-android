#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),{execFileSync}=require('node:child_process');
const C=require('../../public/js/mediatheque-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'docs/research/room-mediatheque-stage2/2026-09-12');
const evidence={mode:'synthetic deterministic domain benchmark; no browser or owner data',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),worktreeDirty:!!execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim(),runs:[]};
for(const count of [5000,30000]){
 const materials=Array.from({length:count},(_,n)=>({ref:{kind:'personal',textKey:'scale-'+n},title:'Материал '+String(n).padStart(5,'0'),
  source:'Источник '+n%250,kind:n%3===0?'video':'text',language:'he',tags:n%5===0?['наука']:[],available:true,
  durationSeconds:n%4?120: null,addedAt:new Date(1700000000000+n*1000).toISOString()}));
 const d=C.empty();d.references=materials.map(i=>i.ref);
 d.categories=Array.from({length:500},(_,n)=>({id:'cat-'+n,title:'Тема '+n,description:'',parentId:n<10?null:'cat-'+n%10,items:[]}));
 for(let n=0;n<count;n++)d.categories[n%500].items.push(C.refKey(materials[n].ref));
 const start=performance.now();C.validate(d);const prepared=C.prepare(d,materials),prepareMs=performance.now()-start;
 const samples=[];let rows;
 for(let n=0;n<5;n++){const begin=performance.now();rows=C.query(d,prepared,{kind:'video',tags:['наука'],sort:'added_desc'});samples.push(performance.now()-begin);}
 const expected=materials.filter((_,n)=>n%3===0&&n%5===0).reverse().map(i=>C.refKey(i.ref));
 assert.deepEqual(rows.map(i=>i.key),expected);
 const branch=C.query(d,prepared,{category:'cat-0'}),expectedBranch=materials.filter((_,n)=>(n%500)%10===0).map(i=>C.refKey(i.ref)).sort();
 assert.deepEqual(branch.map(i=>i.key).sort(),expectedBranch);
 assert.ok(prepareMs<4000,'projection budget 4 seconds');assert.ok(Math.max(...samples)<1500,'query budget 1500 ms');
 const run={materials:count,categories:500,prepareMs:Number(prepareMs.toFixed(2)),queryMs:samples.map(n=>Number(n.toFixed(2))),resultCount:rows.length,status:'PASS'};
 evidence.runs.push(run);console.log(JSON.stringify(run));
}
evidence.status='PASS';fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'scale.json'),JSON.stringify(evidence,null,2)+'\n');
