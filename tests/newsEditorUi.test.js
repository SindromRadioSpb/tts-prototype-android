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

test('editor page lists the owner\x27s orders with status and reasons (findability W5)', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const orders = [{ order_id: 'noo_1', item_key: 'na_' + '1'.repeat(24), status: 'failed', reason: 'Слишком коротко', note_ru: 'Выбор владельца', tag: null, created_at: '2026-11-21T10:00:00.000Z' },
    { order_id: 'noo_2', item_key: 'na_' + '2'.repeat(24), status: 'open', reason: null, note_ru: 'По тегу', tag: 'выборы', created_at: '2026-11-21T11:00:00.000Z' }];
  const el = UI.renderOrdersTable(document, orders, { t: tFor(locales().ru) });
  const rows = [...el.querySelectorAll('.ne-order')];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /отказ/); assert.match(rows[0].textContent, /Слишком коротко/);
  assert.match(rows[1].textContent, /#выборы/); assert.match(rows[1].textContent, /ждёт dot/);
  assert.match(UI.renderOrdersTable(document, [], { t: tFor(locales().ru) }).textContent, /Заказов нет/);
});

test('dot instruction card: full link, version and date, copy button, the text folded', async () => {
  const { document } = parseHTML('<html><body></body></html>');
  const copied = [];
  const el = UI.renderDotTaskCard(document, { task: { version: 'abc123def456', updated: '2026-11-22', url: '/api/news/dot-task.md' }, text: '# Задание для dot\nЧасть 0.' },
    { t: tFor(locales().ru), origin: 'https://linguistpro.kolosei.com', copy: async s => { copied.push(s); } });
  assert.equal(el.querySelector('h2').textContent, 'Инструкция для dot');
  const a = el.querySelector('a.ne-dot-task-link');
  assert.equal(a.getAttribute('href'), 'https://linguistpro.kolosei.com/api/news/dot-task.md');
  assert.equal(a.textContent, 'https://linguistpro.kolosei.com/api/news/dot-task.md');
  assert.match(el.querySelector('.ne-dot-task-meta').textContent, /abc123def456/);
  assert.match(el.querySelector('.ne-dot-task-meta').textContent, /2026-11-22/);
  assert.equal(el.querySelector('details pre').textContent, '# Задание для dot\nЧасть 0.');
  const btn = el.querySelector('button.ne-dot-task-copy');
  btn.dispatchEvent(new document.defaultView.Event('click'));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(copied, ['https://linguistpro.kolosei.com/api/news/dot-task.md']);
  assert.equal(el.querySelector('.ne-dot-task-status').textContent, 'Ссылка скопирована');
  for (const lang of ['ru', 'en', 'he']) assert.equal(typeof locales()[lang].newsEditor.dotTask.title, 'string', lang + ' has the card strings');
});

// ---- «Издания» (spec 2026-11-26 §8; plan W1 Task 6) ----------------------------------------------------
const OUTLETS_FIXTURE = [
  { outlet_id: 'ynet', name_latin: 'ynet', name_he: 'ynet', group: 'national', enabled: true, route: 'server', has_adapter: true, day_count: 120, last_ok_at: '2026-11-26T07:55:00.000Z', last_error: null },
  { outlet_id: 'c14', name_latin: 'Channel 14', name_he: 'עכשיו 14', group: 'national', enabled: true, route: 'home_pc', has_adapter: true, day_count: 0, last_ok_at: null, last_error: null },
  { outlet_id: 'mako', name_latin: 'mako', name_he: 'mako', group: 'national', enabled: false, route: 'server', has_adapter: false, day_count: 0, last_ok_at: null, last_error: null },
  { outlet_id: 'walla', name_latin: 'Walla', name_he: 'וואלה', group: 'national', enabled: true, route: 'server', has_adapter: true, day_count: 3, last_ok_at: null, last_error: 'FEED_FAILED:HTTP_500', last_error_at: '2026-11-26T07:00:00.000Z' },
  { outlet_id: 'haipo', name_latin: 'Hai Po', name_he: 'חי פה', group: 'local', region: 'north', enabled: false, route: 'server', has_adapter: false, day_count: 0, last_ok_at: null, last_error: null },
];
test('outlets grouped, local by region', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderOutletsTable(document, OUTLETS_FIXTURE, { t: tFor(locales().ru), now: Date.parse('2026-11-26T08:00:00Z'), canSwitch: true });
  const heads = [...el.querySelectorAll('[data-group]')].map(x => x.getAttribute('data-group'));
  assert.deepEqual(heads, ['national', 'local:north']);
  assert.match(el.querySelector('[data-group="local:north"]').textContent, /Местные: север/);
  assert.equal(el.querySelectorAll('tr[data-outlet]').length, 5);
  assert.equal(el.querySelector('tr[data-outlet=c14]').getAttribute('data-route'), 'home_pc');
  assert.match(el.querySelector('tr[data-outlet=c14]').textContent, /с ПК/);
  assert.match(el.querySelector('tr[data-outlet=c14]').textContent, /ПК ещё не присылал сбор/, 'a home-PC outlet never harvested says so');
  const late = UI.renderOutletsTable(document, [{ ...OUTLETS_FIXTURE[1], last_ok_at: '2026-11-26T03:00:00.000Z' }], { t: tFor(locales().ru), now: Date.parse('2026-11-26T08:00:00Z') });
  assert.match(late.textContent, /ПК не присылал сбор с/);
  assert.match(el.querySelector('tr[data-outlet=ynet]').textContent, /120/);
  assert.equal(el.querySelector('tr[data-outlet=c14] bdi[lang=he]').textContent, 'עכשיו 14', 'the Hebrew name is isolated, not glued to the Latin one');
  assert.equal(el.querySelector('tr[data-outlet=ynet] bdi'), null);
  assert.deepEqual(UI.OUTLET_GROUPS, require('../public/js/news-outlets').GROUPS);
});
test('no-adapter row is greyed and its checkbox disabled', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const switched = [];
  const el = UI.renderOutletsTable(document, OUTLETS_FIXTURE, { t: tFor(locales().ru), canSwitch: true, onSwitch: (id, on) => switched.push([id, on]) });
  const mako = el.querySelector('tr[data-outlet=mako]');
  assert.ok(mako.classList.contains('ne-outlet-off'));
  assert.equal(mako.querySelector('input[type=checkbox]').hasAttribute('disabled'), true);
  assert.match(mako.textContent, /нет подключения/);
  const ynet = el.querySelector('tr[data-outlet=ynet] input[type=checkbox]');
  assert.equal(ynet.hasAttribute('disabled'), false); assert.equal(ynet.checked, true);
  ynet.checked = false; ynet.dispatchEvent(new document.defaultView.Event('change'));
  assert.deepEqual(switched, [['ynet', false]]);
  const ro = UI.renderOutletsTable(document, OUTLETS_FIXTURE, { t: tFor(locales().ru), canSwitch: false });
  assert.ok([...ro.querySelectorAll('input[type=checkbox]')].every(i => i.hasAttribute('disabled')), 'an editor only reads');
});
test('error codes are translated, never raw', () => {
  const { document } = parseHTML('<html><body></body></html>');
  for (const lang of ['ru', 'en', 'he']) {
    const el = UI.renderOutletsTable(document, OUTLETS_FIXTURE, { t: tFor(locales()[lang]), canSwitch: true });
    assert.doesNotMatch(el.textContent, /FEED_FAILED|HOME_PC|NO_ADAPTER/, lang);
  }
  for (const lang of ['ru', 'en', 'he']) for (const c of UI.OUTLET_CODES) assert.equal(typeof tFor(locales()[lang])('newsEditor.outlets.code.' + c, undefined), 'string', lang + ' ' + c);
  for (const lang of ['ru', 'en', 'he']) for (const g of UI.OUTLET_GROUPS) assert.equal(typeof tFor(locales()[lang])('news.outletGroup.' + g, undefined), 'string', lang + ' ' + g);
  for (const lang of ['ru', 'en', 'he']) for (const r of ['north', 'jerusalem', 'center', 'south']) assert.equal(typeof tFor(locales()[lang])('news.region.' + r, undefined), 'string', lang + ' ' + r);
});
