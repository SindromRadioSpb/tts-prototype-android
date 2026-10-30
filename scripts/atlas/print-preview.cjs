// Print the atlas pilot preview: print.html -> A4 PDF, screen.html -> PNG screenshots (desktop and phone).
//   node scripts/atlas/print-preview.cjs <preview dir>
'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function open(browser, file, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__atlasReady === true, null, { timeout: 30000 });
  return page;
}

(async () => {
  const dir = path.resolve(process.argv[2] || '.');
  const browser = await chromium.launch();
  try {
    const print = await open(browser, path.join(dir, 'print.html'), { width: 1240, height: 1754 });
    await print.pdf({ path: path.join(dir, 'print-variant-b.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    const desk = await open(browser, path.join(dir, 'screen.html'), { width: 1440, height: 900 });
    await desk.screenshot({ path: path.join(dir, 'screen-desktop.jpg'), type: 'jpeg', quality: 75 });
    const phone = await open(browser, path.join(dir, 'screen.html'), { width: 380, height: 800 });
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await phone.screenshot({ path: path.join(dir, 'screen-phone-380.png'), fullPage: false });
    console.log(JSON.stringify({ pdf: 'print-variant-b.pdf', phoneHorizontalOverflowPx: overflow }));
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error(err); process.exit(1); });
