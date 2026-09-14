'use strict';
// Owner iPhone videos (3.11.545): every YouTube material booted the isolated
// Room/Studio, then compatibleShell() navigated to the study-* shell and booted
// again. Browsers without iframe credentialless now load the compatible shell
// before any module, worker or database work.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
const SCRIPT = /<script id="compatibleShellRedirect">([\s\S]*?)<\/script>/;

function run(file, { pathname, search = '', hash = '', isolated = true, credentialless = false }) {
  const match = read(file).match(SCRIPT);
  assert.ok(match, `${file} declares the compatible-shell redirect`);
  const replaced = [];
  const context = vm.createContext({
    window: { crossOriginIsolated: isolated },
    HTMLIFrameElement: { prototype: credentialless ? { credentialless: false } : {} },
    location: { pathname, search, hash, replace: url => replaced.push(url) },
  });
  vm.runInContext(match[1], context);
  return replaced;
}

test('isolated Room without iframe credentialless loads the compatible Room, keeping the reader URL', () => {
  assert.deepEqual(run('library.html', { pathname: '/library.html', search: '?my_text=a&from=mediatheque', hash: '#room=x' }),
    ['/study-library.html?my_text=a&from=mediatheque#room=x']);
});

test('isolated Studio without iframe credentialless loads the compatible Studio', () => {
  assert.deepEqual(run('index.html', { pathname: '/' }), ['/study-studio.html']);
  assert.deepEqual(run('index.html', { pathname: '/index.html', search: '?room=1', hash: '#/t/abc' }), ['/study-studio.html?room=1#/t/abc']);
});

test('no redirect where the player already works, inside compatible shells, or on other paths', () => {
  for (const file of ['index.html', 'library.html']) {
    const pathname = file === 'index.html' ? '/index.html' : '/library.html';
    assert.deepEqual(run(file, { pathname, isolated: false }), [], 'a non-isolated page embeds YouTube directly');
    assert.deepEqual(run(file, { pathname, credentialless: true }), [], 'Chromium keeps the isolated shell');
    assert.deepEqual(run(file, { pathname: file === 'index.html' ? '/study-studio.html' : '/study-library.html' }), [], 'never loops');
    assert.deepEqual(run(file, { pathname: '/other.html' }), []);
  }
});

test('redirect runs before modules, workers or database resources are requested', () => {
  for (const file of ['index.html', 'library.html']) {
    const html = read(file);
    const at = html.indexOf('<script id="compatibleShellRedirect">');
    assert.ok(at > 0 && at < html.indexOf('</head>'));
    for (const marker of ['<link rel="modulepreload"', '<script type="module"', '<script src=']) {
      const next = html.indexOf(marker);
      assert.ok(next === -1 || at < next, `${file}: redirect precedes ${marker}`);
    }
  }
});

test('first-run onboarding still appears in the compatible Studio shell', () => {
  assert.match(read('index.html'), /location\.pathname !== "\/index\.html" && location\.pathname !== "\/study-studio\.html"\) return false;/);
});
