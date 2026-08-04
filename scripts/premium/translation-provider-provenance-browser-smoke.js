#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.TRANSLATION_PROVIDER_SMOKE_PORT || 3312);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, 'docs', 'research', 'studio-l4-mt-provider-provenance', '2026-08-04', 'screenshots');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ready() {
  for (let i = 0; i < 240; i += 1) {
    try { if ((await fetch(BASE + '/healthz')).ok) return; } catch (_) {}
    await sleep(250);
  }
  throw new Error('SERVER_NOT_READY');
}

async function seed(page) {
  await page.addInitScript(() => {
    localStorage.setItem('localMode', '1');
    localStorage.setItem('v3OnboardingSeenV1', '1');
    localStorage.setItem('onboardingSeen_v1', '1');
    localStorage.setItem('v3.byokOnboardingDismissed', '1');
    localStorage.setItem('v3.byokTourCompleted', '1');
  });
  await page.goto(`${BASE}/index.html?localMode=1&providerSmoke=${Date.now()}`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (window.__localDBInitPromise) await window.__localDBInitPromise;
    window.appSetLocale('ru');
    const ldb = await ensureLocalDB();
    const definitions = [
      { id: 'provider-madlad', title: 'MADLAD local card', level: 'alef', providers: ['madlad', 'madlad'], meta: { provider: 'madlad', model: 'MADLAD-400-10B-CT2-int8', generatedAt: '2026-08-04T12:00:00.000Z' } },
      { id: 'provider-gemini', title: 'Gemini cloud card', level: 'alef', providers: ['gemini'], meta: { provider: 'gemini', model: 'gemini-3.6-flash', generatedAt: '2026-08-04T12:01:00.000Z' } },
      { id: 'provider-mixed', title: 'Mixed provider card', level: 'bet', providers: ['madlad', 'gemini'], meta: null },
      { id: 'provider-unknown', title: 'Legacy unknown card', level: 'bet', providers: [null], meta: null },
    ];
    for (const item of definitions) {
      await ldb.createText({
        id: item.id,
        text_key: item.id,
        title: item.title,
        source_text: 'שלום עולם',
        level: item.level,
        tags_json: '[]',
        table_model_meta_json: item.meta ? JSON.stringify(item.meta) : null,
      });
      for (let i = 0; i < item.providers.length; i += 1) {
        const provider = item.providers[i];
        await ldb.addSentence(item.id, {
          id: `${item.id}-row-${i}`,
          he_plain: 'שלום',
          ru: 'Привет',
          translation_provider: provider,
          translation_meta_json: provider ? JSON.stringify({ provider, model: item.meta && item.meta.model }) : null,
        });
      }
    }
    const saveFields = v3TranslationFieldsForSave({}, { provider: 'madlad', model: 'MADLAD-400-10B-CT2-int8' });
    window.__providerSmokeSaveFields = saveFields;
  });
}

async function visibleIds(page) {
  return page.locator('#v3LibraryList .v3-lib-card[data-text-id]').evaluateAll((cards) => cards.map((card) => card.dataset.textId).sort());
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-provider-smoke-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), BIND_HOST: '127.0.0.1', DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const browser = await chromium.launch();
  const pageErrors = [];
  const providerRequests = [];
  try {
    await ready();
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('request', (request) => {
      if (/\/api\/(translate|gemini)/.test(request.url())) providerRequests.push(request.url());
    });
    await seed(page);
    await page.evaluate(() => v3LibraryOpen());
    await page.waitForFunction(() => document.querySelectorAll('#v3LibraryList .v3-lib-card[data-text-id]').length === 4);

    const all = await visibleIds(page);
    await page.locator('#v3LibraryProvider').selectOption('madlad');
    await page.waitForFunction(() => document.querySelectorAll('#v3LibraryList .v3-lib-card[data-text-id]').length === 2);
    const madlad = await visibleIds(page);
    await page.evaluate(() => { const el = document.getElementById('v3LibraryLevel'); el.value = 'alef'; v3LibraryOnLevelChange(); });
    await page.waitForFunction(() => document.querySelectorAll('#v3LibraryList .v3-lib-card[data-text-id]').length === 1);
    const madladAlef = await visibleIds(page);
    await page.evaluate(() => { const el = document.getElementById('v3LibraryLevel'); el.value = ''; v3LibraryOnLevelChange(); });
    await page.locator('#v3LibraryProvider').selectOption('mixed');
    await page.waitForFunction(() => document.querySelectorAll('#v3LibraryList .v3-lib-card[data-text-id]').length === 1);
    const mixed = await visibleIds(page);
    await page.locator('#v3LibraryProvider').selectOption('unknown');
    await page.waitForFunction(() => document.querySelectorAll('#v3LibraryList .v3-lib-card[data-text-id]').length === 1);
    const unknown = await visibleIds(page);
    await page.locator('#v3LibraryProvider').selectOption('');

    await page.setViewportSize({ width: 380, height: 844 });
    await page.locator('#v3LibraryProvider').selectOption('madlad');
    await page.waitForFunction(() => document.querySelectorAll('#v3LibraryList .v3-lib-card[data-text-id]').length === 2);
    const libraryBadges = await page.locator('#v3LibraryList .v3-lib-provider-badge').allInnerTexts();
    await page.screenshot({ path: path.join(SHOTS, 'translation-provider-library-380-ru.png'), fullPage: false });
    const libraryOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    await page.evaluate(() => v3TextMetaOpen('provider-madlad'));
    await page.locator('#v3TextMetaModal:not(.hidden)').waitFor();
    const metaRu = await page.locator('#v3TextMetaTranslationProvider').innerText();
    const saveFields = await page.evaluate(() => window.__providerSmokeSaveFields);
    await page.screenshot({ path: path.join(SHOTS, 'translation-provider-meta-380-ru.png'), fullPage: false });
    const ruOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    await page.evaluate(() => window.appSetLocale('he'));
    await page.evaluate(() => v3TextMetaOpen('provider-madlad'));
    const metaHe = await page.locator('#v3TextMetaTranslationProvider').innerText();
    await page.screenshot({ path: path.join(SHOTS, 'translation-provider-meta-380-he.png'), fullPage: false });
    const heState = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));

    const result = { all, madlad, madladAlef, mixed, unknown, libraryBadges, metaRu, metaHe, saveFields, libraryOverflow, ruOverflow, heState, pageErrors, providerRequests };
    const pass =
      JSON.stringify(all) === JSON.stringify(['provider-gemini', 'provider-madlad', 'provider-mixed', 'provider-unknown']) &&
      JSON.stringify(madlad) === JSON.stringify(['provider-madlad', 'provider-mixed']) &&
      JSON.stringify(madladAlef) === JSON.stringify(['provider-madlad']) &&
      JSON.stringify(mixed) === JSON.stringify(['provider-mixed']) &&
      JSON.stringify(unknown) === JSON.stringify(['provider-unknown']) &&
      /MADLAD/.test(metaRu) && /локально/.test(metaRu) && /MADLAD/.test(metaHe) &&
      libraryBadges.some((badge) => /MADLAD/.test(badge)) && !libraryOverflow &&
      saveFields.translation_provider === 'madlad' && /MADLAD-400/.test(saveFields.translation_meta_json) &&
      !ruOverflow && heState.dir === 'rtl' && !heState.overflow && !pageErrors.length && !providerRequests.length;
    if (!pass) throw new Error('TRANSLATION_PROVIDER_PROVENANCE_GATE:' + JSON.stringify(result));
    console.log(JSON.stringify({ gate: 'TRANSLATION_PROVIDER_PROVENANCE_FRESH_CHROMIUM', ...result, screenshots: ['translation-provider-library-380-ru.png', 'translation-provider-meta-380-ru.png', 'translation-provider-meta-380-he.png'] }, null, 2));
    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    await sleep(800);
    if (process.platform === 'win32' && !server.killed) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
