#!/usr/bin/env node
"use strict";
// Real Studio/HTTP/jobs/OPFS/H264/AAC. Only authentication and source acquisition are fixtures.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const BASE = 'http://127.0.0.1:3296', WORKER = 'http://127.0.0.1:3297';
const SHOTS = path.join(ROOT, 'docs/research/studio-media-downloader/2026-09-08/screenshots');
const SECRET = 'browser-fixture-secret-not-production', KEY = 'studio.media-downloads.v1';
const failures = []; let checks = 0;
function check(value, label) { checks++; if (!value) failures.push(label); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function child(command, args, env = {}) {
  const result = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; result.stdout.on('data', data => { log = (log + data).slice(-3000); });
  result.stderr.on('data', data => { log = (log + data).slice(-3000); }); result.diagnostic = () => log; return result;
}
async function ready(base, proc) {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base + '/healthz')).ok) return; } catch (_) {}
    if (proc.exitCode != null) break; await sleep(200);
  }
  throw Error('Fixture server not ready: ' + proc.diagnostic());
}
function capability() {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ typ: 'lp_media_capability_v1', sub: 'browser-fixture', origin: BASE,
    scopes: ['resolve', 'prepare', 'stream'], iat: now, exp: now + 300, nonce: crypto.randomUUID() })).toString('base64url');
  return { ok: true, worker_url: WORKER, expires_at: now + 300,
    subject_scope: crypto.createHmac('sha256', SECRET).update('subject:browser-fixture').digest('hex'),
    capability: body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url') };
}
async function open(page) {
  await page.evaluate(() => {
    for (const id of ['v3OnboardingModal', 'v3Phase6Modal']) document.getElementById(id)?.remove();
    window.StudioImport.open(); window.StudioImport.switchTab('video');
  });
}
async function resolved(page) {
  await page.fill('#v3ImportVideoUrl', 'https://www.youtube.com/watch?v=dH_OkB7Uym4');
  await page.click('#v3RemoteMediaResolve');
  await page.waitForSelector('#v3RemoteMediaCard:not([hidden])');
  await page.waitForFunction(() => !document.getElementById('v3RemoteMediaResolve').disabled);
}
async function complete(page) {
  await page.waitForSelector('#v3RemoteMediaDone:not([hidden])', { timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#v3RemoteMediaPlayer video,#v3RemoteMediaPlayer audio')?.readyState >= 2);
}
async function inspect(browser, locale, viewport, thorough) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript(value => { localStorage.setItem('app.locale', value); localStorage.setItem('phase6FirstOpenSeen', 'fixture'); }, locale);
  await context.route('**/api/media-acquisition/capability', route => route.fulfill({ json: capability() }));
  const page = await context.newPage(), errors = [], ranges = []; let asrCalls = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', async request => {
    if (request.url().endsWith('/stream')) ranges.push((await request.allHeaders()).range || 'full');
    if (request.method() === 'POST' && /generativelanguage|\/asr\b|transcribe/.test(request.url())) asrCalls++;
  });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await open(page); await resolved(page);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('#v3ImportModal .v3-modal-panel').getBoundingClientRect();
    return { dir: document.documentElement.dir, fit: panel.left >= 0 && panel.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth,
      heights: [...document.querySelectorAll('#v3RemoteMediaCard button, #v3RemoteMediaResolve')].filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect().height),
      options: document.getElementById('v3RemoteMediaQuality').options.length };
  });
  check(layout.fit && layout.dir === (locale === 'he' ? 'rtl' : 'ltr'), locale + ': mobile/RTL fit');
  check(layout.heights.every(h => h >= 44), locale + ': tap targets 44px ' + layout.heights);
  check(layout.options === 2, locale + ': actual format choices');
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, 'choices-' + viewport.width + '-' + locale + '.png') });
  if (thorough) await page.evaluate(() => {
    const download = window.MediaStreamStore.downloadToOpfs;
    window.MediaStreamStore.downloadToOpfs = options => download({ ...options, onCheckpoint: () => document.getElementById('v3RemoteMediaPause').click() });
  });
  await page.check('#v3RemoteMediaRights'); await page.click('#v3RemoteMediaAdd');
  if (thorough) {
    await page.waitForSelector('#v3RemoteMediaResume:not([hidden])');
    const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].jobId, KEY);
    await page.reload({ waitUntil: 'load' }); await open(page); await page.click('#v3RemoteMediaResume'); await complete(page);
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].jobId, KEY);
    check(before === after && ranges.some(value => /^bytes=[1-9]/.test(value)), 'reload resumes same job via HTTP Range: ' + JSON.stringify({before,after,ranges}));
  } else await complete(page);
  const media = await page.evaluate(async () => {
    const player = document.querySelector('#v3RemoteMediaPlayer video'); await player.play();
    return { duration: player.duration, height: player.videoHeight };
  });
  check(media.duration > 7 && media.height > 0, locale + ': actual video decoded and playing');
  check(asrCalls === 0, locale + ': download/playback does not trigger ASR');
  await page.screenshot({ path: path.join(SHOTS, 'complete-' + viewport.width + '-' + locale + '.png') });
  if (thorough) {
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#v3RemoteMediaSaveCopy')]);
    check(download.suggestedFilename().endsWith('.mp4'), 'explicit browser file export');
    const exported = fs.readFileSync(await download.path());
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].stored, KEY);
    check(exported.length === stored.sizeBytes && crypto.createHash('sha256').update(exported).digest('hex') === stored.sha256, 'exported file bytes match verified local media');
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key))[0].exportReceipt, KEY);
    check(await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].exportReceipt.owner_saved_copy === false, KEY), 'save request is not device-save proof');
    await page.click('#v3RemoteMediaContinue');
    await page.waitForSelector('#v3ImportPaneFile:not([hidden])');
    check(await page.locator('#v3ImportPaneFile').isVisible() && asrCalls === 0, 'transcription setup opens without provider call');
    await page.reload({ waitUntil: 'load' }); await open(page); await context.setOffline(true);
    await page.locator('#v3RemoteMediaHistory summary').click();
    await page.locator('#v3RemoteMediaHistoryList button').first().click(); await complete(page);
    check(await page.locator('#v3RemoteMediaPlayer video').isVisible(), 'completed local copy reopens offline');
    await context.setOffline(false); await page.click('#v3RemoteMediaNew'); await resolved(page);
    await context.route(WORKER + '/v1/jobs/*/device-receipt', route => route.request().method() === 'OPTIONS' ? route.continue() : route.fulfill({ status: 404, json: { ok: false, error_code: 'JOB_NOT_FOUND' },
      headers: { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } }));
    await page.click('#v3RemoteMediaAudio'); await page.check('#v3RemoteMediaRights'); await page.click('#v3RemoteMediaAdd'); await complete(page);
    check(await page.locator('#v3RemoteMediaPlayer audio').isVisible(), 'audio-only M4A decoded');
    check(await page.evaluate(key => { const r = JSON.parse(localStorage.getItem(key))[0]; return r.state === 'complete' && r.receipt.deletion_receipt.deleted === false; }, KEY), 'lost server receipt preserves verified local audio without claiming cleanup');
    await page.click('#v3RemoteMediaNew');
    await page.fill('#v3ImportVideoUrl', 'https://example.invalid/not-youtube'); await page.click('#v3RemoteMediaResolve');
    await page.waitForFunction(() => !document.getElementById('v3RemoteMediaResolve').disabled);
    check(!(await page.locator('#v3RemoteMediaCard').isVisible()), 'failed source clears stale formats');
    check(!/Traceback|https?:\/\/|error_code/.test(await page.locator('#v3RemoteMediaStatus').innerText()), 'error copy hides upstream internals');
  }
  check(errors.length === 0, locale + ': no page errors ' + errors.join(' | ')); await context.close();
}
(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-media-browser-'));
  const localPython = path.join(ROOT, '.tmp/rma-downloader-venv/Scripts/python.exe');
  const python = process.env.LP_MEDIA_TEST_PYTHON || (fs.existsSync(localPython) ? localPython : 'python');
  const server = child(process.execPath, ['server.js'], { PORT: '3296', DATA_DIR: data, DB_PATH: path.join(data, 'app.db') });
  const worker = child(python, ['scripts/premium/fixtures/media-acquisition-worker.py', '--port', '3297', '--origin', BASE]);
  let browser;
  try {
    await Promise.all([ready(BASE, server), ready(WORKER, worker)]); browser = await chromium.launch({ headless: true });
    await inspect(browser, 'ru', { width: 380, height: 844 }, true);
    await inspect(browser, 'he', { width: 380, height: 844 }, false);
    await inspect(browser, 'ru', { width: 1280, height: 900 }, false);
  } finally { if (browser) await browser.close(); server.kill(); worker.kill(); }
  if (failures.length) throw Error(failures.join('\n'));
  console.log('[remote-media-browser-smoke] PASS ' + checks + '/' + checks);
})().catch(error => { console.error(error); process.exitCode = 1; });
