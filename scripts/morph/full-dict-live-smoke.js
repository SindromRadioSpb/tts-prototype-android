#!/usr/bin/env node
// scripts/morph/full-dict-live-smoke.js — Workstream A1 Phase 2 live
// integration smoke. Verifies the END-TO-END full-tier path:
//   1. The .bin.gz file is committed and served by the dev server.
//   2. The DecompressionStream-based decode in morph-provider.js works.
//   3. The decompressed JSON parses, populates the in-memory Map.
//   4. Sample lookups return real analyses.
//
// Pre-requisite: `npm run build:morphology:full` must have produced
//   public/morph/heb_morphology_full.bin.gz (committed) and
//   public/morph/heb_morphology_full.meta.json.
//
// If the .bin.gz file is absent (e.g. fresh checkout without the prebuilt
// artifact), the smoke skips with exit 0 + a clear message. CI scenarios
// that DO have the file run all assertions.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3197;
const FULL_BIN_GZ = path.join(REPO_ROOT, "public/morph/heb_morphology_full.bin.gz");
const FULL_META   = path.join(REPO_ROOT, "public/morph/heb_morphology_full.meta.json");

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
  if (!fs.existsSync(FULL_BIN_GZ) || !fs.existsSync(FULL_META)) {
    console.log("[full-dict-live] SKIP — full-tier artifact not built");
    console.log("  expected: " + path.relative(REPO_ROOT, FULL_BIN_GZ));
    console.log("  expected: " + path.relative(REPO_ROOT, FULL_META));
    console.log("  rebuild via: MORPH_WORDLIST=<wordlist> npm run build:morphology:full");
    process.exit(0); // soft skip on missing artifact (fresh checkout case)
  }

  const meta = JSON.parse(fs.readFileSync(FULL_META, "utf8"));
  const stat = fs.statSync(FULL_BIN_GZ);
  console.log(`[full-dict-live] artifact: ${path.relative(REPO_ROOT, FULL_BIN_GZ)}`);
  console.log(`  ${meta.entry_count.toLocaleString()} entries · ${meta.analysis_count.toLocaleString()} analyses`);
  console.log(`  ${(stat.size / 1024 / 1024).toFixed(2)} MB gzipped · tier=${meta.tier}`);

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const { child, logs } = startServer(PORT);
  let exitCode = 1;

  let playwright;
  try { playwright = require("playwright"); }
  catch (_) {
    console.error("[full-dict-live] playwright not installed");
    await stopServer(child);
    process.exit(1);
  }

  let browser;
  try {
    const ready = await waitForReady(baseUrl);
    if (!ready) throw new Error("server did not become ready in 15s");
    console.log("[full-dict-live] server up");

    browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    await page.goto(`${baseUrl}/morph-tier-test.html`, { waitUntil: "domcontentloaded" });

    // Pre-set full tier in localStorage BEFORE loading morph-provider so the
    // first ensureReady() goes to the full tier directly. Load the REAL
    // morph-normalize.js (not a stub) — dict keys are normalized via the
    // same invariant, so lookups must use the same normalizer or they miss.
    await page.addScriptTag({ content: `
      try { localStorage.setItem('morphDictTier_v1', 'full'); } catch (_) {}
    `});
    await page.addScriptTag({ url: `/js/morph-normalize.js` });
    await page.addScriptTag({ url: `/js/morph-provider.js` });
    await page.waitForFunction(() => !!window.MorphProvider, { timeout: 5000 });

    // Trigger fetch + decompress + parse. Live network — should succeed.
    const result = await page.evaluate(async () => {
      const t0 = performance.now();
      try { await window.MorphProvider.ensureReady(); }
      catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
      const elapsedMs = Math.round(performance.now() - t0);
      const status = window.MorphProvider.getStatus();
      // Try a known Hebrew query — pick a common verb stem that should
      // exist in any Hebrew morphological dict. שלום (shalom) is universal.
      let lookupResult = null;
      try { lookupResult = await window.MorphProvider.analyze('שלום'); } catch (_) {}
      return {
        ok: status.tier1.state === 'ready',
        elapsedMs,
        loadedTier: status.tier1.loadedTier,
        entries: status.tier1.entries,
        analyses: status.tier1.analysisCount || 0,
        sizeBytes: status.tier1.sizeBytes,
        sample: lookupResult ? lookupResult.length : 0,
        sampleFirst: lookupResult && lookupResult[0] ? lookupResult[0] : null,
      };
    });

    if (!result.ok) {
      console.error(`[full-dict-live] FATAL — provider failed to ready: ${result.error || '?'}`);
      throw new Error(result.error || 'provider not ready');
    }

    console.log(`\n[full-dict-live] runtime:`);
    console.log(`  loadedTier:    ${result.loadedTier}`);
    console.log(`  entries:       ${result.entries.toLocaleString()}`);
    console.log(`  size (decompressed text): ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  fetch+decode:  ${result.elapsedMs} ms`);
    console.log(`  sample 'שלום' analyses: ${result.sample}`);
    if (result.sampleFirst) {
      console.log(`    first: ${JSON.stringify(result.sampleFirst).slice(0, 140)}…`);
    }

    const assertions = [
      ['loadedTier is "full"',                       result.loadedTier === 'full'],
      ['entry_count >= 250000 (Phase 2 target)',    result.entries >= 250000],
      ['entry_count matches meta',                   result.entries === meta.entry_count],
      ['decompressed size > 50 MB (sanity check)',  result.sizeBytes > 50 * 1024 * 1024],
      ['sample lookup returned at least 1 result',  result.sample >= 1],
      ['no page errors during fetch+decompress',    pageErrors.length === 0],
    ];

    let failed = 0;
    for (const [name, ok] of assertions) {
      console.log(`  ${ok ? '✓' : '✗'} ${name}`);
      if (!ok) failed++;
    }
    if (pageErrors.length) {
      console.error('[full-dict-live] page errors:');
      for (const e of pageErrors) console.error('  ' + e);
    }

    if (failed === 0) {
      console.log(`\n[full-dict-live] all green ✓ (${assertions.length} cases)`);
      exitCode = 0;
    } else {
      console.error(`\n[full-dict-live] FAIL — ${failed}/${assertions.length}`);
    }
  } catch (e) {
    console.error('[full-dict-live] fatal:', e && e.message ? e.message : e);
    for (const line of logs.slice(-20)) console.error('  ' + line);
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('[full-dict-live] unhandled:', e); process.exit(1); });
}
