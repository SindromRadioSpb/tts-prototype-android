'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,keys}=require('../public/js/studio-session.js');
const storage=initial=>{const map=new Map(Object.entries(initial||{}));return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
test('A to B then a fresh tab restores B, never the legacy A again',()=>{
  const local=storage({[keys.SESSION]:JSON.stringify({mode:'library',textId:'A'})});
  const first=create(local,storage());assert.equal(first.bootstrap().textId,'A');
  first.write({mode:'library',textId:'B'});first.remember('B');
  assert.equal(create(local,storage()).bootstrap().textId,'B');
  assert.equal(JSON.parse(local.getItem(keys.SESSION)).textId,'A','legacy bytes are preserved');
});
test('independent tab drafts survive pointer changes and migration',()=>{
  const local=storage(),a=create(local,storage()),b=create(local,storage());
  a.bootstrap();a.write({mode:'draft',baseTextId:'A',textId:null});b.bootstrap();b.write({mode:'draft',baseTextId:'B',textId:null});
  b.remember('C');assert.equal(a.bootstrap().baseTextId,'A');assert.equal(b.bootstrap().baseTextId,'B');
  assert.equal(create(local,storage()).bootstrap().textId,'C');
});
test('ordinary session writes and reload do not overwrite a later explicit selection in another tab',()=>{
  const local=storage(),a=create(local,storage()),b=create(local,storage());a.bootstrap();a.write({mode:'library',textId:'A'});a.remember('A');
  b.bootstrap();b.write({mode:'library',textId:'B'});b.remember('B');a.write({mode:'library',textId:'A'});a.bootstrap();
  assert.equal(create(local,storage()).bootstrap().textId,'B');
});
test('deleting the last pointer cannot revive the legacy session or discard another pointer',()=>{
  const local=storage({[keys.SESSION]:JSON.stringify({mode:'library',textId:'A'})});const session=create(local,storage());session.bootstrap();session.remember('B');session.forget('A');
  assert.equal(create(local,storage()).bootstrap().textId,'B');session.forget('B');assert.equal(create(local,storage()).bootstrap(),null);
});
test('unavailable persistence does not prevent reading a live tab session',()=>{
  const denied={getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}};
  const session=create(denied,storage());session.write({mode:'draft',baseTextId:'A'});assert.equal(session.bootstrap().baseTextId,'A');session.remember('B');
});
