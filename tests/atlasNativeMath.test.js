'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom'),{mathml}=require('../scripts/atlas/bake-native-math.cjs');
test('native formulas render real vector accents and Greek symbols, preserving source TeX only as annotation',()=>{
 const {document}=parseHTML('<html/>'),R=require('../public/js/atlas-reader').factory(document);
 const formulas=[['\\vec{F_e}=F_1+F_2','mover'],['\\overrightarrow{AB}=\\vec F','mover'],['\\theta=\\delta \\approx 1','mi']];
 for(const [latex,tag]of formulas){const item={id:'a97001:p1:f01',type:'formula',latex,mathml:mathml(latex)},section={atlas_id:'a97001',id:'s01-fixture',pages:[{page:1,items:[item],figures:[],tables:[]}],terms:{}};const n=R.renderSection((k,f)=>f,section,{});assert(n.querySelector('math '+tag));assert.equal(n.querySelectorAll('.atlas-math-plain').length,0);assert.equal(n.querySelector('annotation').textContent,latex);const presentation=n.querySelector('semantics').firstElementChild.textContent;assert(!/vec|overrightarrow|\\theta|\\delta|\\approx/.test(presentation),presentation);}
 assert.throws(()=>mathml('\\notARealCommand{x}'));
});
test('pure section transform typesets variables and never mutates source before sealing',()=>{
 const {processSections}=require('../scripts/atlas/bake-native-math.cjs');const input=[{pages:[{items:[{id:'f',type:'formula',latex:'\\vec F',vars:[{ref:'v',latex:'\\theta'}]}]}]}];const snapshot=JSON.stringify(input),out=processSections(input);assert.equal(JSON.stringify(input),snapshot);assert.deepEqual(out.report,{sections:1,formulas:1,variables:1});assert.match(out.sections[0].pages[0].items[0].vars[0].mathml,/<math/);
});
