'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mediatheque-core');
const my = { kind: 'personal', textKey: 'my-שלום' };
const pub = { kind: 'public', slug: 'kan', workId: 'pw_1', snapshotHash: 'a'.repeat(64) };
const myKey = C.refKey(my), pubKey = C.refKey(pub);
function tree() {
  let d = C.empty();
  for (const [id, title, parentId] of [['science', 'Наука', null], ['space', 'Космос', 'science'], ['history', 'История', null]])
    d = C.command(d, { type: 'category.create', id, title, parentId });
  d = C.command(d, { type: 'collection.create', id: 'kan', title: 'Интервью KAN' });
  return d;
}
test('one identity can appear in many categories and collections without copying content', () => {
  let d = tree();
  for (const id of ['space', 'history']) d = C.command(d, { type: 'items.add', target: 'category', id, references: [my, my] });
  d = C.command(d, { type: 'items.add', target: 'collection', id: 'kan', references: [my, pub] });
  assert.equal(d.references.length, 2);
  assert.deepEqual(d.categories.find(c => c.id === 'space').items, [myKey]);
  assert.deepEqual(d.saved, [pubKey]);
  assert.equal(JSON.stringify(d).includes('review_log'), false);
});
test('moving a subtree preserves IDs and membership, refuses cycles and missing parents atomically', () => {
  let d = C.command(tree(), { type: 'items.add', target: 'category', id: 'space', references: [my] });
  const before = JSON.stringify(d);
  assert.throws(() => C.command(d, { type: 'category.move', id: 'science', parentId: 'space' }), /CYCLE/);
  assert.throws(() => C.command(d, { type: 'category.move', id: 'science', parentId: 'missing' }), /PARENT_MISSING/);
  assert.equal(JSON.stringify(d), before);
  d = C.command(d, { type: 'category.move', id: 'science', parentId: 'history' });
  assert.deepEqual(C.categoryPath(d, 'space').map(c => c.id), ['history', 'science', 'space']);
  assert.deepEqual(d.categories.find(c => c.id === 'space').items, [myKey]);
});
test('rename preserves identifiers; delete can lift children and retains all referenced material', () => {
  let d = C.command(tree(), { type: 'items.add', target: 'category', id: 'space', references: [my] });
  d = C.command(d, { type: 'category.update', id: 'science', title: 'Научные темы' });
  assert.equal(C.categoryPath(d, 'space')[0].title, 'Научные темы');
  d = C.command(d, { type: 'category.remove', id: 'science', children: 'lift' });
  assert.equal(d.categories.find(c => c.id === 'space').parentId, null);
  d = C.command(d, { type: 'category.remove', id: 'space', children: 'subtree' });
  assert.deepEqual(d.references, [my]);
});
test('merge deduplicates links, reparents children and updates saved view without lost references', () => {
  let d = tree();
  for (const id of ['science', 'history']) d = C.command(d, { type: 'items.add', target: 'category', id, references: [my] });
  d = C.command(d, { type: 'view.save', id: 'view-a', title: 'Наука', filters: { category: 'science' } });
  d = C.command(d, { type: 'category.merge', id: 'science', targetId: 'history' });
  assert.deepEqual(d.categories.find(c => c.id === 'history').items, [myKey]);
  assert.equal(d.categories.find(c => c.id === 'space').parentId, 'history');
  assert.equal(d.views[0].filters.category, 'history');
});
test('public document rejects private references and unexpected sensitive fields', () => {
  const d = C.command(tree(), { type: 'items.add', target: 'category', id: 'space', references: [my] });
  assert.throws(() => C.validate(d, { publicOnly: true }), /PRIVATE_REFERENCE/);
  assert.throws(() => C.validate({ ...C.empty(), review_log: [] }), /INVALID/);
  assert.throws(() => C.reference({ ...pub, token: 'secret' }), /INVALID/);
});
test('category search includes descendants; intersections, missing duration, Hebrew and tag filters are honest', () => {
  let d = C.command(tree(), { type: 'items.add', target: 'category', id: 'space', references: [my, pub] });
  const p = C.prepare(d, [
    { ref: my, title: 'שָׁלוֹם мир', source: 'KAN', kind: 'video', durationSeconds: 480, tags: ['интервью'], progress: 'not_started' },
    { ref: pub, title: 'Другое', source: 'KAN', kind: 'video', durationSeconds: null, tags: [], progress: 'not_started', progressKnown: false },
  ]);
  assert.equal(C.query(d, p, { category: 'science' }).length, 2);
  assert.deepEqual(C.query(d, p, { category: 'science', q: 'שלום', maxDuration: 600, tags: ['интервью'] }).map(i => i.key), [myKey]);
  assert.equal(C.query(d, p, { progress: 'not_started' }).length, 1);
  assert.equal(C.query(d, p, { category: 'missing' }).length, 0);
  assert.equal(C.query(d, p, { collection: 'missing' }).length, 0);
  assert.equal(C.navigationMatches(d, 'Наука Космос')[0].id, 'space');
});
test('manual order is retained when switching to another sort; saved views retain all visible choices', () => {
  let d = C.command(tree(), { type: 'items.add', target: 'collection', id: 'kan', references: [pub, my] });
  const p = C.prepare(d, [{ ref: my, title: 'А', kind: 'text' }, { ref: pub, title: 'Я', kind: 'video' }]);
  assert.deepEqual(C.query(d, p, { collection: 'kan', sort: 'title' }).map(i => i.key), [myKey, pubKey]);
  assert.deepEqual(C.query(d, p, { collection: 'kan' }).map(i => i.key), [pubKey, myKey]);
  d = C.command(d, { type: 'view.save', id: 'v1', title: 'Видео', filters: { collection: 'kan', kind: 'video', layout: 'list', sort: 'added_desc' } });
  assert.equal(C.query(d, p, d.views[0].filters)[0].key, pubKey);
  assert.equal(d.views[0].filters.layout, 'list');
});
test('export/import preserves structure exactly, refuses malformed references and unsupported versions', () => {
  const d = C.command(tree(), { type: 'reference.save', references: [pub] });
  assert.deepEqual(C.importStructure(JSON.parse(JSON.stringify(C.exportStructure(d)))), d);
  assert.throws(() => C.importStructure({ schema: 'v0', exportedAt: '', structure: d }), /INVALID/);
  assert.throws(() => C.validate({ ...d, references: [] }), /REFERENCE_MISSING/);
});
test('10,000 material search remains deterministic and category descendants are deduplicated', () => {
  const items = Array.from({ length: 10000 }, (_, n) => ({ ref: { kind: 'personal', textKey: 't' + n }, title: 'Материал ' + n, source: n % 2 ? 'KAN' : 'Other', kind: 'video' }));
  let d = tree();
  d = C.command(d, { type: 'items.add', target: 'category', id: 'science', references: items.slice(0, 500).map(i => i.ref) });
  d = C.command(d, { type: 'items.add', target: 'category', id: 'space', references: items.slice(250, 750).map(i => i.ref) });
  const p = C.prepare(d, items);
  assert.equal(C.query(d, p, { category: 'science' }).length, 750);
  assert.equal(C.query(d, p, { source: 'KAN' }).length, 5000);
});
test('hidden personal materials leave every placement, survive export/import and never enter public structure', () => {
  let d = C.command(tree(), { type: 'items.add', target: 'category', id: 'science', references: [my] });
  d = C.command(d, { type: 'home.update', title: '', description: '', reference: my, sections: C.SECTIONS.slice() });
  d = C.command(d, { type: 'items.hide', keys: [myKey] });
  assert.deepEqual(d.hidden, [myKey]);
  assert.equal(d.categories.find(c => c.id === 'science').items.includes(myKey), false);
  assert.equal(d.home.featured, null);
  const round = C.importStructure(JSON.parse(JSON.stringify(C.exportStructure(d))));
  assert.deepEqual(round.hidden, [myKey]);
  d = C.command(d, { type: 'items.unhide', keys: [myKey] });
  assert.equal('hidden' in d, false);
  assert.throws(() => C.command(C.empty(), { type: 'items.hide', keys: [myKey] }, { publicOnly: true }));
  assert.throws(() => C.validate({ ...C.empty(), hidden: [myKey] }, { publicOnly: true }), /MEDIATHEQUE_PRIVATE_REFERENCE/);
  assert.throws(() => C.command(C.empty(), { type: 'items.hide', keys: [pubKey] }));
  assert.deepEqual(C.validate(C.empty()), C.empty());
  assert.equal(C.filters().hidden, false);
});
test('public references follow the current version of the same work and collapse duplicates', () => {
  const old = pub, next = { ...pub, snapshotHash: 'b'.repeat(64) }, gone = { ...pub, workId: 'pw_gone' };
  let d = C.command(tree(), { type: 'items.add', target: 'category', id: 'science', references: [old, gone] }, { publicOnly: true });
  d = C.command(d, { type: 'items.add', target: 'collection', id: 'kan', references: [old, next] }, { publicOnly: true });
  d = C.command(d, { type: 'annotation.set', references: [old], tags: ['a'] }, { publicOnly: true });
  const out = C.followCurrent(d, [next, gone], { publicOnly: true });
  const nextKey = C.refKey(next);
  assert.deepEqual(out.categories.find(c => c.id === 'science').items, [nextKey, C.refKey(gone)]);
  assert.deepEqual(out.collections.find(c => c.id === 'kan').items, [nextKey]);
  assert.deepEqual(out.annotations.map(a => a.key), [nextKey]);
  assert.equal(out.references.filter(r => r.workId === 'pw_1').length, 1);
  assert.deepEqual(C.followCurrent(d, [], { publicOnly: true }), d);
});
