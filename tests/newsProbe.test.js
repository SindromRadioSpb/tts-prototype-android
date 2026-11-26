'use strict';
// The outlet probe (plan W3 Task 3; spec 2026-11-26 §5.2). The site is synthetic.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');
const { createOutletState } = require('../db/newsOutletState');

const NOW = Date.parse('2026-11-26T08:00:00Z');
const P = i => 'עיריית חיפה הודיעה הבוקר על פתיחת קו אוטובוס חדש מספר ' + i + ' שיחבר בין הקריות לבין מרכז העיר בתוך חצי שעה בלבד, כך נמסר.';
const SRC = { outlet_id: 'haaretz', generic: true, article: /^https:\/\/www\.haaretz\.co\.il\/news\/\d+$/,
  feeds: [{ url: 'https://www.haaretz.co.il/feed/a.xml', section_he: 'חדשות' }, { url: 'https://www.haaretz.co.il/feed/b.xml', section_he: 'כלכלה' }] };
const page = (i, { full = true, paywalled = false, author = true, photo = true, date = true } = {}) => {
  const ld = { '@type': 'NewsArticle', headline: 'כותרת ' + i, ...(date ? { datePublished: '2026-11-26T07:00:00+02:00' } : {}), ...(author ? { author: { name: 'כתב' } } : {}),
    ...(paywalled ? { isAccessibleForFree: false } : {}), ...(photo ? { image: 'https://img.haarets.co.il/x' + i + '.jpg' } : {}) };
  const body = full ? [P(i), P(i + 100), P(i + 200), P(i + 300)].map(p => '<p>' + p + '</p>').join('') : '<p>' + P(i).slice(0, 60) + '</p>';
  return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><article><h1>כותרת ${i}</h1><div class="body">${body}</div></article></body></html>`;
};
const rss = links => '<rss><channel>' + links.map(l => `<item><title>כותרת</title><link>${l}</link><pubDate>Thu, 26 Nov 2026 06:00:00 GMT</pubDate></item>`).join('') + '</channel></rss>';

async function setup(t, pages, { feedA, feedB } = {}) {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-probe-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const outletState = createOutletState({ db, now: () => NOW });
  const links = Object.keys(pages);
  const web = { 'https://www.haaretz.co.il/feed/a.xml': feedA || rss(links.filter((_, i) => i % 2 === 0)), 'https://www.haaretz.co.il/feed/b.xml': feedB || rss(links.filter((_, i) => i % 2 === 1)), ...pages };
  const fetchImpl = async url => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
    const v = web[url];
    if (v === 403) return new Response('<title>Just a moment...</title>', { status: 403 });
    return v == null ? new Response('nf', { status: 404 }) : new Response(v, { headers: { 'content-type': 'text/html' } });
  };
  const h = createNewsHarvester({ db, dataDir, fetchImpl, sources: [SRC], delayMs: 0, now: () => NOW, outletState });
  return { h, outletState };
}
const url = i => 'https://www.haaretz.co.il/news/' + (1000 + i);

test('probe samples 20 free articles across feeds and scores them', async t => {
  const pages = {};
  for (let i = 0; i < 26; i++) pages[url(i)] = page(i, { full: i % 10 !== 9, author: i % 3 !== 0, photo: i !== 4 });
  const { h, outletState } = await setup(t, pages);
  const p = await h.probeOutlet('haaretz');
  assert.equal(p.sampled, 20);
  assert.equal(p.full, 18); assert.equal(p.failed, 2); assert.equal(p.date, 18); assert.equal(p.photo, 17);
  assert.equal(p.pass, true); assert.equal(p.challenged, 0);
  assert.deepEqual((await outletState.get('haaretz')).probe, p);
});
test('paywalled articles are skipped and counted', async t => {
  const pages = {};
  for (let i = 0; i < 26; i++) pages[url(i)] = page(i, { paywalled: i < 4, full: i >= 4 });
  const { h } = await setup(t, pages);
  const p = await h.probeOutlet('haaretz');
  assert.equal(p.paywalled, 4); assert.equal(p.sampled, 20); assert.equal(p.full, 20); assert.equal(p.pass, true);
});
test('probe fails on a challenge', async t => {
  const pages = {};
  for (let i = 0; i < 26; i++) pages[url(i)] = i === 3 ? 403 : page(i);
  const { h } = await setup(t, pages);
  const p = await h.probeOutlet('haaretz');
  assert.equal(p.challenged, 1); assert.equal(p.pass, false);
  assert.ok(p.sampled < 20, 'the probe stops at the challenge');
});
test('a small outlet passes with 8 of 10', async t => {
  const pages = {};
  for (let i = 0; i < 10; i++) pages[url(i)] = page(i, { full: i < 8 });
  const { h } = await setup(t, pages);
  const p = await h.probeOutlet('haaretz');
  assert.equal(p.sampled, 10); assert.equal(p.full, 8); assert.equal(p.pass, true);
});
test('a switched-on outlet is probed again after a week, between polls', async t => {
  const pages = {};
  for (let i = 0; i < 12; i++) pages[url(i)] = page(i);
  const { h, outletState } = await setup(t, pages);
  await outletState.setProbe('haaretz', { at: '2026-11-18T08:00:00.000Z', sampled: 20, full: 20, pass: true });
  await h.poll();                       // the hourly poll has just run: the next tick may probe
  // A tick serves a due edition first; the probe comes on a following tick.
  let r = null;
  for (let i = 0; i < 4 && !(r && r.probed); i++) r = await h.tick();
  assert.equal(r && r.probed, 'haaretz');
  const st = await outletState.get('haaretz');
  assert.equal(st.probe.at, '2026-11-26T08:00:00.000Z'); assert.equal(st.probe.sampled, 12);
  assert.equal(await h.tick(), null, 'a fresh probe is not repeated');
});
