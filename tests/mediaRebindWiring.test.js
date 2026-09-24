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

test('from the video side the relink task and the draft details search for the card', () => {
  const start = src.indexOf('async function renderRelinkTask');
  const body = src.slice(start, src.indexOf('\n  async function ', start + 20));
  assert.match(body, /MediaRebindUI\.mountForPackage/);
  assert.match(src, /draft&&window\.MediaRebindUI[\s\S]{0,200}mountForPackage/);
});

test('an opened saved card without play buttons offers the rebind in the Studio', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="v3RebindHost"/);
  const at = html.indexOf('await v3RestoreUnboundMediaAfterSourceHydration(textId, rows)');
  assert.match(html.slice(at, at + 400), /MediaRebindUI\.mountInto\(document\.getElementById\("v3RebindHost"\), textId\)/);
});

test('a late second pass keeps the offer the person is working with, and success renames it', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'media-rebind-ui.js'), 'utf8');
  const at = ui.indexOf('async function mountInto');
  assert.match(ui.slice(at, at + 500), /host\.dataset\.textId === String\(textId\) && host\.childElementCount\) return/);
  assert.match(ui, /heading\.textContent = t\('linkedTitle'\)/);
});
