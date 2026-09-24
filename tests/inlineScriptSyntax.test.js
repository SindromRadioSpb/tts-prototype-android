'use strict';
// 2026-09-24: вставка правки превратила "\n" в настоящий перевод строки внутри JS-строки, и главный
// скрипт Студии перестал парситься целиком — node-тесты модулей при этом были зелёными. Каждый
// встроенный <script> оболочек обязан компилироваться.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const page of ['index.html', 'library.html', 'mediatheque.html']) {
  test(`every inline script in ${page} compiles`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
    const bad = [];
    let m;
    while ((m = re.exec(html))) {
      const attrs = m[1] || '';
      if (/\bsrc=/.test(attrs) || /type="(module|application\/(ld\+)?json|text\/template)"/.test(attrs)) continue;
      try { new vm.Script(m[2]); } catch (e) { bad.push(html.slice(0, m.index).split('\n').length + ': ' + e.message); }
    }
    assert.deepEqual(bad, []);
  });
}
