'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const UI = require('../public/js/news-ui');

const NOW = Date.parse('2026-11-12T08:00:00+02:00');
const card = over => ({ article_id: 'na_' + 'a'.repeat(24), work_id: 'na_' + 'a'.repeat(24) + '.b1', snapshot_sha256: 'f'.repeat(64), outlet_id: 'ynet', section: 'politics',
  content_type: 'news', published_at: new Date(NOW - 2 * 3600 * 1000).toISOString(), title_he: 'התקציב עבר', title_ru: 'Бюджет прошёл', summary_ru: 'Кратко.',
  levels: ['B1'], image: { mode: 'source_link', url: 'https://ynet-pic1.yit.co.il/a.jpg', credit_he: 'צילום: א' }, heavy: false, tier: 'fresh', readable: true,
  original_url: 'https://www.ynet.co.il/news/article/abc', ...over });

test('card: outlet tag, reader link with return path, safe original link, lazy no-referrer photo', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderCard(document, card(), { now: NOW, returnTo: '/news.html?outlet=ynet' });
  assert.equal(el.querySelector('.nw-outlet-tag').textContent, 'ynet');
  assert.match(el.querySelector('.nw-card-meta').textContent, /2 ч назад/);
  const main = el.querySelector('a.nw-card-main');
  assert.equal(main.getAttribute('href'), '/library.html?news=' + card().work_id + '&from=news&return_to=' + encodeURIComponent('/news.html?outlet=ynet'));
  const img = el.querySelector('img');
  assert.equal(img.getAttribute('referrerpolicy'), 'no-referrer'); assert.equal(img.getAttribute('loading'), 'lazy');
  const orig = el.querySelector('.nw-card-foot a');
  assert.equal(orig.getAttribute('rel'), 'noopener noreferrer'); assert.equal(orig.getAttribute('href'), 'https://www.ynet.co.il/news/article/abc');
  assert.match(el.querySelector('.nw-card-foot').textContent, /Фото: ynet · צילום: א/);
  assert.equal(el.querySelector('h3').getAttribute('lang'), 'he');
});
test('card: no photo → fallback cover; card-tier → no reader link; unsafe urls dropped', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const none = UI.renderCard(document, card({ image: { mode: 'none' } }), { now: NOW });
  assert.equal(none.querySelector('img'), null); assert.ok(none.querySelector('.nw-cover-fallback'));
  assert.doesNotMatch(none.querySelector('.nw-card-foot').textContent, /Фото/, 'no photo credit without a photo');
  const old = UI.renderCard(document, card({ tier: 'card', readable: false, work_id: null }), { now: NOW });
  assert.equal(old.querySelector('a.nw-card-main'), null); assert.ok(old.querySelector('.nw-card-only'));
  const bad = UI.renderCard(document, card({ image: { mode: 'source_link', url: 'javascript:x' }, original_url: 'javascript:y' }), { now: NOW });
  assert.equal(bad.querySelector('img'), null); assert.equal(bad.querySelector('.nw-card-foot a'), null);
});
test('outlet tile shows the Hebrew name, fresh count and a labelled pin toggle', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderOutletTile(document, { outlet_id: 'haaretz', fresh_count: 12, latest_at: null }, { pinned: true });
  assert.equal(el.querySelector('.nw-tile-name').textContent, 'הארץ');
  assert.match(el.querySelector('.nw-tile-count').textContent, /Свежих: 12/);
  const pin = el.querySelector('.nw-pin');
  assert.equal(pin.getAttribute('aria-pressed'), 'true'); assert.match(pin.getAttribute('aria-label'), /Haaretz/);
  assert.equal(el.querySelector('a').getAttribute('href'), '/news.html?outlet=haaretz');
});
test('url state round-trips and rejects junk', () => {
  const s = UI.parseState('?outlet=walla&section=sport&tier=archive&q=כנסת&from=2026-11-01&to=bad');
  assert.deepEqual(s, { outlet: 'walla', section: 'sport', tier: 'archive', q: 'כנסת', from: '2026-11-01', to: null });
  assert.equal(UI.stateHref(s), '/news.html?outlet=walla&section=sport&tier=archive&q=' + encodeURIComponent('כנסת') + '&from=2026-11-01');
  assert.deepEqual(UI.parseState('?outlet=cnn&section=x'), { outlet: null, section: null, tier: 'fresh', q: '', from: null, to: null });
  assert.equal(UI.feedUrl({ outlet: 'ynet', tier: 'fresh', section: null }, 'abc', true), '/api/news/feed?outlet=ynet&tier=fresh&limit=20&no_heavy=1&cursor=abc');
});
test('every news.* key used by the News tab exists in ru, en and he', () => {
  const root = path.join(__dirname, '..');
  const used = new Set();
  for (const f of ['public/js/news-ui.js', 'public/js/news-reader.js', 'public/js/library-ui.js', 'public/news.html'])
    for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/["'](news\.[a-zA-Z.]*[a-zA-Z])["']/g)) used.add(m[1]);
  for (const id of UI.SECTIONS) used.add('news.section.' + id);
  const sandbox = { window: {} };
  for (const lang of ['ru', 'en', 'he']) vm.runInNewContext(fs.readFileSync(path.join(root, 'public/i18n/locales', lang + '.js'), 'utf8'), sandbox);
  for (const lang of ['ru', 'en', 'he']) for (const key of used) {
    const v = key.split('.').reduce((o, k) => o && o[k], sandbox.window.I18N_LOCALES[lang]);
    assert.equal(typeof v, 'string', lang + ': ' + key);
  }
  for (const lang of ['ru', 'en', 'he']) assert.equal(typeof sandbox.window.I18N_LOCALES[lang].appNav.news, 'string');
});
test('news.html: nav right after body, page script, no inline script', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public/news.html'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(html, /^<body[^>]*>\n<script src="\/js\/app-nav\.js\?v=\d+"><\/script>$/m);
  assert.match(html, /id="nw-root"/);
  assert.match(html, /<script src="\/js\/news-ui\.js\?v=\d+"><\/script>/);
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/);
});

test('review fix: a broken photo keeps the 16:9 frame (no layout shift)', () => {
  const { document, Event } = parseHTML('<html><body></body></html>');
  const el = UI.renderCard(document, card(), { now: NOW });
  el.querySelector('img').dispatchEvent(new Event('error'));
  const cover = el.querySelector('.nw-cover');
  assert.equal(el.querySelector('img'), null);
  assert.match(cover.className, /nw-cover-failed/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/news.css'), 'utf8');
  assert.ok(css.includes('.nw-cover-failed{aspect-ratio:16/9}'), 'failed-photo cover keeps 16:9');
});
test('update gate: a waiting app update shows a banner and holds article taps until the user updates', async () => {
  const { window, document } = parseHTML('<html><body><div id="nw-update" hidden></div><main id="nw-root"><a class="nw-card-main" href="/library.html?news=x">a</a></main></body></html>');
  const posted = [];
  const reg = { waiting: { postMessage: m => posted.push(m) } };
  const gate = UI.installUpdateGate({ document, navigator: { serviceWorker: { getRegistration: async () => reg, addEventListener() {} } }, location: { reload() {} }, setTimeout }, (k, f) => f);
  await gate.ready;
  const banner = document.getElementById('nw-update');
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /новая версия/i);
  const ev = new window.Event('click', { bubbles: true, cancelable: true });
  document.querySelector('a.nw-card-main').dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, 'article tap is held while the old shell would open');
  banner.querySelector('button').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(posted, [{ type: 'SKIP_WAITING' }], 'only the explicit Update press activates the new worker');
});
test('update gate: nothing waiting → no banner, taps pass', async () => {
  const { window, document } = parseHTML('<html><body><div id="nw-update" hidden></div><main id="nw-root"><a class="nw-card-main" href="/x">a</a></main></body></html>');
  const gate = UI.installUpdateGate({ document, navigator: { serviceWorker: { getRegistration: async () => ({ waiting: null }), addEventListener() {} } }, location: { reload() {} }, setTimeout }, (k, f) => f);
  await gate.ready;
  assert.equal(document.getElementById('nw-update').hidden, true);
  const ev = new window.Event('click', { bubbles: true, cancelable: true });
  document.querySelector('a.nw-card-main').dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, false);
});
test('manage menu: only for owner/editor; fresh → «В архив», young archive → «Вернуть в ленту», always «Удалить» with a titled confirm', async () => {
  const { window, document } = parseHTML('<html><body></body></html>');
  assert.equal(UI.renderCard(document, card(), { now: NOW }).querySelector('.nw-manage'), null, 'plain readers see no controls');
  const calls = [];
  const el = UI.renderCard(document, card(), { now: NOW, manage: { act: async (action, c) => { calls.push(action); return true; } } });
  const toggle = el.querySelector('.nw-manage-toggle');
  assert.equal(toggle.getAttribute('aria-haspopup'), 'menu');
  toggle.dispatchEvent(new window.Event('click', { bubbles: true }));
  const items = [...el.querySelectorAll('.nw-manage-menu button')].map(b => b.textContent);
  assert.deepEqual(items, ['В архив', 'Удалить']);
  el.querySelector('.nw-manage-menu button[data-action=delete]').dispatchEvent(new window.Event('click', { bubbles: true }));
  const confirm = el.querySelector('.nw-confirm');
  assert.match(confirm.textContent, /התקציב עבר/); assert.match(confirm.textContent, /30 дней/);
  assert.deepEqual(calls, [], 'nothing deleted before the confirm press');
  confirm.querySelector('button[data-confirm=yes]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(calls, ['delete']);
  const young = UI.renderCard(document, card({ tier: 'archive' }), { now: NOW, manage: { act: async () => true } });
  young.querySelector('.nw-manage-toggle').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual([...young.querySelectorAll('.nw-manage-menu button')].map(b => b.textContent), ['Вернуть в ленту', 'Удалить']);
  const old = UI.renderCard(document, card({ tier: 'archive', published_at: new Date(NOW - 100 * 3600e3).toISOString() }), { now: NOW, manage: { act: async () => true } });
  old.querySelector('.nw-manage-toggle').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual([...old.querySelectorAll('.nw-manage-menu button')].map(b => b.textContent), ['Удалить']);
});
