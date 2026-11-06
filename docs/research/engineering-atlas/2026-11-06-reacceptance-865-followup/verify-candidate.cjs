'use strict';
// Read-only verification against the supplied independent acceptance registers.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../..'),AW=require(root+'/public/js/atlas-words.js'),RM=require(root+'/public/js/reader-morph.js'),T=require(root+'/public/js/atlas-train.js');
const input=path.join(root,'Архив/atlas97001-independent-retest-3.11.864-2026-11-06/atlas97001-independent-retest-3.11.864');
const read=p=>JSON.parse(fs.readFileSync(p)),reg=n=>read(path.join(input,n)),data=path.join(root,'data/atlas/a97001');
const index=read(data+'/index.json'),sections=index.sections.map(s=>read(data+'/sections/'+s.id+'.json'));
const pages=new Map(sections.flatMap(s=>s.pages.map(p=>[p.page,{s,p}]))),checks=[];
for(const r of reg('term-link-retest.json')){
 const {p}=pages.get(r.page),obj=p.items.find(i=>i.id===r.block);assert(obj);assert(!obj.terms.some(t=>t.split('#')[0]===r.term_id),r.block);
 checks.push({R:'R02',ref:r.block,retired:r.term_id,result:'pass',source_he:obj.he});
}
for(const id of ['a97001:p183:b002','a97001:p119:b005','a97001:p168:b003','a97001:p72:b002','a97001:p6:b003','a97001:p24:b007','a97001:p50:b004']){
 const pn=Number(/:p(\d+):/.exec(id)[1]),obj=pages.get(pn).p.items.find(x=>x.id===id);assert(!obj.terms.includes('a97001:term:dimension#mechanics'));checks.push({R:'R03',ref:id,result:'pass',source_he:obj.he});
}
for(const id of ['a97001:p112:b005','a97001:p117:b004','a97001:p117:b008','a97001:p190:b007']){
 const pn=Number(/:p(\d+):/.exec(id)[1]),obj=pages.get(pn).p.items.find(x=>x.id===id);assert(!obj.terms.includes('a97001:term:distance#mechanics'));checks.push({R:'R02',ref:id,result:'pass',source_he:obj.he,scope:'additional analogous context'});
}
for(const r of reg('editor-ref-retest.json')){
 const {p}=pages.get(r.page),note=p.editor.find(n=>n.source_ref===r.ref&&n.text===r.text);assert(note&&note.about==='page'&&!note.ref,r.ref);checks.push({R:'R08',source_ref:r.ref,page:r.page,result:'pass',text:r.text});
}
const coverage=sections.map(s=>{const ctx=AW.sectionContext('a97001',s,RM),queue=T.sectionTermItems(ctx),ids=new Set(queue.map(q=>q.termId)),missing=Object.keys(s.terms).filter(id=>!ids.has(id));assert.equal(missing.length,0,s.id);return{section:s.id,dictionary:Object.keys(s.terms).length,queue:queue.length,uniqueQueue:ids.size,missing};});
const p200=pages.get(200).p,t=p200.tables.find(t=>t.id==='a97001:p200:img01:t-applications'),aa=t.cells[11];
assert(!/топливн|пищев/i.test(aa.ru));assert(/хранен/i.test(aa.ru));
const aa2011=t.cells[5],aa5052=p200.tables.find(t=>t.id==='a97001:p200:img02:t-applications').cells[3];
assert.equal((aa2011.ru.match(/FMA/g)||[]).length,1);assert(!/Источник|исходник/.test(aa2011.ru));
const p159=pages.get(159).p;assert(p159.coverage_notice&&/32/.test(p159.coverage_notice.ru)&&p159.state==='partial');
const limits=sections.flatMap(s=>s.pages.flatMap(p=>(p.source_limits||[]).map(x=>({page:p.page,...x}))));assert.equal(limits.length,20);
const bank=read(data+'/train/terms.json');for(const term of Object.values(bank.terms)){assert(Object.keys(term.places).length,'No verified first place '+term.lemma_he);for(const p of Object.values(term.places))assert.notEqual(p.sid,'s00-front');}
const result={source_base_commit:'82328f3327a0fd80be539b8efd03969170d96ad6',version:'3.11.866',checks,coverage,
 R01:{result:'pass',he:aa.he,ru:aa.ru},R09:{result:'pass',AA2011:aa2011,AA5052:aa5052},source_limits:limits,
 R05:{status:'deferred_by_user',contract:'atlas-context-v2',final_AI_content_generated:false},
 glossary:{unique:Object.keys(bank.terms).length,source_evidence:'coverage-evidence.json; additional-term-evidence.json',exclusions:'scripts/atlas/corrections/a97001.json#reacceptance_term_exclusions'}};
fs.writeFileSync(path.join(__dirname,'candidate-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({verified_commit:require('child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checks:checks.length,sections:coverage.length,terms:Object.keys(bank.terms).length,source_limits:limits.length,passed:true}));
