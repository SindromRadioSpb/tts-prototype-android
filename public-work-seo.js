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

function published(payload) {
  const work = payload?.item?.snapshot?.library?.texts?.[0];
  if (!work || !payload.item.public_read_allowed) return null;
  return { title: work.title || payload.item.title, author: work.corpus?.author || '', source: payload.corpus?.title || '', language: work.corpus?.orig_language || 'he', rows: work.rows || [], kind: 'published' };
}

function render(data, url) {
  const title = String(data.title || 'Учебный материал');
  const first = (data.rows || []).find((row) => row.hebrew_niqqud || row.hebrew_plain);
  const excerpt = first ? String(first.hebrew_niqqud || first.hebrew_plain).slice(0, 180) : '';
  const description = [title, data.author, data.source, excerpt].filter(Boolean).join(' — ').slice(0, 300);
  const lines = (data.rows || []).slice(0, 3).map((row) => `<p lang="he" dir="rtl">${escapeHtml(row.hebrew_niqqud || row.hebrew_plain || '')}</p>`).join('');
  const summary = `<details class="room-public-work-summary"><summary data-i18n="room.publicPage.about">О произведении</summary><h2 dir="auto">${escapeHtml(title)}</h2><p dir="auto">${escapeHtml([data.author, data.source].filter(Boolean).join(' · '))}</p>${lines}</details>`;
  const structured = JSON.stringify({ '@context': 'https://schema.org', '@type': 'CreativeWork', name: title, author: data.author ? { '@type': 'Person', name: data.author } : undefined, inLanguage: data.language, isPartOf: data.source, url }).replace(/</g, '\\u003c');
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} — LinguistPro</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(url)}">`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">\n  <meta property="og:type" content="article">\n  <meta property="og:title" content="${escapeHtml(title)}">\n  <meta property="og:description" content="${escapeHtml(description)}">\n  <meta property="og:url" content="${escapeHtml(url)}">\n  <script type="application/ld+json">${structured}</script>`)
    .replace('<div id="readerSubtitle"', summary + '\n  <div id="readerSubtitle"');
}

function sitemap(publicItems, dataDir) {
  const urls = [ORIGIN + '/', ORIGIN + '/library.html', ORIGIN + '/mediatheque.html',
    ...[...baked.keys()].filter((id) => benyehuda(id, dataDir)).map((id) => canonical({ corpus_work: id })),
    ...(publicItems || []).filter((item) => item?.ref?.kind === 'public' && item.ref.slug && item.ref.workId)
      .map((item) => canonical({ public_corpus: item.ref.slug, public_work: item.ref.workId }))];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    [...new Set(urls)].map((url) => '<url><loc>' + escapeHtml(url) + '</loc></url>').join('') + '</urlset>';
}

module.exports = { benyehuda, published, render, sitemap, canonical };
