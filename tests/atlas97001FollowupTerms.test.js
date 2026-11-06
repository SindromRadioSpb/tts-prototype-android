'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {buildTermsIndex}=require('../scripts/atlas/build-train-bank.cjs');
const cfg=JSON.parse(fs.readFileSync(require.resolve('../scripts/atlas/corrections/a97001.json'),'utf8'));
const cases=[['a97001:p28:b011','weight','equilibrium#mechanics'],['a97001:p172:b001','weight','equilibrium#thermodynamics'],['a97001:p167:b003','mass'],['a97001:p167:b005','mass'],['a97001:p167:b008','mass']];
cases.push(...[[137,'b008'],[149,'b004'],[174,'b008'],[174,'b009'],[176,'b002'],[177,'b002'],[180,'b002'],[185,'b004']].map(([p,b])=>['a97001:p'+p+':'+b,'velocity']));
test('canonical follow-up keeps equilibrium and dissolution out of weight/mass occurrences and first examples',()=>{
 const terms=Object.fromEntries(['weight','mass','equilibrium'].map(slug=>['a97001:term:'+slug,{lemma_he:slug,senses:[{sense:'mechanics',ru:slug},{sense:'thermodynamics',ru:slug}]}]));
 const items=cases.map(([id,slug,replacement])=>{const op=cfg.structure.filter(o=>o.op==='set'&&o.id===id).at(-1);assert(op?.fields?.terms,id);assert(!op.fields.terms.includes('a97001:term:'+slug+'#mechanics'),id);if(replacement)assert(op.fields.terms.includes('a97001:term:'+replacement));return{id,type:'block',he:'מקור',terms:op.fields.terms};});
 items.push({id:'valid-weight',he:'משקל',terms:['a97001:term:weight#mechanics']},{id:'valid-mass',he:'מסה',terms:['a97001:term:mass#mechanics']});
 const index=buildTermsIndex([{id:'fixture',terms,pages:[{page:1,items}]}],'a97001');
 for(const slug of ['weight','mass']){const term=index.terms['a97001:term:'+slug];assert.equal(term.places.mechanics.block,'valid-'+slug);assert.deepEqual(term.occurrences.mechanics.map(x=>x.block),['valid-'+slug]);}
});
test('reviewed scientific names and lexical pronunciations stay distinct from preserved PDF spellings',()=>{
 const entries=slug=>cfg.structure.map(o=>o.fields?.terms).filter(t=>t&&!Array.isArray(t)&&t['a97001:term:'+slug]).map(t=>t['a97001:term:'+slug]);
 for(const t of entries('particle')){assert(t.niqqud.includes('חׇמְרִית'));assert.equal(t.translit,'Nekuda khomrit');assert.equal(t.translit_ru,'нэкуда хомрит');}
 for(const t of entries('neutron')){assert.equal(t.niqqud,'נֵיטְרוֹן');assert.equal(t.translit,'Neytron');assert.equal(t.translit_ru,'нейтрон');assert.equal(t.pronunciation_override.niqqud,t.niqqud);assert(t.pronunciation_override.basis);}
 for(const slug of ['bcc','fcc'])for(const t of entries(slug)){assert(t.lemma_he.includes('סריג קובי ממורכז'));assert(t.editorial_source_spelling.he);assert(t.senses[0].context.includes('Текст исходной страницы сохранён.'));assert(!t.lemma_he.includes('פנים'));}
});
test('all fifteen addressed N05 concepts have explicit canonical source references and section cards',()=>{
 const targets=JSON.parse(fs.readFileSync(require.resolve('../docs/research/engineering-atlas/2026-11-06-reacceptance-865-followup/coverage-evidence.json'),'utf8'));
 assert.equal(targets.length,15);
 for(const x of targets){const op=cfg.structure.filter(o=>o.op==='set'&&o.id===x.ref).at(-1);assert(op,x.ref);const obj=x.cell?op.fields.cells.find(c=>c.row===x.cell.row&&c.col===x.cell.col):op.fields;assert(obj.terms.includes(x.term),x.ref);const section=cfg.structure.filter(o=>o.op==='section'&&o.section===x.section).at(-1);assert(section.fields.terms[x.term.split('#')[0]],x.ref);}
 const units=cfg.structure.filter(o=>o.op==='section'&&o.section==='s01-units').at(-1).fields.terms;
 assert(units['a97001:term:luminous-intensity'].study_note.includes('люксах'));
 const steel=cfg.structure.filter(o=>o.op==='section'&&o.section==='s17-steels').at(-1).fields.terms;
 assert(!steel['a97001:term:mass']);assert(!steel['a97001:term:velocity']);assert(!steel['a97001:term:weight']);
});
test('the SI source-error note follows luminous intensity into the real training answer',()=>{
 const {parseHTML}=require('linkedom'),{document}=parseHTML('<html><body></body></html>'),AW=require('../public/js/atlas-words.js'),RM=require('../public/js/reader-morph.js'),T=require('../public/js/atlas-train.js'),UI=require('../public/js/atlas-train-ui.js');
 const terms=cfg.structure.filter(o=>o.op==='section'&&o.section==='s01-units').at(-1).fields.terms;
 const ctx=AW.sectionContext('a97001',{atlas_id:'a97001',id:'s01-units',terms,pages:[{page:4,items:[],figures:[],tables:[{id:'light',cells:[{row:7,col:0,he:'עוצמת הארה',terms:['a97001:term:luminous-intensity#technical']}]}]}]},RM);
 const item=T.sectionTermItems(ctx)[0];assert(item.studyNote.includes('люксах'));
 const session=UI.termSession(document,{items:[{...item,sentence:'עוצמת הארה'}]});document.body.append(session.el);
 session.el.querySelector('[data-ts-reveal]').click();assert.equal(session.el.querySelector('.atlas-ts-answer').hidden,false);assert(session.el.querySelector('.atlas-ts-answer').textContent.includes('Не учите эту строку'));
 session.el.remove();
});
test('scientific source sentences retain acronyms and numbers while marking Hebrew offsets',()=>{
 const {parseHTML}=require('linkedom'),{document}=parseHTML('<html><body></body></html>'),RM=require('../public/js/reader-morph.js'),UI=require('../public/js/atlas-train-ui.js');
 const sentence='מבנה BCC, ברזל 910°C < 1000°C';
 const session=UI.termSession(document,{items:[{key:'test',title:'סריג',ru:'решётка',sentence,from:1,to:1,sentenceParts:RM.tokenize(sentence).map(p=>({text:p.text,word:p.isWord}))}]});
 assert.equal(session.el.querySelector('.atlas-ts-sentence').textContent,sentence);assert.equal(session.el.querySelector('.atlas-ts-sentence mark').textContent,'ברזל');
});
test('actual section-session adapter preserves scientific context only for 97001',()=>{
 const vm=require('node:vm'),RM=require('../public/js/reader-morph.js'),src=fs.readFileSync(require.resolve('../public/js/library-ui.js'),'utf8'),a=src.indexOf('  function sessionItem(it) {'),b=src.indexOf('  function sourceOf(it)',a);
 assert(a>=0&&b>a);const he='מבנה BCC ברזל 910°C',ctx={items:new Map([['a97001:p167:b003',{he}]])};
 for(const atlasId of ['a97001','a97002']){const env={ctx,RM,atlasId,sid:'s17-steels',atlasStageOf:()=>0};vm.createContext(env);vm.runInContext(src.slice(a,b)+';globalThis.make=sessionItem;',env);const item=env.make({block:'a97001:p167:b003'});if(atlasId==='a97001'){assert.equal(item.sentence,he);assert(item.sentenceParts.some(p=>p.text.includes('BCC')));}else assert.equal(item.sentence,'מבנה ברזל');}
});
