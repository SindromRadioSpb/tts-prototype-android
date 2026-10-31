#!/usr/bin/env node
'use strict';
// Visual acceptance of the atlas: every page of every translated section is shot as the reader shows it,
// on a desktop (1440 px, the page column) and on a phone (390 px), with all four columns on. A second step
// (visual-sheets.py) puts each page beside the scan of the book for review by eye.
// Usage: node scripts/atlas/visual-acceptance.cjs <base url> <out dir> [--assets <prod url>] [--only s01,s02]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const base = process.argv[2], out = process.argv[3];
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const assetsFrom = arg('--assets');
const only = (arg('--only') || '').split(',').filter(Boolean);
if (!base || !out) { console.error('usage: visual-acceptance.cjs <base> <out> [--assets url] [--only ids]'); process.exit(2); }
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
const cacheDir = path.join(out, 'assets');
fs.mkdirSync(cacheDir, { recursive: true });

const CSS = '.atlas-toolbar, .lp-app-nav, .app-nav, .room-tabbar, nav[class*="nav"] { display: none !important; } ' +
  '.corpus-crumb, .corpus-switcher { display: none !important; } * { scroll-behavior: auto !important; }';

async function routeAssets(ctx) {
  if (!assetsFrom) return;
  await ctx.route('**/data/atlas/a97002/assets/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const file = path.join(cacheDir, name);
    if (!fs.existsSync(file)) {
      const r = await fetch(assetsFrom + '/data/atlas/a97002/assets/' + name);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(file) });
  });
}

async function shootSection(browser, id, kind) {
  const phone = kind === 'ph';
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, serviceWorkers: 'block' });
  await routeAssets(ctx);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/library.html#room=atlas%3Aa97002&sec=' + id, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.atlas-section .atlas-page', { timeout: 60000 });
  await p.evaluate(() => {
    const btn = document.querySelector('.atlas-view-btn'); btn.click();
    document.querySelector('[data-preset="all"]').click(); btn.click();
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
  });
  await p.addStyleTag({ content: CSS + (phone ? ' .atlas-aside { display: none !important; }' : '') });
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 15000); }))));
  const pages = await p.$$eval('.atlas-page', (els) => els.map((e) => e.getAttribute('data-page')));
  for (const n of pages) {
    const sel = phone ? '#atlas-p' + n : '#atlas-p' + n + ' .atlas-main';
    const el = await p.$(sel);
    if (!el) continue;
    await el.screenshot({ path: path.join(out, 'shots', kind + '-' + String(n).padStart(3, '0') + '.png') });
  }
  await ctx.close();
  return { pages: pages.length, errors };
}

(async () => {
  const ix = await (await fetch(base + '/data/atlas/a97002/index.json')).json();
  const ids = ix.sections.filter((s) => s.translated && (!only.length || only.includes(s.id))).map((s) => s.id);
  const browser = await chromium.launch();
  const log = [];
  for (const id of ids) {
    for (const kind of ['pc', 'ph']) {
      const t0 = Date.now();
      let r = null;
      for (let attempt = 1; attempt <= 3 && !r; attempt++) {
        try { r = await shootSection(browser, id, kind); }
        catch (e) {   // Windows sockets run out under a long run (ERR_NO_BUFFER_SPACE): wait and try again
          console.log(id, kind, 'attempt', attempt, 'failed:', String(e.message).split('\n')[0]);
          await new Promise((res) => setTimeout(res, 5000 * attempt));
        }
      }
      if (!r) { log.push({ id, kind, failed: true }); continue; }
      log.push({ id, kind, pages: r.pages, errors: r.errors, ms: Date.now() - t0 });
      console.log(id, kind, r.pages, 'pages', r.errors.length ? 'ERRORS ' + r.errors.join(' | ') : '', Math.round((Date.now() - t0) / 1000) + 's');
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(log, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
