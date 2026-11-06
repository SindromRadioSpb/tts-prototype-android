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
// Independent expectations for the reviewed structural edition. Do not derive
// expected recipients from current term refs or the builder under test: that
// would bless a dropped, moved or blindly copied sense link.
const splitPlaces={
 'a97001:p130:b010':{children:['s02']},
 'a97001:p132:b003':{children:['s02']},
 'a97001:p137:b005':{children:['s01']},
 'a97001:p153:b004':{children:['s01']},
 'a97001:p165:b002':{children:['s02'],held:true},
 'a97001:p177:b002':{children:['s01']},
 'a97001:p178:b003':{children:['s05']},
 'a97001:p184:b004':{children:['s01']},
 'a97001:p188:b003':{children:['s01']},
 'a97001:p50:b005':{children:['s02']},
 'a97001:p127:b007':{children:['s03']},
 'a97001:p128:b002':{children:['s04','s05']},
 'a97001:p128:b004':{children:['s01','s02','s03'],held:true},
 'a97001:p129:b002':{children:['s05']},
 'a97001:p132:b006':{children:['s03'],held:true},
 'a97001:p136:b001':{children:['s03'],held:true},
 'a97001:p180:b002':{children:['s03']},
 'a97001:p137:b009':{children:[]},
};
function sourceCase(x){
 const s=section(x.section),context=ctx(x.section),mapping=s.structure_revision&&splitPlaces[x.id];
 if(!mapping){const original=context.items.get(x.id);assert(original,x.id+' original active place');return{context,original,children:[original],expected:[original],held:false};}
 const page=s.pages.find(p=>(p.legacy_groups||[]).some(g=>g.id===x.id)),group=page?.legacy_groups.find(g=>g.id===x.id);
 assert(group,x.id+' historical group');assert(group.original,x.id+' original snapshot');assert(!context.items.has(x.id),x.id+' parent is not an active learning row');
 const children=group.children.map(id=>{const child=page.items.find(it=>it.id===id);assert(child,id+' rendered child');assert.equal(child.structure.parent_ref,x.id);return child;});
 const expected=mapping.children.map(suffix=>{const child=children.find(it=>it.id===x.id+':'+suffix);assert(child,x.id+':'+suffix+' reviewed recipient');return child;});
 for(const child of expected){
  if(mapping.held){assert.equal(child.training_eligible,false,child.id+' explicit hold');assert.equal(child.structure.review_status,'needs_review');assert(!context.items.has(child.id));}
  else assert(context.items.has(child.id),child.id+' active source');
 }
 if(mapping.held){assert.equal(group.review_status,'needs_review');assert(group.review_notes?.length,x.id+' disclosed hold reason');}
 return{context,original:group.original,children,expected,held:!!mapping.held,page,group};
}
function parentSpans(resolved,child,spans){
 if(child.id===resolved.original.id)return spans.map(sp=>[sp.from,sp.to]);
 const text=resolved.original.he,sourceWords=RM.tokenize(text).filter(t=>t.isWord),ranges=child.structure.source_spans.he;
 assert(ranges.length,child.id+' original Hebrew provenance');
 const points=Array.from(text),selected=[];
 assert.equal(ranges.map(([a,b])=>points.slice(a,b).join('')).join('').replace(/\s/g,''),child.he.replace(/\s/g,''),child.id+' exact source words');
 for(const [a,b]of ranges){const start=points.slice(0,a).join('').length,end=points.slice(0,b).join('').length;sourceWords.forEach((w,i)=>{if(w.start>=start&&w.end<=end)selected.push(i);});}
 assert.deepEqual(RM.tokenize(child.he).filter(t=>t.isWord).map(w=>w.text),selected.map(i=>sourceWords[i].text),child.id+' word order in source');
 return spans.map(sp=>{const indexes=selected.slice(sp.from,sp.to+1);assert.equal(indexes.length,sp.to-sp.from+1);assert(indexes.every((v,i)=>v===indexes[0]+i));return[indexes[0],indexes.at(-1)];});
}
function checkSensePlaces(x,ref,forbidden){
 const r=sourceCase(x),sense=ref.slice(ref.indexOf('#')+1);
 assert(r.original.terms.includes(ref),x.id+' original reviewed sense');
 if(forbidden)assert(!r.original.terms.includes(forbidden),x.id+' original rejected sense');
 assert.deepEqual(r.children.filter(it=>(it.terms||[]).includes(ref)).map(it=>it.id).sort(),r.expected.map(it=>it.id).sort(),x.id+' exact sense recipients');
 if(forbidden)for(const it of r.children)assert(!(it.terms||[]).includes(forbidden),it.id+' rejected sense was not copied');
 const select=loc=>loc.he.spans.filter(sp=>sp.id===area&&sp.sense===sense);
 const original=select(AW.locateBlock(r.original,r.context.terms,RM)).map(sp=>[sp.from,sp.to]);
 const actual=r.expected.flatMap(it=>parentSpans(r,it,select(AW.locateBlock(it,r.context.terms,RM))));
 // The former broad prefix matcher treated המשטח as שטח by stripping המ.
 // The split correctly gives that exact word to the distinct משטח lemma. This
 // one pinned refinement must remain explicit, not a general missing-span waiver.
 if(r.group&&x.id==='a97001:p130:b010'&&ref===surface){
  assert.equal(RM.tokenize(r.original.he).filter(t=>t.isWord)[12].text,'המשטח');
  const child=r.children.find(it=>it.id===x.id+':s03');assert(child);
  assert(child.terms.includes('a97001:term:surface#mechanics'));assert(!child.terms.includes(surface));assert(!child.terms.includes(old));
  const spans=AW.locateBlock(child,r.context.terms,RM).he.spans.filter(sp=>sp.id==='a97001:term:surface'&&sp.sense==='mechanics');
  assert.deepEqual(parentSpans(r,child,spans),[[12,12]]);
  actual.push([12,12]);
 }
 assert.deepEqual(actual.sort((a,b)=>a[0]-b[0]),original,x.id+' all original word spans survive at the same source coordinates');
 return r;
}

runtimeTest('17 reviewed surface links use a separate sense in canonical and rendered data',()=>{
 assert.equal(cases.confirmed.length,17);
 for(const x of cases.confirmed){
  const r=checkSensePlaces(x,surface,old);
  const op=cfg.structure.filter(o=>o.op==='set'&&o.id===x.id).at(-1);assert(op.fields.terms.includes(surface));assert(!op.fields.terms.includes(old));
  const context=r.context;for(const child of r.expected)assert(AW.locateBlock(child,context.terms,RM).he.spans.some(s=>s.id===area&&s.sense==='surface'),child.id+' actual Hebrew span');
  const top=AW.cardTop({atlas_term:{id:area,sense:'surface'}},context,{other:'Другие значения'});assert.equal(top.lines[0],'поверхность');assert(top.lines.some(l=>l==='Другие значения: площадь'));
 }
});
runtimeTest('16 reviewed area/region links stay intact; uncertain test-site association is not taught',()=>{
 assert.equal(cases.preserve.length,16);for(const x of cases.preserve)checkSensePlaces(x,old,surface);
 assert.equal(cases.uncertain.length,1);for(const x of cases.uncertain){const r=sourceCase(x);for(const it of [r.original,...r.children]){assert(!(it.terms||[]).includes(old),it.id);assert(!(it.terms||[]).includes(surface),it.id);}}
});
runtimeTest('mixed p180 preserves quantitative area while heat removal uses the longer surface phrase',()=>{
 const id='a97001:p180:b002',r=sourceCase({section:'s17-steels',id}),context=r.context,loc=AW.locateBlock(r.original,context.terms,RM),refs=r.original.terms;
 assert(refs.includes(old));assert(refs.includes('a97001:term:surface#mechanics'));
 assert(loc.he.spans.some(s=>s.id==='a97001:term:surface'&&s.from===14&&s.to===15));
 assert(loc.he.spans.some(s=>s.id===area&&s.sense==='mechanics'&&s.from===20&&s.to===20));
 assert(!loc.he.spans.some(s=>s.id===area&&s.from<=15&&s.to>=15));
 if(r.group){
  const heat=r.children.find(it=>it.id===id+':s02'),ratio=r.children.find(it=>it.id===id+':s03');
  assert.deepEqual(heat.terms.filter(ref=>ref===old||ref===surface||ref==='a97001:term:surface#mechanics'),['a97001:term:surface#mechanics']);
  assert.deepEqual(ratio.terms.filter(ref=>ref===old||ref===surface||ref==='a97001:term:surface#mechanics'),[old]);
  const heatSpans=context.located(heat.id).he.spans.filter(sp=>sp.id==='a97001:term:surface');
  const ratioSpans=context.located(ratio.id).he.spans.filter(sp=>sp.id===area);
  assert.deepEqual(heatSpans.map(sp=>[sp.from,sp.to]),[[7,8]]);assert.deepEqual(parentSpans(r,heat,heatSpans),[[14,15]]);
  assert.deepEqual(ratioSpans.map(sp=>[sp.from,sp.to]),[[2,2]]);assert.deepEqual(parentSpans(r,ratio,ratioSpans),[[20,20]]);
  assert(!context.located(heat.id).he.spans.some(sp=>sp.id===area));
 }
});
runtimeTest('all copies keep identical area/surface definitions and the distinct mishtakh lemma',()=>{
 const copies=sections.filter(s=>s.terms[area]).map(s=>s.terms[area]);assert(copies.length>1);
 for(const t of copies){assert.deepEqual(t,copies[0]);assert.equal(t.lemma_he,'שטח');assert.equal(t.senses.find(s=>s.sense==='mechanics').ru,'площадь');assert.equal(t.senses.find(s=>s.sense==='surface').ru,'поверхность');}
 for(const s of sections)if(s.terms['a97001:term:surface'])assert.equal(s.terms['a97001:term:surface'].lemma_he,'משטח');
});
runtimeTest('generated term index equals real builder and has exactly reviewed surface/area occurrences',()=>{
 assert.deepEqual(bank,buildTermsIndex(sections,'a97001'));
 const b=bank.terms[area],occ=o=>o.sid+'|'+o.block;
 const expected=list=>list.flatMap(x=>{const r=sourceCase(x);return r.held?[]:r.expected.map(it=>x.section+'|'+it.id);}).sort();
 assert.deepEqual(b.occurrences.surface.map(occ).sort(),expected(cases.confirmed));
 assert.deepEqual(b.occurrences.mechanics.map(occ).sort(),expected(cases.preserve));
 const canonical=cfg.structure.filter(o=>o.op==='section').flatMap(o=>Object.keys(o.fields.terms));
 const extra=sections.some(s=>s.structure_revision)?Object.values(read(root+'/scripts/atlas/corrections/a97001-structure-v1.json').terms_by_section||{}).flatMap(Object.keys):[];
 assert.deepEqual(Object.keys(bank.terms).sort(),Array.from(new Set([...canonical,...extra])).sort(),'all 240 established term IDs survive; additions match explicit source decisions');
});

runtimeTest('held surface/area contexts remain readable with exact provenance and never enter learning queues',()=>{
 const {parseHTML}=require('linkedom'),Reader=require(root+'/public/js/atlas-reader.js');
 let held=0;
 for(const x of [...cases.confirmed,...cases.preserve]){
  const r=sourceCase(x);if(!r.held)continue;held++;
  const {document}=parseHTML('<html><body></body></html>'),el=Reader.factory(document).renderPage((_k,f)=>f,r.page,{});
  const group=Reader.resolveRefNodes(el,x.id)[0];assert(group);assert.equal(group.querySelector('[data-source-field="he"]').textContent,r.original.he);
  for(const it of r.expected){
   const node=Reader.resolveRefNodes(el,it.id)[0];assert(node,it.id+' visible held context');assert(!node.querySelector('[data-col]'),it.id+' no learning binding');
   assert(!AW.glossRows(r.context).some(row=>row.id===it.id));assert(!T.sectionTermItems(r.context).some(card=>card.block===it.id));
   assert(!Object.values(bank.terms).some(term=>Object.values(term.occurrences||{}).flat().some(o=>o.sid===x.section&&o.block===it.id)),it.id+' no global training occurrence');
  }
 }
 assert.equal(held,sections.some(s=>s.structure_revision)?4:0,'exactly the four explicitly reviewed group holds, not a blanket exemption');
});

runtimeTest('surface migration guards reject dropped, duplicated, wrong-sense and silently reactivated links',()=>{
 if(!sections.some(s=>s.structure_revision))return;
 const x={section:'s17-steels',id:'a97001:p178:b003'},r=sourceCase(x),recipient=r.expected[0],sibling=r.children[0];
 for(const mutate of [
  ()=>{recipient.terms=recipient.terms.filter(ref=>ref!==surface);},
  ()=>{sibling.terms.push(surface);},
  ()=>{recipient.terms.push(old);},
  ()=>{recipient.he+=' שטח';},
 ]){
  const savedRecipient=JSON.parse(JSON.stringify(recipient)),savedSibling=JSON.parse(JSON.stringify(sibling));
  try{mutate();assert.throws(()=>checkSensePlaces(x,surface,old));}
  finally{Object.assign(recipient,savedRecipient);Object.assign(sibling,savedSibling);}
 }
 const heldCase={section:'s17-steels',id:'a97001:p165:b002'},held=sourceCase(heldCase).expected[0],before=held.training_eligible;
 try{held.training_eligible=true;assert.throws(()=>checkSensePlaces(heldCase,surface,old));}
 finally{held.training_eligible=before;}
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
