'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function adapter(fetchImpl) {
  const window = { fetch: fetchImpl };
  vm.runInNewContext(fs.readFileSync('public/js/corpus-discovery-browser.js', 'utf8'), { window, TextDecoder, Uint8Array, DOMException });
  return window.CorpusDiscoveryBrowser;
}
const card = { id: '1', file: 'works/1.json' };
test('preview stops at declared byte budget before reading the body', async () => {
  let canceled = 0, read = 0;
  const api = adapter(async () => ({ ok: true, headers: { get: () => '131073' }, body: { cancel: async () => canceled++, getReader: () => { read++; } } }));
  await assert.rejects(api.loadRows(card), /budget/); assert.equal(canceled, 1); assert.equal(read, 0);
});
test('preview cancels an unbounded chunked response at the byte limit', async () => {
  let canceled = 0, reads = 0, released = 0;
  const api = adapter(async () => ({ ok: true, headers: { get: () => null }, body: { getReader: () => ({ read: async () => { reads++; return { done: false, value: new Uint8Array(70000) }; }, cancel: async () => canceled++, releaseLock: () => released++ }) } }));
  await assert.rejects(api.loadRows(card), /budget/); assert.equal(canceled, 1); assert.equal(reads, 2); assert.equal(released, 1);
});
test('preview flattens parts, caches successful bounded bodies and retries failures', async () => {
  let calls = 0;
  const api = adapter(async () => { calls++; if (calls === 1) return { ok: false }; return new Response(JSON.stringify({ library: { texts: [{ rows: [{ hebrew_plain: 'א' }] }, { rows: [{ hebrew_plain: 'ב' }] }] } })); });
  await assert.rejects(api.loadRows(card)); const rows = await api.loadRows(card); assert.equal(rows.length, 2); await api.loadRows(card); assert.equal(calls, 2);
});
test('preview rejects unsafe paths and passes cancel/referrer policy to fetch', async () => {
  let options, url;
  const api = adapter(async (path, opts) => { url = path; options = opts; return new Response('{"library":{"texts":[]}}'); });
  await assert.rejects(api.loadRows({ file: '../secret' }), /path/);
  const signal = new AbortController().signal; await api.loadRows(card, { signal }); assert.equal(options.signal, signal); assert.equal(options.referrerPolicy, 'no-referrer');
  assert.equal(options.headers.Range, 'bytes=0-131071'); assert.equal(options.cache, 'no-store'); assert.match(url, /preview=bounded-v1/);
});
test('preview rejects a partial range whose complete work exceeds the budget', async () => {
  const api = adapter(async () => new Response('partial', { status: 206, headers: { 'Content-Range': 'bytes 0-131071/1048576' } }));
  await assert.rejects(api.loadRows(card), /budget/);
});
test('automatic recents are tab-local; explicit saved searches and legacy recents remain intact', () => {
  const source = fs.readFileSync('public/js/library-ui.js', 'utf8');
  const memory = () => { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key,value) => data.set(key,String(value)), removeItem: key => data.delete(key) }; };
  const localStorage = memory(), sessionStorage = memory();
  localStorage.setItem('corpus_recent_searches_v1', '["legacy"]'); localStorage.setItem('corpus_saved_searches_v1', '["explicit"]');
  const functions = ['getRecentSearches', 'pushRecentSearch', 'clearRecentSearches'].map(name => source.match(new RegExp('function ' + name + '\\([^]*?(?=\\nfunction |\\n//)'))[0]).join('\n');
  const context = { localStorage, sessionStorage, RECENTS_KEY: 'corpus_recent_searches_v1' }; vm.createContext(context); vm.runInContext(functions, context);
  context.pushRecentSearch('private-needle'); assert.equal(context.getRecentSearches()[0], 'private-needle');
  assert.equal(localStorage.getItem('corpus_recent_searches_v1'), '["legacy"]'); assert.equal(localStorage.getItem('corpus_saved_searches_v1'), '["explicit"]');
  context.clearRecentSearches(); assert.equal(context.getRecentSearches().length, 0); assert.equal(localStorage.getItem('corpus_recent_searches_v1'), '["legacy"]');
});
test('unpublished copy does not promise delivery dates or offline original text in any locale', () => {
  for (const locale of ['ru','en','he']) {
    const source = fs.readFileSync('public/i18n/locales/' + locale + '.js', 'utf8');
    const copy = source.match(/laterRoadmap: "([^"]+)"/)[1];
    assert.doesNotMatch(copy, /скоро|читается офлайн|on the way|reads offline|בקרוב|וזמין לקריאה/);
    assert.ok(/не подтверждено|not confirmed|לא אומתה/.test(copy));
  }
  assert.doesNotMatch(fs.readFileSync('public/js/library-ui.js','utf8'), /скоро дойдут|Оригинал уже в каталоге и читается офлайн/);
});
test('published corpus release guard preserves manifests, IDs and curated archives', () => {
  assert.equal(require('../scripts/premium/room-discovery-corpus-guard').check().result, 'unchanged');
});
