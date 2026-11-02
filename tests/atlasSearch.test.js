'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const S=require('../public/js/atlas-search.js');
test('notation equivalence and significant case',()=>{
 for(const x of ['σ_Lc','σLc','sigma_Lc','сигма Lc']) assert.equal(S.symbolKey(x),S.symbolKey('\\sigma_{Lc}'));
 assert.equal(S.symbolKey('d₁'),S.symbolKey('d1'));assert.notEqual(S.symbolKey('D'),S.symbolKey('d'));
 assert.equal(S.unitKey('Н·мм'),S.unitKey('N*mm'));assert.equal(S.unitKey('об/мин'),S.unitKey('rpm'));
});
test('Russian Snowball inflections',()=>{for(const w of ['пружинами','пружины','пружин']) assert.equal(S.stemRu(w),S.stemRu('пружина'));});
const sections=[{id:'s1',terms:{t:{lemma_he:'קפיץ',translit:'kfits',senses:[{ru:'пружина'}]}},pages:[{page:131,items:[{id:'b1',type:'block',he:'קפיץ',ru:'Пружина стальная',terms:['t#spring'],editor:'secretneedle'}]}]}];
test('shared normalization, proclitics, translit, exclusion and stable ranking',()=>{const ix=S.buildIndex(sections);for(const q of ['והקפיץ','בקפיץ','пружинами','kfits']) assert.ok(S.query(ix,q).some(r=>r.page===131),q);assert.equal(S.query(ix,'secretneedle').length,0);assert.deepEqual(S.query(ix,'пружина'),S.query(ix,'пружина'));});
test('quoted phrase preserves order',()=>{const ix=S.buildIndex(sections);assert.ok(S.query(ix,'"пружина стальная"').length);assert.equal(S.query(ix,'"стальная пружина"').length,0);});

test('packed index round trip preserves every posting and target',()=>{const a=S.buildIndex(sections),b=S.unpack(JSON.parse(JSON.stringify(S.pack(S.buildIndex(sections)))));assert.deepEqual(b.docs,a.docs.map(d=>d.concat(d.length===6?[null]:[])));assert.deepEqual(JSON.parse(JSON.stringify(b.post)),JSON.parse(JSON.stringify(a.post)));assert.deepEqual(S.query(b,'пружина'),S.query(a,'пружина'));});
