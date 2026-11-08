'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const {document}=parseHTML('<html/>'),R=require('../public/js/atlas-reader').factory(document);
const page=()=>({page:4,image:'scan.png',items:[{id:'a97001:p4:unit',type:'block',kind:'table_cell',he:'אורך',he_niqqud:'אֹרֶךְ',ru:'длина'}],figures:[],tables:[{id:'a97001:p4:table',cells:[{row:0,col:0,unit_ref:'a97001:p4:unit'}]}]});
test('native reference-only grid keeps source rows and anchors without an empty duplicate table',()=>{
 const p=page(),before=JSON.stringify(p);assert.equal(R.sourceLayoutTable(p.tables[0],p),true);
 const el=R.renderPage((k,f)=>f,p,{});assert.equal(el.querySelectorAll('table').length,0);assert.equal(el.querySelectorAll('[data-ref="a97001:p4:unit"]').length,1);assert(el.textContent.includes('длина'));assert.equal(JSON.stringify(p),before);
});
test('a missing source ref or actual populated cell is never silently hidden as a layout grid',()=>{
 const p=page();p.tables[0].cells[0].unit_ref='missing';assert.equal(R.sourceLayoutTable(p.tables[0],p),false);p.tables[0].cells[0].unit_ref=p.items[0].id;p.tables[0].cells[0].he='אורך';assert.equal(R.sourceLayoutTable(p.tables[0],p),false);
});
test('native source formula is shown literally without rewriting source or authorizing numeric learning',()=>{
 const p=page(),it={id:'a97001:p68:formula',type:'formula',kind:'formula',he:'V_t = Δx/Δt',structure:{source_pdf_sha256:'a'.repeat(64)},training_eligible:false};p.items=[it];p.tables=[];const before=JSON.stringify(it),el=R.renderPage((k,f)=>f,p,{});assert(el.textContent.includes(it.he));assert.equal(JSON.stringify(it),before);assert.equal(R.nativeFormulaSource({...it,he:''}),'');assert.equal(R.nativeFormulaSource({...it,id:'a97002:p68:formula'}),'');
});
test('technical candidate banner preserves holds without an incorrect claim of unpublished runtime',()=>{
 const s={id:'s',atlas_id:'a97001rc32',title_he:'ספר',title_ru:'Книга',first:4,last:4,pages:[{...page(),tables:[]}],activation:{environment:'isolated_staging'},terms:{}};
 const el=R.renderSection((k,f)=>f,s,{});assert(el.textContent.includes('содержание ожидает приёмки'));assert(!el.textContent.includes('публикация не выполнена'));
 s.activation.release_gate='blocked';assert(R.renderSection((k,f)=>f,s,{}).textContent.includes('публикация заблокирована'));
});
