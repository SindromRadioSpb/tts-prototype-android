'use strict';
// O-007 (владелец 2026-10-17): внутри одной части сборки долей нет — пока часть идёт, рядом с «Часть N из M»
// честная подпись «часть обычно занимает ~2 мин» (без дополнительного вызова модели).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the part caption exists in ru/en/he and shows only while a part is being generated', () => {
  for (const loc of ['ru', 'en', 'he']) assert.match(read(`public/i18n/locales/${loc}.js`), /partTypical: "[^"]*2[^"]*"/, loc);
  assert.match(read('public/index.html'), /model\.tone === "busy" && model\.state === "generate" \? " · " \+ t\("tableJob\.partTypical"\)/);
});
