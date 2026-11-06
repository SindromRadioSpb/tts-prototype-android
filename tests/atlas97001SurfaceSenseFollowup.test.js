'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cases=read(path.join(__dirname,'fixtures/atlas97001-surface-sense.json'));
const cfg=read(root+'/scripts/atlas/corrections/a97001.json'),data=path.resolve(process.env.ATLAS_FOLLOWUP_DATA||root+'/data/atlas/a97001');
const AW=require(root+'/public/js/atlas-words.js'),RM=require(root+'/public/js/reader-morph.js'),T=require(root+'/public/js/atlas-train.js');
const {buildTermsIndex}=require(root+'/scripts/atlas/build-train-bank.cjs');
// Runtime atlas JSON is volume-only. Clean CI still checks canonical decisions;
// the full source/span/SRS checks run when the local release data is available.
const hasRuntime=fs.existsSync(data+'/sections')&&fs.existsSync(data+'/train/terms.json');
const runtimeTest=(name,fn)=>test(name,{skip:hasRuntime?false:'requires volume-only a97001 runtime; canonical checks still run'},fn);
const sections=hasRuntime?fs.readdirSync(data+'/sections').filter(f=>f.endsWith('.json')).sort().map(f=>read(data+'/sections/'+f)):[];
const section=id=>sections.find(s=>s.id===id),ctx=id=>AW.sectionContext('a97001',section(id),RM);
const bank=hasRuntime?read(data+'/train/terms.json'):null,area='a97001:term:area',old=area+'#mechanics',surface=area+'#surface';
const item=x=>ctx(x.section).items.get(x.id);

runtimeTest('17 reviewed surface links use a separate sense in canonical and rendered data',()=>{
 assert.equal(cases.confirmed.length,17);
 for(const x of cases.confirmed){
  const it=item(x),refs=it.terms;assert(refs.includes(surface),x.id);assert(!refs.includes(old),x.id);
  const op=cfg.structure.filter(o=>o.op==='set'&&o.id===x.id).at(-1);assert(op.fields.terms.includes(surface));assert(!op.fields.terms.includes(old));
  const context=ctx(x.section),loc=context.located(x.id);assert(loc.he.spans.some(s=>s.id===area&&s.sense==='surface'),x.id+' actual Hebrew span');
  const top=AW.cardTop({atlas_term:{id:area,sense:'surface'}},context,{other:'Другие значения'});assert.equal(top.lines[0],'поверхность');assert(top.lines.some(l=>l==='Другие значения: площадь'));
 }
});
runtimeTest('16 reviewed area/region links stay intact; uncertain test-site association is not taught',()=>{
 assert.equal(cases.preserve.length,16);for(const x of cases.preserve)assert(item(x).terms.includes(old),x.id);
 assert.equal(cases.uncertain.length,1);for(const x of cases.uncertain){assert(!item(x).terms.includes(old));assert(!item(x).terms.includes(surface));}
});
runtimeTest('mixed p180 preserves quantitative area while heat removal uses the longer surface phrase',()=>{
 const context=ctx('s17-steels'),id='a97001:p180:b002',loc=context.located(id),refs=context.items.get(id).terms;
 assert(refs.includes(old));assert(refs.includes('a97001:term:surface#mechanics'));
 assert(loc.he.spans.some(s=>s.id==='a97001:term:surface'&&s.from===14&&s.to===15));
 assert(loc.he.spans.some(s=>s.id===area&&s.sense==='mechanics'&&s.from===20&&s.to===20));
 assert(!loc.he.spans.some(s=>s.id===area&&s.from<=15&&s.to>=15));
});
runtimeTest('all copies keep identical area/surface definitions and the distinct mishtakh lemma',()=>{
 const copies=sections.filter(s=>s.terms[area]).map(s=>s.terms[area]);assert(copies.length>1);
 for(const t of copies){assert.deepEqual(t,copies[0]);assert.equal(t.lemma_he,'שטח');assert.equal(t.senses.find(s=>s.sense==='mechanics').ru,'площадь');assert.equal(t.senses.find(s=>s.sense==='surface').ru,'поверхность');}
 for(const s of sections)if(s.terms['a97001:term:surface'])assert.equal(s.terms['a97001:term:surface'].lemma_he,'משטח');
});
runtimeTest('generated term index equals real builder and has exactly reviewed surface/area occurrences',()=>{
 assert.deepEqual(bank,buildTermsIndex(sections,'a97001'));
 const b=bank.terms[area],key=x=>x.section+'|'+x.id,occ=o=>o.sid+'|'+o.block;
 assert.deepEqual(b.occurrences.surface.map(occ).sort(),cases.confirmed.map(key).sort());
 assert.deepEqual(b.occurrences.mechanics.map(occ).sort(),cases.preserve.map(key).sort());
 assert.equal(Object.keys(bank.terms).length,240);
});
runtimeTest('all retired saved area examples fall back without modifying learner state',()=>{
 for(const x of [...cases.confirmed,...cases.uncertain]){
  const key=T.termKey('a97001',area,'mechanics'),states={[key]:{due:1,stability:16,status:'known',textKey:'atlas-block-v1:a97001:'+x.section+':old-revision',sentenceId:x.id}};
  const before=JSON.stringify(states),out=T.globalDueItems(states,bank,[],2,99);
  assert.equal(out.missing,0);assert.equal(out.items.length,1);assert.equal(out.items[0].block,bank.terms[area].places.mechanics.block);assert.notEqual(out.items[0].block,x.id);assert.equal(JSON.stringify(states),before);
 }
});
runtimeTest('each section can teach its referenced sense and every global occurrence remains valid',()=>{
 for(const s of sections){const context=ctx(s.id),cards=T.sectionTermItems(context);for(const it of context.items.values())for(const ref of it.terms||[]){const a=ref.lastIndexOf('#'),tid=ref.slice(0,a),sense=ref.slice(a+1);assert(s.terms[tid]?.senses.some(x=>x.sense===sense),s.id+' '+ref);assert(cards.some(x=>x.termId===tid&&x.sense===sense),s.id+' unavailable '+ref);}}
 for(const [tid,t] of Object.entries(bank.terms))for(const [sense,occs] of Object.entries(t.occurrences||{}))for(const o of occs)assert(ctx(o.sid).items.get(o.block)?.terms.includes(tid+'#'+sense),o.block);
});
runtimeTest('pronunciation fixes are explicit and protected from generic recompilation',()=>{
 for(const [slug,niqqud,latin,ru] of [['electron','אֵלֶקְטְרוֹן','Elektron','элэктрон'],['chamfer','פָזָה','Faza','фаза']]){
  const tid='a97001:term:'+slug,t=bank.terms[tid];assert.equal(t.niqqud,niqqud);assert.equal(t.translit,latin);assert.equal(t.translit_ru,ru);
  for(const s of sections)if(s.terms[tid]){const a=s.terms[tid];assert.deepEqual(a.pronunciation_override,{niqqud,translit:latin,translit_ru:ru,basis:a.pronunciation_basis});}
 }
});
runtimeTest('unverified readings remain explicit limitations, not invented corrections',()=>{
 const al=bank.terms['a97001:term:alclad'],pow=bank.terms['a97001:term:powder-metallurgy'];
 assert.equal(al.translit,'Alkelad');assert.equal(pow.translit,'Metalurgeyat avakot');
 for(const t of [al,pow])assert(t.study_note.includes('не подтверждено'));
});
runtimeTest('circular-runout and pronunciation limitations reach normal cards and both trainer queues',()=>{
 for(const slug of ['circular-runout','alclad','powder-metallurgy','luminous-intensity']){
  const tid='a97001:term:'+slug,s=sections.find(s=>s.terms[tid]),context=ctx(s.id),term=s.terms[tid],sense=term.senses[0].sense;
  assert(term.study_note);const top=AW.cardTop({atlas_term:{id:tid,sense}},context);assert.equal(top.lines.filter(l=>l===term.study_note).length,1);
  const card=T.sectionTermItems(context).find(x=>x.termId===tid&&x.sense===sense);assert.equal(card.studyNote,term.study_note);
  const global=T.globalDueItems({[card.key]:{due:1}},bank,[],2,99).items[0];assert.equal(global.studyNote,term.study_note);
 }
 assert(bank.terms['a97001:term:circular-runout'].study_note.includes('не самим словом'));
});
test('normal card note adapter is opt-in and escaped by the actual ReaderMorph renderer',()=>{
 const tid='fixture',base={lemma_he:'מונח',niqqud:'מוּנָח',translit:'Term',senses:[{sense:'one',ru:'значение'}]};
 for(const invalid of [undefined,'', '   ', 3, {}, []]){const top=AW.cardTop({atlas_term:{id:tid,sense:'one'}},{terms:{[tid]:{...base,study_note:invalid}}});assert.deepEqual(top.lines,['значение']);}
 const top=AW.cardTop({atlas_term:{id:tid,sense:'one'}},{terms:{[tid]:{...base,study_note:'  <img src=x onerror=evil()> & note  '}}});
 assert.deepEqual(top.lines,['значение','<img src=x onerror=evil()> & note']);const html=RM.surfaceTopHtml(top,'ltr');assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('&amp; note'));
});

test('canonical surface decisions and disclosed language limits are checked without a data volume',()=>{
 const last=id=>cfg.structure.filter(o=>o.op==='set'&&o.id===id).at(-1);
 assert.equal(cases.confirmed.length,17);assert.equal(cases.preserve.length,16);assert.equal(cases.uncertain.length,1);
 for(const x of cases.confirmed){assert(last(x.id).fields.terms.includes(surface),x.id);assert(!last(x.id).fields.terms.includes(old),x.id);}
 for(const x of cases.uncertain){assert(!last(x.id).fields.terms.includes(surface));assert(!last(x.id).fields.terms.includes(old));}
 assert.deepEqual(last('a97001:p180:b002').fields.terms,[old,'a97001:term:quenching#mechanics','a97001:term:surface#mechanics']);
 const definitions=cfg.structure.filter(o=>o.op==='section').map(o=>o.fields.terms);
 const areas=definitions.filter(d=>d[area]).map(d=>d[area]);assert.equal(areas.length,7);
 for(const a of areas){assert.deepEqual(a,areas[0]);assert.deepEqual(a.senses.map(s=>[s.sense,s.ru]),[['mechanics','площадь'],['surface','поверхность']]);}
 const get=slug=>definitions.find(d=>d['a97001:term:'+slug])['a97001:term:'+slug];
 for(const [slug,latin,ru] of [['electron','Elektron','элэктрон'],['chamfer','Faza','фаза']]){const t=get(slug);assert.equal(t.translit,latin);assert.equal(t.translit_ru,ru);assert.equal(t.pronunciation_override.translit,latin);assert(t.pronunciation_basis);}
 for(const slug of ['alclad','powder-metallurgy'])assert(get(slug).study_note.includes('не подтверждено'));
 assert(get('circular-runout').study_note.includes('не самим словом'));
 const canonicalBank=buildTermsIndex(definitions.map((terms,i)=>({id:'canonical-'+i,terms,pages:[]})),'a97001');
 assert.equal(Object.keys(canonicalBank.terms).length,240);assert.equal(Object.values(canonicalBank.terms).reduce((n,t)=>n+t.senses.length,0),244);
});
