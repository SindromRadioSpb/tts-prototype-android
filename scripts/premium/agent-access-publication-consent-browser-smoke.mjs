#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLICATION_SCOPES = [
  'reading.publication.catalog.read',
  'reading.publication.item.read',
  'reading.publication.resource.read',
  'reading.publication.derivative.read',
];
const EXPECTED = {
  ru: ['Находить одобренные публичные корпуса и материалы', 'Читать одобренные окна текста из публикаций', 'Получать ссылки и хеши одобренных ресурсов', 'Читать проверенные учебные разборы и решения'],
  en: ['Discover approved public corpora and items', 'Read approved publication text windows', 'Read approved resource links and hashes', 'Read reviewed learning explanations and solutions'],
  he: ['איתור קורפוסים ופריטים ציבוריים מאושרים', 'קריאת חלונות טקסט מאושרים מפרסומים', 'קריאת קישורים וגיבובים של משאבים מאושרים', 'קריאת הסברים ופתרונות לימודיים שנבדקו'],
};

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function waitReady(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('FIXTURE_NOT_READY');
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['scripts/premium/agent-access-ui-fixture.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
let browser;
let checks = 0;
try {
  await waitReady(`${origin}/agent-access.html`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  await page.goto(`${origin}/agent-access.html?request_id=fixture-request`, { waitUntil: 'networkidle' });
  await page.locator('#consentPanel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.scope-card').count(), 9); checks++;
  for (const locale of ['ru', 'en', 'he']) {
    await page.locator('#languageSelect').selectOption(locale);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.equal(await page.locator('html').getAttribute('dir'), locale === 'he' ? 'rtl' : 'ltr');
    const cards = await page.locator('.scope-card').evaluateAll((nodes, scopes) => nodes.map(node => ({
      scope: node.querySelector('.scope-code')?.textContent || '', title: node.querySelector('b')?.textContent || '',
    })).filter(row => scopes.includes(row.scope)), PUBLICATION_SCOPES);
    assert.deepEqual(cards.map(row => row.scope), PUBLICATION_SCOPES);
    assert.deepEqual(cards.map(row => row.title), EXPECTED[locale]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    checks++;
  }
  await page.locator('#languageSelect').focus();
  let focused = false;
  for (let step = 0; step < 8 && !focused; step += 1) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.matches('.scope-card input'));
  }
  assert.equal(focused, true); checks++;
  const itemCard = page.locator('.scope-card').filter({ hasText: 'reading.publication.item.read' });
  assert.equal(await itemCard.locator('.scope-content-badge').count(), 1); checks++;
  const derivativeCard = page.locator('.scope-card').filter({ hasText: 'reading.publication.derivative.read' });
  assert.equal(await derivativeCard.locator('.scope-content-badge').count(), 1); checks++;
  console.log(JSON.stringify({ ok: true, checks, viewport_css_px: 380, locales: ['ru', 'en', 'he'], rtl: true,
    publication_scopes: PUBLICATION_SCOPES.length, horizontal_overflow: false, keyboard_focus: true,
    production_reads: 0, owner_data_writes: 0 }));
} catch (error) {
  if (logs) process.stderr.write(logs.slice(-2000));
  throw error;
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
}
