#!/usr/bin/env node
'use strict';
// Visual check of the official-period sections (catalog v9+): period grid, a period's author list and
// «О материале», at 380px in ru (LTR) and he (RTL) and at desktop width. Writes PNGs to --out.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..');
const PORT = 3291, BASE = `http://127.0.0.1:${PORT}`;
const out = path.resolve(process.argv[2] || path.join(REPO, '.tmp', 'room-periods-shot'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const child = spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (_) {} await sleep(500); }
    const browser = await chromium.launch();
    const report = [];
    for (const [lang, width] of (process.argv[3] ? JSON.parse(process.argv[3]) : [['ru', 380], ['he', 380], ['ru', 1280]])) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: lang === 'he' ? 'he-IL' : 'ru-RU', serviceWorkers: 'block' });
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', (e) => errors.push(String(e.message || e)));
      await pg.goto(BASE + '/library.html?canon=skip', { waitUntil: 'load' });
      await pg.waitForFunction(() => { const t = document.getElementById('tabCorpus'); return t && !t.hidden; }, { timeout: 20000 }).catch(() => {});
      if (lang !== 'ru') { await pg.evaluate((l) => window.appSetLocale && window.appSetLocale(l), lang); await sleep(600); }
      await pg.click('#tabCorpus');
      await pg.waitForSelector('.learning-corpus-entry[data-corpus="benyehuda"]', { timeout: 20000 }).catch(() => {});
      await pg.click('.learning-corpus-entry[data-corpus="benyehuda"]');
      await pg.click('[data-corpus-mode="explore"]');
      await pg.waitForSelector('.corpus-period-grid .period-card', { timeout: 20000 }).catch(() => {});
      await sleep(600);
      const grid = await pg.evaluate(() => ({
        title: document.querySelector('.corpus-periods .shelf-title')?.textContent || '',
        cards: [...document.querySelectorAll('.period-card')].map((c) => ({ title: c.querySelector('.period-card-title')?.textContent, source: c.querySelector('.period-card-source')?.textContent || '', note: c.querySelector('.corpus-grouping-note')?.textContent || '', range: c.querySelector('.period-card-range')?.textContent || '' })),
        rawKey: /room\.corpus\./.test(document.body.innerText),
        hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      const tag = `${lang}-${width}`;
      await pg.locator('.corpus-periods').screenshot({ path: path.join(out, `periods-${tag}.png`) }).catch(() => pg.screenshot({ path: path.join(out, `periods-${tag}.png`) }));
      // Open «Новая ивритская литература» (modern) and capture its author list.
      await pg.locator('.period-card').nth(4).click().catch(() => {});
      await pg.waitForSelector('.corpus-author-row', { timeout: 20000 }).catch(() => {});
      await sleep(400);
      const authors = await pg.evaluate(() => ({ crumb: document.querySelector('.corpus-crumb')?.textContent || '', rows: document.querySelectorAll('.corpus-author-row').length }));
      await pg.screenshot({ path: path.join(out, `authors-${tag}.png`) });
      report.push({ tag, grid, authors, errors });
      await ctx.close();
    }
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report.map((r) => ({ tag: r.tag, title: r.grid.title, cards: r.grid.cards.map((c) => c.title + ' | ' + c.source + ' | ' + c.note + (c.range ? ' | ' + c.range : '')), rawKey: r.grid.rawKey, hOverflow: r.grid.hOverflow, authors: r.authors, errors: r.errors.slice(0, 3) })), null, 1));
  } finally {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL');
  }
})().catch((e) => { console.error(e); process.exit(1); });
