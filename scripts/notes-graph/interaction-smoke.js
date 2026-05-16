#!/usr/bin/env node
// scripts/notes-graph/interaction-smoke.js — v3.3.6 graph interaction
// hardening (drag-bug fix).
//
// Pins the fix for "nodes move unpredictably":
//   1. Pan does NOT start on a node (d3-zoom .filter): dragging a node
//      leaves the zoom-layer transform unchanged (no canvas pan).
//   2. Dragging a node past the threshold moves THAT node (its <g>
//      transform changes) and marks it data-pinned on release.
//   3. A short tap (< threshold) navigates (onNodeActivate) and does
//      NOT pin.
//   4. A real drag suppresses the trailing click (no double-navigate).
//   5. Double-click unpins (data-pinned removed).
//   6. Pan DOES work when the gesture starts on empty canvas
//      (zoom-layer transform changes).
//
// Mocked ready-DB harness (same as render-a11y / mobile smokes).

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3211;
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

const MOCK = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__nav = [];
  window.v3OpenNoteById = function (id) { window.__nav.push("note:" + id); };
  window.v3LibraryOpenText = function (id) { window.__nav.push("text:" + id); };
  window.__localDB = {
    isReady: function(){ return true; },
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"n1", title:"Alpha", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:00:00Z" },
        { id:"n2", title:"Beta",  target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:01:00Z" },
        { id:"n3", title:"Gamma", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:02:00Z" },
        { id:"n4", title:"Delta", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:03:00Z" }
      ];
      if (/FROM note_links/i.test(sql)) return [
        { from_note_id:"n1", to_kind:"note", to_id:"n2", link_alias:null },
        { from_note_id:"n2", to_kind:"note", to_id:"n3", link_alias:null },
        { from_note_id:"n3", to_kind:"note", to_id:"n4", link_alias:null }
      ];
      if (/FROM texts/i.test(sql)) return [{ id:"t1", title:"Text One" }];
      return [];
    },
  };
  window.MorphNormalize = { normalizeHebrew:function(w){return String(w||"").trim();} };
  window.MorphProvider = { ensureReady: async function(){}, analyze: async function(){ return []; } };
`;

function zoomXform(page) {
  return page.evaluate(() => {
    const z = document.querySelector("[data-graph-zoom-layer]");
    return z ? (z.getAttribute("transform") || "") : null;
  });
}
function nodeBox(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: el.getAttribute("data-node-id") };
  }, sel);
}

async function settle(page) {
  await page.waitForFunction(() => {
    const p = document.querySelector("[data-graph-panel]");
    return p && p.getAttribute("data-graph-state") === "loaded";
  }, null, { timeout: 9000 });
  await sleep(1600); // force layout settles
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[interaction-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[interaction-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[interaction-smoke] server up");

  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({
    serviceWorkers: "block", viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: MOCK });
    await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
    await page.addScriptTag({ url: "/js/notes-graph-render.js" });
    await page.addScriptTag({ url: "/js/notes-graph.js" });
    await page.waitForFunction(() => !!window.NotesGraph, null, { timeout: 5000 });
    await page.evaluate(() => window.NotesGraph.open());
    await settle(page);

    // ── Case 1 — dragging a node does NOT pan the canvas ────────────────
    const zoomBefore = await zoomXform(page);
    let nb = await nodeBox(page, "[data-graph-node]");
    await page.mouse.move(nb.x, nb.y);
    await page.mouse.down();
    await page.mouse.move(nb.x + 70, nb.y + 50, { steps: 8 });
    await page.mouse.up();
    await sleep(300);
    const zoomAfter = await zoomXform(page);
    test("Case 1: dragging a node does NOT pan the canvas (zoom-layer transform unchanged)",
         zoomBefore != null && zoomBefore === zoomAfter,
         `before=${zoomBefore} after=${zoomAfter}`);

    // ── Case 2 — the dragged node moved + is pinned ─────────────────────
    const c2 = await page.evaluate((id) => {
      const el = document.querySelector(`[data-node-id="${id}"]`);
      return el ? { pinned: el.getAttribute("data-pinned") === "1",
                    xform: el.getAttribute("transform") || "" } : null;
    }, nb.id);
    test("Case 2: dragged node is pinned (data-pinned) and has a transform",
         c2 && c2.pinned && /translate/.test(c2.xform), JSON.stringify(c2));

    // ── Case 3 — a short tap navigates (no pin) ─────────────────────────
    await page.evaluate(() => { window.__nav = []; });
    const tapNode = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("[data-graph-node]"));
      const fresh = els.find((e) => e.getAttribute("data-pinned") !== "1");
      if (!fresh) return null;
      const r = fresh.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: fresh.getAttribute("data-node-id") };
    });
    await page.mouse.move(tapNode.x, tapNode.y);
    await page.mouse.down();
    await page.mouse.up(); // no movement → tap (navigate is delayed 250 ms)
    await sleep(450);      // > the 250 ms tap-delay so the timer fires
    const c3 = await page.evaluate((id) => ({
      nav: window.__nav.slice(),
      pinned: (document.querySelector(`[data-node-id="${id}"]`) || {}).getAttribute
        ? document.querySelector(`[data-node-id="${id}"]`).getAttribute("data-pinned") === "1"
        : false,
      modalGone: !document.querySelector("[data-graph-panel]"),
    }), tapNode.id);
    test("Case 3: a short tap navigates (onNodeActivate) and does NOT pin",
         (c3.nav.length > 0 || c3.modalGone) && !c3.pinned, JSON.stringify(c3));

    // Re-open if the tap navigated/closed the modal.
    const stillOpen = await page.evaluate(() => !!document.querySelector("[data-graph-panel]"));
    if (!stillOpen) {
      await page.evaluate(() => {
        const ov = document.querySelector("[data-graph-overlay]");
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        window.__nav = [];
        window.NotesGraph.open();
      });
      await settle(page);
    }

    // ── Case 4 — a real drag suppresses the trailing click ──────────────
    await page.evaluate(() => { window.__nav = []; });
    const dn = await page.evaluate(() => {
      const e = document.querySelector("[data-graph-node]");
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: e.getAttribute("data-node-id") };
    });
    await page.mouse.move(dn.x, dn.y);
    await page.mouse.down();
    await page.mouse.move(dn.x + 80, dn.y + 30, { steps: 10 });
    await page.mouse.up();
    await sleep(450); // longer than the tap-delay; a drag must NOT navigate
    const c4 = await page.evaluate(() => window.__nav.slice());
    test("Case 4: a real drag does NOT navigate (post-drag click suppressed)",
         c4.length === 0, JSON.stringify(c4));

    // ── Case 5 — double-click unpins (and does NOT navigate) ────────────
    const pinnedSel = `[data-node-id="${dn.id}"]`;
    const probe = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { pinned: e.getAttribute("data-pinned") === "1",
               x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, pinnedSel);
    if (!probe) {
      failed++;
      console.log("  ✗ Case 5: pinned node missing before dbl-click (modal closed?)");
    } else {
      await page.evaluate(() => { window.__nav = []; });
      await page.mouse.dblclick(probe.x, probe.y);
      await sleep(500); // past the tap-delay; dbl-click must cancel it
      const c5 = await page.evaluate((s) => {
        const e = document.querySelector(s);
        return { unpinned: e ? !e.hasAttribute("data-pinned") : false,
                 nav: window.__nav.slice() };
      }, pinnedSel);
      test("Case 5: double-click unpins (data-pinned removed) and does NOT navigate",
           probe.pinned && c5.unpinned && c5.nav.length === 0,
           `wasPinned=${probe.pinned} ` + JSON.stringify(c5));
    }

    // ── Case 6 — pan DOES work from empty canvas ────────────────────────
    const zb = await zoomXform(page);
    const svgBox = await page.evaluate(() => {
      const s = document.querySelector("[data-graph-svg]");
      const r = s.getBoundingClientRect();
      // a corner far from any node
      return { x: r.x + 14, y: r.y + 14 };
    });
    await page.mouse.move(svgBox.x, svgBox.y);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 90, svgBox.y + 60, { steps: 8 });
    await page.mouse.up();
    await sleep(250);
    const za = await zoomXform(page);
    test("Case 6: pan from empty canvas DOES move the zoom-layer transform",
         zb != null && za != null && zb !== za, `before=${zb} after=${za}`);

    test("Case 7: no pageerror during interaction",
         errs.length === 0, errs.join(" | "));
  } finally {
    await ctx.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[interaction-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[interaction-smoke] fatal:", e); process.exit(1); });
