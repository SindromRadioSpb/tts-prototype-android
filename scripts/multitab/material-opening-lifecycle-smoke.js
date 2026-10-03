'use strict';
// Disposable server/profile. --root allows the SAME benchmark against an unchanged checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const ROOT = path.resolve(arg('root') || path.join(__dirname, '../..'));
const OUT = path.resolve(arg('out') || path.join(__dirname, '../../.tmp/material-opening-lifecycle/result.json'));
const benchmarkOnly = process.argv.includes('--benchmark-only');
const checksOnly = process.argv.includes('--checks-only');
async function main() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-opening-'));
  const server = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(data, 0), silent: true, windowsHide: true });
  const logs = []; server.stdout.on('data', chunk => logs.push(String(chunk))); server.stderr.on('data', chunk => logs.push(String(chunk)));
  let browser;
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 850 } });
    await context.route(url => !url.href.startsWith(base), route => route.abort());
    // Expose the real module closures only in this isolated test; no production debug API.
    await context.route('**/js/library-ui.js?*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__openingTest = { openReader, closeReader, rerenderReader, roomMediaEnsureYoutubeStage, roomMediaTeardown, getFlush: () => flushReaderProgress, setFlush: fn => { flushReaderProgress = fn; }, setAudio: audio => { roomMediaAudio = audio; } };' });
    });
    await context.addInitScript(() => { if (location.protocol !== 'http:') return; localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); });
    const errors = []; context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const studio = await context.newPage();
    await studio.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded' });
    await studio.waitForFunction(() => window.__localDB?.isReady(), null, { timeout: 45000 });
    await studio.evaluate(async () => {
      for (const id of ['opening-A', 'opening-B']) {
        await __localDB.createText({ id, text_key: id, title: id, source_text: id + '\n' + 'שלום עולם\n'.repeat(10000) });
        await __localDB.addSentences(id, Array.from({ length: 40 }, (_, i) => ({ id: id + '-row-' + i,
          he_plain: 'שלום עולם', he: 'שלום עולם', he_niqqud: 'שָׁלוֹם עוֹלָם', ru: id + '-line-' + i,
          translit: 'shalom olam', translit_ru: 'шалом олам', order_index: i })));
        await __localDB.setProgress(id, { last_row_idx: id.endsWith('A') ? 4 : 12, last_step_id: 'ru' });
      }
      window.__documentSentinel = 'studio';
    });
    const room = await context.newPage();
    await room.goto(base + '/library.html?my_text=opening-A', { waitUntil: 'domcontentloaded' });
    await room.locator('#roomReaderTable').getByText('opening-A-line-0', { exact: false }).waitFor({ timeout: 45000 });
    await room.waitForFunction(() => window.__openingTest);
    await room.evaluate(() => { window.__documentSentinel = 'room'; });
    const samples = {};
    for (const surface of ['classic', 'ide', 'room']) {
      if (surface === 'ide') {
        await studio.evaluate(() => v3IdeApplyMode(true, 'opening-A'));
        await studio.locator('#v3IdeCenterContent #proTable').waitFor();
      }
      const page = surface === 'room' ? room : studio;
      samples[surface] = await page.evaluate(async ({ surface, checksOnly }) => {
        const values = [];
        for (let i = 0; i < (checksOnly ? 2 : 12); i++) {
          const id = i % 2 ? 'opening-B' : 'opening-A';
          const start = performance.now();
          if (surface === 'room') await __openingTest.openReader(id, id, { resume: true });
          else if (surface === 'ide') await v3IdeOpenTextInCenter(id);
          else await v3LibraryOpenText(id, { resume: true });
          const elapsed = performance.now() - start;
          const table = document.querySelector(surface === 'room' ? '#roomReaderTable #proTable' : '#proTable');
          if (!table?.textContent.includes(id + '-line-0') || table.querySelectorAll('tbody tr').length !== 40) throw new Error('wrong material: ' + surface);
          if (i >= 2) values.push(Math.round(elapsed * 100) / 100); // two warmup opens, ten samples
        }
        return values;
      }, { surface, checksOnly });
    }
    if (!benchmarkOnly) {
      // Both Studio presenters share the same critical-read guard. IDE source hydration is optional.
      const studioRace = await studio.evaluate(async () => {
        const original = ensureLocalDB;
        let releaseRows, releaseSource;
        const rowsGate = new Promise(resolve => { releaseRows = resolve; });
        const sourceGate = new Promise(resolve => { releaseSource = resolve; });
        ensureLocalDB = async () => new Proxy(await original(), { get(db, key) {
          if (key === 'getSentences') return async id => { if (id === 'opening-A') await rowsGate; return db.getSentences(id); };
          if (key === 'getTextSourceText') return async id => { if (id === 'opening-B') await sourceGate; return db.getTextSourceText(id); };
          return db[key];
        } });
        try {
          const old = v3LibraryOpenText('opening-A', { resume: true });
          await v3IdeOpenTextInCenter('opening-B');
          const table = document.getElementById('proTable');
          const beforeSource = document.getElementById('inputText').value;
          releaseRows(); await old; releaseSource();
          await new Promise(resolve => setTimeout(resolve, 150));
          return { id: v3SessionGet().textId, tableStable: table === document.getElementById('proTable'),
            selected: document.querySelector('#proTable .row-selected')?.dataset.rowIdx, beforeSource };
        } finally { releaseRows(); releaseSource(); ensureLocalDB = original; }
      });
      assert.equal(studioRace.id, 'opening-B'); assert.equal(studioRace.tableStable, true);
      assert.equal(studioRace.selected, '12'); assert.equal(studioRace.beforeSource, '');
      await studio.evaluate(() => v3IdeOpenTextInCenter('opening-B', 'opening-B-row-7'));
      await studio.locator('#proTable tr.row-selected[data-row-idx="7"]').waitFor();


      // A late Room load after Back must never paint over the catalog.
      const roomRace = await room.evaluate(async () => {
        const original = MaterialOpen.load; let release;
        const gate = new Promise(resolve => { release = resolve; });
        MaterialOpen.load = async (id, opts) => { if (id === 'opening-A') await gate; return original(id, opts); };
        try {
          const old = __openingTest.openReader('opening-A', 'opening-A');
          await __openingTest.closeReader(); release(); await old;
          const closed = document.getElementById('roomReader').hidden;
          await __openingTest.openReader('opening-B', 'opening-B', { resume: true });
          return { closed, title: document.getElementById('readerTitle').textContent };
        } finally { release(); MaterialOpen.load = original; }
      });
      assert.equal(roomRace.closed, true); assert.equal(roomRace.title, 'opening-B');

      // A new open may win while Back is waiting for its durable progress flush.
      const closeRace = await room.evaluate(async () => {
        const original = __openingTest.getFlush(); let release;
        const gate = new Promise(resolve => { release = resolve; });
        __openingTest.setFlush(() => gate);
        try {
          const closing = __openingTest.closeReader();
          await __openingTest.openReader('opening-A', 'opening-A', { resume: true });
          release(); await closing;
          return { visible: !document.getElementById('roomReader').hidden, title: document.getElementById('readerTitle').textContent };
        } finally { release(); __openingTest.setFlush(original); }
      });
      assert.deepEqual(closeRace, { visible: true, title: 'opening-A' }, 'late Back must not close the newer material');

      // Real surface wrappers + real lifecycle with a controllable provider boundary.
      for (const [surface, page] of [['studio', studio], ['room', room]]) {
        const result = await page.evaluate(async surface => {
          const gates = [], destroyed = [];
          const original = { create: StudioYtPlayer.create, destroy: StudioYtPlayer.destroy, capability: StudioYtPlayer.capability };
          StudioYtPlayer.capability = () => ({ supported: true });
          StudioYtPlayer.create = (host, id, options) => new Promise((resolve, reject) => {
            const adapter = document.createElement('video'); host.appendChild(adapter);
            gates.push({ resolve: () => resolve(adapter), reject, adapter, signal: options.signal });
          });
          StudioYtPlayer.destroy = adapter => { destroyed.push(adapter); adapter.remove(); };
          const api = surface === 'studio' ? {
            reset: v3MediaTeardown, setAudio: audio => { window.v3ActiveMediaAudio = audio; }, ensure: v3MediaEnsureYoutubeStage,
          } : { reset: __openingTest.roomMediaTeardown, getFlush: () => flushReaderProgress, setFlush: fn => { flushReaderProgress = fn; }, setAudio: __openingTest.setAudio, ensure: __openingTest.roomMediaEnsureYoutubeStage };
          const mount = document.getElementById(surface === 'studio' ? 'v3MediaYtMount' : 'roomMediaYtMount');
          const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
          try {
            api.reset();
            const a = { video: { videoId: 'sameVideo01' }, timing: null }, b = { video: { videoId: 'sameVideo01' }, timing: null };
            api.setAudio(a); const first = api.ensure(a); await flush();
            api.reset(); api.setAudio(b); const second = api.ensure(b); await flush();
            gates[1].resolve(); const accepted = await second;
            gates[0].resolve(); await first;
            const repeated = await api.ensure(b);
            const stable = repeated === accepted && !mount.hidden && mount.contains(accepted) && gates.length === 2;
            const oldDisposed = destroyed.includes(gates[0].adapter) && gates[0].signal.aborted;
            api.reset();
            return { stable, oldDisposed, empty: mount.children.length === 0, destroyed: destroyed.length };
          } finally { api.reset(); Object.assign(StudioYtPlayer, original); }
        }, surface);
        assert.deepEqual(result, { stable: true, oldDisposed: true, empty: true, destroyed: 2 }, surface);
      }
    }
    assert.equal(await studio.evaluate(() => window.__documentSentinel), 'studio');
    assert.equal(await room.evaluate(() => window.__documentSentinel), 'room');
    assert.deepEqual(errors, []);
    const summary = checksOnly ? {} : Object.fromEntries(Object.entries(samples).map(([key, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [key, { medianMs: Math.round((sorted[4] + sorted[5]) * 50) / 100, maxMs: sorted.at(-1), samplesMs: values }];
    }));
    const report = { result: 'PASS', benchmarkOnly, checksOnly, samplesPerSurface: checksOnly ? 0 : 10, rows: 40, sourceChars: 100010, summary,
      noReload: true, errors, scope: 'isolated Chromium desktop; warm fixed fixtures, not production p95 or device evidence' };
    fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } catch (error) { console.error(logs.slice(-10).join('')); throw error; }
  finally { if (browser) await browser.close(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
