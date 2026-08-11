const test = require('node:test');
const assert = require('node:assert/strict');

const MorphHost = require('../public/js/morph-host.js');

test('MorphHost exposes one reference-stable word-state cache to Room consumers', async () => {
  const loaded = { 'pid:1': 'l2' };
  const primed = { 'pid:2': 'known' };
  let reads = 0;
  const host = MorphHost.createHost({
    ldb: async () => ({
      getKnownWordStates: async () => {
        reads += 1;
        return loaded;
      },
    }),
  });

  assert.equal(host.peekWordStates(), null);
  assert.strictEqual(await host.ensureWordStates(), loaded);
  assert.strictEqual(host.peekWordStates(), loaded);
  assert.strictEqual(await host.ensureWordStates(), loaded);
  assert.equal(reads, 1);

  host.primeWordStates(primed);
  assert.strictEqual(host.peekWordStates(), primed);
  assert.strictEqual(await host.ensureWordStates(), primed);
  assert.equal(reads, 1);

  host.invalidateWordStates();
  assert.equal(host.peekWordStates(), null);
  assert.strictEqual(await host.ensureWordStates(), loaded);
  assert.equal(reads, 2);
});
