'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../public/js/mediatheque-core');
const E=require('../public/js/mediatheque-editorial-core');
const seed=require('../public/data/mediatheque/editorial-seed-v1.json');
const ref={kind:'public',slug:'video-library',workId:'episode_1',snapshotHash:'a'.repeat(64)};
test('editorial seed is additive, repeatable, and never fabricates public materials',()=>{
  const d=E.applySeed(C.empty(),seed,[]);
  assert.equal(d.categories.length,11); assert.equal(d.collections.length,22);
  assert.equal(d.references.length,0);
  assert.deepEqual(E.applySeed(d,seed,[]),d);
  const linked=E.applySeed(d,seed,[{ref,videoId:'sYd4zgR7f6w',available:true}]);
  assert.equal(linked.references.length,1);
  const series=linked.collections.find(c=>c.title==='אויבים · עונה 5');
  assert.deepEqual(series.items,[C.refKey(ref)]);
  const p=C.prepare(linked,[{ref,title:'Episode',available:true}]);
  assert.equal(C.query(linked,p,{category:series.categoryId}).length,1);
  assert.equal(C.query(linked,p,{uncategorized:true}).length,0);
});
test('collection association follows category merge and removal without deleting material links',()=>{
  let d=E.applySeed(C.empty(),seed,[{ref,videoId:'sYd4zgR7f6w',available:true}]);
  const series=d.collections.find(c=>c.items.length);
  d=C.command(d,{type:'category.create',id:'other',title:'Other'});
  d=C.command(d,{type:'category.merge',id:series.categoryId,targetId:'other'});
  assert.equal(d.collections.find(c=>c.id===series.id).categoryId,'other');
  d=C.command(d,{type:'category.remove',id:'other',children:'subtree'});
  assert.equal(d.collections.find(c=>c.id===series.id).categoryId,null);
  assert.deepEqual(d.collections.find(c=>c.id===series.id).items,[C.refKey(ref)]);
  assert.equal(d.references.length,1);
});
test('invalid category links are rejected and old collection documents remain compatible',()=>{
  const d=C.command(C.empty(),{type:'collection.create',id:'series',title:'Series'});
  assert.deepEqual(C.validate(d),d);
  assert.throws(()=>C.command(d,{type:'collection.update',id:'series',title:'Series',categoryId:'missing'}),/PARENT_MISSING/);
});
