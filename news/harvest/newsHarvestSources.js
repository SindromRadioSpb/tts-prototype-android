'use strict';
const { hydrateSections } = require('./newsFlight');
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
  { outlet_id: 'n12', feeds: [{ url: 'https://rcs.mako.co.il/rss/31750a2610f26110VgnVCM1000005201000aRCRD.xml', section_he: 'חדשות' }],
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
];

const bySource = new Map(SOURCES.map(s => [s.outlet_id, s]));
module.exports = { SOURCES, sourceFor: id => bySource.get(id) || null };
