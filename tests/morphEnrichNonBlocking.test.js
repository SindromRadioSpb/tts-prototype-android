'use strict';
// Владелец, 2026-09-25: после сохранения большой карточки фоновое обогащение Dicta и «Спряжения
// (Pealim)» шли под полноэкранным затемнением и блокировали работу с карточкой. Прогресс фонового
// прохода — плашка в углу, которая не перехватывает клики.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
function rule(selector) {
  const at = html.indexOf(selector + ' {');
  assert.notEqual(at, -1, selector);
  return html.slice(at, html.indexOf('}', at));
}

test('the enrichment progress does not cover the page', () => {
  const host = rule('.v3-morph-enrich-progress');
  assert.doesNotMatch(host, /inset:\s*0\b/, 'no full-screen layer');
  assert.doesNotMatch(host, /background:\s*rgba\(0,\s*0,\s*0/, 'no dimming backdrop');
  assert.match(host, /pointer-events:\s*none/, 'clicks pass through the host');
  assert.match(rule('.v3-mep-box'), /pointer-events:\s*auto/);
});

test('the progress host announces itself politely instead of trapping focus', () => {
  const at = html.indexOf('function v3MorphProgressShow');
  assert.match(html.slice(at, at + 900), /aria-live/);
});
