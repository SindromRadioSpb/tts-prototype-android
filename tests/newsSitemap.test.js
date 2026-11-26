'use strict';
// A news sitemap as a feed (plan W3 Task 1; spec 2026-11-26 §5.1, §5.4).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsHarvester, parseNewsSitemap } = require('../news/harvest/newsHarvest');
const { sourceFor } = require('../news/harvest/newsHarvestSources');

const NOW = Date.parse('2026-11-26T08:00:00Z');
const urlset = rows => `<?xml version='1.0' encoding='UTF-8'?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:n="http://www.google.com/schemas/sitemap-news/0.9">`
  + rows.map(r => `<url><loc>${r.loc}</loc>${r.at ? `<n:news><n:publication><n:name>שם</n:name><n:language>heb</n:language></n:publication><n:publication_date>${r.at}</n:publication_date><n:title>${r.title || 'כותרת'}</n:title></n:news>` : ''}</url>`).join('') + '</urlset>';

test('parseNewsSitemap reads links, titles and dates; an index lists its sitemaps', () => {
  const r = parseNewsSitemap(urlset([{ loc: 'https://www.mako.co.il/news-world/2026_q4/Article-00e43e44c9e02a1027.htm', at: '2026-11-26T09:47:00+02:00', title: 'האקרים &amp; חברה' }]));
  assert.deepEqual(r.items, [{ link: 'https://www.mako.co.il/news-world/2026_q4/Article-00e43e44c9e02a1027.htm', title: 'האקרים & חברה', pubDate: '2026-11-26T09:47:00+02:00', image: null }]);
  assert.deepEqual(r.sitemaps, []);
  const idx = parseNewsSitemap(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.mako.co.il/SiteMap/mako_news/1.xml.gz</loc><lastmod>2026-11-26T07:18:14+02:00</lastmod></sitemap></sitemapindex>`);
  assert.deepEqual(idx.sitemaps, ['https://www.mako.co.il/SiteMap/mako_news/1.xml.gz']);
});

async function pollWith(t, web) {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sitemap-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const fetchImpl = async url => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
    const body = web[url];
    return body == null ? new Response('nf', { status: 404 }) : new Response(body);
  };
  const h = createNewsHarvester({ db, dataDir, fetchImpl, sources: [sourceFor('n12')], delayMs: 0, now: () => NOW, limits: { pagesPerPoll: 0, pagesPerOutlet: 0 } });
  const r = await h.poll();
  const rows = await new Promise((res, rej) => db.all("SELECT url FROM news_harvest_items ORDER BY url", (e, x) => e ? rej(e) : res(x)));
  return { r, rows: rows.map(x => x.url) };
}

test('n12 reads mako news sitemap (index → gz), only fresh /news-* links', async t => {
  const fresh = 'https://www.mako.co.il/news-world/2026_q4/Article-00e43e44c9e02a1027.htm';
  const gz = zlib.gzipSync(urlset([
    { loc: fresh, at: '2026-11-26T09:47:00+02:00' },
    { loc: 'https://www.mako.co.il/news-military/2026_q4/Article-1111111111a02a1027.htm', at: '2026-11-20T09:00:00+02:00' }, // old
    { loc: 'https://www.mako.co.il/music-news/Article-01c2aba06ad02a1027.htm', at: '2026-11-26T09:00:00+02:00' },            // not news-*
    { loc: 'https://www.mako.co.il/news-money/2026_q4/Article-2222222222a02a1027.htm' },                                       // no date
  ]));
  const { r, rows } = await pollWith(t, {
    'https://www.mako.co.il/SiteMap/Mako-News-SitemapIndex.xml': `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.mako.co.il/SiteMap/mako_news/1.xml.gz</loc></sitemap></sitemapindex>`,
    'https://www.mako.co.il/SiteMap/mako_news/1.xml.gz': gz,
  });
  assert.deepEqual(rows, [fresh]);
  assert.equal(r.outlets.n12.new, 1); assert.deepEqual(r.outlets.n12.errors, []);
});
