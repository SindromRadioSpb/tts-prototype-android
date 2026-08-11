#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.STUDIO_TABLE_RESUME_PORT || 3297);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ready() {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch (_) {}
    await sleep(250);
  }
  throw new Error('SERVER_NOT_READY');
}

function translatedRow(index, text) {
  return { segment_index: index, he: text, he_niqqud: text, translit: `tr-${index}`, ru: `ru-${index}` };
}

async function main() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-table-resume-'));
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), BIND_HOST: '127.0.0.1', DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'] });
  const browser = await chromium.launch();
  const pageErrors = [], calls = [];
  try {
    await ready();
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.addInitScript(() => {
      localStorage.setItem('localMode', '1'); localStorage.setItem('v3OnboardingSeenV1', '1');
      localStorage.setItem('onboardingSeen_v1', '1'); localStorage.setItem('v3.translateProvider', 'gemini');
    });
    await page.route('**/api/translate-table', async (route) => {
      const body = route.request().postDataJSON(), segments = body.segments || [];
      calls.push(segments.map((segment) => segment.text));
      let rows;
      if (segments.length === 120) rows = segments.slice(0, 119).map((segment, index) => translatedRow(index, segment.text));
      else rows = segments.map((segment, index) => translatedRow(index, segment.text));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        rows, fromCache: false, cacheKey: null, warnings: rows.length === segments.length ? [] : ['SEG_COVERAGE_PARTIAL'],
      }) });
    });
    await page.goto(`${BASE}/index.html?table_resume=${Date.now()}`, { waitUntil: 'load' });
    const first = await page.evaluate(async () => {
      if (window.__localDBInitPromise) await window.__localDBInitPromise;
      window.confirm = () => true;
      const segments = Array.from({ length: 121 }, (_, i) => ({ i, text: `segment-${i}`, start: i, end: i + 0.5 }));
      document.getElementById('inputText').value = segments.map((segment) => segment.text).join('\n');
      document.getElementById('providerSelect').value = 'gemini';
      v3LastImportMeta = { kind: 'audio', audio: { media: { sha256: 'a'.repeat(64), durationSec: 122,
        mime: 'video/mp4', originalName: 'resume-smoke.mp4' }, segments } };
      currentTableData = [];
      await v3TranslateTableChunked(segments, { package: { media_sha256: 'a'.repeat(64) } });
      const coverage = TableChunks.coverageForRows(currentTableData, segments.length);
      const journal = await TableJob.loadDurable();
      return { rows: currentTableData.length, coverage, state: journal && journal.state,
        chunks: journal && journal.completed.length, repairs: journal && journal.repairs.length,
        localStorageCopy: localStorage.getItem(TableJob.STORAGE_KEY),
        hud: document.getElementById('v3TableJobRows').textContent };
    });
    await page.reload({ waitUntil: 'load' });
    const restored = await page.evaluate(async () => {
      if (window.__localDBInitPromise) await window.__localDBInitPromise;
      const segments = Array.from({ length: 121 }, (_, i) => ({ i, text: `segment-${i}`, start: i, end: i + 0.5 }));
      document.getElementById('inputText').value = segments.map((segment) => segment.text).join('\n');
      document.getElementById('providerSelect').value = 'google-free';
      v3LastImportMeta = { kind: 'audio', audio: { media: { sha256: 'a'.repeat(64), durationSec: 122,
        mime: 'video/mp4', originalName: 'resume-smoke.mp4' }, segments } };
      currentTableData = [];
      const result = await v3TableJobRestoreLocalOnly({ text: getText().trim(), provider: 'gemini',
        segments, chunkSize: TableChunks.CHUNK_SIZE });
      return { restored: !!result, rows: currentTableData.length,
        coverage: TableChunks.coverageForRows(currentTableData, segments.length), provider: getSelectedProvider() };
    });
    const result = { gate: 'STUDIO_TABLE_COVERAGE_REPAIR_OPFS_RELOAD', first, restored,
      providerCalls: calls.map((segments) => ({ count: segments.length, first: segments[0], last: segments.at(-1) })),
      pageErrors };
    if (first.rows !== 121 || first.coverage.covered !== 121 || first.coverage.missing.length || first.state !== 'done' ||
        first.chunks !== 2 || first.repairs !== 1 || first.localStorageCopy !== null || !/121\/121/.test(first.hud) ||
        !restored.restored || restored.rows !== 121 || restored.coverage.covered !== 121 || restored.coverage.missing.length ||
        restored.provider !== 'google-free' || calls.length !== 3 || calls[0].length !== 120 ||
        calls[1][0] !== 'segment-120' || calls[2][0] !== 'segment-119' || pageErrors.length) {
      throw new Error(`TABLE_RESUME_GATE:${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result, null, 2));
    await context.close();
  } finally {
    await browser.close(); server.kill('SIGTERM'); await sleep(800);
    if (process.platform === 'win32' && !server.killed) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    fs.rmSync(data, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
