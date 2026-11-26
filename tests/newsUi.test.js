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
  assert.match(el.querySelector('.nw-card-foot').textContent, /Фото: ynet · א/);
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
test('overview url state: view, day and rubric group round-trip; an outlet page is never an overview', () => {
  const s = UI.parseState('?view=overview&day=2026-11-15&group=security');
  assert.equal(s.view, 'overview'); assert.equal(s.day, '2026-11-15'); assert.equal(s.group, 'security');
  assert.equal(UI.stateHref(s), '/news.html?view=overview&day=2026-11-15&group=security');
  assert.equal(UI.parseState('?view=overview&outlet=ynet').view, 'outlet', 'an outlet in the address is the outlet screen');
  assert.equal(UI.parseState('?view=overview&group=bad&day=x').group, null);
});
test('url state round-trips and rejects junk', () => {
  const s = UI.parseState('?outlet=walla&section=sport&tier=archive&q=כנסת&from=2026-11-01&to=bad');
  assert.deepEqual([s.view, s.outlet, s.section, s.q, s.from, s.to], ['outlet', 'walla', 'sport', 'כנסת', '2026-11-01', null]);
  assert.equal(UI.stateHref(s), '/news.html?outlet=walla&from=2026-11-01&section=sport&q=' + encodeURIComponent('כנסת'));
  const junk = UI.parseState('?outlet=cnn&section=x');
  assert.deepEqual([junk.view, junk.outlet, junk.section], [null, null, null]);
});
test('every news.* key used by the News tab exists in ru, en and he', () => {
  const root = path.join(__dirname, '..');
  const used = new Set();
  for (const f of ['public/js/news-ui.js', 'public/js/news-list-ui.js', 'public/js/news-reader.js', 'public/js/library-ui.js', 'public/news.html'])
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

test('card prefers the stored article photo, credits it, and labels the original version', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const src = '/api/news/images/na_' + 'a'.repeat(24) + '/img-1.webp?v=' + 'd'.repeat(12);
  const el = UI.renderCard(document, card({ levels: ['OR', 'B1'], image: { mode: 'source_link', url: 'https://ynet-pic1.yit.co.il/x.jpg', credit_he: 'og',
    stored: { url: src, credit_he: 'צילום: א', alt_ru: 'Пленум' } } }), { now: NOW });
  assert.equal(el.querySelector('.nw-cover img').getAttribute('src'), src);
  assert.match(el.querySelector(".nw-card-foot").textContent, /Фото: ynet · א(?!:)/);
  assert.equal(el.querySelector('.nw-level-original').textContent, 'Оригинал');
  const foreign = UI.renderCard(document, card({ image: { mode: 'none', stored: { url: 'https://evil.example/a.jpg' } } }), { now: NOW });
  assert.equal(foreign.querySelector('.nw-cover img'), null);
});

// ---- editions (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.10) ----------------------
test('news home shows the last ready edition and the next one', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const now = Date.parse('2026-11-16T19:00:00+02:00');
  const el = UI.renderStatusLine(document, { last_ready: { slot: 'evening', day: '2026-11-16', published_at: '2026-11-16T16:04:00.000Z' },
    next: { slot: 'late', day: '2026-11-16', target_ready_at: '2026-11-16T20:00:00.000Z', state: 'waiting' } }, { now });
  assert.equal(el.textContent, 'Обновлено в 18:04 · вечерний выпуск · следующий выпуск около 22:00');
});
test('news home says «готовится»/«задерживается», never «сейчас»', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const now = Date.parse('2026-11-16T11:00:00+02:00');
  const base = { last_ready: { slot: 'morning', day: '2026-11-16', published_at: '2026-11-16T05:40:00.000Z' } };
  const prep = UI.renderStatusLine(document, { ...base, next: { slot: 'midday', day: '2026-11-16', target_ready_at: '2026-11-16T10:00:00.000Z', state: 'preparing' } }, { now });
  assert.equal(prep.textContent, 'Обновлено в 07:40 · утренний выпуск · готовится обеденный выпуск');
  const late = UI.renderStatusLine(document, { ...base, next: { slot: 'midday', day: '2026-11-16', target_ready_at: '2026-11-16T10:00:00.000Z', state: 'late' } }, { now });
  assert.match(late.textContent, /задерживается обеденный выпуск$/);
  assert.doesNotMatch(prep.textContent + late.textContent, /сейчас/);
  const older = UI.renderStatusLine(document, { last_ready: { slot: 'late', day: '2026-11-15', published_at: '2026-11-15T19:55:00.000Z' }, next: null }, { now });
  assert.match(older.textContent, /^Обновлено 15 ноября в 21:55 · поздний выпуск$/);
  assert.equal(UI.renderStatusLine(document, { last_ready: null, next: null }, { now }), null);
});
const ovStory = (key, items, extra) => ({ story_key: key, main: false, items, ...extra });
const ovIt = (n, slot, at) => ({ item_key: 'na_' + String(n).padStart(24, '0'), outlet_id: 'ynet', url: 'https://www.ynet.co.il/news/article/x' + n, section: 'politics',
  title_he: 'כותרת ' + n, title_ru: 'Заголовок ' + n, edition_slot: slot, edition_published_at: at });
test('overview: rows of later editions carry «новое в 18:04»; edition filter narrows the list', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const story = ovStory('S', [ovIt(1, 'morning', '2026-11-16T05:40:00.000Z'), ovIt(2, 'evening', '2026-11-16T16:04:00.000Z')]);
  const el = UI.renderStory(document, story, {});
  const badges = [...el.querySelectorAll('.nw-ov-new-in')].map(b => b.textContent);
  assert.deepEqual(badges, ['новое в 18:04']);
  const stories = [story, ovStory('M', [ovIt(3, 'morning', '2026-11-16T05:40:00.000Z')])];
  assert.deepEqual(UI.filterByEdition(stories, 'evening').map(s => [s.story_key, s.items.length]), [['S', 1]]);
  assert.equal(UI.filterByEdition(stories, null).length, 2);
  const s = UI.parseState('?view=overview&day=2026-11-16&ed=evening');
  assert.equal(s.ed, 'evening'); assert.equal(UI.stateHref(s), '/news.html?view=overview&day=2026-11-16&ed=evening');
  assert.equal(UI.parseState('?view=overview&ed=junk').ed, null);
});
test('overview: since-last-visit marks only rows published after lastVisit; a continued story says so', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const story = ovStory('S', [ovIt(1, 'morning', '2026-11-16T05:40:00.000Z'), ovIt(2, 'evening', '2026-11-16T16:04:00.000Z')], { continued: true });
  const el = UI.renderStory(document, story, { lastVisit: '2026-11-16T10:00:00.000Z' });
  assert.equal(el.querySelectorAll('.nw-ov-since').length, 1);
  assert.match(el.querySelector('.nw-ov-head').textContent, /продолжение со вчера/);
  assert.equal(UI.renderStory(document, story, { lastVisit: null }).querySelectorAll('.nw-ov-since').length, 0, 'no stored visit → no marks');
});

// ---- C3: «выбрано dot» on the card -----------------------------------------------------------------------
test('card: an article dot chose says so, with its reason', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderCard(document, card({ selected_by: 'dot', selection_note_ru: 'Владелец просил больше экономики' }), { now: NOW });
  const tag = el.querySelector('.nw-selected-dot');
  assert.equal(tag.textContent, 'выбрано dot');
  assert.equal(tag.getAttribute('title'), 'Владелец просил больше экономики');
  assert.match(el.querySelector('.nw-selected-note').textContent, /Владелец просил больше экономики/);
  assert.equal(UI.renderCard(document, card(), { now: NOW }).querySelector('.nw-selected-dot'), null);
});

// ---- Findability W1: every study article visible, study first --------------------------------------------
test('splitLearn: every study article of a story is listed, not only the first', () => {
  const s = ovStory('S', [{ ...ovIt(1), work_id: 'w1' }, { ...ovIt(2), work_id: 'w2' }, ovIt(3)]);
  const r = UI.splitLearn([s]);
  assert.equal(r.learn.length, 2);
  assert.equal(r.slice.length, 1); assert.equal(r.slice[0].items.length, 1);
  assert.equal(r.slice[0].items[0].item_key, ovIt(3).item_key);
});
test('splitLearn: learn sorted by freshness across stories', () => {
  const a = { ...ovIt(1), work_id: 'w1', published_at: '2026-11-16T08:00:00.000Z' }, b = { ...ovIt(2), work_id: 'w2', published_at: '2026-11-16T15:00:00.000Z' };
  const r = UI.splitLearn([ovStory('A', [a]), ovStory('B', [b])]);
  assert.deepEqual(r.learn.map(x => x.work_id), ['w2', 'w1']);
  assert.equal(r.slice.length, 0, 'a story of study articles only is not repeated below');
});
test('filterByEdition: main is recomputed after filtering', () => {
  const s = ovStory('S', [{ ...ovIt(1, 'morning'), work_id: 'w1' }, ovIt(2, 'evening')], { main: true });
  assert.equal(UI.filterByEdition([s], 'evening')[0].main, false);
});
test('ovItem: a study item has a Read link and badges', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderOverviewItem(document, { ...ovIt(1), work_id: 'na_' + 'a'.repeat(24) + '.b1', selected_by: 'dot' }, { returnTo: '/news.html?view=overview' });
  assert.match(el.querySelector('a.nw-ov-read').getAttribute('href'), /^\/library\.html\?news=/);
  assert.match(el.textContent, /учебная/); assert.match(el.textContent, /выбрано dot/);
  const plain = UI.renderOverviewItem(document, ovIt(2), {});
  assert.equal(plain.querySelector('a.nw-ov-read'), null);
});
test('list row: publication time in Israel time, with the date when it is another day', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const same = UI.renderOverviewItem(document, { ...ovIt(1), published_at: '2026-11-21T16:04:00.000Z', day: '2026-11-21' }, { showTime: true, day: '2026-11-21' });
  assert.match(same.querySelector('.nw-ov-time').textContent, /18:04/);
  const other = UI.renderOverviewItem(document, { ...ovIt(2), published_at: '2026-11-20T21:30:00.000Z' }, { showTime: true, day: '2026-11-21' });
  assert.match(other.querySelector('.nw-ov-time').textContent, /20 ноября, 23:30/);
});
test('slice row with a kept body offers the original; without a body or as a study article it does not', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const it = { ...ovIt(1), full_ok: 1, body_until: '2099-01-01T00:00:00.000Z' };
  const el = UI.renderOverviewItem(document, it, { rawLink: true, returnTo: '/news.html?view=overview' });
  assert.ok(el.querySelector('a.nw-ov-raw').getAttribute('href').startsWith('/library.html?news=' + it.item_key + '.rw&'));
  assert.equal(UI.renderOverviewItem(document, { ...it, body_until: null }, { rawLink: true }).querySelector('a.nw-ov-raw'), null);
  assert.equal(UI.renderOverviewItem(document, { ...it, work_id: 'na_' + 'a'.repeat(24) + '.b1' }, { rawLink: true }).querySelector('a.nw-ov-raw'), null);
});
test('url state keeps ★ and tag filters', () => {
  const s = UI.parseState('view=overview&star=1&tag=' + encodeURIComponent('выборы'));
  assert.equal(s.star, true); assert.equal(s.tag, 'выборы');
  assert.equal(UI.stateHref(s), '/news.html?view=overview&star=1&tag=' + encodeURIComponent('выборы'));
  assert.equal(UI.parseState('view=overview&tag=' + encodeURIComponent('#x')).tag, null);
});

// ---- C14 from the home PC (spec 2026-11-26 §6.4; plan W2 Task 10) -------------------------------------
function uiLocales() {
  const sandbox = { window: {} };
  for (const lang of ['ru', 'en', 'he']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public/i18n/locales', lang + '.js'), 'utf8'), sandbox);
  return sandbox.window.I18N_LOCALES;
}
const tOf = loc => (k, f) => { const v = k.split('.').reduce((o, x) => o && o[x], loc); return typeof v === 'string' ? v : f; };
const AT = Date.parse('2026-11-26T12:00:00Z');
test('home_pc tile names the route and last harvest time', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderOutletTile(document, { outlet_id: 'c14', route: 'home_pc', last_ok_at: '2026-11-26T11:10:00Z', fresh_count: 0 }, { now: AT, t: tOf(uiLocales().ru) });
  const line = el.querySelector('.nw-tile-relay');
  assert.match(line.textContent, /с домашнего компьютера/); assert.match(line.textContent, /13:10/);
  assert.equal(line.getAttribute('data-stale'), 'false');
});
test('stale after 3 hours says the PC has been silent since …', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderOutletTile(document, { outlet_id: 'c14', route: 'home_pc', last_ok_at: '2026-11-26T08:30:00Z' }, { now: AT, t: tOf(uiLocales().ru) });
  const line = el.querySelector('.nw-tile-relay');
  assert.match(line.textContent, /ПК не присылал сбор с 10:30/); assert.equal(line.getAttribute('data-stale'), 'true');
  const day = UI.renderOutletTile(document, { outlet_id: 'c14', route: 'home_pc', last_ok_at: '2026-11-24T08:30:00Z' }, { now: AT, t: tOf(uiLocales().ru) });
  assert.match(day.querySelector('.nw-tile-relay').textContent, /24\.11/, 'an older silence names the date');
});
test('never harvested says so, not «0»', () => {
  const { document } = parseHTML('<html><body></body></html>');
  for (const lang of ['ru', 'en', 'he']) {
    const el = UI.renderOutletTile(document, { outlet_id: 'c14', route: 'home_pc', last_ok_at: null }, { now: AT, t: tOf(uiLocales()[lang]) });
    const text = el.querySelector('.nw-tile-relay').textContent;
    assert.ok(text && !/news\.relay/.test(text), lang + ': ' + text);
  }
  assert.match(UI.renderOutletTile(document, { outlet_id: 'c14', route: 'home_pc', last_ok_at: null }, { now: AT, t: tOf(uiLocales().ru) }).querySelector('.nw-tile-relay').textContent, /ещё не присылал/);
  const ynet = UI.renderOutletTile(document, { outlet_id: 'ynet', route: 'server' }, { now: AT });
  assert.equal(ynet.querySelector('.nw-tile-relay'), null);
});

// ---- W5: the home page by groups, «Мои издания», the settings panel (spec 2026-11-26 §7.2) ------------------
const Prefs = require('../public/js/news-prefs');
const KNOWN_IDS = require('../public/js/news-outlets').OUTLETS.map(o => o.id);
const SHOWN = [
  { outlet_id: 'ynet', group: 'national' }, { outlet_id: 'walla', group: 'national' }, { outlet_id: 'haipo', group: 'local', region: 'north', enabled_at: '2026-11-26T05:30:00.000Z' },
  { outlet_id: 'kolhair', group: 'local', region: 'jerusalem' }, { outlet_id: 'kikar', group: 'haredi' }, { outlet_id: 'geektime', group: 'economy_tech' }];
test('home: «Мои» first in the reader\'s order, then groups (local by region) without mine and hidden; «new» badge', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const prefs = Prefs.normalize({ mine: ['geektime', 'ynet'], hidden: ['kikar'], collapsed: ['local:jerusalem'] }, KNOWN_IDS);
  const el = UI.renderHomeGroups(document, SHOWN, prefs, { t: tOf(uiLocales().ru), now: Date.parse('2026-11-27T08:00:00Z') });
  const sections = [...el.querySelectorAll('[data-group]')].map(s => s.getAttribute('data-group'));
  assert.deepEqual(sections, ['mine', 'national', 'local:north', 'local:jerusalem']);
  assert.deepEqual([...el.querySelectorAll('[data-group=mine] [data-pin]')].map(b => b.getAttribute('data-pin')), ['geektime', 'ynet']);
  assert.deepEqual([...el.querySelectorAll('[data-group=national] [data-pin]')].map(b => b.getAttribute('data-pin')), ['walla']);
  assert.equal(el.querySelector('[data-pin=kikar]'), null, 'hidden');
  assert.match(el.querySelector('[data-group="local:north"] h2').textContent, /Местные: север/);
  assert.equal(el.querySelector('[data-group="local:jerusalem"] .nw-tiles').hidden, true, 'folded');
  assert.equal(el.querySelector('[data-group="local:jerusalem"] button.nw-group-toggle').getAttribute('aria-expanded'), 'false');
  assert.ok(el.querySelector('[data-pin=haipo]').closest('.nw-tile-wrap').querySelector('.nw-tile-new'), '«новое»');
  assert.ok(el.querySelector('button.nw-prefs-open'));
});
test('mine with no outlets says how to add', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const el = UI.renderHomeGroups(document, SHOWN, Prefs.normalize({}, KNOWN_IDS), { t: tOf(uiLocales().ru) });
  assert.match(el.querySelector('[data-group=mine]').textContent, /☆/);
});
test('settings panel: three states per outlet, arrows in «Мои», whole group at once — every change goes out', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const changes = [];
  const prefs = Prefs.normalize({ mine: ['ynet', 'geektime'] }, KNOWN_IDS);
  const el = UI.renderPrefsPanel(document, SHOWN, prefs, { t: tOf(uiLocales().ru), onChange: p => changes.push(p) });
  const sel = el.querySelector('select[data-outlet=kikar]');
  for (const o of sel.querySelectorAll('option')) o.toggleAttribute('selected', o.value === 'hidden');
  sel.dispatchEvent(new document.defaultView.Event('change'));
  assert.deepEqual(changes.pop().hidden, ['kikar']);
  el.querySelector('button[data-move="geektime"][data-dir="-1"]').dispatchEvent(new document.defaultView.Event('click'));
  assert.deepEqual(changes.pop().mine, ['geektime', 'ynet']);
  el.querySelector('button[data-group-hide="local:north"]').dispatchEvent(new document.defaultView.Event('click'));
  assert.deepEqual(changes.pop().hidden, ['haipo'], 'one region, not every local outlet');
  const arrows = UI.renderPrefsPanel(document, SHOWN, Prefs.normalize({ mine: ['nope-off', 'ynet', 'geektime'] }, KNOWN_IDS.concat(['nope-off'])), { t: tOf(uiLocales().ru) });
  assert.equal(arrows.querySelector('button[data-move="ynet"][data-dir="-1"]').hasAttribute('disabled'), true, 'first visible: no «up»');
  assert.match(arrows.querySelector('button[data-move="ynet"][data-dir="1"]').getAttribute('aria-label'), /ynet/);
  for (const lang of ['ru', 'en', 'he']) assert.doesNotMatch(UI.renderPrefsPanel(document, SHOWN, prefs, { t: tOf(uiLocales()[lang]) }).textContent, /news\./, lang);
});
