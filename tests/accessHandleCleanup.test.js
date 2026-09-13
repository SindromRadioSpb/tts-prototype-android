'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('failed pool acquisition waits for late successes and closes every acquired handle', async () => {
  const { AccessHandlePoolVFS } = await import('../public/db/AccessHandlePoolVFS.js');
  const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
  const handles = [];
  const fakeHandle = () => {
    const h = { closed: false, close() { this.closed = true; }, truncate() {}, read(bytes, { at }) {
      if (at === 516) new Uint32Array(bytes.buffer, bytes.byteOffset, 2).set([0xfecc5f80, 0xaccec037]);
    } };
    handles.push(h); return h;
  };
  const directory = { getDirectoryHandle: async () => directory,
    async *[Symbol.asyncIterator]() {
      yield ['early', { kind: 'file', createSyncAccessHandle: async () => fakeHandle() }];
      yield ['failure', { kind: 'file', createSyncAccessHandle: async () => { throw new Error('locked'); } }];
      yield ['late', { kind: 'file', createSyncAccessHandle: async () => { await new Promise(r => setTimeout(r, 20)); return fakeHandle(); } }];
    }
  };
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => directory } });
  try {
    const pool = new AccessHandlePoolVFS('/fixture');
    await assert.rejects(pool.isReady, /locked/);
    assert.equal(handles.length, 2);
    assert.ok(handles.every(handle => handle.closed), 'late handle must not survive failed initialization');
  } finally {
    if (original) Object.defineProperty(navigator, 'storage', original); else delete navigator.storage;
  }
});
