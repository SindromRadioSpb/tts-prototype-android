'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const source = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

function fixture() {
  const { document } = parseHTML('<html><body><div id="mount"><div class="reader-table-wrap"><table id="proTable"><tbody></tbody></table></div></div></body></html>');
  const window = { document };
  const context = vm.createContext({ window, document, setTimeout, clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ overflowY: 'auto' }),
    fetch: () => { throw new Error('No generation/network expected'); },
  });
  vm.runInContext(source('reader-morph.js'), context);
  vm.runInContext(source('word-gloss-ai.js'), context);
  vm.runInContext(source('word-gloss.js'), context);
  const AI = window.WordGlossAI, gloss = window.WordGloss, mount = document.getElementById('mount');
  const tbody = mount.querySelector('tbody');
  function row(words, cached) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-row-idx', String(tbody.children.length));
    const td = document.createElement('td'); td.setAttribute('data-col', 'niqqud');
    for (const [i, word] of words.entries()) {
      const sp = document.createElement('span'); sp.className = 'rm-w'; sp.textContent = word;
      sp.setAttribute('data-w-offset', String(i)); sp.setAttribute('data-surface', word); sp.setAttribute('data-niqqud', word);
      td.appendChild(sp);
      gloss._memo.set(word + '\u0001' + word, { meaning: 'словарь ' + word, text: 'словарь ' + word, label: 'lemma' });
    }
    tr.appendChild(td); const ru = document.createElement('td'); ru.setAttribute('data-col', 'ru'); ru.textContent = 'Перевод'; tr.appendChild(ru);
    tbody.appendChild(tr);
    if (cached) AI._mem.set(AI.rowPayload(tr).storageKey, { glosses: cached, mwe: [], model: 'paid-context' });
    return tr;
  }
  const counts = { hydrate: 0, paintRow: 0, paintWord: 0, paintMount: 0, estimate: 0, startLazy: 0, stopLazy: 0 };
  for (const name of Object.keys(counts)) {
    const original = AI[name];
    AI[name] = function (...args) { counts[name]++; return original.apply(this, args); };
  }
  return { window, document, mount, row, AI, gloss, counts };
}

for (const strict of [true, false]) test(`each row hydrates once and preserves cached AI/manual provenance, strict=${strict}, generation disabled`, async () => {
  const f = fixture();
  const cached = f.row(['שָׁלוֹם', 'עוֹלָם'], [{ gloss: 'мир' }, { gloss: 'вселенная', manual: true, ai_gloss: 'мир' }]);
  const missing = f.row(['בַּיִת']);
  await f.gloss.apply(f.mount, { gloss: true, strict, ai: false });
  const spans = cached.querySelectorAll('.rm-w');
  assert.equal(spans[0].getAttribute('data-gloss'), 'мир');
  assert.equal(spans[0].getAttribute('data-gloss-source'), 'ai');
  assert.equal(spans[1].getAttribute('data-gloss'), 'вселенная');
  assert.equal(spans[1].getAttribute('data-gloss-source'), 'user');
  assert.equal(spans[1].getAttribute('data-gloss-label'), 'user');
  assert.equal(f.AI.wordAt(cached, 1).aiGloss, 'мир', 'manual edit retains its original paid result');
  const fallback = missing.querySelector('.rm-w');
  assert.equal(fallback.getAttribute('data-gloss'), strict ? '—' : '◇ словарь בַּיִת');
  assert.equal(fallback.getAttribute('data-gloss-source'), strict ? 'missing' : 'dictionary');
  assert.match(f.document.querySelector('.rm-context-coverage').textContent, /2 из 3/);
  assert.deepEqual(f.counts, { hydrate: 1, paintRow: 0, paintWord: 2, paintMount: 0, estimate: 1, startLazy: 0, stopLazy: 1 });
});

test('ribbon-only uses cached contextual/manual words without painting interlinear or generating', async () => {
  const f = fixture();
  const tr = f.row(['א', 'ב'], [{ gloss: 'первый' }, { gloss: 'второй', manual: true, ai_gloss: 'два' }]);
  tr.className = 'row-playing';
  await f.gloss.apply(f.mount, { ribbon: true, gloss: false, strict: true, ai: false });
  assert.deepEqual(Array.from(f.document.querySelectorAll('.rm-ribbon-gloss'), sp => sp.textContent), ['первый', 'второй']);
  assert.deepEqual(Array.from(f.document.querySelectorAll('.rm-ribbon-chip'), sp => sp.getAttribute('data-gloss-label')), ['ai', 'user']);
  assert.equal(f.mount.querySelectorAll('.rm-w[data-gloss]').length, 0);
  assert.deepEqual(f.counts, { hydrate: 1, paintRow: 0, paintWord: 0, paintMount: 0, estimate: 1, startLazy: 0, stopLazy: 1 });
});

test('mixed vocalized/plain rows retain contextual glosses without a second full-table paint', async () => {
  const f = fixture();
  const vocalized = f.row(['שָׁלוֹם'], [{ gloss: 'мир' }]);
  const plain = f.row(['עולם'], [{ gloss: 'вселенная', manual: true }]);
  plain.querySelector('td').setAttribute('data-col', 'he');
  const duplicate = vocalized.querySelector('td').cloneNode(true); duplicate.setAttribute('data-col', 'he'); vocalized.appendChild(duplicate);
  await f.gloss.apply(f.mount, { gloss: true, strict: true, ai: false });
  assert.equal(plain.querySelector('.rm-w').getAttribute('data-gloss'), 'вселенная');
  assert.equal(plain.querySelector('.rm-w').getAttribute('data-gloss-source'), 'user');
  assert.equal(vocalized.querySelector('td[data-col="niqqud"] .rm-w').getAttribute('data-gloss'), 'мир');
  assert.equal(duplicate.querySelector('.rm-w').hasAttribute('data-gloss'), false, 'do not show the same word in both columns');
  assert.equal(f.counts.paintWord, 2);
  assert.equal(f.counts.paintRow, 0);
  assert.equal(f.counts.paintMount, 0);
});

test('late hydration cannot overwrite a newer application or update coverage/start generation', async () => {
  const f = fixture(); f.row(['א']);
  const gate = deferred(), hydrate = f.AI.hydrate;
  f.AI.hydrate = () => gate.promise;
  const old = f.gloss.apply(f.mount, { gloss: true, strict: true, ai: true });
  f.AI.hydrate = hydrate;
  await f.gloss.apply(f.mount, { gloss: true, strict: false, ai: false });
  const html = f.document.body.innerHTML, counts = { ...f.counts };
  gate.resolve(); await old;
  assert.equal(f.document.body.innerHTML, html);
  assert.deepEqual(f.counts, counts);
});

test('owner cancellation during hydration and at entry leaves DOM and coverage untouched', async () => {
  const f = fixture(); f.row(['א']);
  await f.gloss.apply(f.mount, { gloss: true, strict: true });
  const before = f.document.body.innerHTML;
  const gate = deferred(); f.AI.hydrate = () => gate.promise;
  let current = true;
  const pending = f.gloss.apply(f.mount, { gloss: true, ai: true, isCurrent: () => current });
  current = false; gate.resolve(); await pending;
  assert.equal(f.document.body.innerHTML, before);
  const counts = { ...f.counts };
  await f.gloss.apply(f.mount, { gloss: false, isCurrent: () => false });
  assert.equal(f.document.body.innerHTML, before);
  assert.deepEqual(f.counts, counts);
});

test('dictionary results and ribbon chips do not commit after owner cancellation', async () => {
  const f = fixture(); const tr = f.row(['א']); tr.className = 'row-playing';
  f.gloss._memo.clear();
  const gate = deferred(), entered = deferred();
  f.window.ReaderMorph = { resolveForGloss() { entered.resolve(); return gate.promise; } };
  let current = true;
  const pending = f.gloss.apply(f.mount, { gloss: true, ribbon: true, isCurrent: () => current });
  await entered.promise; current = false;
  const before = f.document.body.innerHTML;
  gate.resolve(null); await pending;
  assert.equal(f.document.body.innerHTML, before);
  assert.equal(f.document.querySelector('.rm-context-coverage'), null);
  assert.equal(f.mount.querySelectorAll('.rm-w[data-gloss]').length, 0);
});

test('ribbon dictionary continuation observes owner cancellation independently of apply', async () => {
  const f = fixture(); const tr = f.row(['א']); tr.className = 'row-playing';
  f.gloss._memo.clear();
  const gate = deferred(), entered = deferred();
  f.window.ReaderMorph = { resolveForGloss() { entered.resolve(); return gate.promise; } };
  let current = true;
  await f.gloss.apply(f.mount, { ribbon: true, isCurrent: () => current });
  await entered.promise; current = false;
  gate.resolve(null); await new Promise(r => setTimeout(r, 0));
  assert.equal(f.document.querySelector('.rm-ribbon-gloss').textContent, '…');
});

test('lazy generation callback expires when application or owner changes', async () => {
  const f = fixture(); f.row(['א']);
  const callbacks = []; f.AI.startLazy = (_mount, enabled) => callbacks.push(enabled);
  let current = true;
  await f.gloss.apply(f.mount, { gloss: true, strict: true, ai: true, isCurrent: () => current });
  assert.equal(callbacks[0](), true);
  await f.gloss.apply(f.mount, { gloss: true, strict: true, ai: true, isCurrent: () => current });
  assert.equal(callbacks[0](), false);
  assert.equal(callbacks[1](), true);
  current = false;
  assert.equal(callbacks[1](), false);
  assert.equal(f.counts.stopLazy, 2, 'replace observer so it receives the new generation guard');
});

test('a restored row hydrates and paints before a held distant row; every long-paragraph word eventually appears', async () => {
  const f = fixture(), first = f.row(Array(145).fill('א')), restored = f.row(['ב'], [{ gloss: 'мой перевод', manual: true, ai_gloss: 'original' }]);
  const originalQueue = f.window.ReaderMorph.createRowQueue;
  f.window.ReaderMorph.createRowQueue = (...args) => { const queue = originalQueue(...args); queue.prioritize(restored); return queue; };
  const originalHydrate = f.AI.hydrate, gate = deferred(), entered = deferred();
  f.AI.hydrate = async rows => { if (rows.includes(first)) { entered.resolve(); await gate.promise; } return originalHydrate(rows); };
  const pending = f.gloss.apply(f.mount, { gloss: true, strict: false });
  await entered.promise;
  assert.equal(restored.querySelector('.rm-w').getAttribute('data-gloss'), 'мой перевод');
  assert.equal(first.querySelector('.rm-w').hasAttribute('data-gloss'), false);
  gate.resolve(); await pending;
  assert.equal(first.querySelectorAll('.rm-w[data-gloss-source="dictionary"]').length, 145);
});

test('unchanged contextual refresh preserves due tooltip, editor selection nodes and all gloss attributes', async () => {
  const f = fixture(), row = f.row(['א', 'ב'], [{ gloss: 'один' }, { gloss: 'два', manual: true, ai_gloss: 'two' }]);
  await f.gloss.apply(f.mount, { gloss: true });
  const word = row.querySelector('.rm-w'); word.title = 'К повторению'; word.setAttribute('data-rm-due-tip', '1');
  const text = word.firstChild, before = row.innerHTML;
  await f.gloss.apply(f.mount, { gloss: true });
  assert.equal(row.innerHTML, before); assert.equal(word.firstChild, text);
  assert.equal(f.AI.wordAt(row, 1).aiGloss, 'two');
  await f.AI.setOccurrenceGloss(row, 1, 'исправление');
  await f.gloss.apply(f.mount, { gloss: true });
  assert.equal(row.querySelectorAll('.rm-w')[1].getAttribute('data-gloss'), 'исправление');
  assert.equal(f.AI.wordAt(row, 1).aiGloss, 'two');
});

test('applications on separate mounts do not cancel each other or share strictness', async () => {
  const f = fixture(), a = f.row(['א']), b = f.row(['ב']);
  const other = f.document.createElement('div'); other.innerHTML = '<table id="proTable"><tbody></tbody></table>';
  f.document.body.appendChild(other); other.querySelector('tbody').appendChild(b);
  const gate = deferred(), started = deferred(), hydrate = f.AI.hydrate;
  f.AI.hydrate = async rows => { if (rows.includes(a)) { started.resolve(); await gate.promise; } return hydrate(rows); };
  const pending = f.gloss.apply(f.mount, { gloss: true, strict: true });
  await started.promise; await f.gloss.apply(other, { gloss: true, strict: false }); gate.resolve(); await pending;
  assert.equal(a.querySelector('.rm-w').getAttribute('data-gloss-source'), 'missing');
  assert.equal(b.querySelector('.rm-w').getAttribute('data-gloss-source'), 'dictionary');
});
