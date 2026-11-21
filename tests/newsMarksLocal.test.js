'use strict';
// Marks of a visitor without an account live in the browser (findability spec §8а п.1).
const test = require('node:test'), assert = require('node:assert/strict');
const ML = require('../public/js/news-marks-local');
const memory = () => { const m = new Map(); return { load: async () => [...m.values()], put: async r => { m.set(r.item_key, r); }, del: async k => { m.delete(k); }, m }; };

test('local marks: toggle, tags with counts, keys by tag, reads', async () => {
  const backend = memory(), s = await ML.open({ backend });
  assert.equal(s.ok, true);
  await s.toggle('na_1', '★'); await s.toggle('na_1', 'выборы'); await s.toggle('na_2', 'выборы');
  assert.deepEqual(s.marks('na_1'), ['★', 'выборы']);
  assert.deepEqual(s.tags(), [{ tag: 'выборы', n: 2 }, { tag: '★', n: 1 }]);
  assert.deepEqual(s.keysWith('выборы').sort(), ['na_1', 'na_2']);
  await s.toggle('na_1', '★');
  assert.deepEqual(s.marks('na_1'), ['выборы']);
  await s.read('na_2'); assert.equal(s.isRead('na_2'), true);
  const again = await ML.open({ backend });
  assert.deepEqual(again.marks('na_1'), ['выборы'], 'kept across visits');
});
test('local marks: blocked storage → ok:false, every call harmless', async () => {
  const s = await ML.open({ backend: { load: async () => { throw new Error('SecurityError'); } } });
  assert.equal(s.ok, false);
  assert.deepEqual(s.marks('na_1'), []); assert.deepEqual(await s.toggle('na_1', '★'), []); assert.deepEqual(s.tags(), []);
  const none = await ML.open({});
  assert.equal(none.ok, false, 'no IndexedDB at all (Node) is the same as blocked');
});
