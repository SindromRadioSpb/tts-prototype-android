'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { captureReadingPosition } = require('../public/js/reader-morph');

function fixture(nested) {
  const doc = { defaultView: { innerHeight: 900, innerWidth: 1000, getComputedStyle: host => ({ overflowY: host.overflowY }) } };
  function host(overflowY, clipTop, clientHeight, scrollTop) {
    return { overflowY, scrollHeight: 5000, scrollTop, clientHeight, clientTop: 0,
      getBoundingClientRect: () => ({ top: clipTop }), scrollTo: function (opts) { assert.equal(opts.behavior, 'instant'); this.scrollTop = opts.top; } };
  }
  const page = doc.scrollingElement = host('visible', 0, 900, 400);
  const scroll = nested ? host('auto', 200, 450, 300) : page;
  if (nested) scroll.parentElement = page;
  const mount = { parentElement: scroll, isConnected: true, ownerDocument: doc, scrollHeight: 5000, clientHeight: 5000,
    overflowY: 'visible', getBoundingClientRect: () => ({ top: -200, bottom: 4000, left: 50, right: 950 }), contains: item => item.isConnected };
  let addedHeight = 0, visualRow;
  function makeRow(start) {
    const row = { isConnected: true, closest: () => row, getBoundingClientRect: () => ({ top: words[0].getBoundingClientRect().top }),
      querySelectorAll: () => words };
    const words = Array.from({ length: 20 }, (_, i) => ({ isConnected: true, getClientRects: () => [1], getBoundingClientRect: () => {
      const top = start + i * 35 + addedHeight - scroll.scrollTop; return { top, bottom: top + 25, height: 25 };
    } }));
    return { row, words };
  }
  visualRow = makeRow(nested ? 460 : 395);
  doc.elementsFromPoint = (_x, y) => y >= (nested ? 200 : 0) && y <= (nested ? 650 : 900) ? [visualRow.row] : [];
  return { page, scroll, get words() { return visualRow.words; }, mount,
    layout: (height, browserShift = 0) => { addedHeight += height; scroll.scrollTop += browserShift; },
    chooseNextRow: () => { visualRow = makeRow(nested ? 1140 : 1050); },
  };
}

for (const nested of [false, true]) test('gloss holds the same visible token around layout batches in ' + (nested ? 'nested' : 'document') + ' scroll', () => {
  const { mount, layout, chooseNextRow, scroll, page } = fixture(nested);
  // Native anchoring applied 12px already. Restore only the balance.
  const initial = scroll.scrollTop, pageInitial = page.scrollTop;
  const restore = captureReadingPosition(mount);
  layout(390, 12); restore();
  assert.equal(scroll.scrollTop, initial + 390);
  // A manual/programmatic seek between batches stops owning the previous viewport.
  scroll.scrollTop = 1000; chooseNextRow();
  const next = captureReadingPosition(mount);
  layout(-125); next();
  assert.equal(scroll.scrollTop, 875);
  if (nested) assert.equal(page.scrollTop, pageInitial);
});

test('a stale capture must not scroll newly opened work', () => {
  const f = fixture(false), initial = f.scroll.scrollTop;
  const restore = captureReadingPosition(f.mount);
  f.words.forEach(w => { w.isConnected = false; });
  f.layout(390); restore();
  assert.equal(f.scroll.scrollTop, initial);
});
