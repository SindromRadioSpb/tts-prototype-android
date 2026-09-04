const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
const studioMorph = fs.readFileSync(path.join(root, 'public', 'js', 'studio-morph.js'), 'utf8');

test('Studio loads the exact lexical-resolution projector before its morphology adapter', () => {
  const core = html.indexOf('<script src="/js/lexical-resolution-core.js');
  const service = html.indexOf('<script src="/js/lexical-resolution-service.js');
  const adapter = html.indexOf('<script src="/js/studio-morph.js');
  assert.ok(core >= 0, 'Studio must load lexical-resolution-core.js');
  assert.ok(service >= 0, 'Studio must load lexical-resolution-service.js');
  assert.ok(core < service && service < adapter, 'exact resolution dependencies must load before studio-morph.js');
  assert.match(html, /<script src="\/js\/studio-morph\.js\?v=2"><\/script>/);
  assert.match(sw, /"\/js\/studio-morph\.js\?v=2"/,
    'the service worker must precache the same Studio adapter URL');
});

test('Studio morphology cards request the saved exact-occurrence resolution', () => {
  assert.match(studioMorph, /lookupLexicalResolution\s*:/,
    'ReaderMorph Studio options must expose lookupLexicalResolution');
  assert.match(studioMorph, /LexicalResolutionService\.lookupExactOccurrence/,
    'Studio must reuse the shared fail-closed exact-occurrence projector');
});
