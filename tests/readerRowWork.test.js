'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/reader-row-work.js'), 'utf8').replace('export function', 'function');

function setup({ rowCostMs = 1 } = {}) {
  const { document } = parseHTML('<html><body><div id="mount"><table><tbody>' +
    Array.from({ length: 200 }, (_, i) => `<tr data-row-idx="${i}"><td>Text ${i}</td></tr>`).join('') + '</tbody></table></div></body></html>');
  const tasks = new Map(), prepared = [];
  let clock = 0, seq = 0, intersect, disconnected = false;
  const context = vm.createContext({ performance: { now: () => clock },
    setTimeout: fn => { tasks.set(++seq, fn); return seq; }, clearTimeout: id => tasks.delete(id),
    IntersectionObserver: class { constructor(fn) { intersect = fn; } observe() {} unobserve() {} disconnect() { disconnected = true; } },
  });
  vm.runInContext(source, context);
  const mount = document.getElementById('mount');
  const work = context.scheduleRowWork(mount, row => { prepared.push(Number(row.dataset.rowIdx)); clock += rowCostMs; });
  const tick = () => { const [id, fn] = tasks.entries().next().value; tasks.delete(id); fn(); };
  return { mount, work, prepared, tasks, tick, intersect: row => intersect([{ target: row, isIntersecting: true }]), disconnected: () => disconnected };
}

test('saved or visible distant row is prepared before the background tail, each row exactly once', async () => {
  const f = setup(), original = f.mount.textContent;
  assert.equal(f.prepared.length, 8, 'first screen is ready synchronously');
  const last = f.mount.querySelector('[data-row-idx="199"]');
  f.intersect(last); f.tick();
  assert.equal(f.prepared[8], 199, 'viewport priority beats sequential work');
  f.work.ensure(last);
  while (f.tasks.size) f.tick();
  assert.equal(await f.work.complete, true);
  assert.equal(f.prepared.length, 200);
  assert.equal(new Set(f.prepared).size, 200);
  assert.equal(f.mount.textContent, original, 'complete searchable text remains present');
  assert.ok(f.disconnected());
});

test('cancellation settles consumers and prevents stale callbacks after a material switch', async () => {
  const f = setup(), late = [...f.tasks.values()][0];
  f.work.cancel(); late();
  f.work.ensure(f.mount.querySelector('[data-row-idx="99"]'));
  assert.equal(await f.work.complete, false);
  assert.equal(f.prepared.length, 8);
  assert.equal(f.tasks.size, 0);
  assert.ok(f.disconnected());
});

test('long paragraphs get one immediate interactive row and yield before preparing another', async () => {
  const f = setup({ rowCostMs: 12 });
  assert.deepEqual(f.prepared, [0], 'one costly row is prepared, not all eight warmup rows');
  const visible = f.mount.querySelector('[data-row-idx="150"]');
  f.intersect(visible); f.tick();
  assert.deepEqual(f.prepared, [0, 150], 'next slice prioritises the visible row and yields again');
  while (f.tasks.size) {
    const before = f.prepared.length;
    f.tick();
    assert.ok(f.prepared.length - before <= 1, 'no slice combines two expensive paragraphs');
  }
  assert.equal(await f.work.complete, true);
  assert.equal(new Set(f.prepared).size, 200, 'bounded warming still completes every row');
});

test('warmup stops at its time budget even when fewer than eight small rows fit', async () => {
  const f = setup({ rowCostMs: 3 });
  assert.deepEqual(f.prepared, [0, 1, 2]);
  f.work.cancel();
  assert.equal(await f.work.complete, false);
});
