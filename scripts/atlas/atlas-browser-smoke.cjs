// Browser smoke for the atlas in the Reading Room: hub -> atlas home -> translated section; 1440 and 380 px; print PDF.
//   node scripts/atlas/atlas-browser-smoke.cjs <base url> <out dir> [section id]
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const base = process.argv[2] || 'http://localhost:3399';
  const out = path.resolve(process.argv[3] || '.tmp/atlas-smoke');
  const sectionId = process.argv[4] || 's24-surface';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const report = {};
  try {
    for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 380, height: 800 }]]) {
      const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      await page.goto(base + '/library.html', { waitUntil: 'domcontentloaded' });
      await page.getByText('Инженерный атлас 97002', { exact: false }).first().click({ timeout: 30000 });
      await page.waitForSelector('.atlas-home', { timeout: 30000 });
      await page.screenshot({ path: path.join(out, name + '-home.png') });
      await page.click('.atlas-section-btn[data-section="' + sectionId + '"]');
      await page.waitForSelector('.atlas-section .atlas-page', { timeout: 30000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, name + '-section.png') });
      report[name] = {
        overflowPx: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        pages: await page.locator('.atlas-page').count(),
        rows: await page.locator('.atlas-row').count(),
        math: await page.locator('.atlas-math math').count(),
        errors,
      };
      if (name === 'desktop') {
        await page.evaluate(async (sid) => {
          const data = await (await fetch('/data/atlas/a97002/sections/' + sid + '.json')).json();
          window.AtlasReader.preparePrint(document, data);
        }, sectionId);
        await page.emulateMedia({ media: 'print' });
        await page.pdf({ path: path.join(out, 'print-' + sectionId + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(report));
})().catch((err) => { console.error(err); process.exit(1); });
