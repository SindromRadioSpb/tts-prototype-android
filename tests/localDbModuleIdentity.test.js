'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('all production surfaces import one identical local DB module URL', () => {
  const files = ['public/index.html', 'public/js/library-ui.js', 'public/js/mediatheque-ui.js',
    'public/js/agent-access.js', 'public/js/study-video-source-ui.js', 'public/sw.js', 'server.js'];
  const urls = new Set();
  for (const file of files) {
    const matches = fs.readFileSync(path.join(root, file), 'utf8').match(/\/db\/local-db\.js\?v=\d+/g);
    assert.ok(matches?.length, file + ' must declare its DB dependency');
    matches.forEach(url => urls.add(url));
  }
  assert.equal(urls.size, 1, 'different query strings instantiate separate workers in one document');
});

test('worker dependency graph cache-busts all repaired async lifecycle modules', () => {
  const worker = fs.readFileSync(path.join(root, 'public/db/db-worker-runtime.js'), 'utf8');
  const vfs = fs.readFileSync(path.join(root, 'public/db/IDBBatchAtomicVFS.js'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  for (const [source, name] of [[worker, 'sqlite-api.js'], [worker, 'operation-lease.js'],
    [worker, 'IDBBatchAtomicVFS.js'], [vfs, 'IDBContext.js']]) {
    const version = { 'sqlite-api.js': 531, 'operation-lease.js': 542, 'IDBBatchAtomicVFS.js': 543, 'IDBContext.js': 543 }[name];
    assert.ok(source.includes(`./${name}?v=${version}`), name + ' must not reuse a stale unversioned SW dependency');
    assert.ok(sw.includes(`/db/${name}?v=${version}`));
    assert.ok(server.includes(`/db/${name}?v=${version}`));
  }
});
