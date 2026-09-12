'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mediatheque-core');

test('change preview distinguishes identity, membership, order and editorial fields without mutation', () => {
  let before = C.command(C.empty(), { type:'category.create', id:'science', title:'Наука' });
  before = C.command(before, { type:'items.add', target:'category', id:'science', references:[{kind:'personal',textKey:'a'},{kind:'personal',textKey:'b'}] });
  const snapshot = JSON.stringify(before), after = JSON.parse(snapshot);
  after.categories[0].title = 'Наука и технологии';
  after.categories[0].items.reverse();
  after.home.description = 'Для ежедневного чтения';
  const changes = C.structureChanges(before, after);
  const category = changes.find(c => c.type === 'categories');
  assert.equal(category.id, 'science');
  assert.deepEqual(category.fields, ['title']);
  assert.deepEqual(category.added, []);
  assert.deepEqual(category.removed, []);
  assert.equal(category.reordered, true);
  assert.deepEqual(changes.find(c => c.type === 'home').fields, ['description']);
  assert.equal(JSON.stringify(before), snapshot);
  assert.deepEqual(C.structureChanges(before, JSON.parse(snapshot)), []);
});

test('restore preview includes removed entities and unfiled references; additions do not imply reorder', () => {
  let before = C.command(C.empty(), {type:'category.create',id:'old',title:'Old'});
  before = C.command(before, {type:'reference.save',references:[{kind:'personal',textKey:'a'}]});
  const changes = C.structureChanges(before, C.empty());
  assert.ok(changes.some(c => c.type === 'categories' && c.kind === 'removed' && c.title === 'Old'));
  assert.ok(changes.some(c => c.type === 'references' && c.removed.includes('my/a')));
  const after = C.command(before, {type:'category.create',id:'new',title:'New'});
  assert.equal(C.structureChanges(before, after).some(c => c.kind === 'order'), false);
});

test('duration summary reports partial metadata and ignores unavailable materials', () => {
  assert.deepEqual(C.durationSummary([{durationSeconds:120},{durationSeconds:null},{durationSeconds:999,available:false}]),
    {seconds:120,known:1,unknown:1,unavailable:1,total:3});
  assert.deepEqual(C.durationSummary([{durationSeconds:NaN},{durationSeconds:Infinity},{durationSeconds:-1}]),
    {seconds:0,known:0,unknown:3,unavailable:0,total:3});
});

test('saved view comparison normalizes defaults and tag order but detects changed scope', () => {
  assert.equal(C.sameFilters({tags:['a','b']}, {tags:['b','a']}), true);
  assert.equal(C.sameFilters({}, C.filters()), true);
  assert.equal(C.sameFilters({category:'a'}, {category:'b'}), false);
});
