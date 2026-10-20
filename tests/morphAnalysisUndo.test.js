'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Host=require('../public/js/morph-host'),RM=require('../public/js/reader-morph');
const Core=require('../public/js/lexical-resolution-core'),Service=require('../public/js/lexical-resolution-service'),Scan=require('../public/js/text-key-scan');

test('classification-only name and undo preserve old events, restore prior reading and reject a stale undo',async()=>{
 const priorWindow=global.window,priorRM=global.ReaderMorph;
 const candidate={pealim_id:'867',lemma:'להיוותר',lp_pos:'verb',meaning_ru:'оставаться',root:'יתר',binyan:'nifal'};
 const row={id:'s',text_id:'t',text_key:'key',order_index:0,he_plain:'נותר',he_niqqud:'נוֹתַר'};
 const occ={text_id:'t',sentence_id:'s',word_offset:0,surface:'נותר',sentence_he:row.he_plain,sentence_he_niqqud:row.he_niqqud};
 const events=[];
 const db={dbQuery:async()=>[row],appendLexicalResolutionEvent:async e=>events.push(Core.normalizeEvent(e)),listLexicalResolutionEventsForOccurrence:async()=>events.slice()};
 global.window={ReaderMorph:{...RM,ensureEngine:async()=>({}),analysisCandidates:()=>[candidate]},LexicalResolutionCore:Core,LexicalResolutionService:Service,TextKeyScan:Scan};
 global.ReaderMorph=global.window.ReaderMorph;
 try{
  const host=Host.createHost({ldb:async()=>db});
  const name=await host.confirmOccurrenceAnalysis(occ,{name:true});
  assert.equal(name.analysis.meaning_ru,'');assert.equal(name.analysis.lp_pos,'propernoun');
  const undone=await host.confirmOccurrenceAnalysis(occ,{undo:name.event_id});
  assert.equal(undone.state,'unresolved');assert.equal(events[1].action,'clear');
  await assert.rejects(host.confirmOccurrenceAnalysis(occ,{undo:name.event_id}),/LEXICAL_DECISION_CHANGED/);
  const word=await host.confirmOccurrenceAnalysis(occ,{pealim_id:'867'});
  const original=JSON.stringify(events);
  const name2=await host.confirmOccurrenceAnalysis(occ,{name:true});
  const restored=await host.confirmOccurrenceAnalysis(occ,{undo:name2.event_id});
  assert.deepEqual(restored.analysis,word.analysis);assert.equal(restored.state,'resolved');
  assert.equal(JSON.stringify(events.slice(0,3)),original);
  assert.equal(events.at(-1).supersedes_id,name2.event_id);
  await assert.rejects(host.confirmOccurrenceAnalysis(occ,{name:true},{isCurrent:()=>false}),/LEXICAL_SOURCE_CHANGED/);
  assert.equal(events.length,5);
  // Closing/switching while an awaited anchor is computed must still abort before append.
  let current=true;
  const anchorCore={...Core,sourceAnchor:async exact=>{const anchor=await Core.sourceAnchor(exact);current=false;return anchor;}};
  global.window.LexicalResolutionCore=anchorCore;
  await assert.rejects(host.confirmOccurrenceAnalysis(occ,{name:true},{isCurrent:()=>current}),/LEXICAL_SOURCE_CHANGED/);
  assert.equal(events.length,5);
 }finally{global.window=priorWindow;global.ReaderMorph=priorRM;}
});
