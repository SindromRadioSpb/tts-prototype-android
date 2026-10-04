'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/world-engine.js'), 'utf8');
test('world sign animation never synchronously measures layout after a reader mutation', () => {
  const sign = { hidden: false, dataset: { loc: 'cinema' }, style: {}, get offsetWidth() { throw new Error('forced layout'); } };
  const stage = { sign, signWidth: 90, scale: 2, renderer: { camera: () => 100 } };
  const box = { state: { stage, location: 'cinema', walk: null, pack: { locations: { cinema: { x: 200, sign: {} } }, scenery: { groundY: 70 } } }, syncRoute: () => {} };
  vm.createContext(box);
  const start = source.indexOf('  function syncSign()');
  vm.runInContext(source.slice(start, source.indexOf('  // Campaign posters', start)), box);
  for (let i = 0; i < 60; i++) assert.doesNotThrow(() => box.syncSign());
  assert.equal(sign.style.transform, 'translateX(66px)');
});
