'use strict';
// Engineering atlas in the Reading Room: data route, reader module wiring, locales, service worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('atlas data is served from the data volume before public static files', () => {
  const server = read('server.js');
  const route = server.indexOf("app.use('/data/atlas', express.static(path.join(DATA_DIR, 'atlas')");
  assert.ok(route > 0, 'route /data/atlas from DATA_DIR/atlas');
  assert.ok(route < server.indexOf('app.use(express.static(path.join(__dirname, "public")'), 'volume route wins over public');
  const block = server.slice(route, route + 600);
  assert.match(block, /fallthrough: true/);
  assert.match(block, /immutable/);           // sha-named images never change
  assert.match(block, /max-age=300/);         // section JSON is re-published
});
