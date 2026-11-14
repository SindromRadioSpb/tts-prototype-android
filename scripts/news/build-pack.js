#!/usr/bin/env node
'use strict';
// Builds a .lpnews.zip from a folder of *.draft.json (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §8).
// A draft is article.json with the original text in `source_text_he` instead of `check`. The program
// computes the verbatim-overlap fingerprints, checks every article, DROPS the original text and packs
// only the articles that passed. Usage:
//   node scripts/news/build-pack.js <folder> [--out file.lpnews.zip] [--check-only] [--producer dot]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const C = require('../../news/newsPackCore');

const REJECT_OVER = 0.15, FLAG_OVER = 0.08, FIDELITY_REJECT = 0.5, FIDELITY_WARN = 0.85, IMAGE_MAX = 600 * 1024;
const NAME = /^[A-Za-z0-9._-]+$/;

function localIso(ms) {
  const d = new Date(ms), off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', pad = n => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

async function buildPack(dir, { out, checkOnly = false, producer = 'dot', now = Date.now() } = {}) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.draft.json')).sort();
  const zip = new AdmZip(), manifestArticles = [], articles = [];
  let n = 0;
  for (const file of files) {
    const report = { file, ok: false };
    articles.push(report);
    let draft;
    try { draft = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '')); }
    catch (e) { report.code = 'SCHEMA_INVALID'; report.message = 'JSON: ' + e.message; continue; }
    const source = typeof draft.source_text_he === 'string' ? draft.source_text_he.trim() : '';
    const article = { ...draft };
    delete article.source_text_he;
    if (source) article.check = { source_shingles: C.shingles(source), source_word_count: source.split(/\s+/).length };
    else delete article.check;
    const v = C.validateArticle(article, { now });
    if (!v.ok) { report.code = v.code; continue; }
    report.overlap = Math.round(C.articleOverlap(article) * 1000) / 1000;
    if (report.overlap > REJECT_OVER) { report.code = 'VERBATIM_OVERLAP'; continue; }
    if (report.overlap > FLAG_OVER) report.flagged = true;
    const fidelity = C.articleFidelity(article);
    if (fidelity != null) {
      report.fidelity = Math.round(fidelity * 1000) / 1000;
      if (fidelity < FIDELITY_REJECT) { report.code = 'ORIGINAL_MISMATCH'; report.message = 'версия OR не совпадает с source_text_he'; continue; }
      if (fidelity < FIDELITY_WARN) report.flagged = true;
    }
    // Files of one article: first its own folder named after the draft (ynet-0001.draft.json → ynet-0001/),
    // so every article can have its own img-1.jpg; then the drafts folder itself.
    const own = path.join(dir, file.slice(0, -'.draft.json'.length));
    const locate = name => [path.join(own, name), path.join(dir, name)].find(f => fs.existsSync(f)) || null;
    const extras = [];
    for (const im of article.images || []) extras.push(im.file);
    for (const version of article.learning.versions) if (version.word_gloss_ai) extras.push(version.word_gloss_ai);
    if (article.image.mode === 'licensed') extras.push(article.image.file);
    const missing = extras.find(name => !NAME.test(name) || !locate(name));
    if (missing) { report.code = 'SCHEMA_INVALID'; report.message = 'нет файла ' + missing; continue; }
    const bigImage = (article.images || []).find(im => fs.statSync(locate(im.file)).size > IMAGE_MAX);
    if (bigImage) { report.code = 'TOO_LARGE'; report.message = bigImage.file + ' больше 600 КБ — уменьшите до 1600 px по длинной стороне'; continue; }
    n++;
    const folder = 'articles/' + article.source.outlet_id + '-' + String(n).padStart(4, '0');
    const body = Buffer.from(JSON.stringify(article, null, 1));
    zip.addFile(folder + '/article.json', body);
    for (const name of extras) zip.addFile(folder + '/' + name, fs.readFileSync(locate(name)));
    manifestArticles.push({ path: folder + '/article.json', sha256: C.sha256(body) });
    report.ok = true; report.warnings = v.warnings;
  }
  const ok = manifestArticles.length > 0;
  if (checkOnly || !ok) return { ok, articles };
  const manifest = { schema: 'linguistpro-news-pack', schema_version: 1, pack_id: crypto.randomUUID(), created_at: localIso(now),
    producer: { name: producer }, ui_languages: ['ru'], articles: manifestArticles };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 1)));
  const stamp = localIso(now).slice(0, 16).replace(/[-:]/g, '');
  const written = path.resolve(out || path.join(dir, `news-${stamp}-${producer}.lpnews.zip`));
  zip.writeZip(written);
  return { ok, written, articles };
}

if (require.main === module) {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args.find((a, i) => !a.startsWith('--') && !['--out', '--producer'].includes(args[i - 1]));
  if (!dir) { console.error('Использование: node scripts/news/build-pack.js <папка> [--out файл.lpnews.zip] [--check-only] [--producer dot]'); process.exit(2); }
  buildPack(dir, { out: opt('--out'), producer: opt('--producer') || 'dot', checkOnly: args.includes('--check-only') }).then(r => {
    for (const a of r.articles) console.log((a.ok ? (a.flagged ? '⚠ ' : '✓ ') : '✗ ') + a.file + (a.code ? ' — ' + a.code : '') + (a.message ? ' (' + a.message + ')' : '') + (a.overlap != null ? ' · совпадение пересказа ' + Math.round(a.overlap * 100) + '%' : '') + (a.fidelity != null ? ' · оригинал совпал на ' + Math.round(a.fidelity * 100) + '%' : ''));
    const good = r.articles.filter(a => a.ok).length;
    console.log(`Итого: принято ${good}, отклонено ${r.articles.length - good}` + (r.written ? `\nАрхив: ${r.written}` : ''));
    process.exit(r.ok ? 0 : 1);
  }).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { buildPack };
