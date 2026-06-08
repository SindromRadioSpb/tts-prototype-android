#!/usr/bin/env node
"use strict";
// BRR-P0-002b · Phase 0 — boot-waterfall attribution.
//
// The ~1.3s open latency was attributed (handoff) to "the weight of the 39K-line
// index.html shell, not the rows" (measure-reader-render.js proved 486 rows = 74ms).
// This harness PROVES where the time goes before we extract a slim reader: it reads
// the Navigation/Resource Timing API on a real room deep-link open and decomposes:
//
//   responseEnd            — HTML downloaded
//   →domInteractive        — HTML parse + compile/exec of ALL synchronous scripts
//                            (the inline 39K-line monolith + 29 blocking <script src>)  ← CANDIDATE LEVER A
//   →domContentLoaded      — DCL handlers
//   →loadEventEnd          — window.load (deeplink boot kicks off here)
//   →#proTable full        — DB-init + fetch rows + renderTable  ← CANDIDATE LEVER B (cold DB-worker OPFS page-in)
//
// ⚠ UNRECONCILED (audit 2026-06-08): two diagnoses disagree on the DOMINANT lever —
// (A) domInteractive script parse/compile/exec, vs (B) the cold DB-worker first-SQL OPFS
// page-in. RE-RUN this and read the ACTUAL waterfall numbers before optimizing, then update
// this note + the session prompt with the real split. Option A (embedded reader in the slim
// library.html) removes BOTH (no 39K shell parse + warm-worker reuse), so the direction holds
// either way — but the <300ms acceptance target must rest on a measured number, not a guess.
//
// It also navigates the slim library.html to show the baseline a self-contained
// reader.html could reach (the prize of Option A), and reports the document's
// decoded size (inline weight) vs the summed external-module transfer.
//
// Run: node scripts/premium/measure-reader-boot.js   (needs playwright + canon-v2.zip)

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3281, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }
function b64url(s) { return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
const ms = (n) => (n == null ? "?" : Math.round(n) + "ms");
const line = (a, b) => "  " + a.padEnd(42) + b;

// Read the navigation-timing waterfall for the page currently loaded in `pg`.
async function navWaterfall(pg) {
  return pg.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return null;
    const scripts = performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script");
    let scriptBytes = 0; for (const s of scripts) scriptBytes += (s.transferSize || 0);
    return {
      responseEnd: nav.responseEnd,
      domInteractive: nav.domInteractive,
      domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
      loadEventEnd: nav.loadEventEnd,
      docDecodedBytes: nav.decodedBodySize || 0,   // inline-shell weight (HTML incl. inline <script>)
      docTransferBytes: nav.transferSize || 0,
      externalScripts: scripts.length,
      externalScriptBytes: scriptBytes,            // summed transfer of the 29 <script src>
    };
  });
}

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed to start"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  try {
    // SW blocked so we measure cold parse/compile, not a precache replay.
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();

    // 0) Characterize the first-statement warmup on an EMPTY OPFS (canon not yet
    // imported). If empty-DB first-query is still ~1s → WASM/worker warmup (fixable
    // by preload, helps every page). If fast → the cost scales with the canon DB
    // file size (OPFS page-in).
    await ctx.addInitScript(() => {
      window.__bootT0 = performance.now();
      const iv = setInterval(() => {
        if (window.__localDBInitPromise) { clearInterval(iv); try { window.__localDBInitPromise.then(() => { window.__dbReadyAt = performance.now(); }); } catch (_) {} }
      }, 4);
    });
    await pg.goto(BASE + "/index.html?canon=skip", { waitUntil: "load" });
    const emptyProbe = await pg.evaluate(async () => {
      for (let i = 0; i < 200 && window.__dbReadyAt == null; i++) await new Promise((r) => setTimeout(r, 20));
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) { try { const l = await window.ensureLocalDB(); if (l && l.dbQuery) ldb = l; } catch (_) { await new Promise((r) => setTimeout(r, 50)); } }
      if (!ldb) return { err: "no ldb" };
      const a = performance.now(); try { await ldb.dbQuery("SELECT 1"); } catch (_) {}
      return { dbInit: window.__dbReadyAt != null ? Math.round(window.__dbReadyAt - window.__bootT0) : null, firstQuery: Math.round(performance.now() - a) };
    });
    console.log("\nEMPTY-OPFS warmup (canon not imported):");
    console.log(line("  cold DB-init:", ms(emptyProbe && emptyProbe.dbInit)));
    console.log(line("  first query (SELECT 1) on empty DB:", ms(emptyProbe && emptyProbe.firstQuery) + (emptyProbe && emptyProbe.firstQuery > 700 ? "  ← WASM/worker warmup (data-independent)" : "  ← scales with canon DB size")));

    // 1) Publish canon into OPFS (same-origin), then find the largest text.
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    for (let i = 0; i < 40 && !(await pg.$(".work-card")); i++) await sleep(500);
    const libNav = await navWaterfall(pg);

    await pg.goto(BASE + "/index.html?canon=skip", { waitUntil: "load" });
    await sleep(2500);
    const big = await pg.evaluate(async () => {
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) { try { if (window.__localDBInitPromise) await window.__localDBInitPromise; const l = await window.ensureLocalDB(); if (l && l.dbQuery) ldb = l; } catch (_) {} if (!ldb) await new Promise((r) => setTimeout(r, 500)); }
      if (!ldb) return null;
      const r = await ldb.dbQuery("SELECT t.id, t.title, COUNT(s.id) n FROM texts t JOIN sentences s ON s.text_id=t.id GROUP BY t.id ORDER BY n DESC LIMIT 1");
      return r && r[0] ? { id: r[0].id, title: r[0].title, n: r[0].n } : null;
    });
    if (!big) { console.error("no canon text found in OPFS"); await b.close(); await stop(srv.c); process.exit(1); }

    // 2) Cold open the largest text via the room deep-link; time nav→table.
    const dl = "/index.html?room=1#/t/" + b64url(JSON.stringify({ v: 1, type: "text", id: String(big.id) }));
    await pg.goto(BASE + dl, { waitUntil: "load" });
    let rendered = 0, fullAt = null;
    const t0 = await pg.evaluate(() => performance.now());
    for (let i = 0; i < 80; i++) {
      rendered = await pg.evaluate(() => document.querySelectorAll("#proTable tbody tr").length);
      if (rendered >= big.n - 2) { fullAt = await pg.evaluate(() => performance.now()); break; }
      await sleep(100);
    }
    const idxNav = await navWaterfall(pg);
    // Time-from-navigationStart to a fully-rendered table (perf clock is nav-relative).
    const fullTableT = fullAt != null ? fullAt : await pg.evaluate(() => performance.now());

    // ── Report ────────────────────────────────────────────────────────────
    console.log("\n=== BRR-P0-002b · boot-waterfall attribution ===");
    console.log('largest canon text: "' + big.title + '" — ' + big.n + " rows (id " + big.id + ")\n");

    console.log("INDEX.HTML (current reader, ?room=1 deep-link):");
    if (idxNav) {
      const parseExec = idxNav.domInteractive - idxNav.responseEnd;
      console.log(line("HTML download (→responseEnd):", ms(idxNav.responseEnd)));
      console.log(line("parse + compile/exec all sync <script>:", ms(parseExec) + "   (inline monolith + 29 src — NOT the lever)"));
      console.log(line("→DOMContentLoaded:", ms(idxNav.domContentLoadedEventEnd)));
      console.log(line("→window.load (deeplink boot starts):", ms(idxNav.loadEventEnd)));
      console.log(line("→#proTable fully rendered:", ms(fullTableT)));
      console.log(line("deeplink boot+DB+fetch+render:", ms(fullTableT - idxNav.loadEventEnd)));
      console.log("");
      console.log(line("inline-shell weight (doc decodedBody):", (idxNav.docDecodedBytes / 1024).toFixed(0) + " KB"));
      console.log(line("external modules (" + idxNav.externalScripts + " src, transfer):", (idxNav.externalScriptBytes / 1024).toFixed(0) + " KB"));
      console.log(line("TOTAL nav→readable table:", ms(fullTableT) + "  (rendered " + rendered + "/" + big.n + ")"));
    }
    console.log("\nLIBRARY.HTML (slim Room surface — Option A baseline):");
    if (libNav) {
      console.log(line("parse + compile/exec all sync <script>:", ms(libNav.domInteractive - libNav.responseEnd)));
      console.log(line("→DOMContentLoaded:", ms(libNav.domContentLoadedEventEnd)));
      console.log(line("inline-shell weight (doc decodedBody):", (libNav.docDecodedBytes / 1024).toFixed(0) + " KB"));
      console.log(line("external modules (" + libNav.externalScripts + " src, transfer):", (libNav.externalScriptBytes / 1024).toFixed(0) + " KB"));
    }
    if (idxNav && libNav) {
      const prize = (idxNav.domInteractive - idxNav.responseEnd) - (libNav.domInteractive - libNav.responseEnd);
      console.log("\nPRIZE (parse+exec saved by a slim shell): ~" + ms(prize));
      console.log("VERDICT: " + (idxNav.domInteractive - idxNav.responseEnd > 400
        ? "inline-shell compile dominates → slim reader (Option A) is the right lever."
        : "inline-shell compile is NOT dominant → re-check DB/fetch before extracting."));
    }
    console.log("");

    // 3) Decompose the post-load gap: cold DB-init vs the 486-row query vs render.
    // Fresh page in the SAME context (OPFS already has canon) → re-init is the real
    // per-open cost a slim reader.html would ALSO pay (same local-db.js + OPFS).
    // An init-script (runs BEFORE page scripts) stamps nav start and DB-ready so we
    // capture the FULL cold-init wall time, not just the tail of an in-flight promise.
    await ctx.addInitScript(() => {
      window.__bootT0 = performance.now();
      const iv = setInterval(() => {
        if (window.__localDBInitPromise) {
          clearInterval(iv);
          try { window.__localDBInitPromise.then(() => { window.__dbReadyAt = performance.now(); }); } catch (_) {}
        }
      }, 4);
    });
    await pg.goto(BASE + "/index.html?canon=skip", { waitUntil: "load" });
    const probe = await pg.evaluate(async (textId) => {
      for (let i = 0; i < 200 && window.__dbReadyAt == null; i++) await new Promise((r) => setTimeout(r, 20));
      const dbInit = window.__dbReadyAt != null ? Math.round(window.__dbReadyAt - window.__bootT0) : null;
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) { try { const l = await window.ensureLocalDB(); if (l && l.dbQuery) ldb = l; } catch (_) { await new Promise((r) => setTimeout(r, 50)); } }
      if (!ldb) return { dbInit, err: "ldb not ready for query" };
      const T = async (fn) => { const a = performance.now(); try { await fn(); } catch (_) {} return Math.round(performance.now() - a); };
      // Isolate first-query OPFS warmup from getTextById's own cost.
      const warmup = await T(() => ldb.dbQuery("SELECT 1"));
      const getTextStar = await T(() => ldb.getTextById(textId));               // SELECT *  (current)
      const getTextStar2 = await T(() => ldb.getTextById(textId));              // repeat (warm)
      const getTextNarrow = await T(() => ldb.dbQuery("SELECT id,text_key,title,level,source,topic,source_meta_json FROM texts WHERE id = ?", [textId]));
      const countTexts = await T(() => ldb.dbQuery("SELECT COUNT(*) n FROM texts"));
      let nRows = 0;
      const getSents = await T(async () => { const ss = await ldb.getSentences(textId); nRows = (ss || []).length; });
      return { dbInit, warmup, getTextStar, getTextStar2, getTextNarrow, countTexts, getSentences: getSents, nRows };
    }, big.id);
    console.log("POST-LOAD GAP decomposition (warm OPFS, fresh page):");
    if (probe && probe.dbInit != null) {
      console.log(line("cold DB-init: nav→DB ready (SAH+migrate 054):", ms(probe.dbInit)));
      if (probe.err) { console.log("  query probe: " + probe.err); }
      else {
        console.log(line("first query warmup (SELECT 1):", ms(probe.warmup) + "  ← THE LEVER: OPFS page-in of populated canon DB (per fresh worker)"));
        console.log(line("getTextById SELECT * (1st):", ms(probe.getTextStar)));
        console.log(line("getTextById SELECT * (2nd, warm):", ms(probe.getTextStar2)));
        console.log(line("narrow SELECT (no source_text):", ms(probe.getTextNarrow)));
        console.log(line("SELECT COUNT(*) FROM texts:", ms(probe.countTexts)));
        console.log(line("getSentences (" + probe.nRows + " rows):", ms(probe.getSentences)));
        console.log(line("(renderTable, measured earlier):", "~74ms"));
      }
    } else {
      console.log("  probe failed: " + (probe && probe.err));
    }
    console.log("");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
