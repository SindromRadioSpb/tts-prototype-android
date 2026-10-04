'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/library-ui.js'), 'utf8');
const toggle = source.slice(source.indexOf('async function toggleBookmark('), source.indexOf('// ============================================================================', source.indexOf('async function toggleBookmark(')));
function fixture(on = false) {
  const classes = new Set(on ? ['bookmarked'] : []), attrs = {};
  const btn = { disabled: false, textContent: on ? '★' : '☆', classList: { contains: k => classes.has(k), toggle(k, v) { if (v) classes.add(k); else classes.delete(k); } }, setAttribute(k,v) { attrs[k] = v; } };
  let resolve, reject, calls = [];
  const pending = new Promise((a,b) => { resolve = a; reject = b; });
  const box = { readerRows: [{ _v3_sentenceId: 's', he: 'שלום' }], readerTextId: 't', readerTextKey: 'tk', readerTextTitle: 'title', _bookmarkSet: new Set(on ? ['s'] : []), tt: (_,v) => v, roomToast: () => {}, localDb: { addBookmark: data => { calls.push(data); return pending; }, removeBookmark: (...args) => { calls.push(args); return pending; } } };
  vm.createContext(box); vm.runInContext(toggle, box);
  return { box, btn, attrs, calls, resolve, reject };
}
test('a slow bookmark write acknowledges the tap and suppresses duplicates', async () => {
  const f = fixture(), work = f.box.toggleBookmark(0, f.btn);
  assert.equal(f.btn.textContent, '★'); assert.equal(f.attrs['aria-busy'], 'true');
  await f.box.toggleBookmark(0, f.btn); assert.equal(f.calls.length, 1);
  // Navigating during the write must not add the old bookmark to the new material.
  const originalSet = f.box._bookmarkSet; f.box._bookmarkSet = new Set(); f.box.readerTextId = 'next';
  f.resolve(); await work;
  assert.ok(originalSet.has('s')); assert.equal(f.box._bookmarkSet.size, 0);
  assert.equal(f.calls[0].text_id, 't'); assert.equal(f.btn.disabled, false);
});
test('failed add and remove roll back the visible bookmark and retain stored state', async () => {
  for (const on of [false, true]) {
    const f = fixture(on), work = f.box.toggleBookmark(0, f.btn);
    assert.equal(f.btn.textContent, on ? '☆' : '★');
    f.reject(new Error('write failed')); await work;
    assert.equal(f.btn.textContent, on ? '★' : '☆');
    assert.equal(f.box._bookmarkSet.has('s'), on); assert.equal(f.btn.disabled, false);
    assert.equal(f.attrs['aria-busy'], 'false');
  }
});
