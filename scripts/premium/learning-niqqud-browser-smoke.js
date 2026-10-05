#!/usr/bin/env node
'use strict';
// Real source/layer bytes; disposable browser storage, no owner profile or paid calls.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { fork } = require('node:child_process'), { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..');
const arg = key => { const i = process.argv.indexOf('--' + key); return i >= 0 ? process.argv[i + 1] : ''; };
async function protectedState(page, id) {
  return page.evaluate(async id => {
    const db = window.__localDB;
    return { sentences: await db.dbQuery('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index', [id]),
      notes: await db.dbQuery('SELECT * FROM notes_v2 WHERE text_id=? ORDER BY id', [id]),
      bookmarks: await db.dbQuery('SELECT * FROM bookmarks WHERE text_id=? ORDER BY id', [id]),
      reviews: await db.dbQuery('SELECT * FROM review_log ORDER BY id', []),
      progress: await db.dbQuery('SELECT last_row_idx,last_step_id FROM text_progress WHERE text_id=?', [id]) };
  }, id);
}
async function main() {
  const source = arg('source'), reportPath = arg('report'), out = path.resolve(arg('out') || path.join(ROOT, '.tmp/learning-niqqud-browser'));
  if (!source || !reportPath) throw Error('--source and --report required');
  fs.mkdirSync(out, { recursive: true });
  const bundle = JSON.parse(fs.readFileSync(source)), report = JSON.parse(fs.readFileSync(reportPath));
  const layerFile = path.join(path.dirname(reportPath), path.basename(report.file));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-learning-niqqud-'));
  fs.mkdirSync(path.join(dataDir, 'benyehuda', 'works'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'benyehuda', 'learning-niqqud'), { recursive: true });
  fs.copyFileSync(source, path.join(dataDir, 'benyehuda', 'works', report.work_id + '.json'));
  fs.copyFileSync(layerFile, path.join(dataDir, 'benyehuda', report.file));
  let child, browser;
  const checks = [], errors = [], logs = [], record = (name, evidence) => { checks.push({ name, evidence }); console.log('PASS ' + name); };
  try {
    let base = arg('base');
    if (!base) {
      child = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(dataDir, 0), silent: true, windowsHide: true });
      child.stdout.on('data', x => logs.push(String(x))); child.stderr.on('data', x => logs.push(String(x)));
      base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 30000);
    }
    const response = await fetch(base + '/data/benyehuda/' + report.file);
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /immutable/);
    assert.equal(require('node:crypto').createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), report.sha256);
    record('served layer hash and immutable headers', report.sha256);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: 'block' });
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await context.addInitScript(() => {
      localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1');
      if (!localStorage.getItem('room.translitProfile')) localStorage.setItem('room.translitProfile', 'learner-latin');
      localStorage.setItem('room.translitProfile.v2', '1');
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const url = base + '/library.html?canon=skip&corpus_work=' + report.work_id;
    const cell = col => page.locator('#roomReaderTable tbody tr').nth(5).locator('td[data-col="' + col + '"]');
    for (const [profile, expected] of [['learner-latin', 'Haboker hatehorim.'], ['sbl', 'habbôqer haṭṭəhôrîm.'], ['ru-phonetic', 'хабокэр хатэхорим.']]) {
      await page.goto(url);
      await page.waitForFunction(() => !!window.__localDB, { timeout: 45000 });
      await page.evaluate(profile => { localStorage.setItem('room.translitProfile', profile); localStorage.setItem('room.translitProfile.v2', '1'); }, profile);
      await page.reload(); await page.locator('#readerLearningNiqqud').waitFor({ timeout: 45000 });
      await page.waitForFunction(({ expected }) => document.querySelectorAll('#roomReaderTable tbody tr')[5]?.querySelector('[data-col="translit"]')?.textContent.trim() === expected, { expected }, { timeout: 45000 });
      assert.equal((await cell('niqqud').textContent()).normalize('NFC'), 'הַבּוֹקֶר הַטְּהוֹרִים.');
      record('actual reader row 06 ' + profile, await cell('translit').textContent());
    }
    const id = await page.evaluate(async key => (await window.__localDB.dbQuery('SELECT id FROM texts WHERE text_key=?', [key]))[0].id, bundle.library.texts[0].text_key);
    await page.evaluate(async id => {
      const db = window.__localDB, rows = await db.getSentences(id), now = new Date().toISOString();
      await db.updateSentence(id, rows[8].id, { he_niqqud: 'בְּדִיקָה', edit_meta_json: JSON.stringify({ edited: { he_niqqud: true } }) });
      await db.dbRun('INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', ['layer-note','sentence',rows[5].id,id,'free','Fixture','{"markdown":"Keep note"}',now,now]);
      await db.setProgress(id, { last_row_idx: 5, last_step_id: 'translation' });
    }, id);
    const before = await protectedState(page, id);
    await page.reload(); await page.locator('#readerLearningNiqqud').waitFor({ timeout: 45000 });
    assert.equal((await page.locator('#roomReaderTable tbody tr').nth(8).locator('[data-col="niqqud"]').textContent()).normalize('NFC'), 'בְּדִיקָה'.normalize('NFC'));
    await page.locator('#readerLearningNiqqud').click();
    assert.equal((await cell('niqqud').textContent()).normalize('NFC'), 'הבוֹקר הטהוֹרים.');
    assert.equal((await cell('translit').textContent()).trim(), 'хвокр хтхорйм.');
    await page.locator('#readerLearningNiqqud').click();
    assert.equal((await cell('translit').textContent()).trim(), 'хабокэр хатэхорим.');
    assert.deepEqual(await protectedState(page, id), before);
    record('reload, source comparison, edits, notes, progress and review_log preserved', { rows: before.sentences.length, progress: before.progress });
    await page.screenshot({ path: path.join(out, 'desktop.png') });
    await page.setViewportSize({ width: 380, height: 844 });
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    const buttonSize = await page.locator('#readerLearningNiqqud').boundingBox(); assert.ok(buttonSize.height >= 44);
    record('380px button target', buttonSize);
    await page.evaluate(() => window.appSetLocale?.('he'));
    await page.screenshot({ path: path.join(out, 'mobile-he.png') });
    // An independent cold context has no cached layer. A 503 must leave the original readable.
    const fallback = await browser.newContext({ serviceWorkers: 'block' });
    await fallback.addInitScript(() => { localStorage.setItem('app.locale', 'ru'); localStorage.setItem('onboardingSeen_v1', '1'); });
    await fallback.route('**/*', route => {
      if (!route.request().url().startsWith(base)) return route.abort();
      if (route.request().url().includes('/learning-niqqud/')) return route.fulfill({ status: 503, body: 'fixture unavailable' });
      return route.continue();
    });
    const original = await fallback.newPage(); original.on('pageerror', e => errors.push(e.message));
    await original.goto(url); await original.locator('#roomReaderTable tbody tr').nth(5).waitFor({ timeout: 45000 });
    assert.equal((await original.locator('#roomReaderTable tbody tr').nth(5).locator('[data-col="niqqud"]').textContent()).normalize('NFC'), 'הבוֹקר הטהוֹרים.');
    assert.equal(await original.locator('#readerLearningNiqqud').count(), 0);
    record('503 layer falls back to original', true);
    const delayed = await browser.newContext({ serviceWorkers: 'block' });
    await delayed.addInitScript(() => { localStorage.setItem('app.locale', 'ru'); localStorage.setItem('onboardingSeen_v1', '1'); });
    let requested; const layerRequested = new Promise(resolve => { requested = resolve; });
    await delayed.route('**/*', async route => {
      if (!route.request().url().startsWith(base)) return route.abort();
      if (route.request().url().includes('/learning-niqqud/')) { requested(); await new Promise(resolve => setTimeout(resolve, 900)); }
      return route.continue();
    });
    const stale = await delayed.newPage(); stale.on('pageerror', e => errors.push(e.message));
    await stale.goto(url); await layerRequested;
    await stale.locator('#readerBack').click();
    await stale.waitForTimeout(1400);
    assert.equal(await stale.locator('#roomReader').isVisible(), false);
    assert.equal(await stale.locator('#readerLearningNiqqud').count(), 0);
    assert.equal(await stale.locator('#roomReaderTable tbody tr').count(), 0);
    record('Back during layer fetch prevents late table paint', true);
    assert.deepEqual(errors, []); record('no browser page errors', true);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ status: 'pass', base, source_sha256: report.source_bundle_sha256, layer_sha256: report.sha256, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ status: 'fail', checks, errors, error: error.stack }, null, 2));
    fs.writeFileSync(path.join(out, 'server.log'), logs.join('')); throw error;
  } finally { await browser?.close(); child?.kill(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
