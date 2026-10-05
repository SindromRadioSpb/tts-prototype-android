'use strict';
// Disposable OPFS/server only. Published payloads are read; bodies are synthetic fixtures.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, '.tmp/room-discovery-browser');
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = window.__localDB;
    const tables = await db.dbQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", []);
    const data = {};
    for (const { name } of tables) {
      if (!/^[a-z0-9_]+$/i.test(name) || /^(sqlite_|_)/.test(name) || /(?:ingredient|cache|projection|migration|fts|dict|lexicon|pealim)/.test(name)) continue;
      data[name] = (await db.dbQuery('SELECT * FROM "' + name + '"', [])).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return data;
  });
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const child = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-discovery-')), 0), silent: true, windowsHide: true });
  const logs = []; child.stdout.on('data', bytes => logs.push(String(bytes))); child.stderr.on('data', bytes => logs.push(String(bytes)));
  let browser, debugPage;
  const checks = [], record = (name, evidence) => { checks.push({ name, evidence, result: 'pass' }); console.log('PASS ' + name); };
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 30000);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(20000);
    const requests = [], errors = []; let bodyMode = 'ok', bodies = 0;
    await context.route('**/*', async route => {
      const req = route.request(); requests.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() });
      if (!req.url().startsWith(base)) return route.abort();
      const pathname = new URL(req.url()).pathname;
      if (pathname === '/js/product-telemetry.js') {
        const source = fs.readFileSync(path.join(ROOT, 'public/js/product-telemetry.js'), 'utf8');
        assert.match(source, /var disabled = .*navigator\.webdriver;/);
        // Exercise real payload serialization despite its loopback/webdriver opt-out.
        return route.fulfill({ contentType: 'text/javascript', body: source.replace(/var disabled = .*navigator\.webdriver;/, 'var disabled = false;') });
      }
      if (pathname === '/api/product-pulse/v1/config') return route.fulfill({ contentType: 'application/json', body: '{"collect":true}' });
      if (pathname === '/api/product-pulse/v1/events') return route.fulfill({ status: 202, contentType: 'application/json', body: '{"ok":true}' });
      if (pathname === '/api/public-corpora') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ corpora: [{ corpus_id: 'fixture', slug: 'discovery-fixture', title: 'Public fixture', description: 'Synthetic', published: true }] }) });
      if (pathname === '/api/public-corpora/discovery-fixture') {
        const items = Array.from({ length: 77 }, (_, i) => ({ public_work_id: 'work-' + i, title: 'PUBLIC-FIXTURE ' + i, creator: 'Fixture author', snapshot_sha256: 'a'.repeat(64), position_no: i, public_read_allowed: true, public_stream_allowed: false, package_download_allowed: false, expected_audio_count: 0, included_audio_count: 0, asset_missing: 0, package_complete: true }));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ corpus: { corpus_id: 'fixture', slug: 'discovery-fixture', title: 'Public fixture' }, edition: { edition_id: 'fixture-edition', edition_number: 1, manifest_sha256: 'b'.repeat(64), item_count: 77, asset_count: 0, asset_missing: 0, package_complete: true }, items }) });
      }
      if (/\/data\/benyehuda\/works\/[0-9]+\.json/.test(req.url())) {
        bodies++;
        if (bodyMode === 'error') return route.fulfill({ status: 503, body: 'fixture unavailable' });
        if (bodyMode === 'slow') { await new Promise(resolve => setTimeout(resolve, 1500)); }
        const id = req.url().match(/works\/([0-9]+)/)[1];
        const card = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/benyehuda/corpus-index-v7.json'))).ready.find(card => card.id === id);
        const rows = Array.from({ length: Number(card?.segments || 16) }, (_, n) => ({ id: 'fixture-' + id + '-' + n, hebrew_plain: 'שלום עולם ' + n, hebrew_niqqud: 'שָׁלוֹם עוֹלָם ' + n, russian: n % 2 ? '' : 'Синтетическая строка ' + n }));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ library: { texts: [{ title: card?.title || 'Fixture', text_key: card?.text_key, source: 'corpus:benyehuda', rows }] } }) });
      }
      return route.continue();
    });
    await context.addInitScript(() => { localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1'); });
    const page = await context.newPage(); debugPage = page; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/library.html?canon=skip#room=benyehuda');
    await page.locator('#roomCorpusSearch').waitFor({ timeout: 30000 });
    console.log('Ben home ready');
    await page.evaluate(async () => {
      const db = window.__localDB, now = '2026-10-04T12:00:00Z';
      await db.dbRun('INSERT INTO texts (id,text_key,title,source_text,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', ['discovery-existing','discovery-existing','Existing fixture','שלום','fixture',now,now]);
      await db.dbRun('INSERT INTO sentences (id,text_id,order_index,he_plain,ru,meta_json,created_at) VALUES (?,?,0,?,?,?,?)', ['discovery-sentence','discovery-existing','שלום','Ручной перевод',JSON.stringify({ manual: true }),now]);
      await db.dbRun('INSERT INTO text_progress (text_id,last_row_idx,updated_at) VALUES (?,1,?)', ['discovery-existing',now]);
      await db.dbRun('INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', ['discovery-note','text','discovery-existing','discovery-existing','free','Fixture note','{"markdown":"Learner note"}',now,now]);
      await db.dbRun('INSERT INTO review_log (id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json) VALUES (?,?,?,?,?,?,?,?,?)', ['discovery-review','lemma:discovery','review',now,3,'fixture','lab',123,'{}']);
    });
    const baseline = await snapshot(page);
    const savedBefore = await page.evaluate(() => {
      const saved = JSON.stringify([{ name: 'Explicitly saved fixture', f: { q: 'SAVED-by-owner' } }]);
      localStorage.setItem('corpus_saved_searches_v1', saved);
      localStorage.setItem('corpus_recent_searches_v1', '["LEGACY-before-release"]');
      return saved;
    });
    const needle = 'PRIVATE-needle-72819';
    await page.locator('#roomCorpusSearch').fill(needle);
    await page.waitForFunction(needle => history.state?.filters?.q === needle, needle);
    assert.ok(!page.url().includes(needle)); assert.equal(bodies, 0);
    const originStorage = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))));
    assert.ok(!originStorage.includes(needle), 'Automatic query must not enter origin-wide localStorage');
    assert.ok(await page.evaluate(needle => sessionStorage.getItem('corpus_recent_searches_v1')?.includes(needle), needle));
    assert.equal(await page.evaluate(() => localStorage.getItem('corpus_saved_searches_v1')), savedBefore);
    assert.equal(await page.evaluate(() => localStorage.getItem('corpus_recent_searches_v1')), '["LEGACY-before-release"]');
    const privateUrl = page.url();
    await page.reload(); await page.locator('#roomCorpusSearch').waitFor();
    assert.equal(await page.locator('#roomCorpusSearch').inputValue(), needle);
    const another = await context.newPage(); await another.goto(privateUrl); await another.locator('#roomCorpusSearch').waitFor();
    assert.equal(await another.locator('#roomCorpusSearch').inputValue(), '');
    assert.ok(!(await another.locator('body').innerText()).includes(needle), 'New tab must not expose automatic recent query chips');
    assert.ok(!(await another.evaluate(() => sessionStorage.getItem('corpus_recent_searches_v1') || '')).includes(needle));
    await another.close();
    await page.locator('[data-corpus-mode="explore"]').click();
    await page.locator('#roomCorpusSearch').fill('Хана Сенеш');
    await page.waitForFunction(() => document.querySelector('.corpus-work-row'));
    await page.locator('.corpus-share-search').click();
    const shared = await page.locator('.corpus-material-dialog input').inputValue();
    await page.keyboard.press('Escape');
    const sharedFixture = new URL(shared); sharedFixture.searchParams.set('canon', 'skip');
    const sharedPage = await context.newPage(); await sharedPage.goto(sharedFixture.href);
    await sharedPage.locator('#roomCorpusSearch').waitFor(); assert.equal(await sharedPage.locator('#roomCorpusSearch').inputValue(), 'Хана Сенеш');
    await sharedPage.close();
    await page.goBack(); await page.locator('#roomCorpusSearch').waitFor();
    assert.equal(await page.locator('#roomCorpusSearch').inputValue(), needle);
    record('private query: history, refresh, new tab, explicit share, Back', { privateUrlHasQuery: false, sharedFragmentContainsQuery: true });
    await page.locator('[data-corpus-mode="explore"]').click(); await page.locator('#roomCorpusSearch').fill('Хана Сенеш');
    const row = page.locator('.corpus-work-row').first(); await row.waitFor();
    await row.locator('.corpus-passport-button').click();
    assert.ok((await page.locator('.corpus-material-dialog').innerText()).includes('Период по источнику неизвестен'));
    const source = page.locator('.corpus-material-dialog a').first(); assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
    await page.keyboard.press('Escape');
    await page.locator('#roomCorpusSearch').fill(''); await page.locator('[data-corpus-mode="read"]').click();
    const readyRow = page.locator('.corpus-work-row').first(); await readyRow.waitFor();
    await readyRow.locator('.corpus-passport-button').click();
    await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    await page.locator('.corpus-preview-line').first().waitFor(); assert.equal(await page.locator('.corpus-preview-line').count(), 4);
    assert.equal(await page.locator('.corpus-preview-line [lang=he]').first().getAttribute('dir'), 'rtl');
    await page.keyboard.press('Escape');
    const afterPreview = await snapshot(page); assert.deepEqual(afterPreview, baseline);
    const previousBodies = bodies;
    await readyRow.locator('.corpus-passport-button').click(); await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click(); await page.locator('.corpus-preview-line').first().waitFor(); await page.keyboard.press('Escape'); assert.equal(bodies, previousBodies);
    assert.deepEqual(await snapshot(page), baseline);
    record('search/filter/passport/preview/repeat preserve OPFS canon', { tables: Object.keys(baseline), bodies, rowsShown: 4 });
    // Different ready cards avoid the successful preview cache.
    bodyMode = 'error'; await page.locator('.corpus-work-row').nth(1).locator('.corpus-passport-button').click(); await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click(); await page.getByText('Предпросмотр недоступен.', { exact: false }).waitFor(); await page.keyboard.press('Escape');
    bodyMode = 'slow'; await page.locator('.corpus-work-row').nth(2).locator('.corpus-passport-button').click(); await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(1700);
    assert.deepEqual(await snapshot(page), baseline); record('fetch error and cancellation preserve canon', {});
    bodyMode = 'ok';
    assert.ok(await page.evaluate(() => !!(document.querySelector('.corpus-ready').compareDocumentPosition(document.querySelector('.corpus-saved')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'An explicitly saved search must follow the useful ready materials');
    const firstScreen = [];
    // Each case has fresh storage: no recents, saved filters or existing learner profile.
    // Let the real world stylesheet/canvas settle before measuring the usable viewport.
    for (const width of [380, 1280]) for (const world of ['sukkot', 'classic']) for (const theme of ['light', 'dark']) {
      const fresh = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' });
      fresh.setDefaultTimeout(20000);
      await fresh.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      await fresh.addInitScript(({ world, theme }) => {
        localStorage.setItem('app.locale', 'ru'); localStorage.setItem('appTheme_v1', theme);
        localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1');
        localStorage.setItem('lp_world_sukkot_trial_v1', '1');
        localStorage.setItem('lp_world_v1', JSON.stringify({ id: world, mode: 'live', paused: false, lighting: 'day' }));
      }, { world, theme });
      const screen = await fresh.newPage(); debugPage = screen;
      await screen.goto(base + '/library.html?canon=skip#room=benyehuda');
      await screen.locator('.corpus-work-row').first().waitFor({ timeout: 30000 });
      if (world !== 'classic') await screen.locator('html[data-world="sukkot"] .lp-world-stage:not([hidden]) canvas').waitFor();
      await screen.evaluate(() => document.fonts.ready); await screen.waitForTimeout(500);
      const bounds = await screen.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, height: r.height } : null; };
        const fixedTop = Array.from(document.querySelectorAll('body *')).filter(node => {
          const s = getComputedStyle(node), r = node.getBoundingClientRect();
          return s.position === 'fixed' && s.display !== 'none' && r.height > 0 && r.top > innerHeight / 2 && r.bottom >= innerHeight - 1;
        }).reduce((top, node) => Math.min(top, node.getBoundingClientRect().top), innerHeight);
        return { viewport: { width: innerWidth, height: innerHeight }, usableBottom: fixedTop, header: rect('.room-header'), world: rect('.lp-world-stage'), search: rect('#roomCorpusSearch'), modes: rect('.corpus-mode-switch'), firstCard: rect('.corpus-work-row'), filtersClosed: !document.querySelector('.discovery-filters').open, overflow: document.documentElement.scrollWidth > innerWidth + 1, theme: document.body.className, worldId: document.documentElement.dataset.world || 'classic' };
      });
      firstScreen.push({ world, theme, ...bounds });
      fs.writeFileSync(path.join(OUT, 'first-screen.json'), JSON.stringify(firstScreen, null, 2));
      const screenshot = world === 'sukkot' && theme === 'light' ? 'read-' + width + '.png' : 'read-' + width + '-' + world + '-' + theme + '.png';
      await screen.screenshot({ path: path.join(OUT, screenshot), fullPage: false });
      assert.equal(bounds.worldId, world); assert.ok(bounds.theme.includes('theme-' + theme));
      assert.ok(bounds.filtersClosed && !bounds.overflow);
      for (const name of ['search', 'modes', 'firstCard']) assert.ok(bounds[name]?.top >= 0 && bounds[name].bottom <= bounds.usableBottom, `${width}/${world}/${theme}: ${name} outside usable first screen: ${JSON.stringify(bounds)}`);
      await fresh.close(); debugPage = page;
    }
    record('fresh 380×850 and 1280×850 first screen: useful card, search and modes in both themes/worlds', firstScreen);
    await page.setViewportSize({ width: 380, height: 850 });
    await page.selectOption('#roomLang', 'he'); await page.locator('[data-corpus-mode="explore"]').click();
    const heTitles = await page.locator('.period-card-title').allTextContents();
    const heGlosses = await page.locator('.period-card-gloss').allTextContents();
    assert.deepEqual(heTitles, ['תקופת המקרא', 'ימי הביניים', 'תקופת ההשכלה', 'תקופת התחייה', 'תקופת המנדט', 'ספרות מודרנית', 'תקופה לא ידועה']);
    assert.equal(heGlosses.length, 7); assert.ok(heGlosses.every(text => /[א-ת]/.test(text) && !/[А-Яа-яЁё]/.test(text)));
    assert.ok((await page.locator('.period-card-range').allTextContents()).every(text => !/[А-Яа-яЁё]/.test(text)));
    await page.screenshot({ path: path.join(OUT, 'explore-380-he.png'), fullPage: true }); assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    await page.selectOption('#roomLang', 'en');
    assert.deepEqual(await page.locator('.period-card-title').allTextContents(), ['Biblical period', 'Middle Ages', 'Haskalah (Enlightenment)', 'Tehiya (Revival)', 'Mandate period', 'Modern literature', 'Period unknown']);
    await page.selectOption('#roomLang', 'he');
    await page.locator('.period-card').first().focus(); await page.keyboard.press('Enter'); await page.locator('.corpus-author-row').first().waitFor();
    record('localized HE/EN era labels and glosses, RTL and keyboard catalog navigation', { heTitles, heGlosses });
    await page.goto(base + '/library.html?canon=skip#room=public%3Adiscovery-fixture');
    await page.locator('#roomPublicCorpusSearch').waitFor();
    await page.locator('#roomPublicCorpusSearch').fill('PUBLIC-FIXTURE');
    await page.waitForFunction(() => history.state?.filters?.q === 'PUBLIC-FIXTURE');
    await page.locator('.public-corpus-page-next').click();
    await page.waitForFunction(() => history.state?.page === 2);
    assert.ok(!page.url().includes('PUBLIC-FIXTURE'));
    await page.reload(); await page.locator('#roomPublicCorpusSearch').waitFor();
    assert.equal(await page.locator('#roomPublicCorpusSearch').inputValue(), 'PUBLIC-FIXTURE');
    await page.waitForFunction(() => document.querySelector('.public-corpus-page-prev')?.disabled === false);
    assert.equal(await page.locator('[data-public-corpus]').getAttribute('data-public-corpus'), 'discovery-fixture');
    await page.goBack(); await page.waitForFunction(() => history.state?.page === 1);
    assert.ok((await page.locator('#roomPublicCorpusSearch').inputValue()) === 'PUBLIC-FIXTURE');
    record('public slug, query and bounded page survive refresh and Back', { items: 77, pageSize: 48 });
    await page.evaluate(() => { location.hash = '#room=public%3Adiscovery-fixture&page=100000'; });
    await page.waitForFunction(() => history.state?.corpus === 'public:discovery-fixture' && history.state?.page === 2);
    assert.ok((await page.locator('.public-corpus-page-next').isDisabled()));
    await page.evaluate(() => { location.hash = '#room=benyehuda&mode=read&genre=poetry&page=100000'; });
    await page.locator('#roomCorpusSearch').waitFor();
    await page.waitForFunction(() => history.state?.corpus === 'benyehuda' && history.state?.page < 100000);
    assert.ok((await page.locator('.corpus-work-row').count()) > 0);
    await page.evaluate(() => { location.hash = '#room=benyehuda&mode=read&share=1&q=NO-MATCH-FIXTURE-219&page=100000'; });
    await page.waitForFunction(() => history.state?.filters?.q === 'NO-MATCH-FIXTURE-219' && history.state?.page === 1);
    assert.ok(!page.url().includes('page=100000'));
    record('oversized pages clamp to actual results including empty Ben results', { publicLastPage: 2, emptyBenPage: 1 });
    const leak = request => JSON.stringify(request).includes(needle) || JSON.stringify(request).includes(encodeURIComponent(needle));
    assert.equal(requests.filter(leak).length, 0); assert.equal(logs.filter(log => log.includes(needle)).length, 0);
    assert.equal(requests.filter(request => request.headers.referer?.includes('room=')).length, 0);
    const telemetry = requests.filter(request => request.url.includes('/api/product-pulse/v1/events'));
    assert.ok(telemetry.length > 0, 'Existing telemetry was exercised with fixture transport');
    assert.deepEqual(errors, []); record('requests, telemetry, referrer and server logs contain no private query', { requests: requests.length, telemetryPackets: telemetry.length, errors });
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ checks, scope: 'Disposable browser/server fixtures; no owner profile or live provider calls' }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, result: 'pass', out: OUT }));
  } catch (error) { if (debugPage) { await debugPage.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(OUT, 'failure-page.txt'), await debugPage.locator('body').innerText().catch(() => 'unavailable')); } fs.writeFileSync(path.join(OUT, 'failure.txt'), error.stack); throw error; }
  finally { await browser?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
