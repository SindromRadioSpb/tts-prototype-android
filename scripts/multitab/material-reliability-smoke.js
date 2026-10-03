'use strict';
// Isolated OPFS/server fixtures only. No provider calls and no owner-profile writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const REMOTE_BASE = arg('base');
const OUT = path.resolve(arg('out') || path.join(ROOT, '.tmp/material-reliability'));
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = REMOTE_BASE ? null : fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT,
    env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-reliability-')), 0), silent: true, windowsHide: true });
  const logs = []; server?.stdout.on('data', d => logs.push(String(d))); server?.stderr.on('data', d => logs.push(String(d)));
  let browser;
  try {
    const base = REMOTE_BASE || `http://127.0.0.1:${await waitForSmokeServer(server, 30000)}`;
    if (REMOTE_BASE) {
      assert.ok(arg('version'), '--version is required');
      assert.equal((await (await fetch(base + '/api/client-config?verify=' + Date.now())).json()).version, arg('version'));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 850 } });
    await context.route('**/*', route => {
      const request = route.request();
      if (!request.url().startsWith(base) || (REMOTE_BASE && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()))) return route.abort();
      return route.continue();
    });
    await context.addInitScript(() => { if (!['http:', 'https:'].includes(location.protocol)) return; localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1'); });
    const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    const studio = await context.newPage();
    await studio.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded' });
    await studio.waitForFunction(() => window.__localDB?.isReady(), null, { timeout: 45000 });
    await studio.evaluate(async () => {
      for (const id of ['A', 'B']) {
        await __localDB.createText({ id, text_key: 'reliability-' + id, title: 'Material ' + id, source_text: 'source-' + id });
        for (let i = 0; i < 4; i++) await __localDB.addSentence(id, { id: id + i, he: 'שלום', he_plain: 'שלום', ru: id + '-row-' + i, translit: 'shalom', translit_ru: 'шалом', order_index: i });
      }
      await __localDB.setProgress('B', { last_row_idx: 2, last_step_id: 'ru' });
      const legacy = JSON.stringify({ mode: 'library', textId: 'A', openMode: 'open' });
      localStorage.setItem('ttsDashboard_session_state_v1', legacy);
      sessionStorage.setItem('ttsDashboard_session_state_v1', legacy);
      localStorage.removeItem('studio.sessionMigration.v2'); localStorage.removeItem('studio.lastMaterial.v1');
    });
    await studio.reload({ waitUntil: 'domcontentloaded' });
    await studio.locator('#proTable').getByText('A-row-0', { exact: true }).waitFor({ timeout: 30000 });
    await studio.evaluate(async () => {
      const original = ensureLocalDB;
      const deferredSource = new Promise(resolve => { window.releaseSourceA = resolve; });
      ensureLocalDB = async () => new Proxy(await original(), { get(target, prop) {
        if (prop === 'getTextSourceText') return id => id === 'A' ? deferredSource : target.getTextSourceText(id);
        return target[prop];
      }});
      await v3LibraryOpenText('A', {});
      await v3LibraryOpenText('B', { resume: true });
      window.acceptedTable = document.getElementById('proTable');
      window.releaseSourceA('late-source-A');
    });
    await studio.waitForFunction(() => document.getElementById('inputText').value === 'source-B');
    await studio.locator('#proTable tr.row-selected[data-row-idx="2"]').waitFor();
    assert.equal(await studio.evaluate(() => document.getElementById('proTable') === window.acceptedTable), true);
    assert.equal(await studio.evaluate(() => v3SessionGet().textId), 'B');
    const fresh = await context.newPage();
    await fresh.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded' });
    await fresh.locator('#proTable').getByText('B-row-0', { exact: true }).waitFor({ timeout: 30000 });
    await fresh.locator('#proTable tr.row-selected[data-row-idx="2"]').waitFor();
    assert.equal(await fresh.evaluate(() => v3SessionGet().textId), 'B');
    assert.equal(await fresh.evaluate(() => JSON.parse(localStorage.getItem('ttsDashboard_session_state_v1')).textId), 'A', 'legacy data is preserved but not replayed');
    await fresh.waitForFunction(() => document.getElementById('inputText').value === 'source-B');
    const saved = await fresh.evaluate(async () => {
      const updated = await v3LibraryUpdateCurrentCore('B', { title: 'Material B updated' });
      if (!updated?.id) throw new Error('normal update failed');
      const copy = await v3LibrarySaveCurrentCore({ title: 'Material B copy' });
      if (!copy?.id) throw new Error('normal Save as new failed');
      const second = await v3LibraryUpdateCurrentCore(copy.id, { title: 'Material B copy updated' });
      if (!second?.id) throw new Error('update after Save as new failed');
      const rows = await __localDB.getSentences(copy.id);
      return { original: updated.id, copy: copy.id, updatedCopy: second.id, rows: rows.map(r => r.ru) };
    });
    assert.equal(saved.original, 'B'); assert.notEqual(saved.copy, 'B'); assert.equal(saved.updatedCopy, saved.copy);
    assert.deepEqual(saved.rows, ['B-row-0', 'B-row-1', 'B-row-2', 'B-row-3']);
    const rollback = await fresh.evaluate(async () => {
      const original = ensureLocalDB, db = await original();
      const beforeReview = JSON.stringify(await db.dbQuery('SELECT * FROM review_log ORDER BY id'));
      const active = v3SessionGet().textId;
      let attemptedId;
      ensureLocalDB = async () => new Proxy(db, { get(target, prop) {
        if (prop === 'createText') return async fields => { attemptedId = fields.id; return target.createText(fields); };
        if (prop === 'addSentences') return async (...args) => { await target.addSentences(...args); throw new Error('fixture: quota failure after rows'); };
        return target[prop];
      }});
      let result;
      try { result = await v3LibrarySaveCurrentCore({ title: 'must rollback' }); }
      finally { ensureLocalDB = original; }
      return { failed: result === null, attempted: !!attemptedId, absent: !(await db.getTextById(attemptedId)),
        activeUnchanged: v3SessionGet().textId === active,
        reviewUnchanged: beforeReview === JSON.stringify(await db.dbQuery('SELECT * FROM review_log ORDER BY id')) };
    });
    assert.deepEqual(rollback, { failed: true, attempted: true, absent: true, activeUnchanged: true, reviewUnchanged: true });
    // Public reading becomes available before optional account/tutor responses.
    const catalog = await context.newPage();
    let releaseOptional; const optionalGate = new Promise(r => { releaseOptional = r; });
    await catalog.route('**/api/auth/me', async route => { await optionalGate; await route.fulfill({ json: { user: null } }); });
    await catalog.route('**/api/tutor/capabilities', async route => { await optionalGate; await route.fulfill({ json: { enabled: false } }); });
    const structure = require('../../public/js/mediatheque-core').empty();
    await catalog.route('**/api/mediatheque', route => route.fulfill({ json: { ok: true, revision: 1, structure, items: [{
      ref: { kind: 'public', slug: 'fixture', workId: 'B', snapshotHash: 'a'.repeat(64) },
      title: 'Public fixture B', available: true, kind: 'text', tags: []
    }] } }));
    const catalogStart = Date.now();
    await catalog.goto(base + '/mediatheque.html?space=public&section=catalog', { waitUntil: 'domcontentloaded' });
    await catalog.getByText('Public fixture B', { exact: true }).first().waitFor({ timeout: 15000 });
    const catalogMs = Date.now() - catalogStart;
    releaseOptional();
    await catalog.screenshot({ path: path.join(OUT, 'catalog-desktop.png') });
    // A deliberately pending membership response must not gate a local Room link.
    const room = await context.newPage();
    let releaseMembership; const membershipGate = new Promise(r => { releaseMembership = r; });
    await room.route('**/api/group-corpora**', async route => { await membershipGate; await route.fulfill({ json: { ok: true, corpora: [] } }); });
    const started = Date.now();
    await room.goto(base + '/library.html?my_text=B', { waitUntil: 'domcontentloaded' });
    await room.locator('#roomReaderTable').getByText('B-row-0', { exact: false }).waitFor({ timeout: 15000 });
    const localRoomMs = Date.now() - started;
    await room.evaluate(() => { window.acceptedRoomTable = document.getElementById('roomReaderTable').firstElementChild; window.documentSentinel = true; });
    releaseMembership();
    await room.screenshot({ path: path.join(OUT, 'room-desktop.png') });
    await fresh.screenshot({ path: path.join(OUT, 'studio-desktop.png') });
    await fresh.setViewportSize({ width: 380, height: 820 });
    await fresh.screenshot({ path: path.join(OUT, 'studio-380.png') });
    await fresh.setViewportSize({ width: 1280, height: 850 });
    await fresh.evaluate(() => v3IdeApplyMode(true, 'B'));
    await fresh.locator('#v3IdeCenterContent #proTable tr.row-selected[data-row-idx="2"]').waitFor();
    assert.equal(await fresh.locator('#proTable').count(), 1, 'one active table across Studio modes');
    assert.equal(await fresh.inputValue('#inputText'), 'source-B');
    await fresh.evaluate(async () => {
      const text = await v3LibraryUpdateCurrentCore('B', { title: 'Material B from IDE' });
      if (!text?.id) throw new Error('IDE update failed');
    });
    assert.equal(await fresh.evaluate(async () => (await __localDB.getSentences('B'))[0].he_plain), 'שלום');
    assert.equal(await fresh.locator('#proTable').count(), 1, 'saving in IDE must not mount a hidden Classic table');
    assert.equal(await fresh.locator('#v3IdeCenterContent tr[data-row-idx="0"]').getAttribute('data-sentence-id'),
      await fresh.evaluate(async () => (await __localDB.getSentences('B'))[0].id));
    await fresh.evaluate(() => v3IdeApplyMode(false));
    await fresh.locator('#tableContainer #proTable').getByText('B-row-0', { exact: true }).waitFor();
    assert.equal(await fresh.locator('#proTable').count(), 1);
    assert.equal(await room.evaluate(() => window.documentSentinel), true);
    assert.deepEqual(errors, []);
    const report = { result: 'PASS', base, remoteReadOnly: !!REMOTE_BASE, disposableBrowserProfile: true, freshTabMaterial: 'B', restoredRow: 2, lateSourceSuppressed: true,
      legacyPreserved: true, localRoomIndependentOfMembership: true, localRoomMs,
      publicCatalogIndependentOfAccount: true, catalogMs,
      saveUpdateAndCopy: true, rollback,
      studioModeIdentityAndSave: true,
      studioTimings: await studio.evaluate(() => v3MaterialOpens.timings()), errors };
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    fs.writeFileSync(path.join(OUT, 'server.log'), logs.join(''));
    if (browser) for (const [i, page] of browser.contexts().flatMap(c => c.pages()).entries()) {
      await page.screenshot({ path: path.join(OUT, `failure-${i}.png`) }).catch(() => {});
      fs.writeFileSync(path.join(OUT, `failure-${i}.txt`), page.url() + '\n' + await page.locator('body').innerText().catch(() => 'unavailable'));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) { server.kill(); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); }); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
