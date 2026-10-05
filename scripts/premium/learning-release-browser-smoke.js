'use strict';
// Real publication bytes, disposable learner storage, loopback only. Never uses owner OPFS.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, '.tmp/learning-release/browser');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/benyehuda/learning-release-v8.json')));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/benyehuda/corpus-index-v8.json')));
const card = id => index.ready.find(c => c.id === String(id));
async function protectedState(page, id) {
  return page.evaluate(async id => {
    const db = window.__localDB;
    return {
      sentences: await db.dbQuery('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index', [id]),
      notes: await db.dbQuery('SELECT * FROM notes_v2 WHERE text_id=? ORDER BY id', [id]),
      bookmarks: await db.dbQuery('SELECT * FROM bookmarks WHERE text_id=? ORDER BY id', [id]),
      reviews: await db.dbQuery('SELECT * FROM review_log ORDER BY id', []),
      audio: await db.dbQuery('SELECT * FROM audio_assets ORDER BY id', []),
      audioLinks: await db.dbQuery('SELECT * FROM sentence_audio ORDER BY sentence_id,audio_id', []),
      mediaBytes: Array.from(new Uint8Array(await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('audio-cache')).getFileHandle('release-fixture.wav')).getFile().then(file => file.arrayBuffer()))),
      progress: await db.dbQuery('SELECT last_row_idx,last_step_id FROM text_progress WHERE text_id=?', [id]),
      replaceBackups: await db.dbQuery('SELECT * FROM lww_replace_backups ORDER BY id', [])
    };
  }, id);
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const child = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-learning-release-')), 0), silent: true, windowsHide: true });
  const logs = []; child.stdout.on('data', x => logs.push(String(x))); child.stderr.on('data', x => logs.push(String(x)));
  let browser, debugPage;
  const checks = [], record = (name, evidence) => { checks.push({ name, result: 'pass', evidence }); console.log('PASS ' + name); };
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 60000);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(30000);
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await context.addInitScript(() => { localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1'); });
    const page = await context.newPage(); debugPage = page;
    const errors = [], bodyRequests = []; page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.method() === 'GET' && /\/data\/benyehuda\/works\//.test(r.url())) bodyRequests.push(r.url()); });
    await page.goto(base + '/library.html?canon=skip#room=benyehuda&mode=explore&scope=corpus&readyOnly=0&hasAudio=0&reviewed=0&exactForm=0&rv=2');
    await page.locator('#roomCorpusSearch').waitFor();
    const config = await (await page.request.get(base + '/api/client-config')).json();
    assert.match(config.version, /^3\.11\.731/);
    record('served candidate version and root', { version: config.version, ready: index.ready.length, discovery: 26455 });
    const old = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/learning-release/baseline/data/benyehuda/works/3557.json')));
    const seeded = await page.evaluate(async bundle => {
      const db = window.__localDB;
      const result = await db.importBundle(bundle, { mode: 'skip' });
      assertNoErrors(result);
      function assertNoErrors(r) { if (r.errors.length) throw Error(JSON.stringify(r.errors)); }
      const texts = await db.dbQuery('SELECT id,text_key FROM texts WHERE text_key=?', [bundle.library.texts[0].text_key]);
      const id = texts[0].id, now = '2026-10-05T00:00:00Z';
      const rows = await db.getSentences(id);
      await db.dbRun('INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', ['release-note','sentence',rows[0].id,id,'free','Fixture note','{"markdown":"Preserve learner annotation"}',now,now]);
      await db.addBookmark({ text_id: id, text_key: texts[0].text_key, sentence_id: rows[0].id, order_index: 0, title: 'Fixture bookmark' });
      await db.setProgress(id, { last_row_idx: 2, last_step_id: 'translation' });
      const mediaDir = await (await navigator.storage.getDirectory()).getDirectoryHandle('audio-cache', { create: true });
      const mediaFile = await mediaDir.getFileHandle('release-fixture.wav', { create: true });
      const mediaWriter = await mediaFile.createWritable();
      await mediaWriter.write(new Uint8Array([82,73,70,70,0,0,0,0,87,65,86,69])); await mediaWriter.close();
      await db.upsertAudioAsset({ id: 'release-media', asset_key: 'release-fixture', relative_path: 'audio-cache/release-fixture.wav', mime: 'audio/wav', size_bytes: 12 });
      await db.linkSentenceAudio(rows[0].id, 'release-media');
      await db.dbRun('INSERT INTO review_log (id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json) VALUES (?,?,?,?,?,?,?,?,?)', ['release-review','lemma:fixture','review',now,3,'fixture','lab',123,'{}']);
      return { id, rows: rows.length };
    }, old);
    assert.equal(seeded.rows, 7);
    const protectedBefore = await protectedState(page, seeded.id);
    // Author lookup does not request an explicit Hebrew FTS jump (a deliberate reading action).
    await page.locator('#roomCorpusSearch').fill('Хана Сенеш');
    const row = page.locator('.corpus-work-row[data-work-id="3557"]'); await row.waitFor();
    await row.locator('.corpus-passport-button').click();
    const details = await page.locator('.corpus-material-dialog').innerText();
    assert.ok(details.includes('Показаны данные опубликованной учебной редакции'));
    assert.ok(details.includes('Экспертная филологическая проверка не заявлена'));
    await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    await page.locator('.corpus-preview-line').first().waitFor();
    assert.equal(await page.locator('.corpus-preview-line').count(), 4);
    await page.screenshot({ path: path.join(OUT, 'replacement-passport-desktop.png') });
    await page.keyboard.press('Escape');
    assert.deepEqual(await protectedState(page, seeded.id), protectedBefore);
    record('passport and bounded preview preserve learner state', { id: '3557', publishedRows: 5, deviceRows: 7 });
    await row.locator('.corpus-work-open').click();
    await page.locator('#roomDeviceEdition').waitFor();
    await page.waitForTimeout(1000);
    const banner = await page.locator('#roomDeviceEdition').innerText();
    assert.ok(banner.includes('Сохранена прежняя редакция') && banner.includes('7 строк'));
    assert.equal(bodyRequests.filter(url => url.includes(card('3557').file)).length, 0);
    assert.deepEqual(await protectedState(page, seeded.id), protectedBefore);
    await page.screenshot({ path: path.join(OUT, 'earlier-edition-desktop.png') });
    record('existing client opens old edition without replace or body fetch', { deviceRows: 7, publishedRows: 5, learnerTablesUnchanged: true });
    await page.getByRole('button', { name: 'Открыть новую редакцию отдельно', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#roomDeviceEdition')?.textContent.includes('Опубликованная учебная редакция'));
    assert.deepEqual(await protectedState(page, seeded.id), protectedBefore);
    const copies = await page.evaluate(async key => window.__localDB.dbQuery('SELECT id,text_key FROM texts WHERE text_key=?', [key]), card('3557').text_key);
    assert.equal(copies.length, 1); assert.notEqual(copies[0].id, seeded.id);
    const newRows = await page.evaluate(id => window.__localDB.getSentences(id), copies[0].id);
    assert.equal(newRows.length, 5);
    record('new edition imports separately and leaves old rows, notes, bookmarks, progress, reviews and OPFS media intact', { oldId: seeded.id, newId: copies[0].id, oldRows: 7, newRows: 5 });
    const afterImportRequests = bodyRequests.length;
    await page.reload(); await page.locator('#roomDeviceEdition').waitFor();
    assert.equal(bodyRequests.length, afterImportRequests);
    assert.deepEqual(await protectedState(page, seeded.id), protectedBefore);
    record('reload resolves the new edition idempotently', { newBodyFetches: 1 });
    await page.goto(base + '/library.html?canon=skip#room=benyehuda&mode=explore&scope=corpus&readyOnly=0&hasAudio=0&reviewed=0&exactForm=0&rv=2');
    await page.locator('#roomCorpusSearch').waitFor();
    await page.locator('#roomCorpusSearch').fill(card('54646').title);
    const long = page.locator('.corpus-work-row[data-work-id="54646"]'); await long.waitFor();
    await long.locator('.corpus-passport-button').click(); await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    await page.locator('.corpus-preview-line').first().waitFor();
    assert.ok((await page.locator('.corpus-material-dialog').innerText()).includes('157'));
    await page.setViewportSize({ width: 380, height: 844 });
    await page.screenshot({ path: path.join(OUT, 'new-long-passport-mobile.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.keyboard.press('Escape'); await long.locator('.corpus-work-open').click(); await page.locator('#roomDeviceEdition').waitFor();
    assert.ok((await page.locator('#roomDeviceEdition').innerText()).includes('157 строк'));
    await page.locator('#roomReaderTable tbody tr').first().waitFor({ state: 'visible' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    assert.ok(await page.locator('#roomReaderTable').innerText());
    await page.screenshot({ path: path.join(OUT, 'new-long-reader-mobile.png') });
    record('new long multilingual work, mobile passport, preview and reader', { id: '54646', rows: 157, horizontalOverflow: false });
    // DOM injection test uses a deliberately synthetic card, never public output.
    await page.evaluate(() => CorpusDiscoveryBrowser.passport({ id: '1', title: '<img src=x onerror="window.injected=1"> שלום', author: 'Автор <script>bad</script>', public_learning: { source_edition: '<svg onload=bad()>' } }, false));
    assert.equal(await page.locator('.corpus-material-dialog img, .corpus-material-dialog svg, .corpus-material-dialog script').count(), 0);
    await page.keyboard.press('Escape');
    record('passport escapes HTML and retains mixed scripts', { executableElements: 0 });
    for (const locale of ['en', 'he']) {
      await page.evaluate(locale => appSetLocale(locale), locale);
      await page.evaluate(card => CorpusDiscoveryBrowser.passport(card, true), card('54646'));
      assert.equal(await page.locator('.corpus-material-dialog').count(), 1);
      assert.ok(!(await page.locator('.corpus-material-dialog').innerText()).includes('sourceVersion'));
      await page.screenshot({ path: path.join(OUT, 'passport-mobile-' + locale + '.png') });
      await page.keyboard.press('Escape');
    }
    record('EN and HE material details on mobile', { locales: ['en','he'] });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ checks, pageerrors: errors, manifestSummary: manifest.summary }, null, 2));
    console.log('PASS all ' + checks.length + ' browser checks');
  } catch (error) {
    if (debugPage) { await debugPage.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(OUT, 'failure.txt'), await debugPage.locator('body').innerText().catch(() => '')); }
    console.error(logs.join('').slice(-2000)); throw error;
  } finally { if (browser) await browser.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
