'use strict';
// Actual final immutable/source/context data. No owner profile, grading or network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../../public/js/atlas-edition'),T=require('../../public/js/atlas-train'),S=require('../../public/js/atlas-search'),P=require('../../lib/atlasEdition'),{prepare}=require('./rc32-context.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const [oldArg,finalArg,packageArg,outArg]=process.argv.slice(2);
(async()=>{
 const old=path.resolve(oldArg),final=path.resolve(finalArg),pkg=path.resolve(packageArg),out=path.resolve(outArg);
 const ctxdir=path.resolve(__dirname,'../../atlas-context/a97001rc32',E.contextPinFor('a97001rc32'));
 const prepared=await prepare(final,ctxdir),{W,RM,AI}=require('./rc32-context.cjs').reader(),index=read(path.join(final,'edition/index.json')),rawBank=read(path.join(final,'edition/train/terms.json')),bank=E.projectCorpus(rawBank,E.base('a97001rc32'));
 const baseline=read(path.join(old,'edition/train/terms.json')),ledger=read(path.join(pkg,'term-enrichment-round3/lexical-acceptance-v2.json')),all=read(path.join(pkg,'term-enrichment-round3/terms-additions.json')).records;
 const accepted=new Map(ledger.records.map(a=>[a.term_id.replace(/^a97001:/,'a97001rc32:'),a]));
 for(const [id,t]of Object.entries(baseline.terms))assert.deepEqual(rawBank.terms[id],t,'Old train term changed '+id);
 const sections=index.sections.map(s=>read(path.join(final,'edition/sections',s.id+'.json'))),search=S.buildIndex(sections,read(path.resolve(__dirname,'../../atlas/a97001/notation-lexicon.json')));
 const report={schema:'atlas97001.terms-v2-final-acceptance.1',revision:E.pinFor('a97001rc32').revision,contextPin:E.contextPinFor('a97001rc32'),new_targets:0,baseline_targets:0,lexical_rows:0,global_due:0,old_due_state_preserved:0,held:0,wrong_scope:0,search_docs:0,visible_sources:0,source_records_compared:0,source_fields_compared:0,errors:[]};
 const {parseHTML}=require('linkedom'),{document}=parseHTML('<html/>'),R=require('../../public/js/atlas-reader').factory(document);
 const items=[];
 for(const raw of sections){
  const section=E.projectCorpus(raw,E.base('a97001rc32')),ctx=W.sectionContext('a97001rc32',section,RM,{purpose:'term_context'}),cards=T.sectionTermItems(ctx),oldRaw=read(path.join(old,'edition/sections',raw.id+'.json'));
  report.lexical_rows+=W.sectionItems(raw).length;
  const oldCtx=W.sectionContext('a97001rc32',E.projectCorpus(oldRaw,'/data/atlas-editions/a97001/cea369d48494fcf58e78e0567fb82477abe7bb21ba02112707c3d7ba31fc4fd7/'),RM,{purpose:'term_context'}),oldCards=T.sectionTermItems(oldCtx);
  const dom=R.renderSection((_k,f)=>f,section,{}),visible=new Set([...dom.querySelectorAll('[data-ref]')].map(el=>el.getAttribute('data-ref')));
  for(const [id,t]of Object.entries(oldRaw.terms))assert.deepEqual(raw.terms[id],t,'Old section canonical changed');
  for(const it of oldCards){assert(cards.some(c=>c.key===it.key&&c.title===it.title&&c.block===it.block));const state={[it.key]:{due:1,textKey:oldCtx.textKeys.get(it.block),sentenceId:it.block,status:'l2',stability:12}},snapshot=JSON.stringify(state);assert.equal(T.globalDueItems(state,bank,[],100,999).due,1);assert.equal(JSON.stringify(state),snapshot);report.old_due_state_preserved++;}
  for(const it of cards){
   const a=accepted.get(it.termId);if(!a){report.baseline_targets++;continue;}
   assert.equal(a.sid,raw.id);assert(a.source_refs.map(r=>r.replace(/^a97001:/,'a97001rc32:')).includes(it.block));assert.equal(it.title,a.canonical_fields.niqqud);assert.equal(it.translit,a.canonical_fields.translit);assert.equal(it.translit_ru,a.canonical_fields.translit_ru);assert.equal(it.ru,a.canonical_fields.ru);
   const state={[it.key]:{due:1,textKey:ctx.textKeys.get(it.block),sentenceId:it.block}},snapshot=JSON.stringify(state),due=T.globalDueItems(state,bank,[],100,999);assert.equal(due.due,1);assert.equal(due.items[0].title,it.title);assert.equal(due.items[0].block,it.block);assert.equal(JSON.stringify(state),snapshot);report.global_due++;
   const withoutSource=T.globalDueItems({[it.key]:{due:1}},bank,[],100,999);assert.equal(withoutSource.due,1,'A loose/ref-free saved grade must restore the approved term place');assert.equal(withoutSource.items[0].block,it.block);
   const bad={[it.key]:{due:1,textKey:'atlas-block-v1:a97001rc32:s99-wrong:fixture',sentenceId:it.block}},hostile={terms:{[it.termId]:{...bank.terms[it.termId],occurrences:undefined}}};assert.equal(T.globalDueItems(bad,hostile,[],100,999).due,0);report.wrong_scope++;
   assert(visible.has(it.block),'No visible native source '+it.block);report.visible_sources++;
   const doc=search.docs.find(d=>d[0]==='term'&&d[1]===a.sid&&a.source_refs.includes(d[3])&&d[4]===a.canonical_fields.lemma_he);assert(doc,'Missing scoped glossary result '+it.termId);report.search_docs++;
   items.push({...it,sid:raw.id,page:Number(/:p(\d+):/.exec(it.block)[1])});report.new_targets++;
  }
 }
 for(const r of all){const id=r.term_id.replace(/^a97001:/,'a97001rc32:');if(accepted.has(id))continue;const key=T.termKey('a97001rc32',id,r.sense),state={[key]:{due:1,textKey:'atlas-block-v1:a97001rc32:'+r.section_id+':fixture',sentenceId:r.source_refs[0].replace(/^a97001:/,'a97001rc32:')}},snapshot=JSON.stringify(state);assert.equal(T.globalDueItems(state,bank,[],100,999).due,0);assert.equal(JSON.stringify(state),snapshot);report.held++;}
 const corrections=read(path.join(pkg,'term-enrichment-round3/source-reading-correction-diff.json')).records;
 for(const line of fs.readFileSync(path.join(pkg,'inspection/canonical-native-records.jsonl'),'utf8').trim().split('\n')){
  const r=JSON.parse(line),section=sections.find(s=>s.id===r.sid);let node=section.pages.find(p=>p.page===r.page);for(const p of r.location.split('/'))node=Array.isArray(node)?node[Number(p)]:node[p];assert.equal(node.id,r.record.id);
  for(const field of ['he','source_he','source_fields','formula','latex','training_eligible']){assert.deepEqual(node[field],r.record[field],r.record.id+':'+field);report.source_fields_compared++;}
  for(const field of ['lexical','source_find'])assert.deepEqual(node.learning_eligibility?.[field],r.record.learning_eligibility?.[field],'Source eligibility broadened '+r.record.id);
  const correction=corrections.find(c=>c.source_ref===r.record.id);for(const field of ['he_niqqud','translit','translit_ru'])assert.equal(node[field],correction?.changes[field]?.after??r.record[field],'Unreviewed reading '+r.record.id);
  report.source_records_compared++;
 }
 assert.equal(report.new_targets,222);assert.equal(report.baseline_targets,33);assert.equal(report.lexical_rows,78);assert.equal(report.held,48);assert.equal(report.old_due_state_preserved,33);assert.equal(report.source_records_compared,6255);
 const p203=items.find(it=>it.termId==='a97001rc32:term:short-alumina-fiber');assert(p203&&p203.studyNote.includes('визуально'));assert(p203.studyNote.includes('не разрешены'));
 // Old and new context pins are deliberately incompatible, even for the same corpus.
 const oldPrepared=await prepare(old,path.resolve(__dirname,'../../atlas-context/a97001rc32',E.nativeReleaseFor('cea369d48494fcf58e78e0567fb82477abe7bb21ba02112707c3d7ba31fc4fd7').contextPin));
 const L=require('../../public/js/atlas-context-rc32-loader'),C=require('../../public/js/atlas-context-contract'),A=require('../../public/js/atlas-context-addressed');
 const stale=L.create({contextPin:oldPrepared.release.contextPin,sourceBinding:E.rc32SourceBinding,contract:C,ai:AI,addressed:A,fetch:async url=>new Response(fs.readFileSync(path.resolve(__dirname,'../../atlas-context/a97001rc32',oldPrepared.release.contextPin,url.split('/').pop())))});await assert.rejects(stale.load('s00-front',prepared.sections[0].rows),/SOURCE/);
 report.sections=prepared.sections.map(s=>({id:s.id,context_rows:s.loaded.checked.accepted,missing:s.loaded.checked.missing.length}));report.status='passed';report.production_changed=false;report.learner_state_mutated=false;report.items=items;
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,items:report.items.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
