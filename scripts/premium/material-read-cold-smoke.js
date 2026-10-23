'use strict';
// Disposable fixtures only. Isolates cold worker/DB reads, not whole-app paint.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(arg('out') || path.join(ROOT, '.tmp/reader-performance/cold-read.json'));
const REMOTE = arg('base');
async function main() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-material-read-'));
  const server = REMOTE ? null : fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(data, 0), silent: true, windowsHide: true });
  const logs = []; server?.stdout.on('data', c => logs.push(String(c))); server?.stderr.on('data', c => logs.push(String(c)));
  let browser;
  const report = { result: 'RUNNING', scope: 'Isolated Chromium, cold document/worker and ready fixture DB; SW blocked, routing disables HTTP cache. Data-read timing only, not interactive UI or owner/device evidence.', remoteReadOnly: !!REMOTE, samples: [], checks: {}, errors: [] };
  try {
    const base = REMOTE || 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
    if (REMOTE) {
      assert.ok(arg('version'), '--version required');
      assert.equal((await (await fetch(base + '/api/client-config?verify=' + Date.now())).json()).version, arg('version'));
    }
    const shell = await (await fetch(base + '/')).text();
    const dbPath = shell.match(/(?:href|from)=["'](\/db\/local-db.js\?v=\d+)/)?.[1] || shell.match(/from ['"](\/db\/local-db.js\?v=\d+)/)?.[1];
    const materialPath = shell.match(/src="(\/js\/material-open.js\?v=\d+)/)?.[1];
    assert.ok(dbPath && materialPath, 'resolve served module pins');
    browser = await chromium.launch({ headless: true });
    for (const backend of ['AccessHandlePool', 'tts-opfs-idb'].filter(value => !arg('backend') || value === arg('backend'))) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const r = route.request();
        if (!r.url().startsWith(base + '/') || !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) return route.abort();
        if (new URL(r.url()).pathname === '/__material-read-smoke') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Isolated material read</title>' });
        return route.continue();
      });
      await context.addInitScript(backend => {
        localStorage.setItem('opfsVfsPreference_v1', backend);
        window.__rpc = [];
        const Native = window.Worker;
        window.Worker = class extends Native {
          postMessage(message, ...rest) { window.__rpc.push(message.type); return super.postMessage(message, ...rest); }
        };
      }, backend);
      const open = async () => {
        const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(base + '/__material-read-smoke');
        await page.addScriptTag({ url: base + materialPath });
        await page.evaluate(async dbPath => { window.db = await import(dbPath); await db.initLocalDB(); }, dbPath);
        return page;
      };
      let page = await open();
      const seeded = await page.evaluate(async () => {
        const specs = [['short', 40, 1, 100], ['media', 499, 1, 259251], ['paragraphs', 34, 24, 1750], ['large', 2477, 1, 1673248]];
        const texts = specs.map(([key, count, repeat, size]) => ({ text_key: 'cold-read-' + key, title: key,
          source_text: 'Original source retained', source_meta_json: JSON.stringify({ provider_evidence: 'x'.repeat(size), audio: { source: 'fixture' } }),
          sentences: Array.from({ length: count }, (_, i) => ({ order_index: i * 2, he_plain: 'שלום עולם הילד קורא ספר בבית '.repeat(repeat),
            he_niqqud: 'שָׁלוֹם עוֹלָם הַיֶּלֶד קוֹרֵא סֵפֶר בַּבַּיִת '.repeat(repeat), ru: 'Строка ' + i,
            translit: i ? 'stored' : 'MY MANUAL', edit_meta_json: i ? null : '{"edited":{"translit":true}}' })) }));
        const imported = await db.importBundle({ texts }, { mode: 'skip' });
        if (imported.errors?.length || imported.imported !== 4) throw new Error(JSON.stringify(imported));
        const rows = await db.dbQuery("SELECT id,text_key FROM texts WHERE text_key LIKE 'cold-read-%'");
        const info = db.getVfsInfo(); await db.closeLocalDB();
        return { ids: rows.map(row => ({ id: row.id, name: row.text_key.slice(10) })), info };
      });
      console.log('Seeded', backend, JSON.stringify(seeded.info)); await page.close();
      const hashes = new Map();
      // Alternate order per pair, with a fresh document/worker for EVERY sample.
      for (const fixture of seeded.ids.filter(value => !arg('fixture') || value.name === arg('fixture'))) for (let pair = 0; pair < Number(arg('pairs') || 3); pair++) for (const mode of pair % 2 ? ['batch', 'split'] : ['split', 'batch']) {
        page = await open();
        const sample = await page.evaluate(async ({ id, mode }) => {
          const localDb = mode === 'split' ? new Proxy(db, { get(target, key) { return key === 'getMaterialForOpen' ? undefined : target[key]; } }) : db;
          window.__rpc.length = 0;
          const start = performance.now();
          const model = await MaterialOpen.load(id, { localDb, sourceOnly: true });
          const ms = performance.now() - start, rpc = window.__rpc.slice();
          if (!model.ok || !model.sentences.length || model.sentences[0].translit !== 'MY MANUAL') throw new Error('invalid material');
          const bytes = new TextEncoder().encode(JSON.stringify(model));
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
          const state = await db.dbQuery('SELECT (SELECT count(*) FROM review_log) AS reviews,(SELECT count(*) FROM text_progress) AS progress');
          await db.closeLocalDB();
          return { ms: Math.round(ms * 100) / 100, rpc, hash, rows: model.sentences.length, payloadBytes: bytes.length, state: state[0] };
        }, { id: fixture.id, mode });
        assert.deepEqual(sample.rpc, mode === 'split' ? ['query', 'query', 'query'] : ['readMaterial'], 'one material RPC vs three cold split reads');
        const key = backend + ':' + fixture.name;
        if (hashes.has(key)) assert.equal(sample.hash, hashes.get(key), 'both paths preserve exactly the same read model');
        hashes.set(key, sample.hash);
        assert.equal(sample.state.reviews, 0); assert.equal(sample.state.progress, 0);
        report.samples.push({ backend, fixture: fixture.name, pair, mode, ...sample });
        await page.close();
      }
      await context.close();
    }
    assert.deepEqual(report.errors, []);
    report.checks = { identicalReadModels: true, noReviewOrProgressWrites: true, oneRpc: true, coldWorkers: true };
    report.result = 'PASS';
    console.log(JSON.stringify({ result: report.result, samples: report.samples.length, checks: report.checks }));
  } catch (error) { report.result = 'FAIL'; report.failure = error.stack; console.error(logs.slice(-8).join('')); throw error; }
  finally {
    fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
    await browser?.close(); server?.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
