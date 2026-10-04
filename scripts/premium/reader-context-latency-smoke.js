'use strict';
// Slow/failing context is injected; real shipped dictionary, disposable browsers,
// no live Dicta, learner databases or paid providers.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.tmp/reader-context-latency'); fs.mkdirSync(out, { recursive: true });
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
      await context.route('**/__context_latency_fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="stylesheet" href="/css/reader-morph.css"><script src="/js/notes-autogen.js"></script><script src="/js/inflection-dict.js"></script><script src="/js/inflection-render.js"></script><script src="/js/reader-morph.js"></script><script src="/js/morph-host.js"></script><body><div id="fixture"><table><tbody><tr data-row-idx="0"><td data-col="niqqud"></td></tr><tr data-row-idx="1"><td data-col="niqqud"></td></tr></tbody></table></div></body></html>` }));
      await context.route('**/js/reader-morph.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'public/js/reader-morph.js')) }));
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('https://linguistpro.kolosei.com/__context_latency_fixture', { waitUntil: 'load' });
      if (!(await page.evaluate(() => !!window.ReaderMorph))) throw new Error(JSON.stringify({ errors, state: await page.evaluate(() => ({ url: location.href, html: document.documentElement.outerHTML.slice(0,1000), resources: performance.getEntriesByType('resource').map(r=>r.name) })) }));
      await page.evaluate(async () => {
        await ReaderMorph.ensureEngine();
        window.jobs = []; window.savedStatus = ''; window.due = false; window.grades = 0;
        localStorage.setItem('room.contextConsent', 'granted');
        window.ReaderDicta = {
          analyzeSentence: () => new Promise((resolve, reject) => jobs.push({ reject, resolve: ctx => resolve({ ok: true, tokens: [{ niqqud: ctx.niqqud, posDicta: ctx.posDicta }] }) })),
          tokenForSurface: tokens => tokens[0],
        };
        window.contextHost = MorphHost.createHost({});
        const rows = [{ he: 'כתב', he_niqqud: 'כָּתַב' }, { he: 'שלום', he_niqqud: 'שָׁלוֹם' }];
        const base = await ReaderMorph.resolveWordLight(rows[0].he, rows[0].he_niqqud);
        window.baseKey = base.lemmaKey; window.baseLabel = base.label;
        ReaderMorph.attach(document.getElementById('fixture'), { cellSelector: 'td[data-col="niqqud"]', getRow: i => rows[i],
          contextProvider: contextHost.makeContextProvider(),
          getWordStatus: async () => savedStatus, setWordStatus: async (_, value) => { savedStatus = value; },
          saveUserMeaning: async () => {},
          getDueSchedule: async () => due ? { [baseKey]: { due: Date.now() - 1000 } } : {},
          gradeReadingTap: async () => { grades++; } });
      });
      const tap = async (row = 0) => {
        await page.evaluate(() => contextHost.clearCtxCache());
        const before = await page.evaluate(() => jobs.length);
        const ms = await page.locator('#fixture tr[data-row-idx="' + row + '"] .rm-w').evaluate(async word => {
          const start = performance.now(); word.click();
          while (document.querySelector('.rm-loading') && performance.now() - start < 2000) await new Promise(r => setTimeout(r, 5));
          return Math.round(performance.now() - start);
        });
        assert.ok(ms < 1500, 'offline card opens while cloud is unresolved');
        assert.equal(await page.locator('[data-rm-context-pending]').count(), 1);
        return { ms, job: before };
      };
      const settle = async (job, fail = false) => {
        await page.evaluate(({ job, fail }) => fail ? jobs[job].reject(new Error('injected outage')) : jobs[job].resolve({ niqqud: 'כְּתָב', posDicta: 'noun' }), { job, fail });
        await page.waitForFunction(() => !document.querySelector('[data-rm-context-pending]'));
      };
      const slow = await tap();
      // Model the reported six seconds. The local card stays available throughout.
      await page.waitForTimeout(6000); assert.equal(await page.locator('.rm-loading').count(), 0);
      await settle(slow.job);
      assert.equal(await page.locator('.rm-head .rm-prov-likely').count(), 1, 'context disagreement softens the offline certainty');
      await page.screenshot({ path: path.join(out, engine.name() + '-refined.png') });
      await page.locator('.rm-sheet-x').click();
      const cachedJobs = await page.evaluate(() => jobs.length);
      await page.locator('#fixture tr[data-row-idx="0"] .rm-w').evaluate(word => word.click());
      await page.waitForFunction(() => !document.querySelector('.rm-loading'));
      assert.equal(await page.locator('[data-rm-context-pending]').count(), 0);
      assert.equal(await page.evaluate(() => jobs.length), cachedJobs, 'cached context starts no additional provider call');
      await page.locator('.rm-sheet-x').click();
      const edit = await tap();
      await page.evaluate(() => { window.originalWordNode = document.querySelector('.rm-word'); });
      await page.locator('[data-rm-status="known"]').click();
      await settle(edit.job);
      assert.equal(await page.evaluate(() => savedStatus), 'known');
      assert.equal(await page.evaluate(() => document.querySelector('.rm-word') === originalWordNode), true, 'late cloud does not replace engaged card');
      await page.locator('.rm-sheet-x').click();
      const typing = await tap();
      await page.locator('[data-rm-meaning-edit]').click();
      await page.locator('[data-rm-meaning-input]').fill('Мой черновик');
      await settle(typing.job);
      assert.equal(await page.locator('[data-rm-meaning-input]').inputValue(), 'Мой черновик');
      assert.equal(await page.locator('[data-rm-meaning-input]').evaluate(el => document.activeElement === el), true);
      await page.locator('.rm-sheet-x').click();
      const closed = await tap(); await page.locator('.rm-sheet-x').click();
      await page.evaluate(job => jobs[job].resolve({ niqqud: 'כְּתָב', posDicta: 'noun' }), closed.job);
      await page.waitForTimeout(100); assert.equal(await page.locator('.rm-sheet.rm-open').count(), 0);
      const old = await tap(); const next = await tap(1);
      await page.evaluate(job => jobs[job].resolve({ niqqud: 'כְּתָב', posDicta: 'noun' }), old.job);
      await page.waitForTimeout(100); assert.equal(await page.locator('.rm-word').textContent(), 'שָׁלוֹם');
      await settle(next.job, true); assert.equal(await page.locator('.rm-word').textContent(), 'שָׁלוֹם');
      await page.locator('.rm-sheet-x').click();
      const earlier = await tap(), repeated = await tap();
      await page.evaluate(job => jobs[job].resolve({ niqqud: 'כְּתָב', posDicta: 'noun' }), earlier.job);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('[data-rm-context-pending]').count(), 1, 'an earlier tap on the same word cannot finish a newer tap');
      await settle(repeated.job, true);
      await page.locator('.rm-sheet-x').click();
      await page.evaluate(() => { savedStatus = ''; due = true; });
      assert.equal(await page.evaluate(() => baseLabel), 'exact', 'fixture is eligible for due recall');
      const recall = await tap();
      assert.equal(await page.locator('[data-rm-recall-reveal]').isDisabled(), true, 'pending context cannot reveal a due answer');
      assert.equal(await page.locator('.rm-meaning').count(), 0);
      await settle(recall.job, true);
      assert.equal(await page.locator('[data-rm-recall-reveal]').isDisabled(), false);
      assert.equal(await page.evaluate(() => grades), 0);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ engine: engine.name(), slowContextMs: 6000, cardOpenMs: slow.ms, guardedEdit: true, guardedClose: true, guardedSwitch: true, recallPreserved: true, errors }));
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
