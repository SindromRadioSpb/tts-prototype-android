#!/usr/bin/env node
// scripts/notes-graph/lazyload-smoke.js — v3.3.6 Knowledge Graph lazy-load smoke.
//
// C0 scope: cases 1–2. C1 adds cases 3–4 (vendored bundle integrity +
// d3graph symbol surface). C4 expands further (launcher → chunk load,
// state machine). C8 adds SW-cache cases. This file grows across the
// patch sequence.
//
// Cases at C0:
//   1. Classic-view DOMContentLoaded is within baseline + 200 ms.
//      Baseline is captured ONCE into __fixtures__/lazyload-baseline.json
//      on first run (when the file is absent) and asserted against on
//      every subsequent run. The graph loader shim is a tiny eager
//      script that does nothing until open(); it must not regress
//      startup.
//   2. window.NotesGraph === undefined BEFORE any open() — proves the
//      heavy chunks (d3 + data + renderer) are NOT eagerly loaded.
//      window.LinguistProGraph DOES exist (the shim itself is eager).
//
// Exit 0 if all green, 1 otherwise.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_DIR = path.join(__dirname, "__fixtures__");
const BASELINE_PATH = path.join(FIXTURE_DIR, "lazyload-baseline.json");
const PORT = 3202;
const BASE = `http://127.0.0.1:${PORT}`;
const REGRESSION_BUDGET_MS = 200;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
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
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

async function measureDomContentLoaded(page) {
  // navigationStart → domContentLoadedEventEnd, averaged over 3 loads
  // to absorb cold-cache jitter.
  const samples = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    const dcl = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) return Math.round(nav.domContentLoadedEventEnd - nav.startTime);
      // Legacy fallback.
      const t = performance.timing;
      return t.domContentLoadedEventEnd - t.navigationStart;
    });
    samples.push(dcl);
    await sleep(150);
  }
  samples.sort((a, b) => a - b);
  return samples[1]; // median of 3
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[lazyload-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[lazyload-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[lazyload-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  try {
    const dcl = await measureDomContentLoaded(page);
    console.log(`[lazyload-smoke] measured DOMContentLoaded median = ${dcl} ms`);

    // ── Case 1 — classic startup not regressed ──────────────────────────
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    let baseline = null;
    if (fs.existsSync(BASELINE_PATH)) {
      try { baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")); }
      catch (_) { baseline = null; }
    }
    if (!baseline || typeof baseline.domContentLoadedMs !== "number") {
      // First run after C0: capture the baseline. This run trivially
      // passes case 1 (it IS the baseline); subsequent runs assert
      // against it. The captured value already includes the loader
      // shim, so regression is measured against "shim present" — any
      // future graph chunk accidentally going eager would blow the
      // +200 ms budget vs this captured baseline.
      baseline = {
        domContentLoadedMs: dcl,
        capturedAt: new Date().toISOString(),
        note: "Captured at v3.3.6 C0 with notes-graph-loader.js shim present. " +
              "Regression budget = +" + REGRESSION_BUDGET_MS + " ms vs this value.",
      };
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
      test("Case 1: classic DOMContentLoaded baseline captured (first run)",
           true,
           `baseline=${dcl} ms written to ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    } else {
      const delta = dcl - baseline.domContentLoadedMs;
      test(`Case 1: classic DOMContentLoaded within baseline + ${REGRESSION_BUDGET_MS} ms`,
           delta <= REGRESSION_BUDGET_MS,
           `measured=${dcl} ms, baseline=${baseline.domContentLoadedMs} ms, delta=${delta} ms`);
    }

    // ── Case 2 — heavy chunks NOT eager; shim IS eager ──────────────────
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(400); // let any deferred eager work settle
    const c2 = await page.evaluate(() => {
      return {
        shimPresent: typeof window.LinguistProGraph === "object" &&
                     typeof window.LinguistProGraph.open === "function",
        notesGraphUndefined: typeof window.NotesGraph === "undefined",
        d3Undefined: typeof window.d3 === "undefined" ||
                     typeof window.d3.forceSimulation === "undefined",
        chunkScriptsAbsent:
          document.querySelectorAll('script[data-graph-chunk]').length === 0,
        chunkManifest: (window.LinguistProGraph && window.LinguistProGraph._chunks) || null,
      };
    });
    test("Case 2: shim eager, heavy chunks lazy (NotesGraph + d3 undefined, no chunk <script> tags)",
         c2.shimPresent &&
         c2.notesGraphUndefined &&
         c2.d3Undefined &&
         c2.chunkScriptsAbsent &&
         Array.isArray(c2.chunkManifest) && c2.chunkManifest.length === 3,
         JSON.stringify(c2));

    // ── Case 3 — vendored d3 bundle integrity (sha256 vs README) ────────
    const readmePath = path.join(REPO_ROOT, "public/vendor/README.md");
    const bundlePath = path.join(REPO_ROOT, "public/vendor/d3-graph.min.js");
    let shaOk = false, shaDetail = "";
    try {
      const crypto = require("crypto");
      const bundleSha = crypto.createHash("sha256")
        .update(fs.readFileSync(bundlePath)).digest("hex");
      const readme = fs.readFileSync(readmePath, "utf8");
      const m = readme.match(/d3-graph\.min\.js\s+sha256:([0-9a-f]{64})/);
      const declared = m ? m[1] : null;
      shaOk = !!declared && declared === bundleSha;
      shaDetail = `served=${bundleSha.slice(0, 16)}… declared=${declared ? declared.slice(0, 16) + "…" : "MISSING"}`;
    } catch (e) {
      shaDetail = "error: " + e.message;
    }
    test("Case 3: vendored d3-graph.min.js sha256 matches README declaration",
         shaOk, shaDetail);

    // ── Case 4 — bundle exposes the required d3graph symbols ────────────
    await page.evaluate(() => window.LinguistProGraph && true);
    await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
    const c4 = await page.evaluate(() => {
      const g = window.d3graph || {};
      const fns = ["forceSimulation", "forceManyBody", "forceLink",
                   "forceCenter", "forceCollide", "forceX", "forceY",
                   "zoom", "zoomTransform", "select", "selectAll"];
      const allFns = fns.every((k) => typeof g[k] === "function");
      const zoomIdent = g.zoomIdentity && typeof g.zoomIdentity === "object" &&
                        g.zoomIdentity.k === 1;
      return { allFns, zoomIdent, present: typeof window.d3graph === "object" };
    });
    test("Case 4: /vendor/d3-graph.min.js exposes window.d3graph with 11 fns + zoomIdentity",
         c4.present && c4.allFns && c4.zoomIdent, JSON.stringify(c4));
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[lazyload-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[lazyload-smoke] fatal:", e); process.exit(1); });
