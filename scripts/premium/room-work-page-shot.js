#!/usr/bin/env node
'use strict';
// Visual check of a work made of parts (Modern F4): the work page and its table of contents at 380px
// in ru (LTR) and he (RTL) plus desktop. Text import is NOT exercised here (headless OPFS trap) — the
// part reader is verified in a real browser. Usage: node room-work-page-shot.js <outDir> [workId]
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..');
const PORT = 3292, BASE = process.env.SHOT_BASE || `http://127.0.0.1:${PORT}`;
const out = path.resolve(process.argv[2] || path.join(REPO, '.tmp', 'room-work-page-shot'));
const work = process.argv[3] || '58052';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const child = process.env.SHOT_BASE ? null : spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (_) {} await sleep(500); }
    const browser = await chromium.launch();
    const report = [];
    for (const [lang, width] of [['ru', 380], ['he', 380], ['ru', 1280]]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1400 }, serviceWorkers: 'block' });
      await ctx.addInitScript((l) => { try { localStorage.setItem('app.locale', l); } catch (_) {} }, lang);
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', (e) => errors.push(String(e.message || e)));
      await pg.goto(`${BASE}/library.html?corpus_work=${work}`, { waitUntil: 'load' });
      await pg.waitForSelector('#roomWorkPage .work-toc-part', { timeout: 30000 }).catch(() => {});
      await sleep(800);
      const info = await pg.evaluate(() => ({
        dir: document.documentElement.getAttribute('dir'),
        title: document.getElementById('readerTitle')?.innerText,
        facts: document.querySelector('.work-page-facts')?.innerText,
        cta: document.querySelector('.work-page-cta')?.innerText,
        tocTitle: document.querySelector('.work-page-toc-title')?.innerText,
        parts: document.querySelectorAll('.work-toc-part').length,
        nested: document.querySelectorAll('.work-toc-children').length,
        rawKey: /room\.work\./.test(document.body.innerText),
        hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hiddenAids: getComputedStyle(document.getElementById('roomReadAloud')).display === 'none',
      }));
      const tag = `${lang}-${width}`;
      await (await pg.$('#roomReader'))?.screenshot({ path: path.join(out, `work-${tag}.png`) });
      report.push({ tag, ...info, errors });
      await ctx.close();
    }
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
  } finally {
    if (child) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL'); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
