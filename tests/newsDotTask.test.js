'use strict';
// The instruction for dot lives on the site: one stable address, a version that changes with the text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createDotTask, TASK_URL } = require('../news/newsDotTask');
const { mountNewsRoutes } = require('../news/newsRoutes');

test('dot task: version follows the text, the date comes from the «Обновлено» line', () => {
  const a = createDotTask({ read: () => '# Задание\n\n_Обновлено: 2026-11-22._\n\nТекст.' }).get();
  const b = createDotTask({ read: () => '# Задание\n\n_Обновлено: 2026-11-22._\n\nДругой текст.' }).get();
  assert.match(a.version, /^[0-9a-f]{12}$/);
  assert.notEqual(a.version, b.version, 'any edit of the text changes the version');
  assert.equal(a.updated, '2026-11-22');
  assert.equal(a.url, TASK_URL);
  assert.equal(TASK_URL, '/api/news/dot-task.md');
  assert.equal(createDotTask({ read: () => 'без даты' }).get().updated, null);
});

test('dot task: the real dotTask.md names its own address, the version rule and an «Обновлено» date', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'news', 'harvest', 'dotTask.md'), 'utf8');
  const t = createDotTask().get();
  assert.equal(t.text, text);
  assert.match(t.updated || '', /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(text.includes('https://linguistpro.kolosei.com' + TASK_URL), 'the instruction tells dot where it lives');
  assert.ok(text.includes('task.version'), 'the instruction tells dot to compare the version');
});

async function app(t, extra = {}) {
  const a = express();
  const dotTask = createDotTask({ read: () => '# Задание для dot\n\n_Обновлено: 2026-11-22._\n\nЧасть 0.' });
  mountNewsRoutes(a, { repo: {}, editorAuth: { resolve: async req => req.headers.authorization === 'Bearer dot' ? { id: 'editor:e1', kind: 'editor', via: 'bearer' } : null },
    resolveUser: async () => null, dotTask, ...extra });
  const server = await new Promise(r => { const s = a.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  return { base: 'http://127.0.0.1:' + server.address().port, task: dotTask.get() };
}

test('dot task routes: the text is public as markdown, the JSON carries the version and the text', async t => {
  const { base, task } = await app(t);
  const md = await fetch(base + '/api/news/dot-task.md');
  assert.equal(md.status, 200);
  assert.match(md.headers.get('content-type'), /^text\/markdown; charset=utf-8/);
  assert.equal(md.headers.get('etag'), '"' + task.version + '"');
  assert.equal(await md.text(), task.text);
  const again = await fetch(base + '/api/news/dot-task.md', { headers: { 'if-none-match': '"' + task.version + '"' } });
  assert.equal(again.status, 304);
  const j = await (await fetch(base + '/api/news/dot-task')).json();
  assert.deepEqual(j.task, { version: task.version, updated: '2026-11-22', url: TASK_URL });
  assert.equal(j.text, task.text);
});

test('dot task routes: editions/next and the editor order list tell dot the current version', async t => {
  const orders = { list: async () => [] };
  const harvester = { nextEdition: async () => null };
  const { base, task } = await app(t, { harvester, orders });
  const H = { authorization: 'Bearer dot' };
  const next = await (await fetch(base + '/api/news/editor/editions/next', { headers: H })).json();
  assert.equal(next.edition, null);
  assert.deepEqual(next.task, { version: task.version, updated: '2026-11-22', url: TASK_URL }, 'even with no new edition dot learns of a new instruction');
  const list = await (await fetch(base + '/api/news/editor/orders', { headers: H })).json();
  assert.equal(list.task.version, task.version);
});
