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

// ---- editions card (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.10) -----------------
test('editor: editions card shows late editions and the 7-day average per slot', () => {
  const { parseHTML } = require('linkedom');
  const UIE = require('../public/js/news-editor-ui');
  const { document } = parseHTML('<html><body></body></html>');
  const ed = (day, slot, cut, pub, ready, extra) => ({ edition_id: 'ne_' + day.replace(/-/g, '') + slot, day, slot, status: pub ? 'published' : 'downloaded', cutoff_at: cut, cut_at: cut,
    archive_ready_at: cut, downloaded_at: cut, published_at: pub, target_ready_at: ready, late: pub ? pub > ready : true, main_count: 8, overview_count: 40, published_count: 8, rework_count: 0, ...extra });
  const eds = [ed('2026-11-16', 'evening', '2026-11-16T14:30:00.000Z', '2026-11-16T15:50:00.000Z', '2026-11-16T16:00:00.000Z'),
    ed('2026-11-15', 'evening', '2026-11-15T14:30:00.000Z', '2026-11-15T16:30:00.000Z', '2026-11-15T16:00:00.000Z'),
    ed('2026-11-16', 'late', '2026-11-16T18:30:00.000Z', null, '2026-11-16T20:00:00.000Z')];
  const avg = UIE.slotAverages(eds, Date.parse('2026-11-16T21:00:00Z'));
  assert.equal(avg.evening, 100, 'minutes from cut-off to publication: (80 + 120) / 2');
  assert.equal(avg.late, undefined, 'unpublished editions are not averaged');
  const el = UIE.renderEditionsTable(document, eds, {});
  const rows = [...el.querySelectorAll('[data-edition]')];
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.getAttribute('data-late')), ['false', 'true', 'true']);
  assert.match(rows[1].textContent, /опоздал/);
  assert.match(rows[0].textContent, /вовремя/);
});
test('editor: interests card saves the text (PUT) and refuses more than 4000 characters', async () => {
  const { parseHTML } = require('linkedom');
  const UIE = require('../public/js/news-editor-ui');
  const { document } = parseHTML('<html><body></body></html>');
  const calls = [];
  const api = async (method, url, body) => { calls.push([method, url, body]); return method === 'GET' ? { ok: true, text: 'Больше экономики', updated_at: '2026-11-15T10:00:00Z' } : { ok: true, text: JSON.parse(body).text }; };
  const said = [];
  const box = await UIE.renderInterestsCard(document, { api, say: s => said.push(s), canSave: true, json: o => JSON.stringify(o) });
  const ta = box.querySelector('textarea');
  assert.equal(ta.value, 'Больше экономики');
  ta.value = 'Меньше криминала';
  await box.__save();
  assert.deepEqual(calls[1], ['PUT', '/api/news/editor/interests', JSON.stringify({ text: 'Меньше криминала' })]);
  ta.value = 'a'.repeat(4001);
  await box.__save();
  assert.equal(calls.length, 2, 'not sent');
  assert.match(said.at(-1), /4000/);
  const ro = await UIE.renderInterestsCard(document, { api, say: () => {}, canSave: false, json: o => JSON.stringify(o) });
  assert.equal(ro.querySelector('textarea').disabled, true);
});
