'use strict';

const fs = require('fs');
const path = require('path');
const learningRelease = require('./db/benyehudaLearningRelease');

const ORIGIN = 'https://linguistpro.kolosei.com';
const roomSource = fs.readFileSync(path.join(__dirname, 'public', 'js', 'library-ui.js'), 'utf8');
const version = Number(roomSource.match(/const CORPUS_CATALOG_VERSION = (\d+);/)?.[1]);
if (!Number.isInteger(version)) throw new Error('CORPUS_CATALOG_VERSION missing');
const catalog = require('./public/data/benyehuda/corpus-index-v' + version + '.json');
const baked = new Map((catalog.ready || []).map((work) => [String(work.id), work]));
const shell = fs.readFileSync(path.join(__dirname, 'public', 'library.html'), 'utf8');
const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function canonical(params) {
  if (params.corpus_work) return ORIGIN + '/library.html?corpus_work=' + encodeURIComponent(params.corpus_work);
  return ORIGIN + '/library.html?public_corpus=' + encodeURIComponent(params.public_corpus) + '&public_work=' + encodeURIComponent(params.public_work);
}

function benyehuda(id, dataDir) {
  if (!/^\d{1,8}$/.test(String(id || ''))) return null;
  const card = baked.get(String(id));
  if (!card) return null;
  const edition = learningRelease.publishedFile(id);
  const relative = path.join('benyehuda', 'works', edition?.name || String(id) + '.json');
  const local = path.join(__dirname, 'public', 'data', relative);
  const volume = path.join(dataDir, relative);
  const file = fs.existsSync(volume) ? volume : local;
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  if (edition) learningRelease.checkBody(bytes, edition.sha256);
  const texts = JSON.parse(bytes.toString('utf8')).library?.texts;
  const work = texts?.[0];
  if (!work || String(work.corpus?.byehuda_id || '') !== String(id)) return null;
  if (edition?.textKey && (texts.length !== 1 || work.text_key !== edition.textKey
    || work.rows?.length !== edition.rows || work.source_meta?.public_learning?.edition_id !== edition.editionId)) throw new Error('Published SEO identity mismatch');
  return { title: card.title, author: card.author, source: 'Project Ben-Yehuda', language: 'he', rows: work.rows || [], kind: 'benyehuda' };
}

// extras: learning-support Markdown (answer + solution) and public attachments,
// each already filtered by its own rights gate in server.js.
function published(payload, extras = {}) {
  const work = payload?.item?.snapshot?.library?.texts?.[0];
  if (!work || !payload.item.public_read_allowed) return null;
  return {
    title: work.title || payload.item.title, author: work.corpus?.author || '', source: payload.corpus?.title || '',
    language: work.corpus?.orig_language || 'he', rows: work.rows || [], kind: 'published',
    support: typeof extras.support === 'string' ? extras.support : '',
    attachments: Array.isArray(extras.attachments) ? extras.attachments : [],
  };
}

const absolute = (href) => /^https?:\/\//.test(String(href)) ? String(href) : ORIGIN + (String(href).startsWith('/') ? '' : '/') + String(href);
const oneLine = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

// One plain-text document for people and agents who open the link without running
// the app: full source text, attachments, then the reviewed answer and solution.
function readableMarkdown(data, url) {
  const title = oneLine(data.title || 'Учебный материал');
  const out = ['# ' + title, '', '- Источник: ' + (oneLine([data.author, data.source].filter(Boolean).join(' · ')) || 'LinguistPro'), '- Ссылка: ' + url, ''];
  if (!data.support) {
    out.push('## Текст материала', '');
    for (const row of data.rows || []) {
      const he = oneLine(row.hebrew_niqqud || row.hebrew_plain);
      const ru = oneLine(row.russian);
      if (he) out.push('- ' + he + (ru ? '\n  - ' + ru : ''));
      else if (ru) out.push('- ' + ru);
    }
    out.push('');
  }
  const files = (data.attachments || []).filter((item) => item && item.href);
  if (files.length) {
    out.push('## Вложенные файлы', '');
    for (const item of files) out.push('- [' + oneLine(item.title || 'Файл') + '](' + absolute(item.href) + ')' + (item.note ? ' — ' + oneLine(item.note) : ''));
    out.push('');
  }
  if (data.support) out.push(String(data.support).replace(/^# [^\n]*\n+/, '').trim(), '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, href) => '<a href="' + href + '">' + label + '</a>')
    .replace(/(^|\s)(https:\/\/linguistpro\.kolosei\.com\/[^\s<]+)/g, (_, pre, href) => pre + '<a href="' + href + '">' + href + '</a>');
}

// Small Markdown subset: headings, lists (one nested level), quotes, paragraphs.
function markdownHtml(markdown) {
  const html = [];
  let list = null;
  const close = () => { if (list) { html.push(list.items.join('') + '</' + list.tag + '>'); list = null; } };
  for (const raw of String(markdown).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if ((m = line.match(/^(#{1,4}) (.*)$/))) {
      close();
      const level = m[1].length + 1;
      html.push('<h' + level + ' dir="auto">' + inline(m[2]) + '</h' + level + '>');
    } else if ((m = line.match(/^ {2,}- (.*)$/)) && list) {
      const last = list.items.length - 1;
      list.items[last] = list.items[last].replace(/<\/li>$/, '<br>' + inline(m[1]) + '</li>');
    } else if ((m = line.match(/^(- |\d+\. )(.*)$/))) {
      const tag = m[1] === '- ' ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { close(); list = { tag, items: ['<' + tag + '>'] }; }
      list.items.push('<li dir="auto">' + inline(m[2]) + '</li>');
    } else {
      close();
      if ((m = line.match(/^> ?(.*)$/))) html.push('<blockquote dir="auto">' + inline(m[1]) + '</blockquote>');
      else if (line.trim()) html.push('<p dir="auto">' + inline(line) + '</p>');
    }
  }
  close();
  return html.join('\n');
}

function readableArticle(data, url, attrs = '', maxBytes = Infinity) {
  let markdown = readableMarkdown(data, url).replace(/^# [^\n]*\n/, '');
  if (Buffer.byteLength(markdown, 'utf8') > maxBytes) {
    const cut = Buffer.from(markdown, 'utf8').subarray(0, maxBytes).toString('utf8');
    markdown = cut.slice(0, cut.lastIndexOf('\n')) + '\n\n**Полный текст:** ' + url + '&format=md';
  }
  return '<article id="publicWorkReadable" class="public-work-readable" lang="ru"' + attrs + '>\n<h1 dir="auto">' + escapeHtml(oneLine(data.title || 'Учебный материал')) + '</h1>\n'
    + markdownHtml(markdown) + '\n</article>';
}

// Lean page for AI fetchers: the same text without 280 KB of app styles in front of it.
function lean(data, url) {
  const title = escapeHtml(String(data.title || 'Учебный материал'));
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + title + ' — LinguistPro</title><link rel="canonical" href="' + escapeHtml(url) + '"></head><body>\n'
    + readableArticle(data, url) + '\n<p><a href="' + escapeHtml(url) + '">Открыть в LinguistPro</a></p>\n</body></html>';
}

const READABLE_IN_APP = ' inert aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);"';

function render(data, url) {
  const title = String(data.title || 'Учебный материал');
  const first = (data.rows || []).find((row) => row.hebrew_niqqud || row.hebrew_plain);
  const excerpt = first ? String(first.hebrew_niqqud || first.hebrew_plain).slice(0, 180) : '';
  const description = [title, data.author, data.source, excerpt].filter(Boolean).join(' — ').slice(0, 300);
  const lines = (data.rows || []).slice(0, 3).map((row) => `<p lang="he" dir="rtl">${escapeHtml(row.hebrew_niqqud || row.hebrew_plain || '')}</p>`).join('');
  const summary = `<details class="room-public-work-summary"><summary data-i18n="room.publicPage.about">О произведении</summary><h2 dir="auto">${escapeHtml(title)}</h2><p dir="auto">${escapeHtml([data.author, data.source].filter(Boolean).join(' · '))}</p>${lines}</details>`;
  const structured = JSON.stringify({ '@context': 'https://schema.org', '@type': 'CreativeWork', name: title, author: data.author ? { '@type': 'Person', name: data.author } : undefined, inLanguage: data.language, isPartOf: data.source, url }).replace(/</g, '\\u003c');
  // Text first in <body> for every fetcher, with or without scripts. In the app it
  // is off-screen, inert and out of the accessibility tree, so a student still
  // meets the answer only through "Проверить ответ" / "Понять и решить".
  const readable = readableArticle(data, url, READABLE_IN_APP, 120 * 1024) + '\n';
  return shell
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)} — LinguistPro</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${escapeHtml(url)}">\n  <link rel="alternate" type="text/markdown" href="${escapeHtml(url + '&format=md')}">`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escapeHtml(description)}">\n  <meta property="og:type" content="article">\n  <meta property="og:title" content="${escapeHtml(title)}">\n  <meta property="og:description" content="${escapeHtml(description)}">\n  <meta property="og:url" content="${escapeHtml(url)}">\n  <script type="application/ld+json">${structured}</script>`)
    .replace('<div id="readerSubtitle"', () => summary + '\n  <div id="readerSubtitle"')
    .replace(/<body>\r?\n/, (tag) => tag + readable);
}

function sitemap(publicItems, dataDir) {
  const urls = [ORIGIN + '/', ORIGIN + '/library.html', ORIGIN + '/mediatheque.html',
    ...[...baked.keys()].filter((id) => benyehuda(id, dataDir)).map((id) => canonical({ corpus_work: id })),
    ...(publicItems || []).filter((item) => item?.ref?.kind === 'public' && item.ref.slug && item.ref.workId)
      .map((item) => canonical({ public_corpus: item.ref.slug, public_work: item.ref.workId }))];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    [...new Set(urls)].map((url) => '<url><loc>' + escapeHtml(url) + '</loc></url>').join('') + '</urlset>';
}

module.exports = { benyehuda, published, render, sitemap, canonical, readableMarkdown, lean };
