'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Budget = require('../public/js/local-cache-budget.js');

// Владелец, 2026-09-11: localStorage забит под потолок (10 239 КБ, 142 ключа), запись 120 КБ
// падает QuotaExceededError. Виноват кеш библиотеки: он писал по записи на КАЖДЫЙ открытый текст,
// никогда ничего не удалял и глотал ошибку. Кеш не имеет права голодом морить остальных писателей.
function fakeStorage(limitChars) {
  const map = new Map();
  const used = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i]; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    removeItem(k) { map.delete(k); },
    setItem(k, v) {
      const after = used() - (map.has(k) ? k.length + map.get(k).length : 0) + k.length + String(v).length;
      if (limitChars != null && after > limitChars) {
        const error = new Error('QuotaExceededError'); error.name = 'QuotaExceededError'; throw error;
      }
      map.set(k, String(v));
    },
    __used: used, __map: map,
  };
}
const P = 'cache:';
const put = (storage, key, chars, now) =>
  Budget.save(storage, { prefix: P, key: P + key, value: 'x'.repeat(chars), maxEntries: 3, maxChars: 1000, now });

test('a cache entry is written and readable like before', () => {
  const storage = fakeStorage(null);
  const result = put(storage, 'a', 100, 1);
  assert.equal(result.ok, true);
  assert.equal(storage.getItem(P + 'a').length, 100);
  assert.deepEqual(result.evicted, []);
});

test('the oldest entry leaves when the entry budget is full', () => {
  const storage = fakeStorage(null);
  put(storage, 'a', 100, 1); put(storage, 'b', 100, 2); put(storage, 'c', 100, 3);
  const result = put(storage, 'd', 100, 4);
  assert.equal(result.ok, true);
  assert.deepEqual(result.evicted, [P + 'a']);
  assert.equal(storage.getItem(P + 'a'), null);
  assert.equal(storage.getItem(P + 'd').length, 100);
});

test('entries leave oldest-first until the size budget fits', () => {
  const storage = fakeStorage(null);
  put(storage, 'a', 400, 1); put(storage, 'b', 300, 2);
  const result = put(storage, 'c', 500, 3);
  assert.equal(result.ok, true);
  assert.deepEqual(result.evicted, [P + 'a']);
  assert.equal(storage.getItem(P + 'b').length, 300);
});

test('rewriting the same key counts once, not twice', () => {
  const storage = fakeStorage(null);
  put(storage, 'a', 400, 1); put(storage, 'b', 400, 2);
  const result = put(storage, 'a', 500, 3);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.evicted, []);
  assert.equal(storage.getItem(P + 'a').length, 500);
  assert.equal(storage.getItem(P + 'b').length, 400);
});

test('an entry larger than the whole budget is refused, and the cache it cannot join survives', () => {
  const storage = fakeStorage(null);
  put(storage, 'a', 400, 1);
  const result = put(storage, 'huge', 2000, 2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ENTRY_TOO_LARGE');
  assert.equal(storage.getItem(P + 'a').length, 400, 'a refused write must not cost the entries already cached');
  assert.equal(storage.getItem(P + 'huge'), null);
});

test('a store filled by somebody else is survived by evicting our own entries, not theirs', () => {
  // Именно это и происходило у владельца: место занято, setItem падает — и кеш молча терял запись.
  const storage = fakeStorage(1000);
  storage.setItem('other:big', 'y'.repeat(600));
  put(storage, 'a', 100, 1);
  put(storage, 'b', 100, 2);
  const result = put(storage, 'c', 150, 3);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.evicted.length > 0, 'something of ours had to go');
  assert.equal(storage.getItem('other:big').length, 600, 'another writer’s data is never our eviction candidate');
  assert.equal(storage.getItem(P + 'c').length, 150);
});

test('when even an empty cache cannot fit the entry, the failure is named, not swallowed', () => {
  const storage = fakeStorage(300);
  storage.setItem('other:big', 'y'.repeat(250));
  const result = put(storage, 'a', 200, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'QUOTA_EXCEEDED');
});

test('prune brings an over-grown cache back inside its budget and reports what it freed', () => {
  // Лечение уже заболевшего браузера: 142 ключа накопились ДО появления бюджета.
  const storage = fakeStorage(null);
  for (let i = 0; i < 10; i++) storage.setItem(P + 'old' + i, 'z'.repeat(500));
  storage.setItem('other:keep', 'k'.repeat(100));
  const result = Budget.prune(storage, { prefix: P, maxEntries: 3, maxChars: 1000 });
  assert.equal(Budget.usage(storage, { prefix: P }).entries <= 3, true);
  assert.equal(Budget.usage(storage, { prefix: P }).chars <= 1000, true);
  assert.ok(result.freedChars >= 3500, 'freed size must be reported honestly: ' + result.freedChars);
  assert.equal(storage.getItem('other:keep').length, 100, 'prune touches only its own prefix');
});

test('entries of unknown age are dropped before entries we know are recent', () => {
  const storage = fakeStorage(null);
  put(storage, 'known', 300, 5);
  storage.setItem(P + 'orphan', 'z'.repeat(300));
  const result = put(storage, 'fresh', 400, 6);
  assert.equal(result.ok, true);
  assert.deepEqual(result.evicted, [P + 'orphan']);
  assert.equal(storage.getItem(P + 'known').length, 300);
});

test('the budget index never counts as a cached entry', () => {
  const storage = fakeStorage(null);
  put(storage, 'a', 100, 1);
  const usage = Budget.usage(storage, { prefix: P });
  assert.equal(usage.entries, 1, 'the index is bookkeeping, not content');
  assert.ok(usage.chars >= 100);
});

test('a corrupt index does not lose the cache, and the next write repairs it', () => {
  const storage = fakeStorage(null);
  put(storage, 'a', 100, 1);
  storage.setItem(Budget.indexKey(P), '{not json');
  assert.equal(storage.getItem(P + 'a').length, 100);
  const result = put(storage, 'b', 100, 2);
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(storage.getItem(Budget.indexKey(P))).entries.some((e) => e.k === P + 'b'), true);
});
