'use strict';
// Real Classic/IDE tables and local transliteration; disposable origin/profile.
// Holds unrelated status painting and the derivation queue to exercise completion
// deterministically. Timings describe this controlled test, not normal startup.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const root = path.resolve(__dirname, '../..');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const baseline = process.argv.includes('--baseline'), ref = arg('ref') || 'ce0836c2', count = Number(arg('rows') || 2500);
const mobile = process.argv.includes('--mobile');
const remote = arg('base');
const out = path.resolve(arg('out') || '.tmp/reader-performance/studio-translit-817.json');
(async () => {
  const server = remote ? null : fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: root, env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-studio-translit-')), 0), silent: true, windowsHide: true });
  server?.stdout.resume(); server?.stderr.resume(); let browser, probePage;
  const report = { baseline, ref, count, mobile, scope: 'Disposable desktop/mobile viewport Chromium; held status/derivation queues; no owner data or paid calls.', checks: {}, errors: [] };
  try {
    const base = remote || 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
    if (remote) { assert.ok(arg('version') && !baseline); assert.equal((await (await fetch(base + '/api/client-config?verify=' + Date.now())).json()).version, arg('version')); }
    browser = await chromium.launch({ headless: true });
    for (const surface of ['classic', 'ide']) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: mobile ? { width: 380, height: 780 } : { width: 1280, height: 900 } });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base || !['GET', 'HEAD'].includes(route.request().method())) return route.abort();
        const file = url.pathname === '/' || url.pathname === '/index.html' ? 'public/index.html' : 'public' + url.pathname;
        if (baseline && ['public/index.html', 'public/js/translit-display.js', 'public/js/studio-morph.js'].includes(file)) {
          const response = await route.fetch();
          return route.fulfill({ response, body: execFileSync('git', ['show', ref + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 }) });
        }
        return route.continue();
      });
      await context.addInitScript(mobile => {
        localStorage.setItem('app.locale', mobile ? 'he' : 'ru'); localStorage.setItem('phase6Decision_v1', 'declined');
        localStorage.setItem('studio.wordStatus', '0'); localStorage.setItem('studio.wordGloss', '0');
        localStorage.setItem('studio.wordRibbon', '0'); localStorage.setItem('studio.wordGlossAi', '0');
        localStorage.setItem('onboardingSeen_v1', '1');
      }, mobile);
      const page = await context.newPage(); page.setDefaultTimeout(60000);
      probePage = page;
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded' });
      console.log(surface + ': shell loaded');
      await page.waitForFunction(() => __localDB?.isReady() && window.TranslitDisplay && window.StudioMorph);
      console.log(surface + ': database ready');
      await page.evaluate(({ surface, count }) => {
        window.__studioProbe = { tasks: [], longTasks: [], renders: 0, released: false };
        if (TranslitDisplay.patchTable) {
          const patch = TranslitDisplay.patchTable;
          TranslitDisplay.patchTable = (...args) => {
            return patch(...args).then(result => { __studioProbe.patchDone = result; return result; }).catch(error => { __studioProbe.patchError = error.stack; });
          };
        }
        try { new PerformanceObserver(list => __studioProbe.longTasks.push(...list.getEntries().map(e => e.duration))).observe({ entryTypes: ['longtask'] }); } catch (_) {}
        const create = TranslitDisplay.createStore;
        TranslitDisplay.createStore = (derive, opts) => create(derive, { ...opts, budgetMs: 0, sliceMs: 8,
          defer: fn => __studioProbe.released ? setTimeout(fn, 0) : __studioProbe.tasks.push(fn) });
        _v3TranslitStore = null;
        ReaderMorph.decorateWords = async () => new Promise(() => {}); // unrelated pass deliberately remains pending
        applyPreset('full');
        document.querySelectorAll("[id*='OnboardingModal'],#v3Phase6Modal").forEach(el => el.remove());
        if (surface === 'ide') v3IdeApplyMode(true);
        const rows = Array.from({ length: count }, (_, i) => ({ he: 'שלום עולם ' + i, he_niqqud: 'שָׁלוֹם עוֹלָם ' + i,
          ru: 'Синтетическая строка ' + i, translit: i === 0 ? 'MY OWN LATIN' : 'stored-' + i, translit_ru: '',
          edit_meta_json: i === 0 ? { edited: { translit: true } } : null, _v3_sentenceId: 's' + i, _v3_textId: 'fixture' }));
        currentTableData = rows;
        const name = surface === 'ide' ? 'v3IdeRenderTable' : 'renderTable', original = window[name];
        window[name] = function (...args) { __studioProbe.renders++; return original.apply(this, args); };
        if (surface === 'ide') { v3IdeState.activeTextId = 'fixture'; v3IdeRenderTable(rows, 'fixture'); }
        else renderTable(rows);
      }, { surface, count });
      // Initial media/morph mount hooks own their own controls. Attach the replay
      // fixture only after those hooks settle, before releasing derivation.
      await page.waitForTimeout(300);
      await page.evaluate(({ surface, count }) => {
        const rows = currentTableData;
        const table = document.querySelector(surface === 'ide' ? '#v3IdeCenterContent #proTable' : '#tableContainer #proTable');
        const at = Math.floor(count * .7), tr = table.querySelector('tr[data-row-idx="' + at + '"]');
        const editorCell = tr.querySelector('[data-col="translit"]');
        tableEditOpenCellEditor(editorCell, 'translit', at);
        const editor = editorCell.querySelector('textarea'); editor.value = 'UNFINISHED USER EDIT'; editor.setSelectionRange(4, 9);
        editor.scrollIntoView({ block: 'center', behavior: 'instant' });
        const replayCell = table.querySelector('tr[data-row-idx="2"] [data-col="translit"]');
        const button = document.createElement('button'); button.className = 'smk-row-replay'; button.textContent = '▶';
        button.addEventListener('click', event => { event.stopPropagation(); __studioProbe.replayed = true; }); replayCell.append(document.createTextNode('\u00a0'), button);
        __studioProbe.table = table; __studioProbe.editor = editor; __studioProbe.replay = button;
        __studioProbe.before = { top: editor.getBoundingClientRect().top, model: JSON.stringify(rows) };
        __studioProbe.rows = rows; __studioProbe.profile = getSelectedTranslitProfile();
      }, { surface, count });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => { __studioProbe.before.top = __studioProbe.editor.getBoundingClientRect().top; });
      const before = await page.evaluate(() => ({ pending: v3TranslitStore().isFilling(), renders: __studioProbe.renders }));
      console.log(surface + ': table mounted, derivation held');
      assert.ok(before.pending && before.renders === 1);
      await page.evaluate(() => {
        __studioProbe.longTasks.length = 0; __studioProbe.started = performance.now(); __studioProbe.released = true;
        __studioProbe.tasks.splice(0).forEach(fn => setTimeout(fn, 0));
      });
      await page.waitForFunction(isBaseline => !v3TranslitStore().isFilling() &&
        (isBaseline ? __studioProbe.renders >= 2 : __studioProbe.patchDone || __studioProbe.patchError), baseline);
      const patchError = await page.evaluate(() => __studioProbe.patchError);
      assert.equal(patchError, undefined, patchError);
      const result = await page.evaluate(() => {
        const p = __studioProbe, table = document.getElementById('proTable');
        p.replay.click();
        return { renders: p.renders, completionMs: performance.now() - p.started, longestTaskMs: Math.max(0, ...p.longTasks),
          sameTable: p.table === table && p.table.isConnected, editorPreserved: p.editor.isConnected && p.editor.value === 'UNFINISHED USER EDIT',
          focusPreserved: document.activeElement === p.editor, caret: [p.editor.selectionStart, p.editor.selectionEnd],
          replayPreserved: p.replay.isConnected && !!p.replayed, manualTranslit: table.querySelector('tbody [data-col="translit"]').textContent,
          scrollDelta: p.editor.isConnected ? p.editor.getBoundingClientRect().top - p.before.top : null,
          patchDone: p.patchDone, remainingStored: Array.from(table.querySelectorAll('td[data-col="translit"]')).filter(c => !c.querySelector('.cell-editor-wrap') && /^stored-/.test(c.firstChild?.textContent || '')).length,
          sourceUnchanged: JSON.stringify(currentTableData) === p.before.model };
      });
      report.checks[surface] = result;
      if (baseline) { assert.equal(result.sameTable, false); assert.ok(result.renders >= 2); }
      else {
        assert.equal(result.renders, 1); assert.ok(result.sameTable && result.editorPreserved && result.focusPreserved && result.replayPreserved && result.sourceUnchanged);
        assert.equal(result.remainingStored, 0);
        assert.deepEqual(result.caret, [4, 9]); assert.equal(result.manualTranslit, 'MY OWN LATIN');
        assert.ok(Math.abs(result.scrollDelta) <= 2, 'saved visible row stays anchored');
        if (mobile) assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out.replace(/\.json$/, '') + '-' + surface + '.png' });
        // A late fill belonging to A cannot patch a newly mounted B.
        const cancelled = await page.evaluate(async () => {
          const old = __studioProbe.table; currentTableData = [{ he: 'חדש', he_niqqud: 'חָדָשׁ', translit: 'B' }];
          old.parentElement.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0"><td data-col="translit">B</td></tr></tbody></table>';
          const result = await TranslitDisplay.patchTable(old, [{ translit: 'A' }], 'sbl', { store: v3TranslitStore() });
          return result.cancelled && document.querySelector('#proTable td').textContent === 'B';
        });
        assert.ok(cancelled); result.lateFillSuppressed = true;
      }
      console.log(surface, JSON.stringify(result));
      await context.close();
    }
    assert.deepEqual(report.errors, []); report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL'; report.failure = error.stack;
    report.diagnostic = await probePage?.evaluate(() => ({ rows: document.querySelectorAll('#proTable tbody tr').length,
      rendered: window.__studioProbe?.renders, filling: typeof v3TranslitStore === 'function' && v3TranslitStore()?.isFilling(),
      patchDone: window.__studioProbe?.patchDone, patchError: window.__studioProbe?.patchError, sameRows: currentTableData === window.__studioProbe?.rows, profile: getSelectedTranslitProfile(), expectedProfile: window.__studioProbe?.profile,
      cells: Array.from(document.querySelectorAll('#proTable td[data-col="translit"]')).filter(c => /^stored-/.test(c.firstChild?.textContent || '')).slice(0, 5).map(c => ({ text: c.textContent, row: c.closest('tr')?.dataset.rowIdx, editing: !!c.querySelector('.cell-editor-wrap') })) })).catch(() => null);
    throw error;
  }
  finally { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
