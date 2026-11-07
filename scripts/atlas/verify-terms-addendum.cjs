'use strict';
// Independent checks on final native bytes and the current app functions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../../public/js/atlas-edition'),T=require('../../public/js/atlas-train'),S=require('../../public/js/atlas-search'),{prepare,reader}=require('./rc32-context.cjs');
const [oldArg,finalArg,pkgArg,v2Arg,outArg]=process.argv.slice(2),rd=p=>JSON.parse(fs.readFileSync(p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const project=raw=>E.projectCorpus(raw,E.base('a97001rc32'));
(async()=>{
 const old=path.resolve(oldArg),final=path.resolve(finalArg),pkg=path.resolve(pkgArg),v2=path.resolve(v2Arg),{W,RM,AI}=reader();
 const prepared=await prepare(final,path.resolve('atlas-context/a97001rc32',E.contextPinFor('a97001rc32')));
 const input=rd(path.join(pkg,'reviewed-scoped-addendum.json')).records,accepted=new Map(input.map(a=>[a.term_id.replace('a97001:','a97001rc32:'),a]));
 const bank=project(rd(path.join(final,'edition/train/terms.json'))),oldBank=rd(path.join(old,'edition/train/terms.json'));
 const sections=rd(path.join(final,'edition/index.json')).sections.map(s=>rd(path.join(final,'edition/sections',s.id+'.json'))),search=S.buildIndex(sections,rd('atlas/a97001/notation-lexicon.json'));
 const report={schema:'atlas97001.addendum-final-proof.1',revision:E.pinFor('a97001rc32').revision,contextPin:E.contextPinFor('a97001rc32'),base_targets:0,new_targets:0,total_targets:0,old_due:0,new_due:0,negative_guards:0,remaining_v2_holds:0,held_source_cases:0,separate_editorials:0,additional_holds:0,lexical:0,source_find:0,identities_checked:0,old_orders_shifted_without_map:[],changed_text_keys:[],changed_ai_keys:[],editorial:[],search_docs:0,source_records:0};
 const items=[],contexts=new Map(),beforeContexts=new Map(),oldSections=new Map();
 for(const raw of sections){
  const oldRaw=rd(path.join(old,'edition/sections',raw.id+'.json')),section=project(raw),base=project(oldRaw);oldSections.set(raw.id,oldRaw);
  for(const [tid,t]of Object.entries(oldRaw.terms))if(!accepted.has(tid.replace('a97001:','a97001rc32:')))assert.deepEqual(raw.terms[tid],t,'Old canonical changed '+tid);
  for(const purpose of ['lexical','source_find','term_context','inspection']){
   const opts=purpose==='lexical'?{}:{purpose},a=W.sectionContext('a97001rc32',base,RM,opts),b=W.sectionContext('a97001rc32',section,RM,opts);
   const oldAi=new Map(purpose==='inspection'?W.glossRows(a).map(r=>[r.id,AI.rowPayloadFromData(r)?.key]):[]),newAi=new Map(purpose==='inspection'?W.glossRows(b).map(r=>[r.id,AI.rowPayloadFromData(r)?.key]):[]);
   const unfrozen=structuredClone(section);delete unfrozen.occurrence_compatibility.purposes;const unfrozenCtx=W.sectionContext('a97001rc32',unfrozen,RM,opts);
   if(purpose==='term_context'){contexts.set(raw.id,b);beforeContexts.set(raw.id,a);}
   if(purpose==='lexical'||purpose==='source_find'){assert.equal(a.items.size,b.items.size,'Source policy broadened');report[purpose==='lexical'?'lexical':'source_find']+=b.items.size;}
   for(const [id,it]of a.items){
    assert(b.items.has(id));assert.deepEqual(['he','he_niqqud','ru'].map(k=>b.items.get(id)[k]),['he','he_niqqud','ru'].map(k=>it[k]));
    if(purpose==='term_context'&&unfrozenCtx.order.get(id)!==a.order.get(id))report.old_orders_shifted_without_map.push({id,before:a.order.get(id),unfrozen:unfrozenCtx.order.get(id)});
    assert.equal(b.order.get(id),a.order.get(id),'Saved ordinal changed '+id);
    if(b.textKeys.get(id)!==a.textKeys.get(id))report.changed_text_keys.push({purpose,id,before:a.textKeys.get(id),after:b.textKeys.get(id)});
    assert.equal(b.textKeys.get(id),a.textKeys.get(id),'Unchanged source key changed '+id);report.identities_checked++;
    if(purpose==='inspection')assert.equal(oldAi.get(id),newAi.get(id),'Manual AI key changed');
    if(purpose==='lexical')for(let i=0;i<Math.min(3,RM.tokenize(it.he).filter(t=>t.isWord).length);i++){
     const surface=RM.tokenize(it.he).filter(t=>t.isWord)[i].text,occ=W.occurrence(a,id,i,surface,'he');assert.deepEqual(W.verifyOccurrence(occ,b),W.verifyOccurrence(occ,a),'Saved favorite/source offset changed');
    }
   }
  }
  const ctx=contexts.get(raw.id),baseCtx=beforeContexts.get(raw.id),cards=T.sectionTermItems(ctx),oldCards=T.sectionTermItems(baseCtx);
  report.base_targets+=oldCards.length;report.total_targets+=cards.length;
  for(const card of oldCards){assert.deepEqual(cards.find(c=>c.key===card.key),card,'V2 target changed '+card.key);const state={[card.key]:{due:1,textKey:baseCtx.textKeys.get(card.block),sentenceId:card.block,status:'l2',stability:19,favorite:true}},snapshot=JSON.stringify(state);assert.equal(T.globalDueItems(state,bank,[],100,999).due,1);assert.equal(JSON.stringify(state),snapshot);report.old_due++;}
  for(const card of cards){const a=accepted.get(card.termId);if(!a)continue;
   assert.equal(raw.id,a.section_id);assert.equal(card.block,a.source_ref.replace('a97001:','a97001rc32:'));
   const cf=a.canonical_after_patch;for(const [k,v]of Object.entries({title:cf.niqqud,plain:cf.lemma_he,translit:cf.translit,translit_ru:cf.translit_ru,ru:cf.ru}))assert.equal(card[k],v);
   if(a.required_notice_ru)assert(card.studyNote.includes(a.required_notice_ru));
   if(a.requires_no_literal_source_wordspan){const loc=ctx.located(card.block);assert.equal(card.from,null);assert.equal(card.to,null);assert(!loc.he.spans.concat(loc.niqqud.spans).some(s=>s.id===card.termId));report.editorial.push(card.termId);}
   const state={[card.key]:{due:1,textKey:ctx.textKeys.get(card.block),sentenceId:card.block}},snapshot=JSON.stringify(state),due=T.globalDueItems(state,bank,[],100,999);assert.equal(due.due,1);assert.equal(due.items[0].block,card.block);assert.equal(due.items[0].studyNote,card.studyNote);assert.equal(JSON.stringify(state),snapshot);report.new_due++;
   assert.equal(T.globalDueItems({[card.key]:{due:1}},bank,[],100,999).items[0].block,card.block);
   // Each independent source/term guard must fail closed.
   for(const mutate of [s=>s.terms[card.termId].training_eligible=false,s=>s.terms[card.termId].learning_eligibility.lexical.allowed=false,s=>s.terms[card.termId].projection_hold_reasons=['fixture'],s=>delete s.terms[card.termId],s=>s.terms[card.termId].senses=[],s=>{for(const it of W.sectionItems(s,'term_context')){const x=it.id===card.block;if(x){it.terms=[];}}}].slice(0,5)){
    const s=structuredClone(section);mutate(s);assert(!T.sectionTermItems(W.sectionContext('a97001rc32',s,RM,{purpose:'term_context'})).some(c=>c.key===card.key));report.negative_guards++;
   }
   const doc=search.docs.find(d=>d[0]==='term'&&d[1]===raw.id&&d[3]===a.source_ref&&d[4]===cf.lemma_he);assert(doc,'Search source missing '+card.termId);report.search_docs++;
   items.push({...card,sid:raw.id,page:Number(/:p(\d+):/.exec(card.block)[1]),required_notice_ru:a.required_notice_ru||'',editorial:!!a.requires_no_literal_source_wordspan});report.new_targets++;
  }
 }
 for(const [id,t]of Object.entries(oldBank.terms))if(!accepted.has(id.replace('a97001:','a97001rc32:')))assert.deepEqual(bank.terms[id.replace('a97001:','a97001rc32:')],project(t),'Old bank changed '+id);
 for(const h of rd(path.join(v2,'term-enrichment-round3/remaining-holds-v2.json')).records){if(accepted.has(h.term_id.replace('a97001:','a97001rc32:')))continue;const id=h.term_id.replace('a97001:','a97001rc32:');assert.equal(T.globalDueItems({[T.termKey('a97001rc32',id,h.sense||'technical')]:{due:1}},bank,[],100,999).due,0);report.remaining_v2_holds++;for(const ref of h.source_refs){const state={[T.termKey('a97001rc32',id,h.sense||'technical')]:{due:1,sentenceId:ref.replace('a97001:','a97001rc32:'),textKey:'atlas-block-v1:a97001rc32:'+h.section_id+':held'}},before=JSON.stringify(state);assert.equal(T.globalDueItems(state,bank,[],100,999).due,0);assert.equal(JSON.stringify(state),before);report.held_source_cases++;}}
 for(const h of rd(path.join(pkg,'editorial-scoped-proposals.json')).records){assert(!items.some(i=>i.termId===h.term_id.replace('a97001:','a97001rc32:')));const id=h.term_id.replace('a97001:','a97001rc32:');assert.equal(T.globalDueItems({[T.termKey('a97001rc32',id,h.sense||'technical')]:{due:1,sentenceId:h.source_ref.replace('a97001:','a97001rc32:'),textKey:'atlas-block-v1:a97001rc32:'+h.section_id+':held'}},bank,[],100,999).due,0);report.separate_editorials++;}
 for(const h of rd(path.join(pkg,'materials-held-after-language-review.json')).records){assert(!items.some(i=>i.termId===h.term_id?.replace('a97001:','a97001rc32:')));report.additional_holds++;}
 const records=fs.readFileSync(path.join(v2,'inspection/canonical-native-records.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 for(const r of records){const raw=sections.find(s=>s.id===r.sid),old=oldSections.get(r.sid);let a=raw.pages.find(p=>p.page===r.page),b=old.pages.find(p=>p.page===r.page);for(const part of r.location.split('/')){a=Array.isArray(a)?a[Number(part)]:a[part];b=Array.isArray(b)?b[Number(part)]:b[part];}assert.equal(a.id,b.id);for(const k of ['he','source_he','source_fields','he_niqqud','translit','translit_ru','ru','formula','latex','training_eligible'])assert.deepEqual(a[k],b[k],r.record.id+':'+k);for(const k of ['lexical','source_find'])assert.deepEqual(a.learning_eligibility?.[k],b.learning_eligibility?.[k]);report.source_records++;}
 assert.equal(report.base_targets,255);assert.equal(report.new_targets,48);assert.equal(report.total_targets,303);assert.equal(report.remaining_v2_holds,45);assert.equal(report.separate_editorials,5);assert.equal(report.additional_holds,4);assert.equal(report.editorial.length,3);assert.equal(report.lexical,78);assert.equal(report.source_records,6255);
 report.status='passed';report.items=items;report.production_changed=false;fs.writeFileSync(outArg,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,items:items.length,old_orders_shifted_without_map:report.old_orders_shifted_without_map.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
