'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
function fixture() {
 const { window: domWindow, document } = parseHTML('<html><body><div id="mount"><table><tbody>' +
  Array.from({ length: 260 }, (_, i) => '<tr data-row-idx="' + i + '"><td>word</td></tr>').join('') + '</tbody></table></div></body></html>');
 const events = new Map(), window = { document, Event: domWindow.Event, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
 const context = vm.createContext({ window, document, setTimeout, clearTimeout });
 vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/js/reader-morph.js'), 'utf8'), context);
 const mount = document.getElementById('mount'), rows = Array.from(mount.querySelectorAll('tr'));
 let current = true;
 const queue = window.ReaderMorph.createRowQueue(mount, rows, () => current);
 return { window, document, mount, rows, queue, scroll: () => events.get('scroll')?.({ target: document }), cancel: () => { current = false; } };
}
test('a new visible row interrupts a partial paragraph, then all unfinished work resumes', () => {
 const f = fixture();
 assert.equal(f.queue.next(), f.rows[0]); // paragraph has consumed only one slice
 f.queue.prioritize(f.rows[249]);
 assert.equal(f.queue.next(), f.rows[249]);
 f.queue.done(f.rows[249]);
 assert.equal(f.queue.next(), f.rows[0], 'do not abandon the partial row when cursor has advanced');
 f.queue.done(f.rows[0]);
 const rest = [];
 for (let row; (row = f.queue.next());) { rest.push(row); f.queue.done(row); }
 assert.equal(rest.length, 258); assert.equal(new Set(rest).size, 258);
 f.queue.close(); assert.equal(f.queue.next(), null);
});

test('actual scrolling recomputes the visible range and can interrupt background preparation', () => {
 const f = fixture();
 f.window.innerWidth = 1000; f.window.innerHeight = 900;
 f.mount.getBoundingClientRect = () => ({ left: 0, right: 1000, top: 0, bottom: 900 });
 let at = 180;
 f.document.elementsFromPoint = () => [f.rows[at].querySelector('td')];
 f.scroll();
 assert.equal(f.queue.next(), f.rows[180]);
 at = 240; f.scroll();
 assert.equal(f.queue.next(), f.rows[240]); f.queue.done(f.rows[240]);
 f.queue.close();
});

test('word work yields through the browser scheduler and remains asynchronous without it', async () => {
 const f = fixture(); let calls = 0;
 f.window.scheduler = { yield: async () => { calls++; } };
 await f.window.ReaderMorph.yieldWordWork(); assert.equal(calls, 1);
 delete f.window.scheduler;
 let returned = false;
 const pending = f.window.ReaderMorph.yieldWordWork().then(() => { returned = true; });
 assert.equal(returned, false); await pending; assert.equal(returned, true); f.queue.close();
});
test('focus and bounded storage prefetch retain priority without consuming the rows', () => {
 const f = fixture();
 f.queue.prioritize(f.rows[257]);
 const batch = f.queue.batch(f.rows[257], 128);
 assert.equal(batch.length, 128); assert.equal(batch[0], f.rows[257]);
 assert.equal(new Set(batch).size, 128); assert.equal(f.queue.next(), f.rows[257]);
 f.queue.done(f.rows[257]);
 f.rows[258].querySelector('td').dispatchEvent(new f.window.Event('focusin', { bubbles: true }));
 assert.equal(f.queue.next(), f.rows[258]);
 f.queue.done(f.rows[258]); assert.equal(f.queue.next(), f.rows[0]);
 f.cancel(); assert.equal(f.queue.next(), null); f.queue.close();
 f.queue.prioritize(f.rows[259]); assert.equal(f.queue.next(), null);
});
