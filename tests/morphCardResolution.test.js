'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const R=require('../public/js/reader-morph'),NA=require('../public/js/notes-autogen');
const ds=JSON.parse(zlib.gunzipSync(fs.readFileSync(require('node:path').join(__dirname,'../public/data/inflection/pealim-infl-v12.json.gz'))));
const eng={NA,maps:NA.buildResolverMaps(ds.paradigms),pidMap:new Map(ds.paradigms.map(p=>[String(p.pealim_id),p])),lookup:(k,b)=>ds.paradigms[ds.index[k+' '+(b||'')]]};
for(const form of ['יוֹפִי','יֹפִי'])test(form+' retains both real lexical entries, including the adverb without cells',async()=>{
 const c=await R.resolveCore(eng,'יופי',form);
 assert.deepEqual(c.analysisCandidates.map(x=>x.pealim_id).sort(),['5856','5857']);
 assert.equal(c.selectionRequired,true);assert.equal(c.ambiguous,true);
 assert.equal(c.analysisCandidates.find(x=>x.pealim_id==='5857').lp_pos,'adverb');
});
test('different vowels do not make every same-spelling entry applicable',()=>{
 const cs=R.analysisCandidates(eng,'ספר','סֵפֶר');
 assert.ok(cs.length>0);assert.ok(!cs.some(x=>x.lp_pos==='verb'&&/לספור/.test(x.lemma)));
});
test('shin and sin remain distinct candidate evidence',()=>{
 const cs=R.analysisCandidates(eng,'שר','שָׂר');
 assert.ok(cs.some(x=>x.lp_pos==='noun'));
 assert.ok(!cs.some(x=>x.lp_pos==='verb'&&x.meaning_ru==='петь'));
});
test('a human choice clears incompatible Dicta identity and keeps a distinct word key',()=>{
 const c=R.applyLexicalResolution({word:'יופי',label:'dicta',dictaKey:'dl:יפי#noun',pos:'noun',selectionRequired:true},
  {state:'resolved',actor_kind:'owner',event_id:'decision',analysis:{lemma:'יופי',lp_pos:'adverb',pealim_id:'5857',meaning_ru:'отлично! замечательно!'}});
 assert.equal(c.selectionRequired,false);assert.equal(c.dictaKey,'');
 assert.equal(R.statusKeyForCard(NA,c,'יוֹפִי','יופי'),'pid:5857');
});
test('a function link cannot borrow the id of a different part of speech',async()=>{
 const vm=require('node:vm'),win={};
 const data=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../public/data/inflection/pealim-function-links.v1.json')));
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/js/pealim-function-links.js'),'utf8'),{window:win,fetch:async()=>({ok:true,json:async()=>data})});
 await win.PealimFunctionLinks.ensureReady();
 assert.equal(win.PealimFunctionLinks.lookup('יופי','noun'),null);
 assert.equal(String(win.PealimFunctionLinks.lookup('יופי','adverb').id),'5857');
});
test('candidate confirmation is source-anchored, portable and invalidated by candidate changes',async()=>{
 const C=require('../public/js/lexical-resolution-core'),S=require('../public/js/lexical-resolution-service');
 const candidates=R.analysisCandidates(eng,'יופי','יוֹפִי');
 const occ={text_id:'t',sentence_id:'s',text_key:'key',word_offset:0,order_index:0,surface:'יופי',niqqud:'יוֹפִי',sentence_he:'יופי',sentence_he_niqqud:'יוֹפִי'};
 const ev={id:'choose',occurrence_id:'lpro:t:s:0',...occ,source_anchor:await C.sourceAnchor(occ),candidate_fingerprint:await C.candidateFingerprint({alternatives:candidates}),
  action:'confirm_candidate',actor_kind:'owner',created_at:'2026-10-20T00:00:00Z',chosen_analysis:candidates.find(x=>x.pealim_id==='5857')};
 assert.equal((await S.projectExactOccurrence(occ,[ev],C,candidates)).analysis.pealim_id,'5857');
 assert.equal(await S.projectExactOccurrence(occ,[ev],C),null);
 assert.equal((await S.projectExactOccurrence(occ,[ev],C,candidates.slice(0,1))).state,'stale');
 assert.equal((await S.projectExactOccurrence({...occ,sentence_he_niqqud:'יוֹפִי!'},[ev],C,candidates)).state,'stale');
 const imported=C.rebindPortableEvent(ev,{text_id:'new-t',sentence_id:'new-s'});
 assert.equal((await S.projectExactOccurrence({...occ,text_id:'new-t',sentence_id:'new-s'},[imported],C,candidates)).analysis.pealim_id,'5857');
 assert.equal(await S.projectExactOccurrence(occ,[ev,{...ev,id:'clear',created_at:'2026-10-20T01:00:00Z',action:'clear',chosen_analysis:{}}],C,candidates),null);
});
