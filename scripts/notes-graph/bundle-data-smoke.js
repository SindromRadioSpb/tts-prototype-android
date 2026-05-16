#!/usr/bin/env node
// scripts/notes-graph/bundle-data-smoke.js — v3.5.
//
// Verifies the v3.5 "smart prototype" graph fixes against the USER'S
// REAL test bundle (test_library-bundle-20260516-192012.zip): 5 notes
// (3 word_study + 2 free), 1 explicit link, 4 texts (only 3 have
// notes). Mocks __localDB.dbQuery with exactly the rows _fetchRaw()
// would project (json_extract of body_json → j_root/j_word/j_binyan).
//
// Before v3.5 this data produced a fragmented / library-blind map
// (word_study notes never created a text node; 3 of 4 texts invisible;
// notes floated as isolated root/word stars). The fixes:
//   Fix 1+2 — every note auto-attaches to its source text (text_id);
//             texts that have notes become visible nodes.
//   Fix 3   — nodes-with-no-`[[`-links still render (state=loaded),
//             not the blocking empty card.
//
// Cases:
//   1. State is "loaded" (not empty_no_links) — entities are shown.
//   2. The 3 texts that have notes appear; the 4th (no notes) does NOT
//      (knowledge, not raw inventory).
//   3. Every one of the 5 notes is connected to its source text
//      (auto_text or explicit) — no orphan notes.
//   4. Shared morphology still clusters: root אהב links the 2 notes
//      that share it; binyan paal links all 3 word_study notes.
//   5. No pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3220;
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

// Exact rows from the user's bundle, as _fetchRaw() would project them
// (json_extract(body_json,'$.root'|'$.binyan'|'$.word')).
const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__localDB = {
    isReady: function () { return true; },
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"N1", target_kind:"word",     target_id:"ae92ec2a:0", text_id:"T_VERBS", note_type:"word_study", j_root:"לבש", j_binyan:"paal", j_word:"לגור", updated_at:"2026-05-16T16:09:53Z" },
        { id:"N2", target_kind:"word",     target_id:"52f6cd53:0", text_id:"T_POS1",  note_type:"word_study", j_root:"אהב", j_binyan:"paal", j_word:"אוהב", updated_at:"2026-05-16T16:10:00Z" },
        { id:"N3", target_kind:"word",     target_id:"6fce83c6:3", text_id:"T_VERBS", note_type:"word_study", j_root:"אהב", j_binyan:"paal", j_word:"לאהוב", updated_at:"2026-05-16T16:11:00Z" },
        { id:"N4", target_kind:"sentence", target_id:"S_1216",     text_id:"T_VERBS", note_type:"free",       j_root:null,  j_binyan:null,  j_word:null,  updated_at:"2026-05-16T16:13:00Z" },
        { id:"N5", target_kind:"sentence", target_id:"S_6bd4",     text_id:"T_POS11", note_type:"free",       j_root:null,  j_binyan:null,  j_word:null,  updated_at:"2026-05-16T16:14:00Z" }
      ];
      if (/FROM note_links/i.test(sql)) return [
        { from_note_id:"N4", to_kind:"text", to_id:"T_VERBS", link_alias:"150 наиболее употребимых глаголов" }
      ];
      if (/FROM texts/i.test(sql)) return [
        { id:"T_VERBS", title:"150 наиболее употребимых глаголов" },
        { id:"T_POS1",  title:"Position 1. אושר כהן" },
        { id:"T_POS11", title:"Position 11. בן צור" },
        { id:"T_ADJ",   title:"150 наиболее употребимых прилагательных" }   // NO notes → must NOT appear
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
    () => !!window.NotesGraph && !!window.NotesGraphRender && !!window.NotesGraphData,
    null, { timeout: 5000 });
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[bundle-data-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[bundle-data-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[bundle-data-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: MOCK_DB });
    await loadGraphLibs(pg);

    // Inspect the built graph directly (data layer) — deterministic.
    const g = await pg.evaluate(async () => {
      const graph = await window.NotesGraphData.buildGraph();
      const ids = graph.nodes.map((n) => n.id);
      const e = graph.edges.map((x) => x.source + "→" + x.target + "(" + x.edge_kind + ")");
      const noteIds = ["note:N1", "note:N2", "note:N3", "note:N4", "note:N5"];
      const noteConnectedToText = noteIds.every((nid) =>
        graph.edges.some((x) =>
          (x.source === nid && x.target.indexOf("text:") === 0) ||
          (x.target === nid && x.source.indexOf("text:") === 0)));
      const adj = (a, b) => graph.edges.some((x) =>
        (x.source === a && x.target === b) || (x.source === b && x.target === a));
      return {
        ids,
        textNodes: ids.filter((i) => i.indexOf("text:") === 0),
        hasAdjText: ids.includes("text:T_ADJ"),
        noteConnectedToText,
        rootAhavLinks: adj("note:N2", "root:אהב") && adj("note:N3", "root:אהב"),
        binyanPaalLinks: adj("note:N1", "binyan:paal") &&
                         adj("note:N2", "binyan:paal") &&
                         adj("note:N3", "binyan:paal"),
        edgeCount: graph.edges.length,
      };
    });

    // Also drive the real open() to confirm the rendered state.
    await pg.evaluate(() => { window.NotesGraph.open(); });
    let state = "(none)";
    for (let i = 0; i < 40; i++) {
      await sleep(120);
      state = await pg.evaluate(() => {
        const p = document.querySelector("[data-graph-panel]");
        return p ? p.getAttribute("data-graph-state") : "(none)";
      });
      if (state === "loaded") break;
    }

    test("Case 1: bundle data renders (state=loaded, not empty card)",
         state === "loaded", JSON.stringify({ state, edgeCount: g.edgeCount }));

    test("Case 2: the 3 texts with notes appear; the note-less text does NOT",
         g.textNodes.length === 3 &&
         g.textNodes.includes("text:T_VERBS") &&
         g.textNodes.includes("text:T_POS1") &&
         g.textNodes.includes("text:T_POS11") &&
         g.hasAdjText === false,
         JSON.stringify({ textNodes: g.textNodes, hasAdjText: g.hasAdjText }));

    test("Case 3: every one of the 5 notes is connected to its source text",
         g.noteConnectedToText === true,
         JSON.stringify(g.ids));

    test("Case 4: shared morphology still clusters (root אהב + binyan paal)",
         g.rootAhavLinks === true && g.binyanPaalLinks === true,
         JSON.stringify({ rootAhav: g.rootAhavLinks, binyanPaal: g.binyanPaalLinks }));

    test("Case 5: no pageerror",
         errs.length === 0, errs.join(" | "));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[bundle-data-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[bundle-data-smoke] fatal:", e); process.exit(1); });
