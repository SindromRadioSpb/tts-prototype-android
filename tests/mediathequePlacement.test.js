'use strict';
// «Разложить» из «Видео дня» (spec docs/superpowers/specs/2026-11-28-mediatheque-daily-sorting-design.md): pure placement.
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../public/js/mediatheque-core');
const P = require('../public/js/mediatheque-placement');

const ref = n => ({ kind: 'public', slug: 'media-0123456789abcdef0123', workId: 'w' + n, snapshotHash: String(n).repeat(64) });
const O = { publicOnly: true };
function base() {
  let s = C.empty();
  s = C.command(s, { type: 'category.create', id: P.DAILY_ID, title: 'Видео дня' }, O);
  s = C.command(s, { type: 'category.create', id: 'c14', title: 'C14' }, O);
  s = C.command(s, { type: 'category.create', id: 'kan', title: 'כאן 11' }, O);
  s = C.command(s, { type: 'collection.create', id: 'intv', title: 'Интервью разные', categoryId: 'c14' }, O);
  s = C.command(s, { type: 'collection.create', id: 'loose', title: 'Без темы' }, O);
  for (const n of [1, 2, 3]) s = C.command(s, { type: 'items.add', target: 'category', id: P.DAILY_ID, references: [ref(n)] }, O);
  return s;
}
const k = n => C.refKey(ref(n));
const items = (s, type, id) => (type === 'category' ? s.categories : s.collections).find(x => x.id === id).items;

test('constants name the two inbox categories', () => {
  assert.equal(P.DAILY_ID, 'm_daily_video');
  assert.deepEqual(P.UNSORTED, { id: 'm_unsorted_video', title: 'Нераспределённые' });
  assert.deepEqual(P.INBOX_IDS, ['m_daily_video', 'm_unsorted_video']);
});
test('placesOf and placeLabel ignore «Видео дня» and «Нераспределённые»', () => {
  let s = base();
  assert.deepEqual(P.placesOf(s, k(1)), []); assert.equal(P.placeLabel(s, k(1)), '');
  s = P.place(s, ref(1), { places: [{ type: 'category', id: 'c14' }, { type: 'collection', id: 'intv' }] }, C, O);
  assert.deepEqual(P.placesOf(s, k(1)).map(p => p.type + ':' + p.id), ['category:c14', 'collection:intv']);
  assert.equal(P.placeLabel(s, k(1)), 'C14 / Интервью разные');
});
test('place adds, removes unchecked places, keeps «Видео дня»', () => {
  let s = P.place(base(), ref(1), { places: [{ type: 'category', id: 'c14' }, { type: 'collection', id: 'intv' }] }, C, O);
  s = P.place(s, ref(1), { places: [{ type: 'category', id: 'kan' }] }, C, O);
  assert.deepEqual(items(s, 'category', 'c14'), []); assert.deepEqual(items(s, 'collection', 'intv'), []);
  assert.deepEqual(items(s, 'category', 'kan'), [k(1)]);
  assert.ok(items(s, 'category', P.DAILY_ID).includes(k(1)));
  s = P.place(s, ref(1), { places: [] }, C, O);
  assert.deepEqual(P.placesOf(s, k(1)), []); assert.ok(items(s, 'category', P.DAILY_ID).includes(k(1)), 'clearing all keeps it in «Видео дня»');
});
test('place creates a topic and a collection inside it by temporary ids', () => {
  const ids = { t1: 'm_new_topic', t2: 'm_new_coll' };
  const s = P.place(base(), ref(2), { places: [{ type: 'category', id: 't1' }, { type: 'collection', id: 't2' }],
    create: [{ tempId: 't1', type: 'category', title: 'Хеврон' }, { tempId: 't2', type: 'collection', title: 'Репортажи', categoryId: 't1' }] },
  C, { ...O, newId: t => ids[t] });
  assert.equal(s.categories.find(c => c.id === 'm_new_topic').title, 'Хеврон');
  const coll = s.collections.find(c => c.id === 'm_new_coll');
  assert.equal(coll.categoryId, 'm_new_topic'); assert.deepEqual(coll.items, [k(2)]);
  assert.equal(P.placeLabel(s, k(2)), 'Хеврон / Репортажи', 'a topic shown by its collection is not repeated');
  const two = P.place(s, ref(2), { places: [{ type: 'category', id: 'kan' }, { type: 'collection', id: 'm_new_coll' }] }, C, O);
  assert.equal(P.placeLabel(two, k(2)), 'כאן 11, Хеврон / Репортажи', 'separate places are joined by commas');
});
test('a placed video leaves «Нераспределённые»; an unplaced one stays there', () => {
  let s = C.command(base(), { type: 'category.create', id: P.UNSORTED.id, title: P.UNSORTED.title }, O);
  s = C.command(s, { type: 'items.add', target: 'category', id: P.UNSORTED.id, references: [ref(3)] }, O);
  assert.deepEqual(items(P.place(s, ref(3), { places: [] }, C, O), 'category', P.UNSORTED.id), [k(3)]);
  assert.deepEqual(items(P.place(s, ref(3), { places: [{ type: 'collection', id: 'loose' }] }, C, O), 'category', P.UNSORTED.id), []);
});
test('an unknown place throws, or is skipped when asked (the draft lacks it)', () => {
  assert.throws(() => P.place(base(), ref(1), { places: [{ type: 'collection', id: 'gone' }] }, C, O), /MEDIATHEQUE_PLACE_UNKNOWN/);
  assert.throws(() => P.place(base(), ref(1), { places: [{ type: 'category', id: P.DAILY_ID }] }, C, O), /MEDIATHEQUE_PLACE_UNKNOWN/, 'the inbox is not a place');
  const s = P.place(base(), ref(1), { places: [{ type: 'collection', id: 'gone' }, { type: 'category', id: 'c14' }] }, C, { ...O, skipUnknown: true });
  assert.deepEqual(items(s, 'category', 'c14'), [k(1)]);
});
test('sweep: fresh stays, old unplaced → «Нераспределённые», old placed just leaves «Видео дня»', () => {
  const day = 86400000, now = Date.parse('2026-11-28T12:00:00Z');
  let s = P.place(base(), ref(2), { places: [{ type: 'category', id: 'c14' }] }, C, O);
  const seen = new Map([[k(1), now - 6 * day], [k(2), now - 6 * day], [k(3), now - 4 * day]]);
  const r = P.sweep(s, seen, now, C);
  assert.deepEqual(r.expired.sort(), [k(1), k(2)].sort()); assert.deepEqual(r.unsorted, [k(1)]);
  assert.deepEqual(items(r.structure, 'category', P.DAILY_ID), [k(3)]);
  assert.deepEqual(items(r.structure, 'category', P.UNSORTED.id), [k(1)]);
  assert.equal(r.structure.categories.find(c => c.id === P.UNSORTED.id).title, 'Нераспределённые');
  assert.deepEqual(items(r.structure, 'category', 'c14'), [k(2)]);
  const quiet = P.sweep(s, new Map([[k(1), now]]), now, C);
  assert.deepEqual(quiet.expired, []); assert.equal(quiet.structure, s, 'nothing to do returns the same structure');
});
