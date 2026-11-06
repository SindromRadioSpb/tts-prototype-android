'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),data=path.join(root,'data/atlas/a97001'),sections=fs.readdirSync(data+'/sections').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(data+'/sections/'+f)));
const learning=sections.flatMap(s=>require(root+'/public/js/atlas-words.js').sectionItems(s));
const bank=JSON.parse(fs.readFileSync(data+'/train/terms.json')),find=JSON.parse(fs.readFileSync(data+'/train/find.json'));
const rows=sections.flatMap(s=>s.pages.flatMap(p=>p.items.map(it=>({...it,page:p.page,sid:s.id}))));
const cases=[['a97001:p28:b011','weight','equilibrium#mechanics'],['a97001:p172:b001','weight','equilibrium#thermodynamics'],['a97001:p167:b003','mass'],['a97001:p167:b005','mass'],['a97001:p167:b008','mass']];
cases.push(...[[137,'b008'],[149,'b004'],[174,'b008'],[174,'b009'],[176,'b002'],[177,'b002'],[180,'b002'],[185,'b004']].map(([p,b])=>['a97001:p'+p+':'+b,'velocity']));
const results=[];
for(const [id,slug,replacement] of cases){const row=rows.find(r=>r.id===id),ref='a97001:term:'+slug+'#mechanics';assert(row&&!row.terms.includes(ref));if(replacement)assert(row.terms.includes('a97001:term:'+replacement));assert(!(bank.terms['a97001:term:'+slug].occurrences.mechanics||[]).some(p=>p.block===id));for(const q of find.items.filter(q=>q.block===id))assert(!q.terms.includes(ref));results.push({id,removed:ref,replacement:replacement||null,result:'pass'});}
// Audit every remaining block occurrence, including mixed paragraphs where an
// actual physical weight and equilibrium both occur. Retain those real weights.
const strip=s=>s.normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g,'');
for(const row of rows.filter(r=>r.terms?.includes('a97001:term:weight#mechanics'))){const rest=strip(row.he).replace(/(?:שווי|שיווי)[־\s]+ה?משקל/g,'');assert(/משקל/.test(rest),row.id+' only equilibrium');}
for(const id of ['a97001:p6:b005','a97001:p122:b004'])assert(rows.find(r=>r.id===id).terms.includes('a97001:term:mass#mechanics'));
for(const id of ['a97001:p6:b006','a97001:p16:b007','a97001:p31:b002'])assert(rows.find(r=>r.id===id).terms.includes('a97001:term:weight#mechanics'));
for(const id of ['a97001:p142:b005','a97001:p143:b005','a97001:p7:b005'])assert(rows.find(r=>r.id===id).terms.includes('a97001:term:velocity#mechanics'));
for(const slug of ['weight','mass','velocity']){const term=bank.terms['a97001:term:'+slug],place=term.places.mechanics,row=learning.find(r=>r.id===place.block);assert(row?.terms.includes('a97001:term:'+slug+'#mechanics'));results.push({term:slug,first_example:place,result:'pass'});}
for(const x of JSON.parse(fs.readFileSync(path.join(__dirname,'coverage-evidence.json')))){
 const id=x.cell?x.ref+':cell:'+x.cell.row+':'+x.cell.col:x.ref,row=learning.find(r=>r.id===id),[tid,sense]=x.term.split('#');
 assert(row?.terms.includes(x.term),id);assert((bank.terms[tid].occurrences[sense]||[]).some(p=>p.sid===x.section&&p.block===id),id+' missing in rebuilt bank');
 results.push({finding:'N05',term:x.term,source_ref:id,result:'pass'});
}
const out={base_commit:'82328f3327a0fd80be539b8efd03969170d96ad6',status:'local_only_not_published',results,physical_mass_block_occurrences:rows.filter(r=>r.terms?.includes('a97001:term:mass#mechanics')).map(r=>r.id),physical_weight_block_occurrences:rows.filter(r=>r.terms?.includes('a97001:term:weight#mechanics')).map(r=>r.id)};
fs.writeFileSync(path.join(__dirname,'term-verification.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
