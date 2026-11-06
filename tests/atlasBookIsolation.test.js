'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function host() {
  const source = fs.readFileSync(path.join(__dirname,'../public/js/library-ui.js'),'utf8');
  const values = new Map();
  const ctx = vm.createContext({localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
    window:{AtlasTrain:require('../public/js/atlas-train.js')}});
  vm.runInContext(source.slice(source.indexOf('const ATLAS_STAGE_KEY'),source.indexOf('function paintAtlasWords()')),ctx);
  return {ctx,values};
}
test('a second atlas does not overwrite legacy stages for a same-named section',()=>{
  const {ctx,values}=host();
  values.set('room.atlas.stage.v1',JSON.stringify({s01:2}));
  ctx.atlasStageSet('s01',1,'a97001');
  assert.equal(ctx.atlasStageOf('s01','a97002'),2);
  assert.equal(ctx.atlasStageOf('s01','a97001'),1);
  ctx.atlasStageSet('s01',0,'a97001');
  assert.equal(ctx.atlasStageOf('s01','a97002'),2);
});
test('editing personal terms preserves the other book and excludes foreign imports',()=>{
  const {ctx,values}=host();
  const old={id:'a97002:term:my-old',personal:true,lemma_he:'ישן'};
  const mine={id:'a97001:term:my-new',personal:true,lemma_he:'חדש'};
  values.set('room.atlas.myTerms.v1',JSON.stringify([old]));
  assert.equal(ctx.atlasMyTermsSave([mine,old],'a97001'),true);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.atlasMyTerms('a97002'))),[old]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.atlasMyTerms('a97001'))),[mine]);
  ctx.atlasMyTermsSave([],'a97001');
  assert.deepEqual(JSON.parse(values.get('room.atlas.myTerms.v1')),[old]);
});
