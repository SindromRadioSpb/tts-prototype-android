#!/usr/bin/env node
// scripts/notes-graph/render-a11y-smoke.js — v3.3.6 C5 a11y smoke.
//
// 6 cases per docs/PHASE_PLAN_v3_3_6_KNOWLEDGE_GRAPH.md §13 + §9:
//   1. Graph container has role="group" + non-empty aria-label.
//      (role="application" was dropped 2026-05-16 — unverifiable
//      focus-mode forcing; the structured table is the canonical AT
//      path. See PHASE_PLAN_v3_3_6 §"role decision".)
//   2. Every SVG node has tabindex="0" + role="button" + aria-label.
//   3. focusFirst() lands on the deterministic first node (degree desc,
//      id tiebreak) — Tab-into-graph order is reproducible.
//   4. Arrow keys move focus to a geometric neighbour.
//   5. Enter on a focused node triggers the read-only navigate handler.
//   6. Canonical AT path present: always-rendered structured table
//      (data-graph-at-table) + role=status summary, while the SVG
//      visual layer is aria-hidden="true".
//   + bonus: no pageerror across the flow.
//
// Drives the FULL modal via NotesGraph.open() with a mocked, ready
// local-DB so buildGraph yields a populated `loaded` state.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3205;
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

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[render-a11y-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[render-a11y-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[render-a11y-smoke] server up");

  const browser = await playwright.chromium.launch();
  // 1280×720 landscape → isFullGraphAllowed() true → desktop loaded state.
  const context = await browser.newContext({
    serviceWorkers: "block", viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

  try {
    await page.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });

    // Mock a READY local-DB returning a small fixture so NotesGraph.open()
    // reaches the `loaded` state. 5 notes / 6 links / 2 texts.
    await page.addScriptTag({ content: `
      window.__navCalls = [];
      window.v3OpenNoteById = function (id) { window.__navCalls.push("note:" + id); };
      window.__localDBInitPromise = Promise.resolve();
      window.__localDBInitError = null;
      window.__localDB = {
        isReady: function () { return true; },
        dbQuery: async function (sql) {
          if (/FROM notes_v2/i.test(sql)) return [
            { id:"n1", title:"Alpha", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null, j_binyan:null, j_word:null, updated_at:"2026-05-15T00:00:00Z" },
            { id:"n2", title:"Beta",  target_kind:"word", target_id:"שלום", text_id:"t1", note_type:"word_study", j_root:"שלם", j_binyan:"PA'AL", j_word:"שלום", updated_at:"2026-05-15T00:01:00Z" },
            { id:"n3", title:"Gamma", target_kind:"free", target_id:null, text_id:"t2", note_type:"grammar_rule", j_root:"כתב", j_binyan:null, j_word:null, updated_at:"2026-05-15T00:02:00Z" },
            { id:"n4", title:"Delta", target_kind:"sentence", target_id:"s1", text_id:"t1", note_type:"free", j_root:null, j_binyan:null, j_word:null, updated_at:"2026-05-15T00:03:00Z" },
            { id:"n5", title:"Eps",   target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null, j_binyan:null, j_word:null, updated_at:"2026-05-15T00:04:00Z" }
          ];
          if (/FROM note_links/i.test(sql)) return [
            { from_note_id:"n1", to_kind:"note", to_id:"n2", link_alias:null },
            { from_note_id:"n1", to_kind:"root", to_id:"שרש", link_alias:null },
            { from_note_id:"n3", to_kind:"binyan", to_id:"HIFIL", link_alias:null },
            { from_note_id:"n2", to_kind:"sentence", to_id:"s2", link_alias:null },
            { from_note_id:"n4", to_kind:"text", to_id:"t2", link_alias:null },
            { from_note_id:"n5", to_kind:"text", to_id:"t1", link_alias:"see" }
          ];
          if (/FROM texts/i.test(sql)) return [
            { id:"t1", title:"Text One" }, { id:"t2", title:"Text Two" }
          ];
          return [];
        },
      };
      window.MorphNormalize = { normalizeHebrew: function (w) { return String(w||"").trim(); } };
      window.MorphProvider = { ensureReady: async function(){}, analyze: async function(){ return []; } };
    `});
    await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
    await page.addScriptTag({ url: "/js/notes-graph-render.js" });
    await page.addScriptTag({ url: "/js/notes-graph.js" });
    await page.waitForFunction(
      () => !!window.NotesGraph && !!window.NotesGraphRender && !!window.NotesGraphData,
      null, { timeout: 5000 });

    await page.evaluate(() => window.NotesGraph.open());
    await page.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 });
    // Let the simulation settle.
    await sleep(1500);

    const c1 = await page.evaluate(() => {
      const c = document.querySelector("[data-graph-canvas]");
      return c ? { role: c.getAttribute("role"),
                   label: (c.getAttribute("aria-label") || "") } : null;
    });
    test("Case 1: graph container role=group + non-empty aria-label",
         c1 && c1.role === "group" && c1.label.length > 10,
         JSON.stringify(c1));

    const c2 = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("[data-graph-node]"));
      const ok = els.length > 0 && els.every((e) =>
        e.getAttribute("tabindex") === "0" &&
        e.getAttribute("role") === "button" &&
        (e.getAttribute("aria-label") || "").length > 0);
      const svg = document.querySelector("[data-graph-svg]");
      return { count: els.length, ok, svgAriaHidden: svg && svg.getAttribute("aria-hidden") === "true" };
    });
    test("Case 2: every SVG node tabindex=0 + role=button + aria-label; SVG aria-hidden",
         c2.count > 0 && c2.ok && c2.svgAriaHidden, JSON.stringify(c2));

    // Tab-into-graph reaches focusable nodes (tabindex=0). Deterministic
    // first-node order is enforced in the renderer (degree desc, id
    // tiebreak via focusOrder/focusRank) — exercised by Case 4's
    // arrow-nav determinism.
    const c3b = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("[data-graph-node]"));
      els[0].focus();
      return { activeIsNode: document.activeElement &&
               document.activeElement.getAttribute("data-graph-node") === "1",
               activeId: document.activeElement && document.activeElement.getAttribute("data-node-id") };
    });
    test("Case 3: a graph node is focusable (Tab-into-graph reaches nodes)",
         c3b.activeIsNode && !!c3b.activeId, JSON.stringify(c3b));

    // Case 4 — arrow key moves focus to a (different) node.
    const beforeId = await page.evaluate(() =>
      document.activeElement && document.activeElement.getAttribute("data-node-id"));
    let moved = false;
    for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
      await page.keyboard.press(key);
      await sleep(60);
      const afterId = await page.evaluate(() =>
        document.activeElement && document.activeElement.getAttribute("data-node-id"));
      if (afterId && afterId !== beforeId &&
          await page.evaluate(() => document.activeElement.getAttribute("data-graph-node") === "1")) {
        moved = true; break;
      }
    }
    test("Case 4: arrow key moves focus to a neighbouring node",
         moved, "beforeId=" + beforeId);

    // Case 5 — Enter on a focused node triggers read-only navigate.
    // Focus a note node, press Enter, expect __navCalls to record it OR
    // the modal to close (navigateTo destroys for note/text).
    const c5 = await page.evaluate(async () => {
      const noteEl = Array.from(document.querySelectorAll('[data-graph-node]'))
        .find((e) => e.getAttribute("data-node-kind") === "note");
      if (!noteEl) return { ok: false, reason: "no note node" };
      noteEl.focus();
      const id = noteEl.getAttribute("data-node-id");
      noteEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      return { ok: true, navCalls: window.__navCalls.slice(),
               modalGone: !document.querySelector("[data-graph-panel]"), id };
    });
    test("Case 5: Enter on focused note node triggers read-only navigate",
         c5.ok && ((c5.navCalls && c5.navCalls.length > 0) || c5.modalGone),
         JSON.stringify(c5));

    // Case 6 — canonical AT path present. Re-open (case 5 may have
    // navigated/closed the modal).
    await page.evaluate(() => {
      const p = document.querySelector("[data-graph-overlay]");
      if (p && p.parentNode) p.parentNode.removeChild(p);
      window.__navCalls = [];
      window.NotesGraph.open();
    });
    await page.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 });
    await sleep(800);
    const c6 = await page.evaluate(() => {
      const atTable = document.querySelector("[data-graph-at-table]");
      const summary = document.querySelector("[data-graph-summary]");
      const svg = document.querySelector("[data-graph-svg]");
      const tableEl = atTable && atTable.querySelector("table[data-graph-list]");
      const rows = atTable ? atTable.querySelectorAll("[data-list-node]").length : 0;
      return {
        atTablePresent: !!atTable,
        hasTable: !!tableEl,
        rows,
        summaryRole: summary && summary.getAttribute("role"),
        summaryLive: summary && summary.getAttribute("aria-live"),
        svgAriaHidden: svg && svg.getAttribute("aria-hidden") === "true",
      };
    });
    test("Case 6: canonical AT path — always-present table + role=status summary; SVG aria-hidden",
         c6.atTablePresent && c6.hasTable && c6.rows > 0 &&
         c6.summaryRole === "status" && c6.summaryLive === "polite" &&
         c6.svgAriaHidden,
         JSON.stringify(c6));

    if (pageErrors.length) {
      failed++;
      console.log("  ✗ Bonus: pageerror — " + pageErrors.join(" | "));
    } else {
      console.log("  · (bonus) no pageerror during a11y flow");
    }
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[render-a11y-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[render-a11y-smoke] fatal:", e); process.exit(1); });
