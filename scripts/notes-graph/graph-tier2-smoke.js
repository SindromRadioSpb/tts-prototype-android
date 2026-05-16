#!/usr/bin/env node
// scripts/notes-graph/graph-tier2-smoke.js — v3.4 Phase B (U5/U6/U7).
//
// Pins the Graph Tier-2 UX uplift (PHASE_PLAN_v3_3_7_GRAPH_UX §2):
//   U6 loading skeleton replaces the bare spinner.
//   U7 per-kind filter chips (mirror the legend) toggle + persist.
//   U5 node search + `/` jump-to (reuses the C2 focusNode path).
// All read-only — no graph mutation.
//
// Cases:
//   1. U6: while data loads, state=loading shows the skeleton SVG
//      (graph-sk-node) inside a role=status region.
//   2. U7: loaded toolbar has filter chips for the present kinds.
//   3. U7: clicking the "text" chip hides text nodes + persists the
//      filter (sessionStorage), graph still renders.
//   4. U5: typing a label updates the count + Enter focuses the node.
//   5. U5: `/` focuses the search input; no pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3219;
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
    const tm = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tm); resolve(true); });
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

// First notes_v2 query is delayed so the loading skeleton is
// observable. notes a1,a2 → text t1 (target_anchor) + explicit link;
// b1 word_study → root כתב. Kinds present: note, text, root.
const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__nq = 0;
  window.__localDB = {
    isReady: function () { return true; },
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) {
        if (window.__nq++ === 0) { await new Promise(function(r){ setTimeout(r, 1200); }); }
        return [
          { id:"a1", title:"Alpha note", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:00:00Z" },
          { id:"a2", title:"Beta note",  target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:01:00Z" },
          { id:"b1", title:"Gamma word", target_kind:"free", target_id:null, text_id:"t2", note_type:"word_study", j_root:"כתב",j_binyan:null,j_word:"כתב", updated_at:"2026-05-16T00:02:00Z" }
        ];
      }
      if (/FROM note_links/i.test(sql)) return [
        { from_note_id:"a1", to_kind:"note", to_id:"a2", link_alias:null }
      ];
      if (/FROM texts/i.test(sql)) return [{ id:"t1", title:"Text One" }, { id:"t2", title:"Text Two" }];
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
  catch (e) { console.error("[graph-tier2-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[graph-tier2-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[graph-tier2-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: MOCK_DB });
    await loadGraphLibs(pg);
    // Fire-and-forget (do NOT return the promise) so we can observe
    // the transient loading state before open() resolves.
    await pg.evaluate(() => { window.NotesGraph.open(); });

    // U6 — observe the loading skeleton during the 1.2s DB delay.
    let sk = { ok: false };
    for (let i = 0; i < 25; i++) {
      sk = await pg.evaluate(() => {
        const p = document.querySelector("[data-graph-panel]");
        if (!p) return { ok: false };
        const st = p.getAttribute("data-graph-state");
        const region = p.querySelector('[role="status"]');
        const skn = p.querySelectorAll(".graph-sk-node").length;
        return { ok: st === "loading" && skn > 0 && !!region, st, skn };
      });
      if (sk.ok) break;
      await sleep(80);
    }
    test("Case 1: U6 loading skeleton (graph-sk-node) in role=status",
         sk.ok === true, JSON.stringify(sk));

    await pg.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 });
    await sleep(400);

    const chips = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const cs = Array.prototype.map.call(
        p.querySelectorAll("[data-graph-filter-chip]"),
        (c) => c.getAttribute("data-graph-filter-chip"));
      return { kinds: cs, hasSearch: !!p.querySelector("[data-graph-node-search]") };
    });
    test("Case 2: U7 filter chips present for the loaded kinds + search box",
         chips.kinds.includes("note") && chips.kinds.includes("text") &&
         chips.kinds.includes("root") && chips.hasSearch,
         JSON.stringify(chips));

    const toggled = await pg.evaluate(async () => {
      const p = document.querySelector("[data-graph-panel]");
      const chip = p.querySelector('[data-graph-filter-chip="text"]');
      chip.click();                                  // hide text → destroy()+open()
      return true;
    });
    await pg.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      const st = p && p.getAttribute("data-graph-state");
      return st === "loaded" || st === "empty_no_links" || st === "empty_no_notes";
    }, null, { timeout: 8000 }).catch(() => {});
    await sleep(300);
    const afterToggle = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const textNodes = p ? p.querySelectorAll('[data-node-id^="text:"]').length : -1;
      let persisted = null;
      try {
        const raw = sessionStorage.getItem("graphFilters_v1");
        persisted = raw ? JSON.parse(raw) : null;
      } catch (_) {}
      return { textNodes, persisted };
    });
    test("Case 3: U7 toggling 'text' hides text nodes + persists filter",
         toggled === true && afterToggle.textNodes === 0 &&
         afterToggle.persisted && afterToggle.persisted.text === false,
         JSON.stringify(afterToggle));

    // Re-show text so search has the full graph again.
    await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const chip = p && p.querySelector('[data-graph-filter-chip="text"]');
      if (chip) chip.click();
    });
    await pg.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 }).catch(() => {});
    await sleep(300);

    const search = await pg.evaluate(async () => {
      const p = document.querySelector("[data-graph-panel]");
      const inp = p.querySelector("[data-graph-node-search]");
      inp.focus();
      inp.value = "Alpha";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));
      const cnt = p.querySelector("[data-graph-search-count]").textContent;
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      return { cnt };
    });
    let jumped = { activeId: null };
    for (let i = 0; i < 25; i++) {
      await sleep(120);
      jumped = await pg.evaluate(() => ({
        activeId: document.activeElement &&
          document.activeElement.getAttribute &&
          document.activeElement.getAttribute("data-node-id"),
      }));
      if (jumped.activeId === "note:a1") break;
    }
    test("Case 4: U5 search counts matches + Enter jumps to the node",
         /1|найдено|found|נמצאו/i.test(search.cnt || "") && jumped.activeId === "note:a1",
         JSON.stringify({ search, jumped }));

    const slash = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const inp = p.querySelector("[data-graph-node-search]");
      inp.blur();
      // dispatch `/` somewhere that is not an input
      p.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
      return { focused: document.activeElement === inp ||
               (document.activeElement && document.activeElement.getAttribute("data-graph-node-search") === "1") };
    });
    test("Case 5: U5 `/` focuses the search input; no pageerror",
         slash.focused === true && errs.length === 0,
         JSON.stringify({ slash, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[graph-tier2-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[graph-tier2-smoke] fatal:", e); process.exit(1); });
