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
  let child, browser, debugPage;
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
    const page = await context.newPage(); debugPage = page;
    page.on('console', message => { if (message.type() === 'warning' && /save.*failed/i.test(message.text())) console.log('SAVE DIAGNOSTIC '+message.text()); }); page.on('pageerror', e => errors.push(e.message));
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
    const localeEvidence = await page.evaluate(() => ({
      source: document.querySelector('#readerSubtitle a')?.textContent,
      expectedSource: window.t('room.reader.context.source') + ': ' + window.t('room.reader.context.sourceName') + ' ↗',
      resume: document.querySelector('#readerResume .reader-resume-msg')?.textContent,
      expectedResume: window.t('room.resume.fromRow') + ' 6'
    }));
    assert.equal(localeEvidence.source, localeEvidence.expectedSource);
    assert.equal(localeEvidence.resume, localeEvidence.expectedResume);
    assert.deepEqual(await protectedState(page, id), before);
    record('live locale switch updates source and resume without changing learner state', localeEvidence);
    await page.screenshot({ path: path.join(out, 'mobile-he.png') });
    // A fresh document uses the validated persistent layer cache, including Studio, exports and SRS reads.
    let repeatedLayerRequests = 0;
    await context.route('**/data/benyehuda/learning-niqqud/**', route => { repeatedLayerRequests++; return route.abort(); });
    await page.goto(base + '/?canon=skip');
    await page.waitForFunction(() => !!window.v3LibraryOpenText && !!window.BenYehudaLearningNiqqud, { timeout: 45000 });
    for (const [profile, expected] of [['learner-latin', 'Haboker hatehorim.'], ['sbl', 'habbôqer haṭṭəhôrîm.'], ['ru-phonetic', 'хабокэр хатэхорим.']]) {
      await page.evaluate(async ({ id, profile }) => {
        document.getElementById('translitProfileSelect').value = profile;
        const visible = document.querySelector('input[type="checkbox"][data-col="translit"]');
        if (visible && !visible.checked) { visible.checked = true; visible.dispatchEvent(new Event('change', { bubbles: true })); }
        await v3LibraryOpenText(id, { resume: true, origin: 'layer-smoke' });
      }, { id, profile });
      await page.waitForFunction(expected => document.querySelectorAll('#tableContainer tbody tr')[5]?.querySelector('[data-col="translit"]')?.textContent.trim() === expected, expected, { timeout: 45000 });
      record('Studio row 06 ' + profile, expected);
    }
    const studioBefore = await protectedState(page, id);
    await page.evaluate(() => v3ToggleLearningNiqqud());
    assert.equal((await page.locator('#tableContainer tbody tr').nth(5).locator('[data-col="niqqud"]').textContent()).normalize('NFC'), 'הבוֹקר הטהוֹרים.');
    await page.evaluate(() => v3ToggleLearningNiqqud());
    assert.equal((await page.locator('#tableContainer tbody tr').nth(5).locator('[data-col="translit"]').textContent()).trim(), 'хабокэр хатэхорим.');
    assert.deepEqual(await protectedState(page, id), studioBefore);
    const exports = await page.evaluate(async id => {
      const db = await ensureLocalDB(), bundle = await db.exportBundle({ textIds: [id] }), text = bundle.library.texts[0];
      const row = text.rows[5], study = (await db.getStudySentences(id))[5];
      const reviewed = await db.getSentenceForReview(study.id);
      return { source: row.hebrew_niqqud, portable: !!text.learning_niqqud_layer,
        study: study.he_niqqud, review: reviewed.he_niqqud };
    }, id);
    assert.deepEqual(exports, { source: 'הבוֹקר הטהוֹרים.', portable: true, study: 'הַבּוֹקֶר הַטְּהוֹרִים.', review: 'הַבּוֹקֶר הַטְּהוֹרִים.' });
    assert.equal(repeatedLayerRequests, 0);
    record('Studio comparison, raw backup plus portable layer, export and SRS parity; zero repeated layer requests', exports);
    const docxBytes = await page.evaluate(async id => {
      const db = await ensureLocalDB(), text = await db.getTextById(id), sentences = await db.getStudySentences(id);
      const response = await fetch('/api/export/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sentences, notes: [], translit_profile: 'learner-latin' }) });
      if (!response.ok) throw Error('DOCX HTTP ' + response.status);
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    }, id);
    const docx = Buffer.from(docxBytes), zip = await require('../../public/db/jszip.min.js').loadAsync(docx);
    const documentXml = await zip.file('word/document.xml').async('string');
    assert.ok(documentXml.includes('Haboker hatehorim.')); assert.ok(documentXml.normalize('NFC').includes('הַבּוֹקֶר הַטְּהוֹרִים.'));
    fs.writeFileSync(path.join(out, 'study.docx'), docx); record('actual DOCX carries prepared pointing and current learner transliteration', { bytes: docx.length });
    // Native backup imports its exact derived asset into a clean profile, without network.
    const portableBundle = await page.evaluate(async id => (await ensureLocalDB()).exportBundle({ textIds: [id] }), id);
    const restoreContext = await browser.newContext({ serviceWorkers: 'block' });
    await restoreContext.route('**/*', route => route.request().url().startsWith(base) && !route.request().url().includes('/learning-niqqud/') ? route.continue() : route.abort());
    const restored = await restoreContext.newPage(); restored.on('pageerror', e => errors.push(e.message));
    await restored.goto(base + '/?canon=skip'); await restored.waitForFunction(() => typeof ensureLocalDB === 'function');
    const restoreResult = await restored.evaluate(async ({ bundle, id }) => {
      const db = await ensureLocalDB(); const result = await db.importBundle(bundle, { mode: 'skip', userRestore: true });
      if (result.errors?.length || !result.importedIds?.length) throw Error('Native restore failed: '+JSON.stringify(result.errors));
      id = result.importedIds[0];
      // A newer global pin must not change this imported frozen package.
      globalThis.BenYehudaLearningNiqqudManifest = { works: { '34190': {file:'learning-niqqud/34190-'+'f'.repeat(32)+'.json',sha256:'f'.repeat(64)} } };
      const raw = (await db.getSentences(id))[5], study = (await db.getStudySentences(id))[5];
      return {raw:raw.he_niqqud, study:study.he_niqqud};
    }, {bundle:portableBundle, id});
    assert.deepEqual(restoreResult, {raw:'הבוֹקר הטהוֹרים.',study:'הַבּוֹקֶר הַטְּהוֹרִים.'});
    record('native backup restores a frozen layer in a clean profile with layer network blocked', restoreResult);
    await page.locator('#v3ModeToggle').click();
    await page.locator('#v3IdeLearningNiqqud').waitFor({timeout:45000});
    await page.locator('#v3IdeColTranslit').check({force:true});
    for (const [profile, expected] of [['learner-latin','Haboker hatehorim.'],['sbl','habbôqer haṭṭəhôrîm.'],['ru-phonetic','хабокэр хатэхорим.']]) {
      await page.selectOption('#v3IdeTranslitProfile',profile);
      await page.waitForFunction(expected => document.querySelectorAll('#v3IdeCenterContent tbody tr')[5]?.querySelector('[data-col="translit"]')?.textContent.trim()===expected,expected,{timeout:45000});
      record('IDE visible profile control '+profile,expected);
    }
    const copied = await page.evaluate(async () => {
      let captured; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{captured=value;}}});
      v3IdeState.selectedRowIdx=5;v3IdeExportCopy();await Promise.resolve();return captured;
    });
    assert.ok(copied.includes('хабокэр хатэхорим.'));assert.ok(!copied.includes('hḇôqr'));
    record('IDE row copy uses the displayed profile and prepared pointing',true);
    await page.locator('#v3IdeLearningNiqqud').click();
    assert.equal((await page.locator('#v3IdeCenterContent tbody tr').nth(5).locator('[data-col="niqqud"]').textContent()).normalize('NFC'),'הבוֹקר הטהוֹרים.');
    await page.locator('#v3IdeLearningNiqqud').click();
    await page.screenshot({path:path.join(out,'studio-ide.png')});
    await page.locator('#v3IdeExitBtn').click();
    await page.waitForFunction(()=>document.querySelectorAll('#tableContainer tbody tr')[5]?.querySelector('[data-col="translit"]')?.textContent.trim()==='хабокэр хатэхорим.',{timeout:45000});
    record('IDE comparison and return to Classic preserve the selected profile',true);
    // Save as new keeps source rows and a derived origin, without making the copy a corpus card.
    const copyResult = await page.evaluate(async () => {
      const text = await v3LibrarySaveCurrentCore({ title:'Fixture private copy', tags:[] });
      if (!text?.id) throw Error('Save as new failed; input chars '+String(getText()||'').length+'; session '+JSON.stringify(v3SessionGet()));
      const db = await ensureLocalDB(), metadata = JSON.parse((await db.getTextById(text.id)).source_meta_json);
      return {raw:(await db.getSentences(text.id))[5].he_niqqud,study:(await db.getStudySentences(text.id))[5].he_niqqud,
        origin:metadata._learning_niqqud_origin?.work_id,corpus:!!metadata.corpus};
    });
    assert.deepEqual(copyResult, {raw:'הבוֹקר הטהוֹרים.',study:'הַבּוֹקֶר הַטְּהוֹרִים.',origin:'34190',corpus:false});
    record('save as new preserves canonical source and frozen study binding', copyResult);
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
    assert.ok((await original.locator('#readerLearningNiqqud').textContent()).includes('исходная'));
    record('503 layer falls back to original', true);
    const slowContext=await browser.newContext({serviceWorkers:'block'});let slowCalls=0;
    await slowContext.addInitScript(()=>{localStorage.setItem('app.locale','ru');localStorage.setItem('onboardingSeen_v1','1');});
    await slowContext.route('**/*',async route=>{
      if(!route.request().url().startsWith(base))return route.abort();
      if(route.request().url().includes('/learning-niqqud/')){slowCalls++;await new Promise(resolve=>setTimeout(resolve,2200));}
      return route.continue();
    });
    const slow=await slowContext.newPage();slow.on('pageerror',e=>errors.push(e.message));await slow.goto(url);
    await slow.locator('#roomReaderTable tbody tr').nth(5).waitFor({timeout:45000});
    assert.equal((await slow.locator('#roomReaderTable tbody tr').nth(5).locator('[data-col="niqqud"]').textContent()).normalize('NFC'),'הבוֹקר הטהוֹרים.');
    const exportReady=await slow.evaluate(async key=>{const db=window.__localDB,id=(await db.dbQuery('SELECT id FROM texts WHERE text_key=?',[key]))[0].id;return (await db.getStudySentences(id))[5].he_niqqud;},bundle.library.texts[0].text_key);
    assert.equal(exportReady.normalize('NFC'),'הַבּוֹקֶר הַטְּהוֹרִים.');
    await slow.waitForFunction(async file=>!!(await (await caches.open('linguistpro-benyehuda-learning-v1')).match('/data/benyehuda/'+file)),report.file,{timeout:15000});
    await slow.reload();await slow.waitForFunction(()=>document.querySelectorAll('#roomReaderTable tbody tr')[5]?.querySelector('[data-col="translit"]')?.textContent.trim()==='Haboker hatehorim.',{timeout:45000});
    assert.equal(slowCalls,1);record('slow first download finishes in background and next open uses it without another request',true);
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
    // Exercise the real installed worker and a fully offline document, separately from routed fixtures.
    const pwa = await browser.newContext({ serviceWorkers: 'allow' });
    await pwa.addInitScript(() => { localStorage.setItem('app.locale', 'ru'); localStorage.setItem('onboardingSeen_v1', '1'); localStorage.setItem('phase6Decision_v1', 'declined'); });
    const offline = await pwa.newPage(); debugPage = offline; offline.on('pageerror', e => errors.push(e.message));
    await offline.goto(url); await offline.locator('#readerLearningNiqqud').waitFor({ timeout: 45000 });
    await offline.evaluate(() => Promise.race([navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(Error('Service worker did not activate')), 45000))]));
    await offline.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 45000 });
    await pwa.setOffline(true); await offline.reload();
    await offline.locator('#readerLearningNiqqud').waitFor({ timeout: 45000 });
    assert.equal((await offline.locator('#roomReaderTable tbody tr').nth(5).locator('[data-col="translit"]').textContent()).trim(), 'Haboker hatehorim.');
    record('installed service worker reloads the prepared study material fully offline', true);
    assert.deepEqual(errors, []); record('no browser page errors', true);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ status: 'pass', base, source_sha256: report.source_bundle_sha256, layer_sha256: report.sha256, checks }, null, 2));
  } catch (error) {
    const diagnostic = await debugPage?.evaluate(async () => ({ mode: document.body.className, profile: document.getElementById('translitProfileSelect')?.value,
      workers: (await navigator.serviceWorker.getRegistrations()).map(r => ({ active: r.active?.state, installing: r.installing?.state, waiting: r.waiting?.state })),
      cacheKeys: await caches.keys(), config: await fetch('/api/client-config').then(r => r.json()).then(c => ({ version: c.version, shellKeys: Object.keys(c.shellIntegrity || {}) })),
      niqqud: document.querySelectorAll('#tableContainer tbody tr')[5]?.querySelector('[data-col="niqqud"]')?.textContent,
      translit: document.querySelectorAll('#tableContainer tbody tr')[5]?.querySelector('[data-col="translit"]')?.textContent,
      rows: document.querySelectorAll('#tableContainer tbody tr').length,
      prepared: typeof currentTableData !== 'undefined' ? currentTableData?.[5] : null })).catch(() => null);
    await debugPage?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ status: 'fail', checks, errors, diagnostic, error: error.stack }, null, 2));
    fs.writeFileSync(path.join(out, 'server.log'), logs.join('')); throw error;
  } finally { await browser?.close(); child?.kill(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
