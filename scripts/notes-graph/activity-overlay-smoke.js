#!/usr/bin/env node
// scripts/notes-graph/activity-overlay-smoke.js — v3.6 Phase 7 (A5).
//
// Pins the learning-state overlay: a NON-DESTRUCTIVE coloured ring on
// note nodes (never an edge), chip-toggleable, surfaced in the detail
// rail + legend. Graph stays read-only.
//
// Cases:
//   1. Static: local-db getLearningStateOverlay is read-only (SELECT
//      only, q() not r(), joins srs_cards+srs_attempts, filters
//      source_note_id) — no srs_* writes, salience rank present.
//   2. Overlay applied: note nodes get data-learn matching the map;
//      LEARN_STYLE exposed with distinct colours.
//   3. Detail rail shows the learning state of a focused note.
//   4. «Прогресс» chip present; toggling OFF removes the rings AND
//      the SVG <line> (edge) count is IDENTICAL with/without the
//      overlay (overlay creates ZERO edges — non-destructive).
//   5. Read-only: every dbQuery is a bare SELECT; no addNoteLink;
//      no pageerror.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3243;
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

const OVERLAY = { n1: "weak", n2: "stale", n3: "new", n4: "learning", n5: "known" };

function mkDb(withOverlay) {
  return `
    window.__localDBInitPromise = Promise.resolve();
    window.__localDBInitError = null;
    window.__sqlLog = [];
    window.__addNoteLinkCalls = [];
    window.__localDB = {
      isReady: function () { return true; },
      addNoteLink: async function () { window.__addNoteLinkCalls.push(1); },
      getLearningStateOverlay: ${withOverlay
        ? "async function () { return " + JSON.stringify(OVERLAY) + "; }"
        : "async function () { return {}; }"},
      dbQuery: async function (sql) {
        window.__sqlLog.push(String(sql));
        if (/FROM notes_v2/i.test(sql)) return [
          { id:"n1", title:"N1", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-17T00:00:00Z" },
          { id:"n2", title:"N2", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-17T00:01:00Z" },
          { id:"n3", title:"N3", target_kind:"text", target_id:"t2", text_id:"t2", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-17T00:02:00Z" },
          { id:"n4", title:"N4", target_kind:"text", target_id:"t2", text_id:"t2", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-17T00:03:00Z" },
          { id:"n5", title:"N5", target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-17T00:04:00Z" }
        ];
        if (/FROM note_links/i.test(sql)) return [];
        if (/FROM note_link_suggestions/i.test(sql)) return [];
        if (/FROM texts/i.test(sql)) return [{ id:"t1", title:"T1" }, { id:"t2", title:"T2" }];
        return [];
      },
    };
    window.MorphNormalize = { normalizeHebrew: function (w){ return String(w||"").trim(); } };
    window.MorphProvider = { ensureReady: async function(){}, analyze: async function(){ return []; } };
  `;
}
async function loadGraphLibs(page) {
  await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
  await page.addScriptTag({ url: "/js/notes-graph-render.js" });
  await page.addScriptTag({ url: "/js/notes-graph.js" });
  await page.waitForFunction(
    () => !!window.NotesGraph && !!window.NotesGraphRender && !!window.NotesGraphData,
    null, { timeout: 5000 });
}
async function openLoaded(page) {
  await page.evaluate(() => { window.NotesGraph.open(); });
  await page.waitForFunction(() => {
    const p = document.querySelector("[data-graph-panel]");
    return p && p.getAttribute("data-graph-state") === "loaded";
  }, null, { timeout: 8000 }).catch(() => {});
  await sleep(500);
}

async function main() {
  // Case 1 — static read-only contract of the local-db aggregate.
  const ldb = fs.readFileSync(path.join(REPO, "public/db/local-db.js"), "utf8");
  const i = ldb.indexOf("export async function getLearningStateOverlay");
  const body = i >= 0 ? ldb.slice(i, i + 1600) : "";
  const staticOk =
    i >= 0 &&
    /FROM srs_cards/.test(body) && /JOIN srs_attempts/.test(body) &&
    /source_note_id IS NOT NULL/.test(body) &&
    /\bawait q\(/.test(body) && !/\bawait r\(/.test(body) &&
    !/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/.test(body) &&
    /weak|stale|learning|new|known/.test(body);
  test("Case 1: getLearningStateOverlay is read-only (SELECT q(), no writes)",
       staticOk, JSON.stringify({ found: i >= 0 }));

  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[activity-overlay-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitReady())) {
    console.error("[activity-overlay-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[activity-overlay-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    // ── overlay ON ───────────────────────────────────────────────────
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: mkDb(true) });
    await loadGraphLibs(pg);
    await openLoaded(pg);

    const on = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      const rings = {};
      p.querySelectorAll('[data-graph-node][data-learn]').forEach((g) => {
        rings[g.getAttribute("data-node-id")] = g.getAttribute("data-learn");
      });
      const S = window.NotesGraphRender.LEARN_STYLE || {};
      const colours = Object.keys(S).map((k) => S[k]);
      const distinct = new Set(colours).size === colours.length && colours.length === 5;
      return {
        rings, lines: p.querySelectorAll('[data-graph-canvas] svg line').length,
        ringEls: p.querySelectorAll('[data-learn-ring]').length,
        styleDistinct: distinct,
        chip: !!p.querySelector('[data-graph-filter-chip="learnOverlay"]'),
      };
    });
    const mapOk = on.rings["note:n1"] === "weak" && on.rings["note:n2"] === "stale" &&
      on.rings["note:n3"] === "new" && on.rings["note:n4"] === "learning" &&
      on.rings["note:n5"] === "known";
    test("Case 2: overlay applied — note rings match map; LEARN_STYLE distinct",
         mapOk && on.ringEls === 5 && on.styleDistinct && on.chip,
         JSON.stringify(on));

    const det = await pg.evaluate(async () => {
      const p = document.querySelector("[data-graph-panel]");
      const n1 = p.querySelector('[data-node-id="note:n1"]');
      if (n1) n1.focus();
      await new Promise((r) => setTimeout(r, 250));
      const rail = p.querySelector('[data-graph-detail]');
      const dl = rail && rail.querySelector('[data-detail-learn]');
      return { learn: dl && dl.getAttribute("data-detail-learn"),
               txt: rail ? rail.textContent : "" };
    });
    test("Case 3: detail rail shows the focused note's learning state",
         det.learn === "weak" && /слаб|weak|חלש|Прогресс|Progress|התקדמות/i.test(det.txt),
         JSON.stringify({ learn: det.learn }));

    // toggle overlay OFF via the chip → rings gone, edges unchanged
    const linesBefore = on.lines;
    await pg.evaluate(() => {
      document.querySelector('[data-graph-filter-chip="learnOverlay"]').click();
    });
    await pg.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 }).catch(() => {});
    await sleep(500);
    const off = await pg.evaluate(() => {
      const p = document.querySelector("[data-graph-panel]");
      return {
        rings: p.querySelectorAll('[data-learn-ring]').length,
        learnNodes: p.querySelectorAll('[data-graph-node][data-learn]').length,
        lines: p.querySelectorAll('[data-graph-canvas] svg line').length,
      };
    });
    test("Case 4: chip OFF removes rings; edge (line) count unchanged (no edges created)",
         off.rings === 0 && off.learnNodes === 0 && off.lines === linesBefore &&
         linesBefore >= 0,
         JSON.stringify({ off, linesBefore }));

    const sqlLog = await pg.evaluate(() => window.__sqlLog || []);
    const addCalls = await pg.evaluate(() => (window.__addNoteLinkCalls || []).length);
    const RO = /^\s*(WITH\b[\s\S]*?\bSELECT|SELECT)\b/i;
    const FORB = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|ATTACH|VACUUM)\b/i;
    const selOnly = sqlLog.length > 0 && sqlLog.every((s) => RO.test(s) && !FORB.test(s));
    test("Case 5: read-only — bare SELECT only, no addNoteLink, no pageerror",
         selOnly && addCalls === 0 && errs.length === 0,
         JSON.stringify({ sql: sqlLog.length, addCalls, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[activity-overlay-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[activity-overlay-smoke] fatal:", e); process.exit(1); });
