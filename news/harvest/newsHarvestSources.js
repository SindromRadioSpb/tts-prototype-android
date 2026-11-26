'use strict';
const { hydrateSections } = require('./newsFlight');
const Outlets = require('../../public/js/news-outlets');
// Where the harvester reads (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16–§17): the RSS feeds of
// each outlet, polled every hour, and how its article page is laid out. Flash feeds («מבזקים») are left
// out on purpose: two-line items are not articles. `section_he` is the feed's rubric — the page's own
// rubric wins when it has one. The general feed goes last: an article listed in a rubric feed too keeps
// that rubric (the first feed that lists an article names it). `text` = the body paragraphs; photos are the <figure> elements between
// them. `image` turns a page-size photo address into a larger one.
// C14 answers servers with a Cloudflare challenge: the harvester does not get around it, the outlet is
// reported as closed and can be harvested from a home computer with scripts/news/harvest.js.

const SOURCES = [
  { outlet_id: 'ynet', feeds: [
    { url: 'https://www.ynet.co.il/Integration/StoryRss6.xml', section_he: 'כלכלה' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss538.xml', section_he: 'תרבות ובידור' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss194.xml', section_he: 'דעות' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss3.xml', section_he: 'ספורט' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss544.xml', section_he: 'דיגיטל' },
    { url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', section_he: 'חדשות' }],
    article: /^https:\/\/www\.ynet\.co\.il\/(?:[a-z-]+\/)+article\//,
    text: 'div.text_editor_paragraph, .DraftEditor-editorContainer h2, .DraftEditor-editorContainer h3', skipText: '.copyright-27a-notice',
    skipImage: /big_defual_image|\/Common\/Api\//,
    image: u => u.replace(/\/cdn-cgi\/image\/[^/]+\//, '/') },
  { outlet_id: 'walla', feeds: [
    { url: 'https://rss.walla.co.il/feed/1', section_he: 'חדשות בארץ' },
    { url: 'https://rss.walla.co.il/feed/10', section_he: 'פלילים ומשפט' },
    { url: 'https://rss.walla.co.il/feed/3', section_he: 'כלכלה' },
    { url: 'https://rss.walla.co.il/feed/4', section_he: 'טכנולוגיה' },
    { url: 'https://rss.walla.co.il/feed/7', section_he: 'ספורט' }],
    article: /^https:\/\/[a-z]+\.walla\.co\.il\/.+\/\d{6,}$/,
    // Two layouts: the new one (www.walla.co.il/news/…) and the older one on news./finance./sports. subdomains.
    text: '[class*="styles_prose"] p, [class*="styles_prose"] h2, [class*="styles_prose"] h3, [class*="styles_prose"] li, '
      + 'section.article-content .text-content p, section.article-content .text-content li, section.article-content h3',
    skipImage: /\/w_96\//, image: u => u },
  { outlet_id: 'maariv', feeds: [
    { url: 'https://www.maariv.co.il/rss/rssfeedsopinions', section_he: 'דעות' },
    { url: 'https://www.maariv.co.il/rss/rssfeedsallnews', section_he: 'חדשות' }],
    article: /^https:\/\/www\.maariv\.co\.il\/.+\/article-\d+/,
    text: 'section.article-body-container p, section.article-body-container h2, section.article-body-container h3, section.article-body-container li',
    skipImage: /h_250,w_250/,
    hydrate: (document, html) => hydrateSections(document, document.querySelector('section.article-body-container'), html),
    image: u => u.replace(/\/image\/upload\/[^/]+\/[^/]+\/(\d+)$/, '/image/upload/f_jpg,q_85,w_1600/$1') },
  // N12: the RSS feed lagged by days (2026-11-26: newest item 6 days old); mako's news sitemap is fresh (W3).
  { outlet_id: 'n12', feeds: [{ kind: 'sitemap', url: 'https://www.mako.co.il/SiteMap/Mako-News-SitemapIndex.xml', section_he: 'חדשות' }],
    article: /^https:\/\/www\.mako\.co\.il\/news-[^/]+\/.+Article-[0-9a-f]+\.htm/,
    text: '[class*="ArticleBodyWrapper"] p, [class*="ArticleBodyWrapper"] h2, [class*="ArticleBodyWrapper"] h3, [class*="ArticleBodyWrapper"] li',
    subtitle: '[class*="ArticleSubtitle"]', image: u => u },
  { outlet_id: 'haaretz', feeds: [{ url: 'https://www.haaretz.co.il/srv/htz---all-articles', section_he: 'חדשות' }],
    article: /^https:\/\/www\.haaretz\.co\.il\/.+\/ty-article/,
    text: 'section.article-body-wrapper p, section.article-body-wrapper h2, section.article-body-wrapper h3, section.article-body-wrapper li',
    // Page photos come 420 px wide; the CDN gives the same crop at any width (height kept in proportion).
    image: u => u.replace(/([?&])width=(\d+)&height=(\d+)/, (m, sep, w, h) => sep + 'width=1600&height=' + Math.round(h * 1600 / w)) },
  { outlet_id: 'c14', feeds: [{ url: 'https://www.c14.co.il/feed/', section_he: 'חדשות' }],
    article: /^https:\/\/www\.(c14|now14)\.co\.il\/article\/\d+/,
    text: '[class*="ArticleContent_articleContent"] p, [class*="ArticleContent_articleContent"] h2, [class*="ArticleContent_articleContent"] h3, [class*="ArticleContent_articleContent"] li',
    skipImage: /\/2025\/04\/%D7%9E%D7%91%D7%96%D7%A7|מבזק\.png|\/_next\/image/, image: u => u },
  // Wave 4 (spec 2026-11-26 §5.1): read generically from their feeds; the probe decides whether they go into the slice.
  { outlet_id: 'news13', generic: true, article: /^https:\/\/(?:www\.)?13tv\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ kind: "sitemap", url: "https://13tv.co.il/Services/sitemapGenerator/xmls/news_sitemap.xml", section_he: "חדשות" }] },
  { outlet_id: 'israelhayom', generic: true, article: /^https:\/\/(?:www\.)?israelhayom\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.israelhayom.co.il/rss.xml", section_he: "חדשות" }] },
  { outlet_id: 'makorrishon', generic: true, article: /^https:\/\/(?:www\.)?makorrishon\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ kind: "sitemap", url: "https://www.makorrishon.co.il/sitemaps/sitemap-news.xml", section_he: "חדשות" }] },
  { outlet_id: 'zman', generic: true, article: /^https:\/\/(?:www\.)?zman\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ kind: "sitemap", url: "https://www.zman.co.il/news-sitemap.xml", section_he: "חדשות" }] },
  { outlet_id: '0404', generic: true, article: /^https:\/\/(?:www\.)?0404\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ kind: "sitemap", url: "https://0404.co.il/news-sitemap.xml", section_he: "חדשות" }] },
  { outlet_id: 'davar', generic: true, article: /^https:\/\/(?:www\.)?davar1\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.davar1.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'mekomit', generic: true, article: /^https:\/\/(?:www\.)?mekomit\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.mekomit.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'hamakom', generic: true, article: /^https:\/\/(?:www\.)?ha\-makom\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.ha-makom.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'shakuf', generic: true, article: /^https:\/\/(?:www\.)?shakuf\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://shakuf.co.il/feed", section_he: "חדשות" }] },
  { outlet_id: 'the7eye', generic: true, article: /^https:\/\/(?:www\.)?the7eye\.org\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.the7eye.org.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'srugim', generic: true, article: /^https:\/\/(?:www\.)?srugim\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.srugim.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'kipa', generic: true, article: /^https:\/\/(?:www\.)?kipa\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.kipa.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'kikar', generic: true, article: /^https:\/\/(?:www\.)?kikar\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.kikar.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'bhol', generic: true, article: /^https:\/\/(?:www\.)?bhol\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.bhol.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'hmnews', generic: true, article: /^https:\/\/(?:www\.)?hm\-news\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://hm-news.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'haipo', generic: true, article: /^https:\/\/(?:www\.)?haipo\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://haipo.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'colbo', generic: true, article: /^https:\/\/(?:www\.)?colbonews\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.colbonews.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'hkn', generic: true, article: /^https:\/\/(?:www\.)?hkn\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://hkn.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'blinker', generic: true, article: /^https:\/\/(?:www\.)?blinker\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://blinker.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'kolhair', generic: true, article: /^https:\/\/(?:www\.)?kolhair\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.kolhair.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'news08', generic: true, article: /^https:\/\/(?:www\.)?news08\.net\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.news08.net/feed/", section_he: "חדשות" }, { kind: "sitemap", url: "https://www.news08.net/sitemap-news.xml", section_he: "חדשות" }] },
  { outlet_id: 'geektime', generic: true, article: /^https:\/\/(?:www\.)?geektime\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.geektime.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'techtime', generic: true, article: /^https:\/\/(?:www\.)?techtime\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://techtime.co.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'ice', generic: true, article: /^https:\/\/(?:www\.)?ice\.co\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.ice.co.il/rss", section_he: "כלכלה" }] },
  { outlet_id: 'hayadan', generic: true, article: /^https:\/\/(?:www\.)?hayadan\.org\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.hayadan.org.il/feed/", section_he: "חדשות" }] },
  { outlet_id: 'zavit', generic: true, article: /^https:\/\/(?:www\.)?zavit\.org\.il\/(?!tag\/|category\/|author\/|page\/|feed)[^?#]+$/, feeds: [{ url: "https://www.zavit.org.il/feed/", section_he: "חדשות" }] },
];

// Closed-candidate orders may retrieve only photo URLs already recorded by the harvester,
// never a URL supplied by the caller, a general article origin, or a redirected request.
const ARCHIVE_IMAGE_HOSTS = {
  ynet: /^(?:ynet-pic[0-9]+\.yit\.co\.il|images1\.ynet\.co\.il)$/,
  // image-resizer-walla.walla.cloud: Walla's resizer (2026-11-22: 70 slice photos were refused without it).
  walla: /^(?:images\.wcdn\.co\.il|img\.wcdn\.co\.il|image-resizer-walla\.walla\.cloud)$/,
  maariv: /^images\.maariv\.co\.il$/,
  n12: /^(?:img\.mako\.co\.il|images\.mako\.co\.il|images\.n12\.co\.il)$/,
  haaretz: /^(?:img\.haarets\.co\.il|gif\.haarets\.co\.il|images\.haaretz\.co\.il)$/,
  // C14 serves article photos from its own site (www…/wp-content/uploads/, home-PC pilot 2026-11-26).
  c14: /^(?:cdn\.c14\.co\.il|static\.c14\.co\.il|www\.c14\.co\.il)$/,
};
// An outlet read generically (wave 4) keeps its photos on its own site or its own subdomains
// (…/wp-content/uploads/, cdn.geektime.co.il): only those, by the catalog's domains of that outlet.
function genericPhotoHost(outletId, u) {
  const src = bySource.get(outletId);
  return !!(src && src.generic) && Outlets.outletForUrl(u.href) === outletId;
}
function canFetchArchiveImage(outletId, src) {
  const hosts = Object.hasOwn(ARCHIVE_IMAGE_HOSTS, outletId) && ARCHIVE_IMAGE_HOSTS[outletId];
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    if (!hosts) return genericPhotoHost(outletId, u);
    if (!hosts.test(u.hostname)) return false;
    if (outletId === 'c14' && u.hostname === 'www.c14.co.il') return u.pathname.startsWith('/wp-content/uploads/');
    return outletId !== 'maariv' || u.pathname.startsWith('/image/upload/');
  } catch (_) { return false; }
}

const bySource = new Map(SOURCES.map(s => [s.outlet_id, s]));
module.exports = { SOURCES, sourceFor: id => bySource.get(id) || null, canFetchArchiveImage };
