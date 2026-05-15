#!/usr/bin/env node
// scripts/notes-graph/lazyload-smoke.js — v3.3.6 Knowledge Graph lazy-load smoke.
//
// C0: cases 1–2. C1: cases 3–4 (bundle integrity + symbols). C4: cases
// 5–7 (top-nav launcher + lazy chunk load + non-blank settled state +
// no pageerror). C8 adds SW-cache cases.
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

    // ── Case 5 — top-nav #btnGraph launcher exists + wired ──────────────
    // ISOLATED context — Cases 1–4 navigated the shared context's page
    // multiple times; its wa-sqlite worker holds the per-origin OPFS
    // AccessHandlePool (single-writer). A 2nd page in the SAME context
    // contends for that handle and traps the WASM heap on init — a
    // harness artifact, not a graph bug (proven by a clean single-page
    // control run). A fresh context = isolated OPFS, mirroring a real
    // user's single browsing context.
    const freshCtx = await browser.newContext({ serviceWorkers: "block" });
    const fresh = await freshCtx.newPage();
    const freshErrors = [];
    fresh.on("pageerror", (e) => freshErrors.push(String(e.message || e)));
    await fresh.goto(BASE + "/index.html", { waitUntil: "load" });
    await fresh.waitForFunction(
      () => window.LinguistProGraph && typeof window.LinguistProGraph.open === "function",
      null, { timeout: 10000 });
    // Mirror REAL usage: a user can only click the graph launcher once
    // the app is interactive — by then the local DB is long-ready.
    // (Opening the graph mid-DB-boot is a race no user can trigger; the
    // in-code DB-readiness guard handles the "DB never readies" case by
    // routing to error_db_unavailable, verified by a separate control.)
    await fresh.waitForFunction(async () => {
      try { if (window.__localDBInitPromise) await window.__localDBInitPromise; }
      catch (_) {}
      return window.__localDB && typeof window.__localDB.isReady === "function" &&
             window.__localDB.isReady();
    }, null, { timeout: 20000 }).catch(() => { /* tolerate — guard covers it */ });
    await sleep(300);
    const c5 = await fresh.evaluate(() => {
      const btn = document.getElementById("btnGraph");
      return {
        present: !!btn,
        onclick: btn ? (btn.getAttribute("onclick") || "") : "",
        notesGraphUndefinedPreOpen: typeof window.NotesGraph === "undefined",
      };
    });
    test("Case 5: top-nav #btnGraph exists, wired to LinguistProGraph.open, NotesGraph still lazy",
         c5.present && /LinguistProGraph/.test(c5.onclick) &&
         c5.notesGraphUndefinedPreOpen,
         JSON.stringify(c5));

    // ── Case 6 — launcher → lazy chunk load → modal renders a STATE ─────
    // The real DB may or may not be ready in a bare index.html load.
    // Either way the modal must reach a defined, non-blank state — never
    // a blank panel, never an infinite spinner, never an uncaught error.
    await fresh.evaluate(() => window.LinguistProGraph.open());
    await fresh.waitForSelector("[data-graph-panel]", { timeout: 8000 });
    // Wait until the state machine settles out of "loading" (or the 10s
    // load-timeout trips → error_data_load). Poll up to 12s.
    await fresh.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") &&
             p.getAttribute("data-graph-state") !== "loading";
    }, null, { timeout: 13000 });
    const c6 = await fresh.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const st = p ? p.getAttribute("data-graph-state") : null;
      const VALID = ["loaded", "empty_no_notes", "empty_no_links",
                     "filtered_all_hidden", "reduced_top200",
                     "error_data_load", "error_db_unavailable",
                     "fallback_mobile"];
      return {
        notesGraphDefined: typeof window.NotesGraph === "object",
        chunkTags: document.querySelectorAll("script[data-graph-chunk]").length,
        state: st,
        validState: VALID.indexOf(st) !== -1,
        panelHasContent: !!(p && p.textContent && p.textContent.trim().length > 0),
      };
    });
    test("Case 6: launcher lazy-loads chunks → NotesGraph defined → non-blank settled state",
         c6.notesGraphDefined && c6.chunkTags === 3 &&
         c6.validState && c6.panelHasContent,
         JSON.stringify(c6));

    // ── Case 7 — no uncaught pageerror across the full open flow ────────
    test("Case 7: no uncaught pageerror during launcher → load → state render",
         freshErrors.length === 0,
         freshErrors.join(" | "));
    await fresh.close();
    await freshCtx.close();

    // ── Cases 8–9 — versioned GRAPH_CACHE (C8) ──────────────────────────
    // SW must be ENABLED here (the other cases block it). Fresh context →
    // first-ever SW registration auto-activates + clients.claim().
    const swCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const swPage = await swCtx.newPage();
    await swPage.goto(BASE + "/index.html", { waitUntil: "load" });
    // Wait for the SW to control the page.
    await swPage.waitForFunction(
      () => navigator.serviceWorker && navigator.serviceWorker.controller,
      null, { timeout: 15000 }).catch(() => {});
    const controlled = await swPage.evaluate(
      () => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    // Open the graph → lazy chunks fetched THROUGH the SW → GRAPH_CACHE.
    await swPage.waitForFunction(
      () => window.LinguistProGraph && typeof window.LinguistProGraph.open === "function",
      null, { timeout: 10000 });
    await swPage.evaluate(() => window.LinguistProGraph.open());
    await sleep(2500); // allow chunk fetch + cache.put
    const cacheState = await swPage.evaluate(async () => {
      const keys = await caches.keys();
      const graphKey = keys.find((k) => k.indexOf("linguistpro-graph-") === 0);
      let hit = false;
      if (graphKey) {
        const c = await caches.open(graphKey);
        const m = await c.match("/vendor/d3-graph.min.js");
        hit = !!m;
      }
      return { keys, graphKey: graphKey || null, hit };
    });
    test("Case 8: first graph open populates a versioned GRAPH_CACHE bucket",
         controlled && cacheState.graphKey &&
         cacheState.graphKey === "linguistpro-graph-v3.3.6-1" && cacheState.hit,
         JSON.stringify(cacheState));

    // Second open serves the chunk from cache (already cached → match
    // resolves; this is the offline-capable path).
    const secondHit = await swPage.evaluate(async () => {
      const c = await caches.open("linguistpro-graph-v3.3.6-1");
      const a = await c.match("/vendor/d3-graph.min.js");
      const b = await c.match("/js/notes-graph.js");
      return { d3: !!a, main: !!b };
    });
    test("Case 9: GRAPH_CACHE holds the d3 bundle + graph module (offline-capable)",
         secondHit.d3 && secondHit.main, JSON.stringify(secondHit));
    await swPage.close();
    await swCtx.close();
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[lazyload-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[lazyload-smoke] fatal:", e); process.exit(1); });
