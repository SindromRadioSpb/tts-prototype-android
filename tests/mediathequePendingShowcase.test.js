'use strict';
// 2026-09-24 · Прод: владелец удалил подборки «בהסתורה» и «הדרום הפרוע» (и так же удалял бы темы) —
// правка легла в черновик витрины (ревизия 127), зрители видят опубликованную 125. Вне редактора
// ничто не говорило, что изменения не опубликованы; публикация пряталась за «Предпросмотром».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../public/js/mediatheque-core');

test('pending showcase changes are counted like the publish preview, ignoring unused reference bookkeeping', () => {
  let published = C.empty();
  published = C.command(published, { type: 'category.create', id: 'topic', title: 'Тема', parentId: null }, { publicOnly: true });
  published = C.command(published, { type: 'collection.create', id: 'series', title: 'בהסתורה', categoryId: 'topic' }, { publicOnly: true });
  const draft = C.command(published, { type: 'collection.remove', id: 'series' }, { publicOnly: true });
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public/js/mediatheque-ui.js'), 'utf8');
  const fn = ui.match(/function pendingShowcaseChanges\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, 'pendingShowcaseChanges defined');
  const pending = new Function('state', 'C', fn[0] + '; return pendingShowcaseChanges();');
  const state = { owner: true, publicReady: true, published: { structure: published }, draft: { structure: draft } };
  assert.equal(pending(state, C), 1, 'removed collection counts');
  const topicGone = C.command(published, { type: 'category.remove', id: 'topic', children: 'lift' }, { publicOnly: true });
  assert.ok(pending({ ...state, draft: { structure: topicGone } }, C) >= 1, 'removed topic counts');
  assert.equal(pending({ ...state, draft: { structure: published } }, C), 0);
  assert.equal(pending({ ...state, owner: false }, C), 0);
  assert.equal(pending({ ...state, draft: null }, C), 0);
});

test('owner sees an unpublished-changes banner outside the editor and can publish from the editor directly', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public/js/mediatheque-ui.js'), 'utf8');
  assert.match(ui, /t\('pendingChanges', \{ count: pending \}\)/);
  assert.match(ui, /button\('publish-pending', t\('publishNow'\)/);
  assert.match(ui, /if \(action === 'publish-pending' && state\.owner\)/);
  assert.match(ui, /if \(state\.owner\) state\.draft = await api\('\/api\/publication\/mediatheque'\)/);
  global.window = {};
  for (const l of ['ru', 'en', 'he']) require('../public/i18n/locales/' + l + '.js');
  for (const l of ['ru', 'en', 'he']) for (const k of ['pendingChanges', 'publishNow', 'continueEditing'])
    assert.ok(window.I18N_LOCALES[l].mediatheque[k], l + '.' + k);
});
