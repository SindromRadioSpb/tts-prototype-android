#!/usr/bin/env node
// scripts/morph/tier-switch-smoke.js — Workstream A1 Phase 1 smoke.
//
// Verifies the morph-provider.js tier-switching contract WITHOUT requiring
// either of the actual dict files to exist. The browser-side aggregator and
// fetch are mocked; this proves:
//   1. Default tier resolves to 'basic'.
//   2. dictPaths() routes to the correct URLs for both tiers.
//   3. setDictTier('full') persists + invalidates the in-memory map.
//   4. The 'full' tier requests `/morph/heb_morphology_full.bin` (not basic).
//   5. setDictTier('invalid') is rejected.
//   6. clearCache() purges BOTH tier filenames from caches.* even if only
//      one is currently in use.
//
// Pipeline: spawn server.js on a temp port → load morph-provider.js in
// Playwright Chromium → drive the public API through Promise.all assertions
// → exit 0 on full pass, 1 on any failure.
//
// Exit codes mirror the existing research smoke runners.
//
// Usage:
//   node scripts/morph/tier-switch-smoke.js [--port 3198] [--keep-open]

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3198;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer(port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

async function waitForReady(baseUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(baseUrl + "/healthz");
      if (r.status === 200) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log(`[morph-tier-smoke] starting server on ${baseUrl}…`);

  const { child, logs } = startServer(PORT);
  let exitCode = 1;
  let playwright;
  try {
    playwright = require("playwright");
  } catch (_) {
    console.error("[morph-tier-smoke] playwright not installed");
    await stopServer(child);
    process.exit(1);
  }

  let browser;
  try {
    const ready = await waitForReady(baseUrl);
    if (!ready) throw new Error("server did not become ready in 15s");
    console.log("[morph-tier-smoke] server up; launching Chromium…");

    browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    // Use a minimal host page that does NOT auto-run its own test runner —
    // research-client-test.html overrides window.fetch as part of its own
    // suite and would race with our mock setup.
    await page.goto(`${baseUrl}/morph-tier-test.html`, { waitUntil: "domcontentloaded" });

    // Inject a fetch mock BEFORE morph-provider.js loads, so the provider's
    // own fetch calls hit our recorder. The mock returns 404 for both tiers
    // (the dict files don't exist in this test scenario), but it tracks the
    // exact URLs requested.
    await page.addScriptTag({ content: `
      window.__fetchCalls = [];
      window.fetch = async function (url, init) {
        window.__fetchCalls.push({ url: String(url), method: (init && init.method) || 'GET' });
        return new Response(JSON.stringify({}), { status: 404, headers: { 'Content-Type': 'application/json' } });
      };
      // Make sure localStorage is clean for the test.
      try { localStorage.removeItem('morphDictTier_v1'); } catch (_) {}
      // Stub caches.* so clearCache() can run without a real SW context.
      // window.caches is a non-configurable read-only getter in real browsers,
      // so plain assignment fails silently — must use defineProperty.
      window.__cacheDeletions = [];
      const stubCaches = {
        keys: async () => ['stub-cache'],
        open: async (name) => ({
          delete: async (url) => { window.__cacheDeletions.push({ name, url }); return true; },
        }),
      };
      try {
        Object.defineProperty(window, 'caches', { value: stubCaches, configurable: true, writable: true });
      } catch (_) {
        window.caches = stubCaches; // best-effort fallback
      }
      // morph-normalize.js stub (real one not loaded on this page).
      window.MorphNormalize = { normalizeHebrew: (s) => String(s || '').trim() };
    `});

    // Load the provider under test.
    await page.addScriptTag({ url: `/js/morph-provider.js` });
    await page.waitForFunction(() => !!window.MorphProvider, { timeout: 5000 });

    // Run the assertions in-page so we can probe the API synchronously.
    const results = await page.evaluate(async () => {
      const out = [];
      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const test = async (name, fn) => {
        try { await fn(); out.push({ name, ok: true }); }
        catch (e) { out.push({ name, ok: false, err: String((e && e.message) || e) }); }
      };
      const r = window.MorphProvider;

      // 1. Default tier.
      await test('default tier is basic when localStorage empty', async () => {
        if (r.getDictTier() !== 'basic') throw new Error('expected basic, got ' + r.getDictTier());
      });

      // 2. dictPaths routing — observe via fetch calls.
      await test('ensureReady() on basic tier fetches /morph/heb_morphology.meta.json', async () => {
        window.__fetchCalls = [];
        try { await r.ensureReady(); } catch (_) {}
        const urls = window.__fetchCalls.map((c) => c.url);
        const hitBasic = urls.some((u) => u.endsWith('/morph/heb_morphology.meta.json'));
        const hitFull  = urls.some((u) => u.endsWith('/morph/heb_morphology_full.meta.json'));
        if (!hitBasic) throw new Error('expected basic meta fetch; saw ' + JSON.stringify(urls));
        if (hitFull)   throw new Error('basic tier must NOT request full meta; saw ' + JSON.stringify(urls));
      });

      // 3. setDictTier persists.
      await test('setDictTier("full") persists to localStorage + returns reloaded:true', async () => {
        // Pre-condition: we're on basic (load attempt happened above).
        const res = await r.setDictTier('full');
        if (!res.ok)            throw new Error('setDictTier ok=false: ' + JSON.stringify(res));
        if (res.tier !== 'full') throw new Error('setDictTier returned tier=' + res.tier);
        if (!res.reloaded)      throw new Error('expected reloaded:true on basic→full switch');
        const ls = localStorage.getItem('morphDictTier_v1');
        if (ls !== 'full')      throw new Error('localStorage not set: ' + ls);
        if (r.getDictTier() !== 'full') throw new Error('getDictTier() not full');
      });

      // 4. Full tier requests full filenames. Meta first; the .bin.gz fetch
      //    only happens after meta succeeds — in this smoke meta returns 404,
      //    so verify URL routing by checking that NO basic URL was attempted.
      await test('ensureReady() on full tier routes to /morph/heb_morphology_full.meta.json', async () => {
        window.__fetchCalls = [];
        try { await r.ensureReady(); } catch (_) {}
        const urls = window.__fetchCalls.map((c) => c.url);
        const hitFullMeta = urls.some((u) => u.endsWith('/morph/heb_morphology_full.meta.json'));
        const hitBasic    = urls.some((u) => u.endsWith('/morph/heb_morphology.meta.json'));
        if (!hitFullMeta) throw new Error('expected full meta fetch; saw ' + JSON.stringify(urls));
        if (hitBasic)     throw new Error('full tier must NOT request basic meta; saw ' + JSON.stringify(urls));
      });

      // 5. Invalid tier rejected.
      await test('setDictTier("bogus") returns ok:false', async () => {
        const res = await r.setDictTier('bogus');
        if (res.ok) throw new Error('expected rejection');
        if (res.error !== 'INVALID_TIER') throw new Error('wrong error: ' + res.error);
        // localStorage must NOT have been overwritten.
        if (localStorage.getItem('morphDictTier_v1') !== 'full') {
          throw new Error('invalid tier overwrote localStorage');
        }
      });

      // 6. Switching to same tier reports reloaded:false.
      await test('setDictTier("full") when already full → reloaded:false', async () => {
        // First clear the loadedTier sentinel by clearing cache so the
        // "no-op" case is unambiguous.
        await r.clearCache();
        // We need to actually load and end up on 'full' tier so that
        // T1.loadedTier === 'full'. But ensureReady() will fail (404), so
        // T1.loadedTier remains null. In that case the implementation
        // falls through on the localStorage-only check: prev===tier and
        // loadedTier is null → reloaded:false.
        const res = await r.setDictTier('full');
        if (!res.ok) throw new Error('expected ok');
        if (res.reloaded) throw new Error('same-tier switch must report reloaded:false; got: ' + JSON.stringify(res));
      });

      // 7. clearCache() targets BOTH tier filenames (incl. .gz for the full
      //    variant since that's the actual URL served at runtime).
      await test('clearCache() deletes both basic and full filenames from caches', async () => {
        window.__cacheDeletions = [];
        await r.clearCache();
        const urls = window.__cacheDeletions.map((c) => c.url);
        const want = [
          '/morph/heb_morphology.bin',
          '/morph/heb_morphology.meta.json',
          '/morph/heb_morphology_full.bin',
          '/morph/heb_morphology_full.bin.gz',
          '/morph/heb_morphology_full.meta.json',
        ];
        for (const w of want) {
          if (!urls.includes(w)) throw new Error('missing ' + w + ' in deletions: ' + JSON.stringify(urls));
        }
      });

      // 8. getStatus exposes dictTier.
      await test('getStatus() exposes current dictTier', async () => {
        const s = r.getStatus();
        if (!s || typeof s.dictTier !== 'string') throw new Error('dictTier missing from status');
        if (s.dictTier !== r.getDictTier()) throw new Error('dictTier mismatch');
      });

      // 9. Switching back to basic.
      await test('setDictTier("basic") reverts persistence + reports reloaded:true', async () => {
        await r.setDictTier('full'); // ensure we start from full
        const res = await r.setDictTier('basic');
        if (!res.ok)             throw new Error('not ok');
        if (res.tier !== 'basic') throw new Error('tier wrong');
        // reloaded:true expected because prev('full') !== new('basic').
        if (!res.reloaded)       throw new Error('basic←full should reload');
        if (r.getDictTier() !== 'basic') throw new Error('getDictTier not basic');
      });

      return out;
    });

    let passed = 0, failed = 0;
    for (const r of results) {
      console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.err}`);
      if (r.ok) passed++; else failed++;
    }
    if (pageErrors.length) {
      console.error(`\n[morph-tier-smoke] page errors:`);
      for (const e of pageErrors) console.error('  ' + e);
    }
    console.log(`\n[morph-tier-smoke] ${passed}/${passed + failed} passed`);
    exitCode = failed === 0 && pageErrors.length === 0 ? 0 : 1;
  } catch (e) {
    console.error('[morph-tier-smoke] fatal:', e && e.message ? e.message : e);
    for (const line of logs.slice(-20)) console.error('  ' + line);
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('[morph-tier-smoke] unhandled:', e); process.exit(1); });
}
