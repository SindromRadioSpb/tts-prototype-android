'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, sentenceIndex } = require('../public/js/material-open');
const { createLifecycle } = require('../public/js/media-host');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('local and remote opens produce the same ordered read model without mutation', async () => {
  const text = { id: 'B', title: 'Independent fixture' };
  const rows = [{ id: 'last', text_id: 'B', orderIndex: 8 }, { id: 'first', text_id: 'B', order_index: 2 }];
  const local = await load('B', { localDb: { getTextByIdLite: async () => text, getSentences: async () => rows } });
  const urls = [];
  const remote = await load('B', { getJson: async url => { urls.push(url); return url.endsWith('/sentences') ? { rows } : { text }; } });
  assert.deepEqual(local, remote);
  assert.deepEqual(local.sentences.map(row => row.id), ['first', 'last']);
  assert.deepEqual(rows.map(row => row.id), ['last', 'first']);
  assert.deepEqual(urls, ['/api/library/texts/B', '/api/library/texts/B/sentences']);
});

test('critical reads start together and an obsolete failure cannot become a visible error', async () => {
  const meta = deferred(), rows = deferred(), calls = [];
  let current = true;
  const pending = load('A', { isCurrent: () => current, localDb: {
    getTextByIdLite: () => { calls.push('meta'); return meta.promise; },
    getSentences: () => { calls.push('rows'); return rows.promise; },
  } });
  assert.deepEqual(calls, ['meta', 'rows']);
  current = false; meta.reject(new Error('late database error')); rows.resolve([]);
  assert.deepEqual(await pending, { ok: false, reason: 'superseded' });
});

test('read model distinguishes missing, busy, invalid identity and a working proxy', async () => {
  const db = { getTextByIdLite: async () => null, getSentences: async () => [] };
  assert.equal((await load('A', { localDb: db })).reason, 'notFound');
  db.isFollower = () => true;
  assert.equal((await load('A', { localDb: db })).reason, 'dbBusy');
  db.isProxy = () => true; db.getTextByIdLite = async () => ({ id: 'A' });
  assert.equal((await load('A', { localDb: db })).ok, true);
  db.getSentences = async () => [{ text_id: 'B' }];
  assert.equal((await load('A', { localDb: db })).reason, 'identity');
});

function mediaFixture() {
  const mounts = [], destroyed = [], adapters = [], events = [];
  const mount = { hidden: true, children: [], appendChild(node) { this.children.push(node); }, ownerDocument: {
    createElement() { const host = { remove() { const index = mount.children.indexOf(host); if (index >= 0) mount.children.splice(index, 1); } }; mounts.push(host); return host; },
  } };
  const lifecycle = createLifecycle({ stop: () => events.push('stop'), destroyLocal: () => events.push('local'),
    clearResolver: () => events.push('cache'), onAdapter: adapter => adapters.push(adapter) });
  const spec = (owner, gate) => ({ owner, videoId: owner.videoId || 'same-video', mount, isCurrent: () => true,
    create: async (host, id, options) => { owner.signal = options.signal; return gate.promise; },
    destroy: adapter => destroyed.push(adapter), onReady: () => events.push('ready') });
  return { mount, lifecycle, spec, destroyed, adapters, events };
}

for (const failure of [false, true]) test('late player ' + (failure ? 'failure' : 'success') + ' cannot hide or destroy the replacement', async () => {
  const f = mediaFixture(), a = deferred(), b = deferred(), ownerA = {}, ownerB = {};
  const old = f.lifecycle.ensureYoutube(f.spec(ownerA, a));
  await Promise.resolve();
  f.lifecycle.reset();
  assert.equal(ownerA.signal.aborted, true);
  const next = f.lifecycle.ensureYoutube(f.spec(ownerB, b));
  await Promise.resolve();
  b.resolve('adapter-B'); assert.equal(await next, 'adapter-B');
  if (failure) a.reject(new Error('late failure')); else a.resolve('adapter-A');
  assert.equal(await old, null);
  assert.equal(f.mount.hidden, false);
  assert.equal(f.mount.children.length, 1);
  assert.equal(f.adapters.at(-1), 'adapter-B');
  assert.deepEqual(f.destroyed, failure ? [] : ['adapter-A']);
  f.lifecycle.reset();
  assert.equal(f.mount.children.length, 0);
  assert.equal(f.mount.hidden, true);
  assert.equal(f.destroyed.filter(adapter => adapter === 'adapter-B').length, 1);
});

test('table rerender reuses pending/ready player and listeners; same video on another material starts a new lease', async () => {
  const f = mediaFixture(), gate = deferred(), owner = {};
  const first = f.lifecycle.ensureYoutube(f.spec(owner, gate));
  const second = f.lifecycle.ensureYoutube(f.spec(owner, gate));
  gate.resolve('adapter');
  assert.deepEqual(await Promise.all([first, second]), ['adapter', 'adapter']);
  assert.equal(await f.lifecycle.ensureYoutube(f.spec(owner, gate)), 'adapter');
  assert.equal(f.mount.children.length, 1);
  assert.deepEqual(f.events, ['ready']);
  const newer = deferred(), next = f.lifecycle.ensureYoutube(f.spec({}, newer));
  newer.resolve('new-adapter'); await next;
  assert.deepEqual(f.destroyed, ['adapter']);
  assert.deepEqual(f.events, ['ready', 'stop', 'local', 'cache', 'ready']);
});

test('closing before the create microtask never starts a player', async () => {
  const f = mediaFixture(), gate = deferred(), owner = {};
  const pending = f.lifecycle.ensureYoutube(f.spec(owner, gate));
  f.lifecycle.reset();
  assert.equal(await pending, null);
  assert.equal(owner.signal, undefined);
  assert.equal(f.mount.children.length, 0);
});

test('current player failure releases its host and permits an explicit retry', async () => {
  const f = mediaFixture(), gate = deferred(), owner = {};
  const pending = f.lifecycle.ensureYoutube(f.spec(owner, gate));
  gate.reject(new Error('denied')); await assert.rejects(pending, /denied/);
  assert.equal(f.mount.hidden, true); assert.equal(f.mount.children.length, 0);
  const retry = deferred(), next = f.lifecycle.ensureYoutube(f.spec(owner, retry));
  retry.resolve('retry'); assert.equal(await next, 'retry');
});

for (const failure of [false, true]) test('an invalidated projection permits a later retry of the same passport after ' + (failure ? 'failure' : 'success'), async () => {
  const f = mediaFixture(), gate = deferred(), owner = {};
  let current = true;
  const pending = f.lifecycle.ensureYoutube({ ...f.spec(owner, gate), isCurrent: () => current });
  await Promise.resolve(); current = false;
  if (failure) gate.reject(new Error('obsolete')); else gate.resolve('obsolete');
  assert.equal(await pending, null);
  assert.equal(f.mount.children.length, 0);
  current = true;
  const retry = deferred(), next = f.lifecycle.ensureYoutube({ ...f.spec(owner, retry), isCurrent: () => current });
  retry.resolve('current'); assert.equal(await next, 'current');
  assert.equal(f.mount.hidden, false);
});

test('late OPFS read cannot repopulate a cleared media cache', async () => {
  const first = deferred(); let reads = 0;
  const sandbox = { window: { MediaStore: { readMedia: () => ++reads === 1 ? first.promise : Promise.resolve('fresh') } }, document: {}, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/media-host.js'), 'utf8'), sandbox);
  const resolver = sandbox.module.exports.createBlobResolver({});
  const audio = { media: { opfsPath: 'media/a.mp3' } };
  const pending = resolver.resolve(audio); resolver.clear(); first.resolve('old'); await pending;
  assert.equal(await resolver.resolve(audio), 'fresh');
  assert.equal(reads, 2);
});

test('sentence anchors resolve the same durable row in DB and UI projections, independent of order gaps', () => {
  for (const key of ['id', '_v3_sentenceId', 'sentence_id', 'sentenceId']) {
    assert.equal(sentenceIndex([{ [key]: 'first', order_index: 8 }, { [key]: 'second', order_index: 30 }], 'second'), 1);
    assert.equal(sentenceIndex([{ [key]: 'first' }], 'first'), 0);
  }
  assert.equal(sentenceIndex([{ id: 'other' }], 'missing'), -1);
  assert.equal(sentenceIndex([], null), -1);
});
