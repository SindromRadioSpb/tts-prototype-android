#!/usr/bin/env node
// scripts/notes-graph/mobile-fallback-smoke.js — v3.3.6 C6 smoke.
//
// 5 cases per docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md §13 + blind-spot §B:
//   1. Mobile viewport (414×896 portrait) → fallback_mobile state:
//      NO [data-graph-canvas], YES [data-graph-cluster-list].
//   2. Cluster cards carry structure: toggle button (dominant-kind
//      label + member/edge count) + collapsed body + open action.
//   3. Search input filters clusters (count updates, list shrinks).
//   4. Expanding a card renders a mini force graph (svg) inside it.
//   5. Threshold gate works both ways: desktop landscape viewport →
//      `loaded` with canvas (NOT fallback).
//   + bonus: no pageerror.
//
// Mocked ready local-DB fixture → buildGraph yields multiple clusters.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3206;
const BASE = `http://127.0.0.1:${PORT}`;

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

const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__navCalls = [];
  window.v3LibraryOpenText = function (id) { window.__navCalls.push("text:" + id); };
  window.v3OpenNoteById = function (id) { window.__navCalls.push("note:" + id); };
  window.__localDB = {
    isReady: function () { return true; },
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) return [
        // cluster A — around text t1
        { id:"a1", title:"A one",  target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:00:00Z" },
        { id:"a2", title:"A two",  target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:01:00Z" },
        { id:"a3", title:"A three",target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:02:00Z" },
        // cluster B — around root כתב
        { id:"b1", title:"B one",  target_kind:"free", target_id:null, text_id:"t2", note_type:"word_study", j_root:"כתב",j_binyan:null,j_word:"כתב", updated_at:"2026-05-15T00:03:00Z" },
        { id:"b2", title:"B two",  target_kind:"free", target_id:null, text_id:"t2", note_type:"word_study", j_root:"כתב",j_binyan:null,j_word:"כתבה", updated_at:"2026-05-15T00:04:00Z" },
        // cluster C — isolated pair (zebra search token)
        { id:"c1", title:"Zebra note", target_kind:"text", target_id:"t3", text_id:"t3", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:05:00Z" }
      ];
      if (/FROM note_links/i.test(sql)) return [
        { from_note_id:"a1", to_kind:"note", to_id:"a2", link_alias:null },
        { from_note_id:"a2", to_kind:"note", to_id:"a3", link_alias:null },
        { from_note_id:"b1", to_kind:"note", to_id:"b2", link_alias:null }
      ];
      if (/FROM texts/i.test(sql)) return [
        { id:"t1", title:"Text One" }, { id:"t2", title:"Text Two" }, { id:"t3", title:"Text Three" }
      ];
      return [];
    },
  };
  window.MorphNormalize = { normalizeHebrew: function (w) { return String(w||"").trim(); } };
  window.MorphProvider = { ensureReady: async function(){}, analyze: async function(){ return []; } };
`;

async function loadGraphLibs(page) {
  await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
  await page.addScriptTag({ url: "/js/notes-graph-render.js" });
  await page.addScriptTag({ url: "/js/notes-graph.js" });
  await page.waitForFunction(
    () => !!window.NotesGraph && !!window.NotesGraphRender, null, { timeout: 5000 });
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[mobile-fallback-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[mobile-fallback-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[mobile-fallback-smoke] server up");

  const browser = await playwright.chromium.launch();
  const pageErrors = [];

  try {
    // ── Mobile context (414×896 portrait → fallback_mobile) ────────────
    const mctx = await browser.newContext({
      serviceWorkers: "block", viewport: { width: 414, height: 896 },
    });
    const mp = await mctx.newPage();
    mp.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
    await mp.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await mp.addScriptTag({ content: MOCK_DB });
    await loadGraphLibs(mp);
    await mp.evaluate(() => window.NotesGraph.open());
    await mp.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "fallback_mobile";
    }, null, { timeout: 8000 });
    await sleep(300);

    const c1 = await mp.evaluate(() => ({
      state: document.querySelector("[data-graph-panel]").getAttribute("data-graph-state"),
      hasCanvas: !!document.querySelector("[data-graph-canvas]"),
      hasClusterList: !!document.querySelector("[data-graph-cluster-list]"),
      cards: document.querySelectorAll("[data-graph-cluster-card]").length,
    }));
    test("Case 1: mobile viewport → fallback_mobile (no canvas, cluster list present)",
         c1.state === "fallback_mobile" && !c1.hasCanvas &&
         c1.hasClusterList && c1.cards >= 2, JSON.stringify(c1));

    const c2 = await mp.evaluate(() => {
      const card = document.querySelector("[data-graph-cluster-card]");
      if (!card) return { ok: false };
      const toggle = card.querySelector("[data-cluster-toggle]");
      const body = card.querySelector("[data-cluster-body]");
      const openBtn = card.querySelector("[data-cluster-open]");
      return {
        ok: true,
        hasToggle: !!toggle,
        toggleHasText: toggle && toggle.textContent.trim().length > 0,
        bodyCollapsed: body && body.hasAttribute("hidden"),
        ariaExpanded: toggle && toggle.getAttribute("aria-expanded") === "false",
        hasOpenBtn: !!openBtn,
      };
    });
    test("Case 2: cluster card structure (toggle+label+counts, collapsed body, open action)",
         c2.ok && c2.hasToggle && c2.toggleHasText && c2.bodyCollapsed &&
         c2.ariaExpanded && c2.hasOpenBtn, JSON.stringify(c2));

    // Case 3 — search filters clusters.
    const before = await mp.evaluate(() =>
      document.querySelectorAll("[data-graph-cluster-card]").length);
    await mp.fill("[data-graph-cluster-search]", "zebra");
    await sleep(320);
    const c3 = await mp.evaluate(() => ({
      after: document.querySelectorAll("[data-graph-cluster-card]").length,
      countText: document.querySelector("[data-graph-cluster-count]").textContent,
    }));
    test("Case 3: search filters clusters (zebra → fewer cards, count updates)",
         c3.after >= 1 && c3.after < before, `before=${before} after=${c3.after}`);
    await mp.fill("[data-graph-cluster-search]", "");
    await sleep(320);

    // Case 4 — expand renders a mini force graph inside the card.
    const c4 = await mp.evaluate(async () => {
      const toggle = document.querySelector("[data-cluster-toggle]");
      const cid = toggle.getAttribute("data-cluster-toggle");
      toggle.click();
      await new Promise((r) => setTimeout(r, 600));
      const body = document.querySelector(`[data-cluster-body="${CSS.escape(cid)}"]`);
      const mini = document.querySelector(`[data-cluster-mini="${CSS.escape(cid)}"]`);
      return {
        bodyOpen: body && !body.hasAttribute("hidden"),
        ariaExpanded: toggle.getAttribute("aria-expanded") === "true",
        miniHasSvg: !!(mini && mini.querySelector("svg[data-graph-svg]")),
        miniNodes: mini ? mini.querySelectorAll("[data-graph-node]").length : 0,
      };
    });
    test("Case 4: expanding a cluster card renders a mini force graph (svg + nodes)",
         c4.bodyOpen && c4.ariaExpanded && c4.miniHasSvg && c4.miniNodes > 0,
         JSON.stringify(c4));
    await mp.close();
    await mctx.close();

    // ── Case 5 — desktop landscape → loaded with canvas (gate both ways)
    const dctx = await browser.newContext({
      serviceWorkers: "block", viewport: { width: 1280, height: 720 },
    });
    const dp = await dctx.newPage();
    dp.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
    await dp.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await dp.addScriptTag({ content: MOCK_DB });
    await loadGraphLibs(dp);
    await dp.evaluate(() => window.NotesGraph.open());
    await dp.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 });
    await sleep(400);
    const c5 = await dp.evaluate(() => ({
      state: document.querySelector("[data-graph-panel]").getAttribute("data-graph-state"),
      hasCanvas: !!document.querySelector("[data-graph-canvas]"),
      hasClusterList: !!document.querySelector("[data-graph-cluster-list]"),
    }));
    test("Case 5: desktop landscape → loaded with canvas (threshold gate both ways)",
         c5.state === "loaded" && c5.hasCanvas && !c5.hasClusterList,
         JSON.stringify(c5));
    await dp.close();
    await dctx.close();

    if (pageErrors.length) {
      failed++;
      console.log("  ✗ Bonus: pageerror — " + pageErrors.join(" | "));
    } else {
      console.log("  · (bonus) no pageerror across mobile+desktop flows");
    }
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[mobile-fallback-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[mobile-fallback-smoke] fatal:", e); process.exit(1); });
