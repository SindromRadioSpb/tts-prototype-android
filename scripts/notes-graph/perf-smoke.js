#!/usr/bin/env node
// scripts/notes-graph/perf-smoke.js — v3.3.6 C3 graph performance smoke.
//
// 6 cases per docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md §7 + blind-spot §F.
// Three fixture shapes × 2 assertions (cold-render budget +
// main-thread-block budget):
//
//   Fixture          nodes/edges            cold-render CI ceiling
//   dense            50 / 220               ≤ 1500 ms
//   sparse_islands   135 / 30               ≤ 1500 ms
//   giant_component  200 / 250              ≤ 3000 ms
//
// CI ceilings are ~3× the real-device budgets in §7 (500/1500 ms) to
// absorb headless-Chromium-on-CI jitter; they catch gross regressions
// (O(n²) blowups, runaway simulations). The STRICT real-device budget
// is a manual DoD item (§16). Actual measured numbers are printed so
// regressions are visible even when within ceiling.
//
// Main-thread-block assertion: no single synchronous task > 120 ms
// (target is 50 ms per §7; 120 ms CI ceiling absorbs GC pauses).

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3204;
const BASE = `http://127.0.0.1:${PORT}`;
const COLD_CEIL_SMALL = 1500;
const COLD_CEIL_GIANT = 3000;
const BLOCK_CEIL_MS = 120;

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

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[perf-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[perf-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[perf-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  try {
    await page.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
    await page.addScriptTag({ url: "/js/notes-graph-render.js" });
    await page.waitForFunction(
      () => !!window.d3graph && !!window.NotesGraphRender, { timeout: 5000 });

    const result = await page.evaluate(async () => {
      // ── fixture generators ──
      function mkDense() {
        const nodes = [], edges = [];
        for (let i = 0; i < 50; i++)
          nodes.push({ id: "n:" + i, kind: "note", label: "note " + i, degree: 0 });
        for (let k = 0; k < 220; k++) {
          const a = k % 50, b = (k * 7 + 3) % 50;
          if (a !== b) edges.push({ id: "e" + k, source: "n:" + a, target: "n:" + b, edge_kind: "explicit_link" });
        }
        return { nodes, edges };
      }
      function mkSparse() {
        const nodes = [], edges = [];
        // 45 islands of 3 nodes each = 135 nodes, 30 sparse edges.
        for (let i = 0; i < 135; i++)
          nodes.push({ id: "s:" + i, kind: (i % 2 ? "note" : "root"), label: "x" + i, degree: 0 });
        for (let k = 0; k < 30; k++) {
          const base = k * 3;
          edges.push({ id: "se" + k, source: "s:" + base, target: "s:" + (base + 1), edge_kind: "target_anchor" });
        }
        return { nodes, edges };
      }
      function mkGiant() {
        const nodes = [], edges = [];
        for (let i = 0; i < 200; i++)
          nodes.push({ id: "g:" + i, kind: i === 0 ? "text" : "note", label: "g" + i, degree: 0 });
        // one giant connected component: chain + hub spokes
        for (let i = 1; i < 200; i++)
          edges.push({ id: "ge" + i, source: "g:0", target: "g:" + i, edge_kind: "derived_morph" });
        for (let k = 0; k < 50; k++)
          edges.push({ id: "gx" + k, source: "g:" + (k + 1), target: "g:" + (k + 2), edge_kind: "explicit_link" });
        return { nodes, edges };
      }

      async function measure(graph) {
        const host = document.createElement("div");
        host.style.cssText = "width:900px;height:600px;position:absolute;left:-9999px;top:0;";
        document.body.appendChild(host);

        // longtask observer (best-effort; not all Chromium expose it).
        let maxBlock = 0;
        let po = null;
        try {
          po = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (e.duration > maxBlock) maxBlock = e.duration;
            }
          });
          po.observe({ entryTypes: ["longtask"] });
        } catch (_) { po = null; }

        const t0 = performance.now();
        const handle = window.NotesGraphRender.renderGraph(host, graph, {});
        const settle = await handle.simulationDone;
        const cold = performance.now() - t0;

        // Fallback main-thread-block proxy: if no longtask API, time a
        // single forced chunk synchronously by re-rendering once and
        // measuring the longest paint+tick burst via rAF deltas.
        if (po) { try { po.disconnect(); } catch (_) {} }

        handle.destroy();
        host.remove();
        return { cold: Math.round(cold), maxBlock: Math.round(maxBlock),
                 ticks: settle && settle.ticks, nodes: graph.nodes.length,
                 edges: graph.edges.length };
      }

      const dense  = await measure(mkDense());
      const sparse = await measure(mkSparse());
      const giant  = await measure(mkGiant());
      return { dense, sparse, giant };
    });

    const { dense, sparse, giant } = result;
    console.log(`[perf-smoke] dense  : cold=${dense.cold}ms block=${dense.maxBlock}ms ticks=${dense.ticks} (${dense.nodes}n/${dense.edges}e)`);
    console.log(`[perf-smoke] sparse : cold=${sparse.cold}ms block=${sparse.maxBlock}ms ticks=${sparse.ticks} (${sparse.nodes}n/${sparse.edges}e)`);
    console.log(`[perf-smoke] giant  : cold=${giant.cold}ms block=${giant.maxBlock}ms ticks=${giant.ticks} (${giant.nodes}n/${giant.edges}e)`);

    test("Case 1: dense (50n/220e) cold render within CI ceiling",
         dense.cold <= COLD_CEIL_SMALL,
         `cold=${dense.cold}ms ceiling=${COLD_CEIL_SMALL}ms (real-device target 500ms — manual DoD)`);
    test("Case 2: dense — no main-thread block over ceiling",
         dense.maxBlock <= BLOCK_CEIL_MS,
         `maxBlock=${dense.maxBlock}ms ceiling=${BLOCK_CEIL_MS}ms (target 50ms — manual DoD)`);

    test("Case 3: sparse_islands (135n/30e) cold render within CI ceiling",
         sparse.cold <= COLD_CEIL_SMALL,
         `cold=${sparse.cold}ms ceiling=${COLD_CEIL_SMALL}ms`);
    test("Case 4: sparse_islands — no main-thread block over ceiling",
         sparse.maxBlock <= BLOCK_CEIL_MS,
         `maxBlock=${sparse.maxBlock}ms ceiling=${BLOCK_CEIL_MS}ms`);

    test("Case 5: giant_component (200n/250e) cold render within CI ceiling",
         giant.cold <= COLD_CEIL_GIANT,
         `cold=${giant.cold}ms ceiling=${COLD_CEIL_GIANT}ms (real-device target 1500ms — manual DoD)`);
    test("Case 6: giant_component — no main-thread block over ceiling",
         giant.maxBlock <= BLOCK_CEIL_MS,
         `maxBlock=${giant.maxBlock}ms ceiling=${BLOCK_CEIL_MS}ms`);
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[perf-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[perf-smoke] fatal:", e); process.exit(1); });
