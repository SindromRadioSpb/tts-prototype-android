'use strict';
// Owner, 2026-10-18: the saved translator (Gemini) came back as Google Translate after every
// reload. initProviderSelect() read PROVIDER_LS_KEY ~17k lines above its `const` in the same
// script; the temporal dead zone threw inside a try/catch and the choice was silently dropped.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('the saved translator and transliteration keys exist before the selects are restored', () => {
  const boot = html.indexOf('\n    initProviderSelect();');
  assert.ok(boot > 0, 'bootstrap call present');
  for (const decl of ['const PROVIDER_LS_KEY', 'const TRANSLIT_PROFILE_LS_KEY']) {
    const at = html.indexOf(decl);
    assert.ok(at > 0, decl + ' present');
    assert.equal(html.indexOf(decl, at + 1), -1, decl + ' declared once');
    assert.ok(at < boot, decl + ' must be declared above initProviderSelect()');
  }
});
