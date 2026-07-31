'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.MEDIA_PACKAGE_BROWSER_PORT || 3281);
const EXTERNAL_BASE = String(process.env.MEDIA_PACKAGE_BROWSER_BASE || '').replace(/\/$/, '');
const BASE = EXTERNAL_BASE || `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, 'docs', 'research', 'studio-l3a-correctable-media-package', '2026-07-31', 'screenshots');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer(dataDir) {
  return spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BIND_HOST: '127.0.0.1', DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([new Promise((resolve) => child.once('exit', () => resolve(true))), sleep(5000).then(() => false)]);
  if (!exited) process.platform === 'win32' ? spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) : child.kill('SIGKILL');
}
async function waitReady() {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch (_) {}
    await sleep(250);
  }
  throw new Error('SERVER_NOT_READY');
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const serverData = EXTERNAL_BASE ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'linguistpro-l3a-browser-'));
  const server = EXTERNAL_BASE ? null : startServer(serverData);
  const browser = await chromium.launch();
  try {
    await waitReady();
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 380, height: 844 }, locale: 'ru-RU' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('localMode', '1');
      localStorage.setItem('phase6FirstOpenSeen', 'browser-smoke');
      localStorage.setItem('v3OnboardingSeenV1', 'browser-smoke');
      localStorage.setItem('onboardingSeen_v1', 'browser-smoke');
      localStorage.setItem('v3.byokOnboardingDismissed', '1');
      localStorage.setItem('v3.byokTourCompleted', '1');
    });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(`${BASE}/index.html?localMode=1`, { waitUntil: 'load' });
    const setup = await page.evaluate(async () => {
      if (window.__localDBInitPromise) await window.__localDBInitPromise;
      const db = await window.ensureLocalDB();
      const migration = await db.dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='studio_caption_revisions'");
      const rate = 8000, samples = rate * 2, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
      const word = (offset, value) => Array.from(value).forEach((ch, i) => { bytes[offset + i] = ch.charCodeAt(0); });
      word(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, samples * 2, true);
      const sha = await window.MediaPackageCore.sha256Hex(bytes), opfs = window.MediaStore.mediaFileName(sha, 'audio/wav', 'l3a-browser-fixture.wav');
      const saved = await window.MediaStore.saveMedia(bytes.buffer, opfs); if (!saved.ok) throw new Error(`MEDIA_SAVE:${saved.reason}`);
      const raw = await window.MediaPackageCore.createRawRevision({ media_sha256: sha, format: 'asr', provider: 'browser-fixture', segments: [
        { start_ms: 0, end_ms: 800, text: 'שלום מיה' }, { start_ms: 900, end_ms: 1800, text: 'זהו מבחן מקומי' },
      ] });
      const repo = window.StudioMediaPackage.browserRepository();
      const pkg = await repo.createPackage({ media: { sha256: sha, mime: 'audio/wav', duration_ms: 2000, original_name: 'l3a-browser-fixture.wav', opfs_path: opfs, size_bytes: bytes.length }, raw_revision: raw });
      const revision = await repo.getCurrentRevision(pkg.corrected_track_id);
      await window.StudioMediaPackage.setActiveWorkspace({ package_id: pkg.package_id, track_id: pkg.corrected_track_id, revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256, local_only: true });
      await window.StudioMediaEditor.open(pkg.corrected_track_id);
      return { migration_v45: migration.length === 1, ...pkg };
    });
    await page.locator('#l3MediaEditorModal:not(.hidden)').waitFor();
    await sleep(250);
    const ru = await page.evaluate(() => ({
      dir: document.getElementById('l3MediaEditorModal').dir,
      counter: document.getElementById('l3CueCounter').textContent,
      player: !document.getElementById('l3MediaPlayer').hidden,
      overflow: document.getElementById('l3MediaEditorPanel').scrollWidth > document.getElementById('l3MediaEditorPanel').clientWidth,
      raw_visible: !!document.getElementById('l3RawText').textContent,
      visible_dialogs: Array.from(document.querySelectorAll(".v3-modal, [role='dialog']")).filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0).map((el) => el.id).filter(Boolean),
    }));
    await page.screenshot({ path: path.join(SHOTS, 'l3a-380-ru.png'), fullPage: false });
    await page.locator('#l3CueText').fill('שלום מיה — תיקון אנושי');
    const saved = await page.evaluate(async () => {
      const revision = await window.StudioMediaEditor.saveVersion();
      return { revision_no: revision.revision_no, author_kind: revision.author_kind, hash: revision.canonical_sha256 };
    });
    await page.evaluate(() => window.StudioMediaEditor.close(true));
    await page.locator('#l3WorkspaceCard:not([hidden])').waitFor();
    const reopen = await page.evaluate(() => ({
      name: document.getElementById('l3WorkspaceName').textContent,
      revision: document.getElementById('l3WorkspaceRevision').textContent,
      raw: document.querySelector('#l3WorkspaceCard [data-i18n="studio.mediaPackage.workspaceRaw"]').textContent,
      library_count: document.getElementById('l3WorkspaceLibraryCount').textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    await page.locator('#l3WorkspaceCard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'l3a-reopen-composer-380-ru.png'), fullPage: false });
    await page.locator('#l3WorkspaceReopenBtn').click();
    await page.locator('#l3MediaEditorModal:not(.hidden)').waitFor();
    await page.evaluate(async (trackId) => {
      window.appSetLocale('he'); window.StudioMediaEditor.close(true); await window.StudioMediaEditor.open(trackId);
    }, setup.corrected_track_id);
    await sleep(250);
    await page.screenshot({ path: path.join(SHOTS, 'l3a-380-he.png'), fullPage: false });
    const he = await page.evaluate(() => ({
      dir: document.getElementById('l3MediaEditorModal').dir,
      html_dir: document.documentElement.dir,
      overflow: document.getElementById('l3MediaEditorPanel').scrollWidth > document.getElementById('l3MediaEditorPanel').clientWidth,
      corrected_text: document.getElementById('l3CueText').value === 'שלום מיה — תיקון אנושי',
      visible_dialogs: Array.from(document.querySelectorAll(".v3-modal, [role='dialog']")).filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0).map((el) => el.id).filter(Boolean),
    }));
    await page.evaluate(async () => { window.StudioMediaEditor.close(true); await window.StudioMediaPackage.openWorkspaceLibrary(); });
    await page.locator('#v3ImportModal:not(.hidden)').waitFor();
    await sleep(250);
    const shelf = await page.evaluate(() => ({
      items: document.querySelectorAll('#l3WorkspaceShelfList .l3-workspace-shelf-item').length,
      title: document.getElementById('l3WorkspaceShelfTitle').textContent,
      hint: document.querySelector('.l3-workspace-shelf-hint').textContent,
      active: document.querySelector('.l3-workspace-shelf-item')?.dataset.active,
      overflow: document.querySelector('#v3ImportModal .v3-modal-panel').scrollWidth > document.querySelector('#v3ImportModal .v3-modal-panel').clientWidth,
    }));
    await page.screenshot({ path: path.join(SHOTS, 'l3a-reopen-shelf-380-he.png'), fullPage: false });
    const shelfOpen = page.locator('#l3WorkspaceShelfList .l3-workspace-shelf-item button');
    if (await shelfOpen.count() !== 1) throw new Error('SHELF_REOPEN_BUTTON_COUNT');
    await shelfOpen.click();
    await page.locator('#l3MediaEditorModal:not(.hidden)').waitFor();
    const reopenedFromShelf = await page.locator('#l3CueText').inputValue() === 'שלום מיה — תיקון אנושי';
    await page.evaluate(() => window.StudioMediaEditor.close(true));
    await page.reload({ waitUntil: 'load' });
    await page.locator('#l3WorkspaceLibraryBtn:not([hidden])').waitFor();
    await page.locator('#l3WorkspaceLibraryBtn').click();
    await page.locator('#v3ImportPaneFile:not([hidden]) #l3WorkspaceShelfList .l3-workspace-shelf-item').waitFor();
    const afterReloadItems = await page.locator('#l3WorkspaceShelfList .l3-workspace-shelf-item').count();
    const reloadShelfOpen = page.locator('#l3WorkspaceShelfList .l3-workspace-shelf-item button');
    if (await reloadShelfOpen.count() !== 1) throw new Error('RELOAD_SHELF_REOPEN_BUTTON_COUNT');
    await reloadShelfOpen.click();
    await page.locator('#l3MediaEditorModal:not(.hidden)').waitFor();
    const reopenedAfterReload = await page.locator('#l3CueText').inputValue() === 'שלום מיה — תיקון אנושי';
    if (!setup.migration_v45 || ru.dir !== 'ltr' || ru.counter !== '1 / 2' || !ru.player || ru.overflow || !ru.raw_visible || ru.visible_dialogs.join(',') !== 'l3MediaEditorModal' || saved.revision_no !== 2 || saved.author_kind !== 'user' || reopen.name !== 'l3a-browser-fixture.wav' || !reopen.revision.includes('v2') || !reopen.raw || reopen.library_count !== '1' || reopen.overflow || he.dir !== 'rtl' || he.html_dir !== 'rtl' || he.overflow || !he.corrected_text || he.visible_dialogs.join(',') !== 'l3MediaEditorModal' || shelf.items !== 1 || !shelf.title || !shelf.hint || shelf.active !== 'true' || shelf.overflow || !reopenedFromShelf || afterReloadItems !== 1 || !reopenedAfterReload || pageErrors.length) {
      throw new Error(`BROWSER_GATE:${JSON.stringify({ setup, ru, saved, reopen, he, shelf, reopenedFromShelf, afterReloadItems, reopenedAfterReload, pageErrors })}`);
    }
    console.log(JSON.stringify({ gate: 'L3A_BROWSER_380_RU_HE_REOPEN', setup, ru, saved, reopen, he, shelf, reopenedFromShelf, afterReloadItems, reopenedAfterReload, screenshots: ['l3a-380-ru.png', 'l3a-reopen-composer-380-ru.png', 'l3a-380-he.png', 'l3a-reopen-shelf-380-he.png'], page_errors: pageErrors }, null, 2));
  } finally {
    await browser.close(); await stopServer(server);
    if (serverData) fs.rmSync(serverData, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
