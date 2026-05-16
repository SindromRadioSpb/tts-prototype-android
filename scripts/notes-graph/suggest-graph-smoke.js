#!/usr/bin/env node
// scripts/notes-graph/suggest-graph-smoke.js — v3.6 Phase 5.
//
// Pins the computed "suggested" graph layers (auto_shared_root /
// auto_shared_lemma): present + distinct + decision-aware + chip-
// filterable, and the canvas stays strictly read-only.
//
// Cases:
//   1. buildGraph emits auto_shared_root + auto_shared_lemma edges
//      for notes sharing a root / lemma.
//   2. Decision-aware: a pair already joined by an explicit_link is
//      NOT re-drawn as auto_shared_*; a `rejected` note_link_
//      suggestion suppresses that shared pair.
//   3. EDGE_STYLE has distinct entries for both new kinds.
//   4. The "Подсказки связей" edge-layer chip exists; toggling it OFF
//      re-renders with fewer SVG edges (suggested layer hidden);
//      toggling ON restores them. Legend lists both new rows.
//   5. Read-only: every dbQuery is a bare SELECT; addNoteLink never
//      called from the graph; no pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3241;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO, env: { ...process.env, PORT: String(PORT) },
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
  const ok = await new Promise((res) => {
    const t = setTimeout(() => res(false), 5000);
    child.once("exit", () => { clearTimeout(t); res(true); });
  });
  if (!ok && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}
async function waitReady(ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

// notes: r1,r2,r3 share root כתב; r1↔r2 already an explicit note_link
// (must NOT also be auto_shared_root). a1,a2 share root אהב but a1↔a2
// is `rejected` → suppressed. L1,L2 share lemma שלום → auto_shared_lemma.
const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__sqlLog = [];
  window.__addNoteLinkCalls = [];
  window.__localDB = {
    isReady: function () { return true; },
    addNoteLink: async function () { window.__addNoteLinkCalls.push(1); return true; },
    dbQuery: async function (sql) {
      window.__sqlLog.push(String(sql));
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"r1", title:"R1", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"word_study", j_root:"כתב", j_binyan:"paal", j_word:"כתב",  updated_at:"2026-05-16T00:00:00Z" },
        { id:"r2", title:"R2", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"word_study", j_root:"כתב", j_binyan:"paal", j_word:"מכתב", updated_at:"2026-05-16T00:01:00Z" },
        { id:"r3", title:"R3", target_kind:"text", target_id:"t2", text_id:"t2", note_type:"word_study", j_root:"כתב", j_binyan:"paal", j_word:"כותב", updated_at:"2026-05-16T00:02:00Z" },
        { id:"a1", title:"A1", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"word_study", j_root:"אהב", j_binyan:"paal", j_word:"אוהב", updated_at:"2026-05-16T00:03:00Z" },
        { id:"a2", title:"A2", target_kind:"text", target_id:"t2", text_id:"t2", note_type:"word_study", j_root:"אהב", j_binyan:"paal", j_word:"אהבה", updated_at:"2026-05-16T00:04:00Z" },
        { id:"L1", title:"L1", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null, j_binyan:null, j_word:"שלום", updated_at:"2026-05-16T00:05:00Z" },
        { id:"L2", title:"L2", target_kind:"text", target_id:"t2", text_id:"t2", note_type:"free", j_root:null, j_binyan:null, j_word:"שלום", updated_at:"2026-05-16T00:06:00Z" }
      ];
      if (/FROM note_links/i.test(sql)) return [
        { from_note_id:"r1", to_kind:"note", to_id:"r2", link_alias:"manual" }
      ];
      if (/FROM note_link_suggestions/i.test(sql)) return [
        { from_note_id:"a1", to_id:"a2", reason_code:"shared_root", state:"rejected", decided_at:"2026-05-16T07:00:00Z" }
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
    () => !!window.NotesGraph && !!window.NotesGraphRender && !!window.NotesGraphData,
    null, { timeout: 5000 });
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[suggest-graph-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitReady())) {
    console.error("[suggest-graph-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[suggest-graph-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: MOCK_DB });
    await loadGraphLibs(pg);

    const g = await pg.evaluate(async () => {
      const graph = await window.NotesGraphData.buildGraph();
      const ek = {};
      for (const e of graph.edges) ek[e.edge_kind] = (ek[e.edge_kind] || 0) + 1;
      const has = (a, b, kind) => graph.edges.some((e) =>
        ((e.source === "note:" + a && e.target === "note:" + b) ||
         (e.source === "note:" + b && e.target === "note:" + a)) && e.edge_kind === kind);
      return {
        kinds: ek,
        r1r3_sharedRoot: has("r1", "r3", "auto_shared_root"),
        r2r3_sharedRoot: has("r2", "r3", "auto_shared_root"),
        r1r2_sharedRoot: has("r1", "r2", "auto_shared_root"),   // must be FALSE (explicit supersedes)
        r1r2_explicit:   has("r1", "r2", "explicit_link"),
        a1a2_sharedRoot: has("a1", "a2", "auto_shared_root"),    // must be FALSE (rejected)
        L1L2_sharedLemma: has("L1", "L2", "auto_shared_lemma"),
        evidence: (graph.edges.find((e) => e.edge_kind === "auto_shared_root") || {}).evidence,
      };
    });
    test("Case 1: auto_shared_root + auto_shared_lemma layers emitted",
         (g.kinds.auto_shared_root || 0) >= 1 && (g.kinds.auto_shared_lemma || 0) >= 1 &&
         g.r1r3_sharedRoot && g.L1L2_sharedLemma && g.evidence === "כתב",
         JSON.stringify(g.kinds));

    test("Case 2: explicit supersedes + rejected suppressed (decision-aware)",
         g.r1r2_explicit && g.r1r2_sharedRoot === false && g.a1a2_sharedRoot === false,
         JSON.stringify({ r1r2_explicit: g.r1r2_explicit,
           r1r2_sharedRoot: g.r1r2_sharedRoot, a1a2_sharedRoot: g.a1a2_sharedRoot }));

    const styles = await pg.evaluate(() => {
      const S = window.NotesGraphRender.EDGE_STYLE || {};
      return {
        root: S.auto_shared_root, lemma: S.auto_shared_lemma,
        distinct: S.auto_shared_root && S.auto_shared_lemma &&
          S.auto_shared_root.dash !== S.auto_shared_lemma.dash &&
          S.auto_shared_root.dash !== (S.explicit_link || {}).dash &&
          S.auto_shared_root.dash !== (S.auto_text || {}).dash,
      };
    });
    test("Case 3: EDGE_STYLE has distinct styles for both new kinds",
         !!styles.root && !!styles.lemma && styles.distinct === true,
         JSON.stringify(styles));

    await pg.evaluate(() => { window.NotesGraph.open(); });
    await pg.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 }).catch(() => {});
    await sleep(500);

    const before = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const chip = p && p.querySelector('[data-graph-filter-chip="edgeSuggested"]');
      const lines = p ? p.querySelectorAll('[data-graph-canvas] svg line').length : -1;
      return { hasChip: !!chip, lines };
    });
    // open legend, check the two new rows
    const legend = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const lg = p && p.querySelector('[data-graph-legend]');
      if (lg) lg.click();
      const pane = p && p.querySelector('[data-graph-legend-pane]');
      const txt = pane ? pane.textContent : "";
      return /подсказк|suggested|הצעה|корень|root|שורש/i.test(txt) &&
             /лемм|lemma|לקסמ/i.test(txt);
    });
    // toggle the suggested layer OFF
    await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const chip = p.querySelector('[data-graph-filter-chip="edgeSuggested"]');
      chip.click();
    });
    await pg.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 }).catch(() => {});
    await sleep(500);
    const afterOff = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p ? p.querySelectorAll('[data-graph-canvas] svg line').length : -1;
    });
    test("Case 4: edge-layer chip present, legend rows shown, toggle hides suggested edges",
         before.hasChip && legend === true &&
         before.lines > 0 && afterOff >= 0 && afterOff < before.lines,
         JSON.stringify({ before, afterOff, legend }));

    // Case 5 — Phase 8 perf: buildGraph on a 200-note, shared-root-
    // heavy synthetic stays under budget AND capped (the O(1)
    // pair-set hardening must not regress; no hairball).
    const perf = await pg.evaluate(async () => {
      const big = [];
      for (let i = 0; i < 200; i++) {
        big.push({ id: "P" + i, title: "P" + i, target_kind: "text",
          target_id: "t1", text_id: "t1", note_type: "word_study",
          j_root: "r" + (i % 10), j_binyan: "paal", j_word: "w" + (i % 10),
          updated_at: "2026-05-17T00:00:00Z" });
      }
      window.__localDB.dbQuery = async function (sql) {
        window.__sqlLog.push(String(sql));
        if (/FROM notes_v2/i.test(sql)) return big;
        if (/FROM note_links/i.test(sql)) return [];
        if (/FROM note_link_suggestions/i.test(sql)) return [];
        if (/FROM texts/i.test(sql)) return [{ id: "t1", title: "T1" }];
        return [];
      };
      const t0 = performance.now();
      const g = await window.NotesGraphData.buildGraph();
      const ms = performance.now() - t0;
      const a = await window.NotesGraphData.buildGraph();
      const det = g.edges.length === a.edges.length;
      // 10 roots × 20 members, cap 6/token → bounded shared edges.
      const shared = g.edges.filter((e) =>
        e.edge_kind === "auto_shared_root" || e.edge_kind === "auto_shared_lemma").length;
      return { ms: Math.round(ms), shared, det, total: g.edges.length };
    });
    test("Case 5: 200-note buildGraph under budget (<400ms), capped, deterministic",
         perf.ms < 400 && perf.shared > 0 && perf.shared <= 200 && perf.det,
         JSON.stringify(perf));

    const sqlLog = await pg.evaluate(() => window.__sqlLog || []);
    const addCalls = await pg.evaluate(() => (window.__addNoteLinkCalls || []).length);
    const RO = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
    const FORB = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
    const selectOnly = sqlLog.length > 0 && sqlLog.every((s) => RO.test(s) && !FORB.test(s));
    test("Case 6: read-only — bare SELECT only, no addNoteLink, no pageerror",
         selectOnly && addCalls === 0 && errs.length === 0,
         JSON.stringify({ sql: sqlLog.length, addCalls, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[suggest-graph-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[suggest-graph-smoke] fatal:", e); process.exit(1); });
