'use strict';
// Reads one article page into its parts (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16):
// title, subtitle, author, dates, body paragraphs in order, and the photos that stand between them
// with their captions and credits as printed on the site. Pure: HTML in, data out.
const { parseHTML } = require('linkedom');
const { normalizeHebrewPunct } = require('./newsText');
const Outlets = require('../../public/js/news-outlets');

const HEBREW = /[א-ת]/;
const JUNK = 'script,style,noscript,iframe,svg,dialog,nav,aside,form,template,blockquote.twitter-tweet,blockquote.instagram-media,blockquote.tiktok-embed';
const JUNK_LINE = /^(לכתבה המלאה|לכתבה הקודמת|קראו (גם|עוד)|כתבות נוספות|עוד באתר|לחצו כאן|הצטרפו ל|עקבו אחרי|להורדת האפליקציה|שתפו|תגיות|הירשמו לניוזלטר|הכתבה המלאה)/;
const CREDIT = /[\s(|]*((?:צילום|צילומים|קרדיט|צלם|צילום מסך)\s*:\s*[^)|]+?)\s*\)?\s*$/;
const CAPTION_NOISE = /^(גלריה|סגירה|הגדלה)+\s*/;

const SECTION_RULES = [
  ['opinion', /דעות|טור|פרשנות|opinion|blogs?\b/i], ['politics', /פוליטי|מדיני|בחירות|הכנסת|politics|elections/i],
  ['security', /ביטחון|צבא|מלחמה|military|security|idf/i], ['world', /עולם|חוץ|בינלאומי|world|foreign/i],
  ['economy', /כלכלה|כסף|נדל|שוק ההון|economy|money|business|finance/i], ['consumer', /צרכנות|consumer/i],
  ['sport', /ספורט|כדורגל|כדורסל|sport/i], ['culture', /תרבות|בידור|קולנוע|טלוויזיה|מוזיקה|ספרות|culture|entertainment|celebs|music|movies|tv/i],
  ['tech', /טכנולוגיה|דיגיטל|tech|digital|computers/i], ['health', /בריאות|רפואה|health/i], ['science', /מדע|סביבה|science|environment/i],
  ['lifestyle', /אוכל|תיירות|טיולים|אופנה|יחסים|lifestyle|food|travel|style|horoscope/i],
];

// Israel local time with its offset (winter +02:00, summer +03:00): the format wants local dates.
function israelIso(ms) {
  const d = new Date(ms);
  if (!isFinite(d)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map(p => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const off = Math.round((local - Math.floor(ms / 1000) * 1000) / 60000), sign = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(s);
  return isFinite(ms) ? ms : null;
}

function readLd(document) {
  let best = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let j; try { j = JSON.parse(s.textContent); } catch (_) { continue; }
    for (const o of [].concat(j && j['@graph'] ? j['@graph'] : j)) {
      if (!o || typeof o !== 'object') continue;
      const type = [].concat(o['@type'] || []).join(' ');
      if (!/Article|Posting/i.test(type)) continue;
      if (!best || String(o.articleBody || '').length > String(best.articleBody || '').length) best = o;
    }
  }
  return best || {};
}
const clean = s => normalizeHebrewPunct(String(s || '').replace(/\s+/g, ' ').trim());
const firstImage = v => { const x = [].concat(v || [])[0]; return typeof x === 'string' ? x : x && x.url || null; };
// One photo under several addresses (sizes, crops, CDN prefixes): the file name without size marks.
function imageKey(u) {
  try {
    const parts = new URL(u).pathname.split('/').filter(Boolean);
    const name = (parts.pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/(_\d+x\d+|_large|_small|-\d{2})$/i, '');
    if (/^\d{5,}$/.test(name)) return name;
    return /^\d+$/.test(name) || name.length < 8 ? (parts.pop() || '') + '/' + name : name.split('_')[0];
  } catch (_) { return String(u); }
}
function absolute(u, base) { if (!u || !String(u).trim()) return null; try { const x = new URL(u, base); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.replace(/^http:/, 'https:') : null; } catch (_) { return null; } }

// Logos, author photos, icons and placeholders are not article photos.
const BYLINE = /avatar|author|writer|byline|reporter|ArticleCredits/i;
const NOT_A_PHOTO =/^data:|\.svg(\?|$)|logo|avatar|placeholder|default[_-]?image/i;
const skipped = (src, source) => NOT_A_PHOTO.test(src) || !!(source.skipImage && source.skipImage.test(src));
function bestSrc(img, base) {
  const set = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
  let best = null, bestW = -1;
  for (const part of set.split(',')) {
    const [u, w] = part.trim().split(/\s+/);
    const n = parseInt(w, 10) || 0;
    if (u && n > bestW) { best = u; bestW = n; }
  }
  return absolute(best || img.getAttribute('data-src') || img.getAttribute('src') || '', base);
}
function parseFigure(fig, base, source) {
  const img = fig.querySelector('img');
  if (!img) return null;
  // The author's avatar in the byline (mako wraps it in a <figure> above the body) is not an article photo.
  for (let el = img; el && el !== fig.ownerDocument.body; el = el.parentElement)
    if (BYLINE.test(el.getAttribute && el.getAttribute('class') || '')) return null;
  const src = bestSrc(img, base);
  if (!src || skipped(src, source)) return null;
  const capEl = fig.querySelector('figcaption');
  let text = clean((capEl || fig).textContent).replace(CAPTION_NOISE, '');
  const half = text.length / 2;
  if (text.length > 8 && text.length % 2 === 0 && text.slice(0, half) === text.slice(half)) text = text.slice(0, half).trim();
  let credit = '';
  const m = text.match(CREDIT);
  if (m) { credit = clean(m[1]); text = clean(text.slice(0, m.index)).replace(/[|\-–]\s*$/, '').trim(); }
  return { src: (source.image || (u => u))(src), caption_he: text.slice(0, 400), credit_he: credit.slice(0, 400), alt_he: clean(img.getAttribute('alt')).slice(0, 400) };
}

function sectionFor(sectionHe, url) {
  const path = (() => { try { return new URL(url).pathname; } catch (_) { return ''; } })();
  for (const [id, re] of SECTION_RULES) if (re.test(sectionHe || '') || re.test(path)) return id;
  return 'news';
}

// → { ok:true, article:{…} } | { ok:false, reason }
function extractArticle(html, { url, source, feed = {} }) {
  const { document } = parseHTML(String(html || ''));
  const ld = readLd(document);
  const meta = n => { const e = document.querySelector(`meta[property="${n}"], meta[name="${n}"]`); return e ? e.getAttribute('content') : null; };
  const title = clean((document.querySelector('h1') || {}).textContent) || clean(ld.headline) || clean(String(meta('og:title') || '').replace(/\s*[|–-]\s*[^|–-]+$/, ''));
  for (const j of document.querySelectorAll(JUNK)) j.remove();
  if (source.hydrate) source.hydrate(document, html);
  const picked = [...document.querySelectorAll(source.text)].filter(el => HEBREW.test(el.textContent)
    && !(source.skipText && el.closest(source.skipText)) && !el.closest('figure, figcaption'));
  const set = new Set(picked);
  const blocks = picked.filter(el => { for (let a = el.parentElement; a; a = a.parentElement) if (set.has(a)) return false; return true; });
  if (!blocks.length) return { ok: false, reason: 'NO_BODY' };
  if (!HEBREW.test(title)) return { ok: false, reason: 'NO_TITLE' };

  const order = new Map([...document.querySelectorAll('*')].map((el, i) => [el, i]));
  const first = order.get(blocks[0]), last = order.get(blocks[blocks.length - 1]);
  const scope = blocks[0].closest('article') || blocks[0].closest('main') || document.body || document;
  const figures = [...scope.querySelectorAll('figure')].filter(f => !f.parentElement || !f.parentElement.closest('figure'));
  const items = blocks.map(el => ({ kind: 'text', at: order.get(el), el }))
    .concat(figures.map(el => ({ kind: 'figure', at: order.get(el), el })).filter(x => x.at <= last))
    .sort((a, b) => a.at - b.at);

  const paragraphs = [], images = [], seen = new Set();
  let hero = null;
  for (const it of items) {
    if (it.kind === 'text') {
      // A line break inside a block separates a bold subheading from its text: two paragraphs.
      for (const br of it.el.querySelectorAll('br')) br.replaceWith(document.createTextNode(' '));
      for (const part of String(it.el.textContent).split(' ')) {
        const text = clean(part);
        if (!text || !HEBREW.test(text) || JUNK_LINE.test(text) || text === paragraphs[paragraphs.length - 1]) continue;
        paragraphs.push(text);
      }
      continue;
    }
    const f = parseFigure(it.el, url, source);
    if (!f || seen.has(imageKey(f.src))) continue;
    seen.add(imageKey(f.src));
    if (it.at < first) hero = f;          // the photo right above the body is the main one
    else images.push({ ...f, role: 'inline', after_p: paragraphs.length });
  }
  if (!paragraphs.length) return { ok: false, reason: 'NO_BODY' };
  if (!hero) {
    // No photo above the body: the page's main image (og:image) is usually one of the body photos —
    // then that photo, with its caption, becomes the main one; so does a photo right after paragraph 1.
    const fallback = absolute(firstImage(ld.image) || meta('og:image') || feed.image || '', url);
    const same = fallback ? images.findIndex(im => imageKey(im.src) === imageKey(fallback)) : -1;
    const at = same >= 0 ? same : (images.length && images[0].after_p <= 1 ? 0 : -1);
    if (at >= 0) { hero = images[at]; images.splice(at, 1); }
    else if (fallback && !skipped(fallback, source)) hero = { src: (source.image || (u => u))(fallback), caption_he: '', credit_he: '', alt_he: '' };
  }
  if (hero) { delete hero.after_p; images.unshift({ ...hero, role: 'hero' }); }

  const subtitleRaw = clean(source.subtitle && document.querySelector(source.subtitle) ? document.querySelector(source.subtitle).textContent : (ld.description || meta('og:description') || meta('description') || ''));
  const firstText = paragraphs[0] || '';
  const subtitle = subtitleRaw && HEBREW.test(subtitleRaw) && !/(\.\.\.|…)$/.test(subtitleRaw) && !firstText.startsWith(subtitleRaw.slice(0, 40)) && subtitleRaw !== title ? subtitleRaw : '';
  const authors = [].concat(ld.author || []).map(a => clean(typeof a === 'string' ? a : a && a.name)).filter(Boolean);
  const sectionHe = clean([].concat(ld.articleSection || [])[0] || meta('article:section') || feed.section_he || 'חדשות');
  const published = parseDate(ld.datePublished) || parseDate(meta('article:published_time')) || parseDate(feed.pubDate);
  const modified = parseDate(ld.dateModified) || parseDate(meta('article:modified_time'));
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  let canonical = absolute(canonicalEl ? canonicalEl.getAttribute('href') : (meta('og:url') || url), url) || url;
  // A syndicated article (N12 sport from sport5.co.il) points to its first home: keep the page we read.
  if (Outlets.outletForUrl(canonical) !== Outlets.outletForUrl(url)) canonical = url.split('#')[0];
  const free = ld.isAccessibleForFree;
  const section = sectionFor(sectionHe, canonical);
  return { ok: true, article: {
    url, canonical_url: canonical, title_he: title, subtitle_he: subtitle.slice(0, 600), author: authors.join(', ') || null,
    published_at: published ? israelIso(published) : null, updated_at: modified && modified !== published ? israelIso(modified) : null,
    section_original_he: sectionHe, section, content_type: section === 'opinion' ? 'opinion' : 'news',
    paywalled: free === false || String(free) === 'false' || /\/\.premium\//.test(url),
    paragraphs, images: images.slice(0, 12),
  } };
}

module.exports = { extractArticle, israelIso, sectionFor };
