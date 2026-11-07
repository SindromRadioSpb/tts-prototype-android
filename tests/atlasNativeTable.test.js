'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom'),W=require('../public/js/atlas-words');
function env(){const {document}=parseHTML('<html><body></body></html>');return require('../public/js/atlas-reader').factory(document);}
const cell={id:'a97001:p1:t1:semantic-label',row:0,col:0,rowspan:1,colspan:1,he:'כוח',he_niqqud:'כֹּחַ',ru:'сила',translit:'koakh',translit_ru:'коах'};
test('semantic table cell IDs and five fields survive mirrored layout, with holds enforced',()=>{
 const R=env(),table={id:'a97001:p1:t1',cells:[cell]};
 for(const mirror of [false,true]){const td=R.renderTable(table,null,mirror).querySelector('td');assert.equal(td.getAttribute('data-ref'),cell.id);for(const key of ['he','he_niqqud','ru','translit','translit_ru'])assert(td.textContent.includes(cell[key]));assert.equal(td.querySelector('[data-col="niqqud"]').textContent,cell.he_niqqud);}
 for(const held of [{...table,training_eligible:false},{...table,cells:[{...cell,training_eligible:false}]}]){const n=R.renderTable(held);assert.equal(n.querySelectorAll('.atlas-learning-row').length,0);assert.equal(n.querySelectorAll('[data-col]').length,0);assert.equal(n.querySelector('td').getAttribute('data-ref'),cell.id);}
});
test('table parts preserve separate rows and graphic cells preserve source image',()=>{
 const R=env(),table={id:'a97001:p1:t1',cells:[{id:'layout-cell',row:0,col:0,rowspan:1,colspan:1,parts:[cell,{...cell,id:'other'}],figure_images:[{id:'image',crop:'/fixture.png',alt:'diagram'}]}]};
 const n=R.renderTable(table);assert.equal(n.querySelectorAll('.atlas-row').length,2);assert.equal(n.querySelector('img').getAttribute('src'),'/fixture.png');assert.equal(R.renderTable({...table,training_eligible:false}).querySelectorAll('[data-col]').length,0);
});
test('word context keeps semantic cell IDs and transliterations, excluding held cells and figures',()=>{
 const s={atlas_id:'a97001',id:'s01-fixture',pages:[{page:1,tables:[{id:'a97001:p1:t1',cells:[cell,{...cell,id:'held',training_eligible:false}]}],figures:[{id:'figure',caption_he:'כוח',training_eligible:false}]}]};
 const items=W.sectionItems(s);assert.equal(items.length,1);assert.equal(items[0].id,cell.id);assert.equal(items[0].translit,cell.translit);assert.equal(items[0].translit_ru,cell.translit_ru);
});
test('table parts become independent learning objects',()=>{
 const s={atlas_id:'a97001',id:'s01-fixture',pages:[{page:1,tables:[{id:'a97001:p1:t1',cells:[{id:'layout-cell',parts:[cell,{...cell,id:'held',training_eligible:false}]}]}]}]};assert.deepEqual(W.sectionItems(s).map(x=>x.id),[cell.id]);s.pages[0].tables[0].training_eligible=false;assert.deepEqual(W.sectionItems(s),[]);
});
test('source numeric facts show only supplied numbers and explicit unresolved markers',()=>{
 const R=env(),table={id:'a97001:p116:t1',cells:[{...cell,source_fields:{atomic_number:1,atomic_mass:null},unresolved_fields:['atomic_mass'],training_eligible:false}]};
 const n=R.renderTable(table);assert.equal(n.querySelector('[data-source-field="atomic_number"]').textContent,'Z: 1');assert.match(n.querySelector('[data-source-field="atomic_mass"]').textContent,/не разобрано/);assert(!n.textContent.includes('null'));assert.equal(n.querySelectorAll('[data-col]').length,0);
 assert.equal(R.renderTable({...table,cells:[{...cell,source_fields:{atomic_number:null}}]}).querySelectorAll('[data-source-field]').length,0);
});
test('blocked staging edition stays visibly marked without hiding content; legacy fixtures unchanged',()=>{
 const R=env(),base={id:'s01-fixture',atlas_id:'a97001',translated:true,pages:[{page:1,items:[{id:'a97001:p1:b1',he:'כוח',ru:'сила'}],figures:[],tables:[]}],terms:{}};
 assert.equal(R.renderSection((k,f)=>f,base,{}).querySelectorAll('.atlas-release-blocked').length,0);
 const n=R.renderSection((k,f)=>f,{...base,activation:{release_gate:'blocked'}},{});assert.match(n.querySelector('.atlas-release-blocked').textContent,/публикация заблокирована/);assert(n.querySelector('[data-ref="a97001:p1:b1"]'));
});
