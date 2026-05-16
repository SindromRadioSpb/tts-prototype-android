#!/usr/bin/env node
// scripts/notes-ui/onboarding-empty-smoke.js — v3.4 C3 + U8.
//
// Pins the create → [[link]] → graph teaching surfaces (A-G3 / A-G2):
//   C3a onboarding panel has the notes+graph feature line.
//   C3b Notes-tab initial empty-state teaches the loop + has a
//       one-click "Open Knowledge Graph" affordance wired to
//       window.LinguistProGraph.open.
//   U8/v3.5  notes-with-no-links now render (entities visible) with a
//       dismissible teaching banner — not a blocking empty card.
//
// Cases:
//   1. Onboarding panel: feature5 present + mentions the graph/[[ loop.
//   2. Notes-tab empty: .v3-ide-notes-teach with 3 steps.
//   3. Notes-tab empty: Open-Graph button exists, wired, and
//      window.LinguistProGraph is defined (eager loader shim).
//   4. U8: notes-with-no-links render (entities visible) + banner.
//   5. No pageerror across either page.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3215;
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

// notes exist but produce ZERO edges (target_kind free, no links, no
// morph) → graph state must be empty_no_links.
const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__localDB = {
    isReady: function () { return true; },
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"n1", title:"Lone one", target_kind:"free", target_id:null, text_id:null, note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:00:00Z" },
        { id:"n2", title:"Lone two", target_kind:"free", target_id:null, text_id:null, note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:01:00Z" }
      ];
      if (/FROM note_links/i.test(sql)) return [];
      if (/FROM texts/i.test(sql)) return [];
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
  catch (e) { console.error("[onboarding-empty-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[onboarding-empty-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[onboarding-empty-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    // ── C3: index.html (onboarding + notes-tab empty) ───────────────────
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push("[index] " + String(e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);

    const onb = await pg.evaluate(() => {
      const panel = document.getElementById("v3OnboardingPanel");
      if (!panel) return { ok: false };
      const feats = Array.prototype.map.call(
        panel.querySelectorAll(".v3-onb-feature"), (e) => e.textContent.trim());
      const f5 = panel.querySelector('[data-i18n="onboarding.feature5"]');
      return {
        ok: true, count: feats.length,
        f5: f5 ? f5.textContent.trim() : "",
      };
    });
    test("Case 1: onboarding has the notes+graph feature line",
         onb.ok && onb.count >= 5 && /\[\[|Карт|Graph|מפת/i.test(onb.f5),
         JSON.stringify(onb));

    const ide = await pg.evaluate(() => {
      const c = document.getElementById("v3IdeNotesContent");
      if (!c) return { ok: false };
      const teach = c.querySelector(".v3-ide-notes-teach");
      const steps = teach ? teach.querySelectorAll("ol > li").length : 0;
      const btn = c.querySelector('[data-i18n="ide.notesEmpty.openGraph"]');
      const onclick = btn ? String(btn.getAttribute("onclick") || "") : "";
      return {
        ok: true,
        hasTeach: !!teach,
        steps: steps,
        hasBtn: !!btn,
        wired: /LinguistProGraph/.test(onclick),
        loaderGlobal: typeof window.LinguistProGraph,
      };
    });
    test("Case 2: Notes-tab empty-state teaches the loop (3 steps)",
         ide.ok && ide.hasTeach && ide.steps === 3, JSON.stringify(ide));
    test("Case 3: Notes-tab one-click Open-Graph affordance wired",
         ide.hasBtn && ide.wired && ide.loaderGlobal === "object",
         JSON.stringify(ide));

    await pg.close(); await ctx.close();

    // ── U8 (v3.5): notes-with-no-links now RENDER (entities visible)
    // with the teaching demoted to a dismissible banner — not the old
    // blocking empty_no_links card. (MOCK notes have no text_id/links
    // → zero edges → loaded + sparse banner.)
    const gctx = await browser.newContext({
      serviceWorkers: "block", viewport: { width: 1280, height: 900 },
    });
    const gp = await gctx.newPage();
    gp.on("pageerror", (e) => errs.push("[graph] " + String(e.message || e)));
    await gp.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await gp.addScriptTag({ content: MOCK_DB });
    await loadGraphLibs(gp);
    await gp.evaluate(() => window.NotesGraph.open());
    await gp.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 }).catch(() => {});
    const u8 = await gp.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const state = p ? p.getAttribute("data-graph-state") : "(none)";
      const banner = p ? p.querySelector("[data-graph-sparse-banner]") : null;
      const nodeEls = p ? p.querySelectorAll("[data-node-id]").length : 0;
      const dismiss = banner ? banner.querySelector("[data-graph-sparse-dismiss]") : null;
      return {
        state, nodeEls,
        hasBanner: !!banner,
        bannerTeaches: banner ? /наполнить|fill the knowledge|למלא|\[\[/.test(banner.textContent) : false,
        dismissible: !!dismiss,
      };
    });
    test("Case 4: notes-with-no-links render (entities visible) + dismissible teach banner",
         u8.state === "loaded" && u8.nodeEls > 0 && u8.hasBanner &&
         u8.bannerTeaches && u8.dismissible,
         JSON.stringify(u8));

    await gp.close(); await gctx.close();

    test("Case 5: no pageerror across either page",
         errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[onboarding-empty-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[onboarding-empty-smoke] fatal:", e); process.exit(1); });
