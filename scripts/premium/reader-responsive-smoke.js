'use strict';
// Real Reader, disposable server credentials/data and Chromium OPFS. No owner profile or paid API.
// --baseline serves the changed Reader/DB modules from --baseline-ref (default HEAD) and measures desktop only.
// --profile --desktop-only records a CPU profile without running the subsequent acceptance flows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(arg('out') || path.join(ROOT, '.tmp/reader-performance/result.json'));
const BASELINE = process.argv.includes('--baseline');
const BASELINE_REF = execFileSync('git', ['rev-parse', arg('baseline-ref') || 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const PROFILE = process.argv.includes('--profile');
const DESKTOP_ONLY = process.argv.includes('--desktop-only');
const ROWS = 2500, LAST = 2491, RESUME = 1725;

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-reader-responsive-'));
  const server = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(data, 0), silent: true, windowsHide: true });
  const logs = []; server.stdout.on('data', c => logs.push(String(c))); server.stderr.on('data', c => logs.push(String(c)));
  let browser, page;
  const report = { baseline: BASELINE, baseRevision: BASELINE_REF, rows: ROWS, checks: {}, measurements: {}, errors: [],
    scope: 'Isolated Chromium synthetic Hebrew fixture; not production, owner data, physical device or linguistic accuracy evidence.' };
  const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } });
    const contextualRequests = [];
    context.on('request', request => {
      if (new URL(request.url()).pathname === '/api/word-gloss-ctx' && request.method() === 'POST') contextualRequests.push(request.url());
    });
    await context.route('**/*', route => {
      const req = route.request();
      if (new URL(req.url()).origin !== base || (new URL(req.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method()))) return route.abort();
      return route.continue();
    });
    await context.route('**/js/library-ui.js?*', async route => {
      const response = await route.fetch();
      const source = BASELINE ? execFileSync('git', ['show', BASELINE_REF + ':public/js/library-ui.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 5e6 }) : await response.text();
      await route.fulfill({ response, body: source + '\nwindow.__responsiveSmoke = { openReader, closeReader, db: () => localDb, rows: () => readerRows, id: () => readerTextId, filling: () => roomTranslit()?.isFilling() };' });
    });
    if (BASELINE) for (const name of ['js/reader-core', 'js/reader-morph', 'js/translit-display', 'js/word-gloss', 'db/local-db', 'db/db-worker-runtime']) {
      const source = execFileSync('git', ['show', BASELINE_REF + ':public/' + name + '.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 5e6 });
      await context.route('**/' + name + '.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: source });
      });
    }
    await context.addInitScript(() => {
      if (!['http:', 'https:'].includes(location.protocol)) return;
      localStorage.setItem('app.locale', 'ru');
      localStorage.setItem('phase6Decision_v1', 'declined');
      localStorage.setItem('room.translitProfile', 'learner-latin');
      localStorage.setItem('room.translitProfile.v2', '1');
      window.__responsiveLongTasks = [];
      new PerformanceObserver(list => list.getEntries().forEach(e => window.__responsiveLongTasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask', buffered: true });
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.log('browser error:', message.text().slice(0, 300)); });
    await page.goto(base + '/library.html', { waitUntil: 'domcontentloaded' });
    console.log('Reader shell loaded');
    await page.waitForFunction(() => window.__responsiveSmoke && window.__roomSettled);
    await page.evaluate(() => Promise.race([window.__roomSettled, new Promise((_, reject) => setTimeout(() => reject(new Error('canon boot exceeded 90 s')), 90000))]));
    console.log('Canon boot settled');
    const ids = await page.evaluate(async ({ count, last }) => {
      const db = __responsiveSmoke.db();
      const pointed = 'שָׁלוֹם עוֹלָם הַיֶּלֶד קוֹרֵא סֵפֶר בַּבַּיִת וְלוֹמֵד עִבְרִית בְּכָל יוֹם';
      const plain = 'שלום עולם הילד קורא ספר בבית ולומד עברית בכל יום';
      const texts = ['A', 'B'].map((letter, ti) => ({ text_key: 'responsive-fixture-' + letter, title: 'Responsive ' + letter,
        source_text: plain + ' ' + letter,
        sentences: Array.from({ length: ti ? 24 : count }, (_, i) => ({ order_index: i,
          he_plain: plain + ' ' + i + (i === last ? ' אברקדברה' : ''), he_niqqud: pointed + ' ' + i + (i === last ? ' אַבְּרָקָדַבְּרָה' : ''),
          ru: 'Материал ' + letter + ' строка ' + i + (i === last ? ' редчайшиймаркер' : ''),
          translit: i === 0 ? 'MY OWN LATIN' : 'stored-' + i, translit_ru: i === 0 ? 'МОЯ ФОНЕТИКА' : '',
          edit_meta_json: i === 0 ? JSON.stringify({ edited: { translit: true, translit_ru: true } }) : null })) }));
      const result = await db.importBundle({ texts }, { mode: 'skip' });
      if (result.errors?.length || result.imported !== 2) throw new Error('fixture import failed: ' + JSON.stringify(result));
      const found = await db.dbQuery("SELECT id, text_key FROM texts WHERE text_key LIKE 'responsive-fixture-%'");
      return Object.fromEntries(found.map(t => [t.text_key.slice(-1), t.id]));
    }, { count: ROWS, last: LAST });
    console.log('Fixture imported', ids);

    let profiler;
    async function measure(name, id, resume = false) {
      const sample = await page.evaluate(async ({ id, resume, resumeRow }) => {
        window.__responsiveLongTasks.length = 0;
        const started = performance.now();
        let firstWord = null;
        let stop = false;
        function watch() {
          const words = document.querySelectorAll('#roomReaderTable tr[data-row-idx="' + (resume ? resumeRow : 0) + '"] .rm-w');
          for (const word of words) {
            const rect = word.getBoundingClientRect();
            if (rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight) { firstWord = performance.now() - started; break; }
          }
          if (firstWord == null && !stop) requestAnimationFrame(watch);
        }
        requestAnimationFrame(watch);
        await Promise.race([__responsiveSmoke.openReader(id, 'Responsive ' + (id === window.__fixtureA ? 'A' : 'B'), { resume }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('openReader exceeded 90 s')), 90000))]);
        const ready = performance.now() - started;
        const until = performance.now() + 10000;
        while (firstWord == null && performance.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
        stop = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        return { readyMs: ready, firstVisibleWordMs: firstWord, timings: __roomMaterialTimings(),
          longTasks: __responsiveLongTasks.filter(e => e.start >= started), domRows: document.querySelectorAll('#roomReaderTable tr[data-row-idx]').length,
          wordCount: document.querySelectorAll('#roomReaderTable .rm-w').length,
          rowRect: document.querySelector('#roomReaderTable tr[data-row-idx="0"]')?.getBoundingClientRect().toJSON(),
          mountRect: document.getElementById('roomReaderTable')?.getBoundingClientRect().toJSON(), scrollY,
          bodyClasses: document.body.className };
      }, { id, resume, resumeRow: RESUME });
      if (profiler && name === 'desktopOpen') {
        const { profile } = await profiler.send('Profiler.stop');
        fs.writeFileSync(OUT.replace(/\.json$/, '') + '.cpuprofile', JSON.stringify(profile));
        const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
        const totals = new Map();
        profile.samples.forEach((id, index) => {
          const frame = nodes.get(id);
          const key = frame.functionName + ' ' + frame.url + ':' + (frame.lineNumber + 1);
          totals.set(key, (totals.get(key) || 0) + (profile.timeDeltas[index] || 0) / 1000);
        });
        report.cpuTop = Array.from(totals, ([frame, milliseconds]) => ({ frame, milliseconds: Math.round(milliseconds) })).sort((a, b) => b.milliseconds - a.milliseconds).slice(0, 20);
        console.log('CPU profile top:', JSON.stringify(report.cpuTop));
        await profiler.detach(); profiler = null;
      }
      report.measurements[name] = sample;
      save();
      console.log(name + ': ' + JSON.stringify({ readyMs: sample.readyMs, firstVisibleWordMs: sample.firstVisibleWordMs, maxLongTaskMs: Math.max(0, ...sample.longTasks.map(t => t.duration)), rowRect: sample.rowRect }));
      await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-' + name + '.png' });
      assert.ok(sample.firstVisibleWordMs != null, name + ' has a visible interactive Hebrew word');
      return sample;
    }
    await page.evaluate(id => { window.__fixtureA = id; }, ids.A);
    if (PROFILE) {
      profiler = await context.newCDPSession(page);
      await profiler.send('Profiler.enable');
      await profiler.send('Profiler.start');
    }
    await measure('desktopOpen', ids.A);
    await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-desktop.png' });
    console.log('DESKTOP_OPEN_SAVED ' + OUT);
    if (BASELINE || DESKTOP_ONLY) { report.result = BASELINE ? 'BASELINE_MEASURED' : 'DESKTOP_MEASURED'; save(); return; }
    await page.evaluate(() => { window.__stableNodes = { table: document.querySelector('#roomReaderTable #proTable'), word: document.querySelector('#roomReaderTable .rm-w'), audio: document.querySelector('#roomReaderTable .row-tts-btn') }; });
    await page.locator('#readerAidsToggle').click();
    const profile = page.locator('#readerAids select').filter({ has: page.locator('option[value="ru-phonetic"]') });
    const switchStart = await page.evaluate(() => { __responsiveLongTasks.length = 0; return performance.now(); });
    await profile.selectOption('ru-phonetic');
    console.log('Profile changed');
    await page.waitForFunction(() => document.querySelector('#roomReaderTable')?.textContent.includes('МОЯ ФОНЕТИКА'));
    report.measurements.profileSwitch = await page.evaluate(start => ({ elapsedMs: performance.now() - start,
      longTasks: __responsiveLongTasks.filter(e => e.start >= start) }), switchStart);
    report.checks.manualTranslit = true;
    console.log('Owned transliteration preserved');
    const expectedLastTranslit = await page.evaluate(() => {
      const rows = __responsiveSmoke.rows();
      return LocalTranslit.transliterateWithProfile(rows[rows.length - 1].he_niqqud, 'ru-phonetic');
    });
    await page.waitForFunction(expected => {
      const rows = __responsiveSmoke.rows();
      return !__responsiveSmoke.filling() && document.querySelector('#roomReaderTable tr[data-row-idx="' + (rows.length - 1) + '"] td[data-col="translit"]')?.textContent === expected;
    }, expectedLastTranslit, { timeout: 60000 });
    console.log('Profile background fill finished');
    report.checks.stableNodesAfterProfileFill = await page.evaluate(() => Object.fromEntries(Object.entries(__stableNodes).map(([key, node]) => [key, !!node && node.isConnected])));
    if (!BASELINE) assert.deepEqual(report.checks.stableNodesAfterProfileFill, { table: true, word: true, audio: true }, 'profile and background fill preserve reader controls and morph word anchors');
    const translation = page.locator('#readerAids select').filter({ has: page.locator('option[value="reveal"]') });
    await translation.selectOption('off');
    await page.waitForFunction(() => !document.querySelector('#roomReaderTable td[data-col="ru"]'));
    await page.evaluate(() => {
      const cell = document.querySelector('#roomReaderTable tr[data-row-idx="0"] td[data-col="translit"]');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'smk-row-replay'; button.textContent = 'Replay fixture';
      window.__replayProbe = { button, clicks: 0 };
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); __replayProbe.clicks++; });
      cell.append(document.createTextNode('\u00a0'), button);
    });
    await profile.selectOption('sbl');
    await page.waitForFunction(() => document.querySelector('#roomReaderTable tr[data-row-idx="0"] td[data-col="translit"]')?.textContent.includes('MY OWN LATIN'));
    await page.locator('#roomReaderTable tr[data-row-idx="0"] .smk-row-replay').click();
    report.checks.replayButtonRetained = await page.evaluate(() => __replayProbe.button.isConnected && __replayProbe.clicks === 1);
    assert.equal(report.checks.replayButtonRetained, true, 'translit update keeps the embedded replay control and listener');
    await translation.selectOption('show');
    console.log('Replay control survived profile change with Russian column hidden');
    await page.locator('#readerAidsToggle').click();
    await page.locator('#readerFindToggle').click();
    await page.locator('.reader-find-input').fill('אברקדברה');
    await page.locator('#roomReaderTable tr.rm-find-row-current[data-row-idx="' + LAST + '"]').waitFor();
    await page.waitForFunction(idx => {
      const row = document.querySelector('#roomReaderTable tr[data-row-idx="' + idx + '"]');
      const rect = row?.getBoundingClientRect();
      return rect && rect.top < innerHeight && rect.bottom > 0 && row.querySelector('.rm-w');
    }, LAST);
    report.checks.searchNearEnd = true;
    await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-search.png' });
    await page.evaluate(async ({ id, resume }) => {
      await __responsiveSmoke.closeReader();
      await __responsiveSmoke.db().setProgress(id, { last_row_idx: resume, last_step_id: 'ru' });
    }, { id: ids.A, resume: RESUME });
    await measure('resumeOpen', ids.A, true);
    await page.waitForFunction(idx => {
      const row = document.querySelector('#roomReaderTable tr[data-row-idx="' + idx + '"]');
      const rect = row?.getBoundingClientRect();
      return rect && rect.top < innerHeight && rect.bottom > 0 && row.querySelector('.rm-w');
    }, RESUME);
    report.checks.resume = true;
    report.checks.rapidSwitch = await page.evaluate(async ({ a, b }) => {
      const original = MaterialOpen.load;
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      MaterialOpen.load = async (id, opts) => { if (id === a) await gate; return original(id, opts); };
      try {
        const old = __responsiveSmoke.openReader(a, 'Responsive A');
        await __responsiveSmoke.openReader(b, 'Responsive B');
        release(); await old;
        await new Promise(resolve => setTimeout(resolve, 150));
        return __responsiveSmoke.id() === b && document.getElementById('readerTitle').textContent === 'Responsive B'
          && document.getElementById('roomReaderTable').textContent.includes('Материал B строка 0')
          && !document.getElementById('roomReaderTable').textContent.includes('Материал A строка');
      } finally { release(); MaterialOpen.load = original; }
    }, { a: ids.A, b: ids.B });
    assert.equal(report.checks.rapidSwitch, true, 'late A cannot replace B');
    await page.setViewportSize({ width: 380, height: 780 });
    await measure('mobileOpen', ids.A, true);
    await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-mobile.png' });
    report.checks.mobileVisibleWords = true;
    await page.evaluate(() => window.appSetLocale('he'));
    await page.waitForFunction(() => document.documentElement.lang === 'he' && document.documentElement.dir === 'rtl');
    await page.waitForFunction(idx => {
      const row = document.querySelector('#roomReaderTable tr[data-row-idx="' + idx + '"]');
      const rect = row?.getBoundingClientRect();
      return rect && rect.top < innerHeight && rect.bottom > 0 && row.querySelector('.rm-w');
    }, RESUME);
    await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-mobile-rtl.png' });
    report.checks.mobileRtl = true;

    // A short row count can still contain thousands of words: exercise long paragraphs
    // and imported context after the existing large-row fixture, without a provider call.
    await page.setViewportSize({ width: 1280, height: 1000 });
    const paragraphs = await page.evaluate(async () => {
      await __responsiveSmoke.closeReader();
      const words = ['שָׁלוֹם', 'עוֹלָם', 'הַיֶּלֶד', 'קוֹרֵא', 'סֵפֶר', 'בַּבַּיִת', 'וְלוֹמֵד', 'עִבְרִית', 'בְּכָל', 'יוֹם'];
      const sentences = Array.from({ length: 34 }, (_, i) => {
        const he = Array.from({ length: 100 }, (_, n) => words[n % words.length]).join(' ') + (i === 33 ? ' אַבְּרָקָדַבְּרָה' : '');
        return { order_index: i, he_niqqud: he, he_plain: ReaderMorph.stripNiqqud(he),
          ru: 'Синтетический абзац ' + i, translit: 'paragraph-' + i };
      });
      const db = __responsiveSmoke.db();
      const imported = await db.importBundle({ texts: [{ text_key: 'responsive-long-paragraphs', title: 'Long paragraphs', source_text: 'Synthetic fixture', sentences }] }, { mode: 'skip' });
      if (imported.errors?.length || imported.imported !== 1) throw new Error('paragraph fixture import failed');
      const [{ id }] = await db.dbQuery("SELECT id FROM texts WHERE text_key='responsive-long-paragraphs'");
      const rows = await db.getSentences(id);
      const payloads = rows.map(row => WordGlossAI.rowPayloadFromData(row));
      const layer = { schema: WordGlossAI.LAYER_SCHEMA, rows: payloads.map((payload, i) => ({
        order_index: i, key: payload.key, model: 'synthetic-local-fixture', mwe: [],
        glosses: payload.words.map((_, offset) => ({ gloss: offset === 0 ? 'Моя правка ' + i : 'Контекст ' + i + ':' + offset,
          ...(offset === 0 ? { manual: true, ai_gloss: 'Исходный контекст ' + i, ai_wrong_hint: false } : {}), wrong_hint: false })),
      })) };
      const stored = await WordGlossAI.remember(layer, rows);
      if (stored.stored !== 34 || stored.rejected) throw new Error('paragraph context fixture rejected');
      WordGloss.setEnabled('room', 'Gloss', true);
      WordGloss.setEnabled('room', 'GlossAi', false);
      WordGloss.setEnabled('room', 'Ribbon', false);
      WordGloss.setEnabled('room', 'GlossStrict', false);
      window.__paragraphSmoke = { id, started: performance.now(), words: payloads.reduce((n, p) => n + p.words.length, 0) };
      const observeGloss = () => {
        if (__paragraphSmoke.stopProbe) return;
        const word = document.querySelector('#roomReaderTable tr[data-row-idx="0"] td[data-col="niqqud"] .rm-w[data-gloss-source="user"]');
        if (word && __responsiveSmoke.id() === id) {
          if (__paragraphSmoke.firstStoredGlossMs == null) __paragraphSmoke.firstStoredGlossMs = performance.now() - __paragraphSmoke.started;
          const rect = word.getBoundingClientRect();
          if (rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0 && __paragraphSmoke.firstVisibleStoredGlossMs == null)
            __paragraphSmoke.firstVisibleStoredGlossMs = performance.now() - __paragraphSmoke.started;
        }
        if (__paragraphSmoke.firstVisibleStoredGlossMs == null) requestAnimationFrame(observeGloss);
      };
      requestAnimationFrame(observeGloss);
      await __responsiveSmoke.openReader(id, 'Long paragraphs');
      return { id, rows: rows.length, words: __paragraphSmoke.words, readyMs: performance.now() - __paragraphSmoke.started };
    });
    await page.waitForFunction(() => {
      const spans = Array.from(document.querySelectorAll('#roomReaderTable td[data-col="niqqud"] .rm-w'));
      return spans.length === __paragraphSmoke.words && spans.every(span => ['ai', 'user'].includes(span.dataset.glossSource) && span.dataset.gloss);
    }, null, { timeout: 30000 });
    report.measurements.paragraphs = await page.evaluate(info => {
      const spans = Array.from(document.querySelectorAll('#roomReaderTable td[data-col="niqqud"] .rm-w'));
      const first = spans[0];
      __paragraphSmoke.stopProbe = true;
      const result = { rows: info.rows, words: info.words, readyMs: info.readyMs, allStoredGlossesMs: performance.now() - __paragraphSmoke.started,
        firstStoredGlossMs: __paragraphSmoke.firstStoredGlossMs ?? null, firstVisibleStoredGlossMs: __paragraphSmoke.firstVisibleStoredGlossMs ?? null,
        manualWords: spans.filter(span => span.dataset.glossSource === 'user').length,
        aiWords: spans.filter(span => span.dataset.glossSource === 'ai').length,
        firstManualText: first.dataset.gloss, generationEnabled: WordGloss.enabled('room', 'GlossAi') };
      return result;
    }, paragraphs);
    assert.equal(report.measurements.paragraphs.manualWords, 34);
    assert.equal(report.measurements.paragraphs.aiWords, paragraphs.words - 34);
    assert.equal(report.measurements.paragraphs.firstManualText, 'Моя правка 0');
    assert.equal(report.measurements.paragraphs.generationEnabled, false);
    report.checks.paragraphStoredGlosses = true;
    await page.locator('#roomReaderTable tr[data-row-idx="0"] td[data-col="niqqud"] .rm-w').first().click();
    await page.waitForFunction(() => document.querySelector('.rm-sheet.rm-open .rm-current-reading')?.textContent.includes('Моя правка 0'));
    assert.equal(await page.locator('.rm-sheet.rm-open .rm-word').evaluate(el => ReaderMorph.stripNiqqud(el.textContent)), 'שלום');
    report.checks.paragraphWordCard = true;
    await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-paragraph-card.png' });
    await page.locator('.rm-sheet.rm-open .rm-sheet-x').click();
    await page.locator('#readerFindToggle').click();
    await page.locator('.reader-find-input').fill('אברקדברה');
    await page.waitForFunction(() => {
      const row = document.querySelector('#roomReaderTable tr.rm-find-row-current[data-row-idx="33"]');
      const rect = row?.getBoundingClientRect();
      return rect && rect.top < innerHeight && rect.bottom > 0 && row.querySelector('.rm-w[data-gloss-source="user"]')?.dataset.gloss === 'Моя правка 33';
    });
    report.checks.paragraphSearchAndManualContext = true;
    assert.equal(contextualRequests.length, 0, 'stored AI/manual context never orders paid generation when disabled');
    report.checks.noContextGenerationRequests = true;
    await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-paragraph-search.png' });
    console.log('Long paragraphs: stored AI/manual context, word card and distant search passed with generation off');
    if (!BASELINE) {
      assert.ok(report.measurements.desktopOpen.firstVisibleWordMs < 2500, 'desktop usable within 2.5 s including isolated DB read');
      const timing = report.measurements.desktopOpen.timings;
      const data = timing.find(e => e.phase === 'data'), paint = timing.find(e => e.phase === 'paint');
      if (data && paint) assert.ok(paint.ms - data.ms < 1000, 'table first paint within 1 s of received data');
    }
    assert.deepEqual(report.errors, [], 'no unhandled browser errors');
    report.result = 'PASS'; save();
    console.log(JSON.stringify(report));
  } catch (error) {
    if (page) {
      try { await page.screenshot({ path: OUT.replace(/\.json$/, '') + '-failure.png', timeout: 5000 }); } catch (_) {}
      try { report.failureState = await page.evaluate(() => ({ title: document.getElementById('readerTitle')?.textContent,
        find: document.querySelector('.reader-find-count')?.textContent, rows: document.querySelectorAll('#roomReaderTable tr[data-row-idx]').length,
        profile: document.querySelector('#readerAids select:has(option[value="ru-phonetic"])')?.value,
        firstTranslit: document.querySelector('#roomReaderTable td[data-col="translit"]')?.textContent })); } catch (_) {}
    }
    report.result = 'FAIL'; report.failure = error.stack; save();
    console.error(logs.slice(-10).join('')); throw error;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
