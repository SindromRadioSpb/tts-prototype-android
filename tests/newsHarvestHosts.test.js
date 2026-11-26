'use strict';
// W3 Task 4: advertising never enters the slice; a bot check by redirect is a challenge; hosts in parallel.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');

const NOW = Date.parse('2026-11-26T08:00:00Z');
const P = i => 'עיריית חיפה הודיעה הבוקר על פתיחת קו אוטובוס חדש מספר ' + i + ' שיחבר בין הקריות לבין מרכז העיר בתוך חצי שעה בלבד, כך נמסר.';
const article = (i, { ad = false } = {}) => `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline: 'כותרת ' + i, datePublished: '2026-11-26T07:00:00+02:00' })}</script></head>
  <body><article>${ad ? '<span>תוכן מקודם</span>' : ''}<h1>כותרת ${i}</h1><div class="body">${[P(i), P(i + 1), P(i + 2), P(i + 3)].map(p => '<p>' + p + '</p>').join('')}</div></article></body></html>`;
const rss = links => '<rss><channel>' + links.map(l => `<item><title>כותרת</title><link>${l}</link><pubDate>Thu, 26 Nov 2026 06:00:00 GMT</pubDate></item>`).join('') + '</channel></rss>';
const src = (id, host) => ({ outlet_id: id, generic: true, article: new RegExp('^https://' + host.replace(/\./g, '\\.') + '/a/\\d+$'), feeds: [{ url: 'https://' + host + '/feed', section_he: 'חדשות' }] });

async function setup(t, sources, web, { onFetch } = {}) {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-hosts-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const fetchImpl = async url => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
    if (onFetch) await onFetch(url);
    const v = web[url];
    if (v && v.redirectTo) { const r = new Response('<html>validation</html>'); Object.defineProperty(r, 'url', { value: v.redirectTo }); Object.defineProperty(r, 'redirected', { value: true }); return r; }
    return v == null ? new Response('nf', { status: 404 }) : new Response(v, { headers: { 'content-type': 'text/html' } });
  };
  const h = createNewsHarvester({ db, dataDir, fetchImpl, sources, delayMs: 20, now: () => NOW });
  return { db, h };
}
const rows = db => new Promise((res, rej) => db.all('SELECT url, status, reason FROM news_harvest_items ORDER BY url', (e, r) => e ? rej(e) : res(r)));

test('promoted pages never enter the slice', async t => {
  const S = [src('haaretz', 'www.haaretz.co.il')];
  const { db, h } = await setup(t, S, { 'https://www.haaretz.co.il/feed': rss(['https://www.haaretz.co.il/a/1', 'https://www.haaretz.co.il/a/2']),
    'https://www.haaretz.co.il/a/1': article(1), 'https://www.haaretz.co.il/a/2': article(2, { ad: true }) });
  await h.poll();
  assert.deepEqual((await rows(db)).map(r => [r.url.slice(-1), r.status, r.reason]), [['1', 'ready', null], ['2', 'failed', 'PROMOTED']]);
});
test('a redirect to a bot check is a challenge, not an empty article', async t => {
  const S = [src('maariv', 'www.maariv.co.il')];
  const { db, h } = await setup(t, S, { 'https://www.maariv.co.il/feed': rss(['https://www.maariv.co.il/a/1', 'https://www.maariv.co.il/a/2']),
    'https://www.maariv.co.il/a/1': { redirectTo: 'https://validate.perfdrive.com/?ssa=x' }, 'https://www.maariv.co.il/a/2': { redirectTo: 'https://validate.perfdrive.com/?ssa=y' } });
  const r = await h.poll();
  assert.ok(r.outlets.maariv.errors.includes('BOT_CHALLENGE'));
  assert.equal((await rows(db)).length, 2);
  const st = await rows(db);
  assert.ok(st.every(x => x.status === 'queued'), 'the route stops: both pages wait for the next poll');
});
test('hosts run in parallel, one host stays sequential', async t => {
  const S = [src('ynet', 'www.ynet.co.il'), src('walla', 'www.walla.co.il'), src('maariv', 'www.maariv.co.il')];
  const web = {};
  for (const s of S) {
    const host = s.feeds[0].url.split('/')[2], links = [1, 2, 3].map(i => 'https://' + host + '/a/' + i);
    web[s.feeds[0].url] = rss(links); links.forEach((l, i) => { web[l] = article(i); });
  }
  let active = 0, peak = 0; const perHost = new Map(); let hostOverlap = false;
  const { h } = await setup(t, S, web, { onFetch: async url => {
    if (!/\/a\/\d$/.test(url)) return;
    const host = url.split('/')[2];
    if (perHost.get(host)) hostOverlap = true;
    perHost.set(host, true); active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 30));
    active--; perHost.set(host, false);
  } });
  const r = await h.poll();
  assert.equal(r.pages, 9);
  assert.ok(peak >= 2, 'several hosts at once (peak ' + peak + ')');
  assert.equal(hostOverlap, false, 'never two requests to one host at once');
});

// ---- review W3 ------------------------------------------------------------------------------------------
test('one broken page does not end the poll; the other pages are read', async t => {
  const S = [{ ...src('ynet', 'www.ynet.co.il'), hydrate: doc => { if (doc.querySelector('h1').textContent.includes('כותרת 1')) throw new Error('broken page'); } }];
  const { db, h } = await setup(t, S, { 'https://www.ynet.co.il/feed': rss(['https://www.ynet.co.il/a/1', 'https://www.ynet.co.il/a/2']),
    'https://www.ynet.co.il/a/1': article(1), 'https://www.ynet.co.il/a/2': article(2) });
  const r = await h.poll();
  assert.ok(r, 'the poll finishes');
  const st = await rows(db);
  assert.equal(st.find(x => x.url.endsWith('/2')).status, 'ready');
  assert.equal(st.find(x => x.url.endsWith('/1')).status, 'queued', 'the broken page waits for a retry');
});
test('a probe that throws still records its time: it is not re-run every tick', async t => {
  const { createOutletState } = require('../db/newsOutletState');
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-probe-err-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const outletState = createOutletState({ db, now: () => NOW });
  const S = [{ ...src('ynet', 'www.ynet.co.il'), hydrate: () => { throw new Error('broken page'); } }];
  const web = { 'https://www.ynet.co.il/feed': rss(['https://www.ynet.co.il/a/1']), 'https://www.ynet.co.il/a/1': article(1) };
  const fetchImpl = async url => url.endsWith('/robots.txt') ? new Response('User-agent: *\nAllow: /') : web[url] ? new Response(web[url]) : new Response('nf', { status: 404 });
  const h = createNewsHarvester({ db, dataDir, fetchImpl, sources: S, delayMs: 0, now: () => NOW, outletState });
  await h.probeOutlet('ynet').catch(() => {});
  const st = await outletState.get('ynet');
  assert.equal(st.probe_at, '2026-11-26T08:00:00.000Z'); assert.equal(st.probe.pass, false); assert.ok(st.probe.errors.length);
});
test('a manual probe never runs beside a poll', async t => {
  const S = [src('ynet', 'www.ynet.co.il')];
  let release;
  const gate = new Promise(r => { release = r; });
  const { h } = await setup(t, S, { 'https://www.ynet.co.il/feed': rss(['https://www.ynet.co.il/a/1']), 'https://www.ynet.co.il/a/1': article(1) }, { onFetch: async () => { await gate; } });
  const polling = h.poll();
  await assert.rejects(h.probeNow('ynet'), e => e.code === 'HARVEST_RUNNING');
  release(); await polling;
});
