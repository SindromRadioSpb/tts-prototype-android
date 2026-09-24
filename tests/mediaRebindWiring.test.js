'use strict';
// Владелец, 2026-09-24: «Задачи → Вернуть аудио или видео» у карточки без привязки заканчивался
// кодом TEXT_MEDIA_BINDING_MISSING. Тупик заменяется бесплатной привязкой прямо в этом мастере.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'studio-portable-learning-package.js'), 'utf8');

test('the relink task turns a missing binding into the free rebind offer', () => {
  const start = src.indexOf('async function renderRelinkTask');
  const body = src.slice(start, src.indexOf('\n  async function ', start + 20));
  assert.match(body, /TEXT_MEDIA_BINDING_MISSING/);
  assert.match(body, /MediaRebindUI\.mount/);
});

test('material details still mount the rebind offer', () => {
  assert.match(src, /MediaRebindUI\.mount\(body\.querySelector\('\.p4-material-detail'\)/);
});
