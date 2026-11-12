'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const UI = require('../public/js/news-editor-ui');
const ROOT = path.join(__dirname, '..');

function locales() {
  const sandbox = { window: {} };
  for (const lang of ['ru', 'en', 'he']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/i18n/locales', lang + '.js'), 'utf8'), sandbox);
  return sandbox.window.I18N_LOCALES;
}
const tFor = loc => (k, f) => { const v = k.split('.').reduce((o, x) => o && o[x], loc); return typeof v === 'string' ? v : f; };

test('receipt shows all seven totals and one translated row per rejection or flag', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const receipt = { pack_id: 'p-1', totals: { published: 3, archived: 1, revised: 0, duplicate: 2, flagged: 1, withdrawn: 0, rejected: 2 }, warnings: ['W1'],
    items: [{ path: 'articles/a/article.json', status: 'published', article_id: 'na_x' }, { path: 'articles/b/article.json', status: 'rejected', code: 'VERBATIM_OVERLAP' },
      { path: 'articles/c/article.json', status: 'rejected', code: 'URL_DOMAIN_MISMATCH' }, { path: 'articles/d/article.json', status: 'published', flagged: true, overlap: 0.12, warnings: ['UNKNOWN_FIELD:x'] }] };
  const el = UI.renderReceipt(document, receipt, { t: tFor(locales().ru) });
  assert.deepEqual([...el.querySelectorAll('[data-total]')].map(li => li.getAttribute('data-total')), UI.TOTALS);
  assert.equal(el.querySelector('[data-total=published] strong').textContent, '3');
  const rows = [...el.querySelectorAll('tbody tr')];
  assert.equal(rows.length, 3);
  assert.doesNotMatch(rows[0].textContent, /VERBATIM_OVERLAP/); // translated, not the raw code
  assert.match(rows[2].textContent, /12%/);
  assert.equal(el.querySelectorAll('.ne-warnings li').length, 2);
});
test('every reason code and editor key is translated in ru, en and he', () => {
  const L = locales();
  const used = new Set();
  for (const m of fs.readFileSync(path.join(ROOT, 'public/js/news-editor-ui.js'), 'utf8').matchAll(/["'](newsEditor\.[a-zA-Z.]*[a-zA-Z])["']/g)) used.add(m[1]);
  for (const c of UI.REASONS) used.add('newsEditor.reason.' + c);
  for (const k of UI.TOTALS) used.add('newsEditor.total.' + k);
  for (const lang of ['ru', 'en', 'he']) for (const key of used) assert.equal(typeof tFor(L[lang])(key, undefined), 'string', lang + ': ' + key);
});
test('the editor key is never stored or put in the address', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/news-editor-ui.js'), 'utf8');
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(src, /location\.(href|hash|search)\s*=|history\.(push|replace)State/);
  const html = fs.readFileSync(path.join(ROOT, 'public/news-editor.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(html, /id="ne-root"/); assert.match(html, /\/js\/news-editor-ui\.js\?v=\d+/);
});
test('article list rows: titles not file paths; actions per view; trash shows when it is erased', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const base = { article_id: 'na_' + 'a'.repeat(24), outlet_id: 'walla', published_at: new Date().toISOString(), title_he: 'מלון חדש', title_ru: 'Новый отель', section: 'lifestyle' };
  const t = tFor(locales().ru);
  const labels = row => [...row.querySelectorAll('button')].map(b => b.textContent);
  const feed = UI.renderArticleRow(document, { ...base, tier: 'fresh' }, { t, view: 'feed', onAction() {} });
  assert.match(feed.textContent, /מלון חדש/); assert.match(feed.textContent, /Новый отель/); assert.doesNotMatch(feed.textContent, /article\.json|articles\//);
  assert.deepEqual(labels(feed), ['В архив', 'Удалить']);
  assert.deepEqual(labels(UI.renderArticleRow(document, { ...base, tier: 'archive', can_return_to_feed: true }, { t, view: 'archive', onAction() {} })), ['Вернуть в ленту', 'Удалить']);
  assert.deepEqual(labels(UI.renderArticleRow(document, { ...base, tier: 'card', can_return_to_feed: false }, { t, view: 'archive', onAction() {} })), ['Удалить']);
  const trash = UI.renderArticleRow(document, { ...base, tier: 'withdrawn', purge_at: '2026-12-13T10:00:00.000Z' }, { t, view: 'deleted', onAction() {} });
  assert.deepEqual(labels(trash), ['Восстановить']);
  assert.match(trash.textContent, /навсегда/);
});
test('the receipt no longer lists per-article buttons with file paths', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/news-editor-ui.js'), 'utf8');
  assert.doesNotMatch(src, /ne-article-actions/);
});
