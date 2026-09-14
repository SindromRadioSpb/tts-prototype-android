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
