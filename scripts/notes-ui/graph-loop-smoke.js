#!/usr/bin/env node
// scripts/notes-ui/graph-loop-smoke.js — v3.4 C2.
//
// Pins the create → link → graph loop affordance + backlink badge
// (audit A-G2 / A-G6):
//   - editor "Open in Knowledge Graph" button → LinguistProGraph.open
//     with {focus:{kind:'note',id}};
//   - links badge title/aria breaks down outgoing · incoming;
//   - the graph honours the focus deep-link (isolates + focuses the
//     node).
//
// Cases:
//   1. #v3NotesOpenGraphBtn present in the Links panel + wired.
//   2. v3NotesOpenInGraph() passes {focus:{kind:'note',id}} to
//      window.LinguistProGraph.open.
//   3. v3NotesLinksRefresh sets a breakdown title/aria on the badge.
//   4. Graph deep-link focus: open({focus}) isolates + focuses the
//      target node.
//   5. No pageerror across either page.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3216;
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

// notes a1↔a2↔a3 with explicit links → graph reaches "loaded".
const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__localDB = {
    isReady: function () { return true; },
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"a1", title:"Alpha", target_kind:"free", target_id:null, text_id:null, note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:00:00Z" },
        { id:"a2", title:"Beta",  target_kind:"free", target_id:null, text_id:null, note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:01:00Z" },
        { id:"a3", title:"Gamma", target_kind:"free", target_id:null, text_id:null, note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-16T00:02:00Z" }
      ];
      if (/FROM note_links/i.test(sql)) return [
        { from_note_id:"a1", to_kind:"note", to_id:"a2", link_alias:null },
        { from_note_id:"a2", to_kind:"note", to_id:"a3", link_alias:null }
      ];
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
  catch (e) { console.error("[graph-loop-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[graph-loop-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[graph-loop-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    // ── C2 editor side: index.html ──────────────────────────────────────
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push("[index] " + String(e.message || e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(800);

    const btn = await pg.evaluate(() => {
      const b = document.getElementById("v3NotesOpenGraphBtn");
      const panel = document.getElementById("v3NotesLinksPanel");
      return {
        present: !!b,
        inPanel: !!(b && panel && panel.contains(b)),
        wired: b ? /v3NotesOpenInGraph/.test(String(b.getAttribute("onclick") || "")) : false,
        handler: typeof window.v3NotesOpenInGraph,
      };
    });
    test("Case 1: Open-in-Graph button present in Links panel + wired",
         btn.present && btn.inPanel && btn.wired && btn.handler === "function",
         JSON.stringify(btn));

    // v3NotesModalNoteId is a script-scoped `let` (not on window); the
    // only honest way to set it is the real save path. Open a fresh
    // free note and save it through a stubbed createNote → the host
    // assigns v3NotesModalNoteId = "note-7" itself. (Proven C1 pattern;
    // window.__localDB is a sealed module namespace so we replace the
    // whole reference with a plain stub that also satisfies the link
    // queries used by the badge.)
    const opened = await pg.evaluate(async () => {
      for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
        const e = document.getElementById(id);
        if (e && e.parentNode) e.parentNode.removeChild(e);
      }
      if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
      window.__localDBInitError = null;
      window.__localDB = {
        isReady: () => true,
        createNote: async () => ({ id: "note-7", updated_at: new Date().toISOString() }),
        updateNote: async () => ({ id: "note-7", updated_at: new Date().toISOString() }),
        listOutgoingLinks: async () => [
          { to_kind: "note", to_id: "x1", link_alias: null },
          { to_kind: "text", to_id: "t1", link_alias: null },
        ],
        listBacklinks: async () => [
          { from_note_id: "z1", to_kind: "note", to_id: "note-7", link_alias: null },
        ],
        addNoteLink: async () => true,
      };
      window.v3NotesOpen("", "", null, { entryKind: "free", targetKind: "free", noteType: "free" });
      const ta = document.getElementById("v3NotesText");
      if (ta) ta.value = "loop body";
      const ed = document.getElementById("v3NotesEditor");
      if (ed) ed.textContent = "loop body";
      try { await window.v3NotesSave(false); } catch (_) {}
      window.__graphOpenArgs = null;
      window.LinguistProGraph = { open: (o) => { window.__graphOpenArgs = o || null; } };
      window.v3NotesOpenInGraph();
      return window.__graphOpenArgs;
    });
    test("Case 2: v3NotesOpenInGraph forwards {focus:{kind:note,id}}",
         opened && opened.focus && opened.focus.kind === "note" &&
         String(opened.focus.id) === "note-7",
         JSON.stringify(opened));

    const badge = await pg.evaluate(async () => {
      const bd = document.getElementById("v3NotesLinksBadge");
      if (bd) { bd.removeAttribute("title"); bd.removeAttribute("aria-label"); }
      await window.v3NotesLinksRefresh();
      return {
        text: bd ? bd.textContent : "",
        title: bd ? bd.getAttribute("title") : null,
        aria: bd ? bd.getAttribute("aria-label") : null,
      };
    });
    test("Case 3: links badge shows outgoing·incoming breakdown",
         badge.text === "3" && /2/.test(badge.title || "") &&
         /1/.test(badge.title || "") && badge.aria === badge.title,
         JSON.stringify(badge));

    await pg.close(); await ctx.close();

    // ── C2 graph side: deep-link focus ──────────────────────────────────
    const gctx = await browser.newContext({
      serviceWorkers: "block", viewport: { width: 1280, height: 900 },
    });
    const gp = await gctx.newPage();
    gp.on("pageerror", (e) => errs.push("[graph] " + String(e.message || e)));
    await gp.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await gp.addScriptTag({ content: MOCK_DB });
    await loadGraphLibs(gp);
    await gp.evaluate(() => window.NotesGraph.open({ focus: { kind: "note", id: "a1" } }));
    await gp.waitForFunction(() => {
      const p = document.querySelector("[data-graph-panel]");
      return p && p.getAttribute("data-graph-state") === "loaded";
    }, null, { timeout: 8000 }).catch(() => {});
    // deferred focus (350ms) + sim settle; poll up to ~4s and also
    // record whether focus ever landed (in case a later tick blurs it).
    let focus = { activeId: null, everFocused: false, state: "(none)" };
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      focus = await gp.evaluate((prev) => {
        const active = document.activeElement;
        const activeId = active ? active.getAttribute("data-node-id") : null;
        const p = document.querySelector("[data-graph-panel]");
        const state = p ? p.getAttribute("data-graph-state") : "(none)";
        return {
          activeId,
          everFocused: prev || activeId === "note:a1",
          state,
        };
      }, focus.everFocused);
      if (focus.activeId === "note:a1") break;
    }
    test("Case 4: graph deep-link focuses the target node (note:a1)",
         focus.everFocused === true, JSON.stringify(focus));

    await gp.close(); await gctx.close();

    test("Case 5: no pageerror across either page",
         errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[graph-loop-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[graph-loop-smoke] fatal:", e); process.exit(1); });
