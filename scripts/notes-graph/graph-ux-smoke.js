#!/usr/bin/env node
// scripts/notes-graph/graph-ux-smoke.js — v3.3.7 Tier-1 UX uplift.
//
// Pins U1–U4 (docs/PHASE_PLAN_v3_3_7_GRAPH_UX.md):
//   1. Detail panel: empty initially; on node focus shows
//      kind/label/degree (role=status aria-live=polite present).
//   2. Neighbour highlight: focusing a node dims a non-neighbour
//      (opacity < 1); blur restores full opacity.
//   3. Pinned badge: a real drag adds the 📌 badge + data-pinned;
//      double-click removes both.
//   4. Zoom controls: ＋ raises the zoom-layer scale, − lowers it,
//      ⤢ refits (scale returns toward the fitted value).
//   + no pageerror.
//
// Mocked ready-DB harness (same as interaction/render-a11y smokes).

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3212;
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
  window.v3OpenNoteById=function(){}; window.v3LibraryOpenText=function(){};
  window.__localDB = {
    isReady:function(){return true;},
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"n1", title:"Hub note", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:00:00Z" },
        { id:"n2", title:"Leaf B", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:01:00Z" },
        { id:"n3", title:"Leaf C", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:02:00Z" },
        { id:"n4", title:"Far D",  target_kind:"free", target_id:null, text_id:"t2", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:03:00Z" },
        { id:"n5", title:"Far E",  target_kind:"free", target_id:null, text_id:"t2", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:04:00Z" }
      ];
      if (/FROM note_links/i.test(sql)) return [
        { from_note_id:"n1", to_kind:"note", to_id:"n2", link_alias:null },
        { from_note_id:"n1", to_kind:"note", to_id:"n3", link_alias:null },
        { from_note_id:"n4", to_kind:"note", to_id:"n5", link_alias:null }
      ];
      if (/FROM texts/i.test(sql)) return [{ id:"t1", title:"Text One" }, { id:"t2", title:"Text Two" }];
      return [];
    },
  };
  window.MorphNormalize = { normalizeHebrew:function(w){return String(w||"").trim();} };
  window.MorphProvider = { ensureReady: async function(){}, analyze: async function(){ return []; } };
`;

async function settle(page) {
  await page.waitForFunction(() => {
    const p = document.querySelector("[data-graph-panel]");
    return p && p.getAttribute("data-graph-state") === "loaded";
  }, null, { timeout: 9000 });
  await sleep(1600);
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[graph-ux-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[graph-ux-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[graph-ux-smoke] server up");

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

    // ── Case 1 — detail panel ───────────────────────────────────────────
    const d0 = await page.evaluate(() => {
      const r = document.querySelector("[data-graph-detail]");
      return r ? { role: r.getAttribute("role"), live: r.getAttribute("aria-live"),
                   empty: !!r.querySelector("[data-graph-detail-empty]") } : null;
    });
    // focus the hub node (n1 — degree 2)
    await page.evaluate(() => {
      const el = document.querySelector('[data-node-id="note:n1"]');
      if (el) el.focus();
    });
    await sleep(150);
    const d1 = await page.evaluate(() => {
      const r = document.querySelector("[data-graph-detail]");
      const node = r && r.querySelector("[data-graph-detail-node]");
      return { hasNode: !!node, text: node ? node.textContent : "",
               forId: node ? node.getAttribute("data-graph-detail-node") : null };
    });
    test("Case 1: detail panel role=status/aria-live, empty→filled on focus with degree",
         d0 && d0.role === "status" && d0.live === "polite" && d0.empty &&
         d1.hasNode && d1.forId === "note:n1" && /Hub note/.test(d1.text) &&
         /2/.test(d1.text),
         JSON.stringify({ d0, d1: { forId: d1.forId } }));

    // ── Case 2 — neighbour highlight ────────────────────────────────────
    const c2focus = await page.evaluate(() => {
      const el = document.querySelector('[data-node-id="note:n1"]');
      el.focus();
      // n4 is in a different component → must be dimmed.
      const far = document.querySelector('[data-node-id="note:n4"]');
      const self = document.querySelector('[data-node-id="note:n1"]');
      return {
        farOpacity: far ? (far.style.opacity || "1") : null,
        selfOpacity: self ? (self.style.opacity || "1") : null,
      };
    });
    await page.evaluate(() => document.querySelector('[data-node-id="note:n1"]').blur());
    await sleep(120);
    const c2blur = await page.evaluate(() => {
      const far = document.querySelector('[data-node-id="note:n4"]');
      return far ? (far.style.opacity || "1") : null;
    });
    test("Case 2: focus dims a non-neighbour; blur restores full opacity",
         parseFloat(c2focus.farOpacity) < 1 &&
         parseFloat(c2focus.selfOpacity) === 1 &&
         (c2blur === "1" || parseFloat(c2blur) === 1),
         JSON.stringify({ c2focus, c2blur }));

    // ── Case 3 — pinned badge via drag, removed via dbl-click ───────────
    const box = await page.evaluate(() => {
      const e = document.querySelector('[data-node-id="note:n2"]');
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 40, { steps: 8 });
    await page.mouse.up();
    await sleep(300);
    const pinned = await page.evaluate(() => {
      const e = document.querySelector('[data-node-id="note:n2"]');
      return { dp: e.getAttribute("data-pinned") === "1",
               badge: !!e.querySelector("[data-pin-badge]") };
    });
    const pb = await page.evaluate(() => {
      const e = document.querySelector('[data-node-id="note:n2"]');
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.dblclick(pb.x, pb.y);
    await sleep(500);
    const unpinned = await page.evaluate(() => {
      const e = document.querySelector('[data-node-id="note:n2"]');
      return { dp: e.hasAttribute("data-pinned"),
               badge: !!e.querySelector("[data-pin-badge]") };
    });
    test("Case 3: drag adds 📌 badge + data-pinned; dbl-click removes both",
         pinned.dp && pinned.badge && !unpinned.dp && !unpinned.badge,
         JSON.stringify({ pinned, unpinned }));

    // ── Case 4 — zoom controls ──────────────────────────────────────────
    const scaleOf = () => page.evaluate(() => {
      const z = document.querySelector("[data-graph-zoom-layer]");
      const m = z && /scale\(([0-9.]+)\)/.exec(z.getAttribute("transform") || "");
      return m ? parseFloat(m[1]) : null;
    });
    const s0 = await scaleOf();
    await page.click("[data-graph-zoomin]");
    await sleep(120);
    const s1 = await scaleOf();
    await page.click("[data-graph-zoomout]");
    await page.click("[data-graph-zoomout]");
    await sleep(120);
    const s2 = await scaleOf();
    await page.click("[data-graph-fit]");
    await sleep(120);
    const s3 = await scaleOf();
    test("Case 4: ＋ raises scale, − lowers it, ⤢ refits",
         s0 != null && s1 > s0 && s2 < s1 && s3 != null,
         JSON.stringify({ s0, s1, s2, s3 }));

    test("Case 5: no pageerror during UX flow",
         errs.length === 0, errs.join(" | "));
  } finally {
    await ctx.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[graph-ux-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[graph-ux-smoke] fatal:", e); process.exit(1); });
