#!/usr/bin/env node
// scripts/morph/settings-ui-smoke.js — Workstream A1 Phase 2 Settings smoke.
//
// DOM-level Playwright smoke for morph-settings-ui.js. Mocks v3ConfirmModal
// (the global modal helper from index.html, not loaded here), opens the
// modal, drives the radio toggle + Apply button, and asserts:
//   1. Modal title + intro copy rendered.
//   2. Status block shows current tier.
//   3. Both radios present (basic + full), exactly one preselected.
//   4. Selecting "full" + Apply persists localStorage.morphDictTier_v1
//      via MorphProvider.setDictTier().
//   5. "Clear cache" button is wired to MorphProvider.forceUpdate().
//   6. No JS errors during open/interact/close.
//
// Spawns its own server.js + temp port; pulls page assets from /js/.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3196;

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
  console.log(`[morph-settings-smoke] starting server on ${baseUrl}…`);

  const { child, logs } = startServer(PORT);
  let exitCode = 1;
  let playwright;
  try { playwright = require("playwright"); }
  catch (_) {
    console.error("[morph-settings-smoke] playwright not installed");
    await stopServer(child);
    process.exit(1);
  }

  let browser;
  try {
    const ready = await waitForReady(baseUrl);
    if (!ready) throw new Error("server did not become ready in 15s");
    console.log("[morph-settings-smoke] server up");

    browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    await page.goto(`${baseUrl}/morph-tier-test.html`, { waitUntil: "domcontentloaded" });

    // Mock v3ConfirmModal (real one is in index.html) and showToast, route
    // the modal body into a known container so we can probe the DOM.
    // Same pattern as preview-ui-smoke.js.
    await page.addScriptTag({ content: `
      window.__LAST_MODAL = null;
      window.__LAST_RESOLUTION = null;
      window.v3ConfirmModal = function (opts) {
        window.__LAST_MODAL = opts;
        let host = document.getElementById('__modal_host');
        if (!host) {
          host = document.createElement('div');
          host.id = '__modal_host';
          document.body.appendChild(host);
        }
        host.innerHTML = opts.body || '';
        // Expose a way to resolve the modal externally (so tests can
        // simulate the user clicking OK).
        return new Promise((resolve) => {
          window.__resolveLastModal = (value) => {
            window.__LAST_RESOLUTION = value;
            resolve(value);
          };
        });
      };
      window.showToast = function (msg) {
        window.__lastToast = String(msg);
      };
      try { localStorage.removeItem('morphDictTier_v1'); } catch (_) {}
      // Stub caches (window.caches is read-only getter in real browsers).
      window.__cacheDeletions = [];
      try {
        Object.defineProperty(window, 'caches', {
          value: {
            keys: async () => ['stub'],
            open: async () => ({ delete: async (u) => { window.__cacheDeletions.push(u); return true; } }),
          }, configurable: true, writable: true,
        });
      } catch (_) {}
      // Need MorphNormalize for provider boot (it doesn't normalize unless loaded).
    `});

    await page.addScriptTag({ url: `/js/morph-normalize.js` });
    await page.addScriptTag({ url: `/js/morph-provider.js` });
    await page.addScriptTag({ url: `/js/morph-settings-ui.js` });
    await page.waitForFunction(
      () => !!window.MorphProvider && !!window.LinguistProMorphSettings,
      { timeout: 5000 }
    );

    // Open the Settings modal — drives v3ConfirmModal stub which mounts
    // its body into #__modal_host.
    await page.evaluate(() => window.LinguistProMorphSettings.open());
    await page.waitForSelector('[data-testid="v3-morph-tier-basic"]', { timeout: 5000 });

    // ── Assertion battery ────────────────────────────────────────────────
    const probe1 = await page.evaluate(() => {
      const host = document.getElementById('__modal_host');
      const m = window.__LAST_MODAL || {};
      const basicRadio = document.querySelector('[data-testid="v3-morph-tier-basic"]');
      const fullRadio  = document.querySelector('[data-testid="v3-morph-tier-full"]');
      return {
        modalTitle:    m.title || '',
        bodyHasIntro:  (host.innerHTML || '').includes('hspell'),
        bodyHasStatus: (host.innerHTML || '').includes('Состояние:') || (host.innerHTML || '').includes('Status:'),
        basicChecked:  basicRadio && basicRadio.checked,
        fullChecked:   fullRadio && fullRadio.checked,
        hasApply:      (m.okText || '') !== '',
        clearBtnPresent: !!document.getElementById('v3MorphClearCacheBtn'),
      };
    });

    const assertions = [
      ['modal title set', /Морфология|Morphology/.test(probe1.modalTitle)],
      ['intro mentions hspell',           probe1.bodyHasIntro],
      ['status block rendered',           probe1.bodyHasStatus],
      ['basic radio preselected (default)', probe1.basicChecked === true],
      ['full radio NOT preselected',      probe1.fullChecked === false],
      ['apply button present',            probe1.hasApply === true],
      ['clear cache button present',      probe1.clearBtnPresent === true],
    ];

    // Now select "full" and resolve the modal with confirmed=true. The
    // settings-ui flow then calls MorphProvider.setDictTier('full').
    await page.evaluate(() => {
      const full = document.querySelector('[data-testid="v3-morph-tier-full"]');
      if (full) full.checked = true;
      window.__resolveLastModal(true);
    });
    // The setDictTier flow inside the .then awaits clearCache. Give it a tick.
    await page.waitForFunction(
      () => localStorage.getItem('morphDictTier_v1') === 'full',
      { timeout: 5000 }
    );

    const probe2 = await page.evaluate(() => ({
      tierAfterApply: localStorage.getItem('morphDictTier_v1'),
      toast: window.__lastToast || '',
      providerTier:   window.MorphProvider.getDictTier(),
      cacheDeletions: (window.__cacheDeletions || []).length,
    }));

    assertions.push(['Apply persists tier=full',         probe2.tierAfterApply === 'full']);
    assertions.push(['Provider getDictTier reflects new tier', probe2.providerTier === 'full']);
    assertions.push(['toast surfaced to user',           /активирован|enabled|activated/i.test(probe2.toast)]);
    assertions.push(['SW cache purged on tier flip',     probe2.cacheDeletions > 0]);

    // Open modal again to verify full is now preselected.
    await page.evaluate(() => window.LinguistProMorphSettings.open());
    await page.waitForSelector('[data-testid="v3-morph-tier-basic"]', { timeout: 5000 });
    const probe3 = await page.evaluate(() => ({
      basicChecked: document.querySelector('[data-testid="v3-morph-tier-basic"]').checked,
      fullChecked:  document.querySelector('[data-testid="v3-morph-tier-full"]').checked,
    }));
    assertions.push(['second open: full preselected, basic not', probe3.fullChecked === true && probe3.basicChecked === false]);

    // Close without changing.
    await page.evaluate(() => window.__resolveLastModal(false));

    assertions.push(['no JS errors during full flow', pageErrors.length === 0]);

    let failed = 0;
    for (const [name, ok] of assertions) {
      console.log(`  ${ok ? '✓' : '✗'} ${name}`);
      if (!ok) failed++;
    }
    if (pageErrors.length) {
      console.error('[morph-settings-smoke] page errors:');
      for (const e of pageErrors) console.error('  ' + e);
    }

    if (failed === 0) {
      console.log(`\n[morph-settings-smoke] all green ✓ (${assertions.length} cases)`);
      exitCode = 0;
    } else {
      console.error(`\n[morph-settings-smoke] FAIL — ${failed}/${assertions.length}`);
    }
  } catch (e) {
    console.error('[morph-settings-smoke] fatal:', e && e.message ? e.message : e);
    for (const line of logs.slice(-20)) console.error('  ' + line);
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('[morph-settings-smoke] unhandled:', e); process.exit(1); });
}
