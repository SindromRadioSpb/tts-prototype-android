#!/usr/bin/env node
// scripts/notes-graph/kmap-data-smoke.js — Knowledge Map v3.8 Phase 1.
//
// Verifies the root-centric data layer (public/js/knowledge-map-data.js)
// against a small deterministic fixture. Mocks __localDB.dbQuery (notes_v2)
// + __localDB.getLearningStateOverlay (status). No DOM/d3 needed.
//
// Fixture (5 notes, 2 roots + 1 root-less, one lemma repeated for frequency):
//   N1 כתב/כותב paal verb  T1  status=known
//   N2 כתב/מכתב  -    noun  T1  status=learning
//   N3 כתב/כותב paal verb  T2  status=(none→new)   ← same lemma כותב as N1
//   N4 למד/לומד paal verb  T2  status=(none→new)
//   N5 (no root) את  preposition                     ← root-less, excluded
//
// Cases:
//   1. node = DISTINCT lemma (כותב appears in N1+N3 → 1 node, freq=2).
//   2. root-less note excluded from clusters; counted in stats.rootless.
//   3. root cluster groups lemmas (כתב → {כותב, מכתב}); edges root→lemma.
//   4. status aggregation (כותב: known+new → learning; root כתב → learning).
//   5. rankRoots is frequency-ordered & content-weighted (כתב > למד; no את).
//   6. determinism (build twice → identical) + no pageerror.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3221;
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

const MOCK_DB = `
  window.__localDBInitPromise = Promise.resolve();
  window.__localDBInitError = null;
  window.__localDB = {
    isReady: function () { return true; },
    dbQuery: async function (sql) {
      if (/FROM notes_v2/i.test(sql)) return [
        { id:"N1", text_id:"T1", note_type:"word_study", j_root:"כתב", j_binyan:"paal", j_word:"כותב", j_pos:"verb" },
        { id:"N2", text_id:"T1", note_type:"word_study", j_root:"כתב", j_binyan:null,   j_word:"מכתב", j_pos:"noun" },
        { id:"N3", text_id:"T2", note_type:"word_study", j_root:"כתב", j_binyan:"paal", j_word:"כותב", j_pos:"verb" },
        { id:"N4", text_id:"T2", note_type:"word_study", j_root:"למד", j_binyan:"paal", j_word:"לומד", j_pos:"verb" },
        { id:"N5", text_id:"T1", note_type:"word_study", j_root:null,   j_binyan:null,   j_word:"את",   j_pos:"preposition" }
      ];
      return [];
    },
    getLearningStateOverlay: async function () {
      return { N1: "known", N2: "learning" }; // N3/N4 absent → new
    }
  };
  window.MorphNormalize = { normalizeHebrew: function (w) { return String(w||"").replace(/[\\u0591-\\u05C7]/g,"").trim(); } };
`;

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[kmap-data-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[kmap-data-smoke] server failed");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[kmap-data-smoke] server up");

  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: MOCK_DB });
    await pg.addScriptTag({ url: "/js/knowledge-map-data.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMapData, null, { timeout: 5000 });

    const r = await pg.evaluate(async () => {
      const idx = await window.KnowledgeMapData.build();
      const idx2 = await window.KnowledgeMapData.build();
      const lemma = (raw) => idx.lemmas.find((l) => l.rawId === raw);
      const root = (raw) => idx.roots.find((r) => r.rawId === raw);
      const cluster = await window.KnowledgeMapData.rootCluster("כתב", { _index: idx });
      const ranked = await window.KnowledgeMapData.rankRoots({ _index: idx });
      const edgeOf = (rraw, lraw) => idx.edges.find((e) =>
        e.source === "root:" + rraw && e.target === "word:" + lraw);
      return {
        stats: idx.stats,
        kotev: lemma("כותב"),
        michtav: lemma("מכתב"),
        rootKtv: root("כתב"),
        rootLmd: root("למד"),
        clusterLemmas: cluster.lemmas.map((l) => l.rawId).sort(),
        clusterEdges: cluster.edges.length,
        edgeKtvKotev: edgeOf("כתב", "כותב"),
        ranked: ranked.map((x) => x.rawId),
        deterministic: JSON.stringify(idx) === JSON.stringify(idx2),
      };
    });

    test("Case 1: node = distinct lemma (כותב freq=2, single node)",
      r.kotev && r.kotev.freq === 2, JSON.stringify(r.kotev));

    test("Case 2: root-less note excluded; stats.rootless=1, distinctRoots=2",
      r.stats.rootless === 1 && r.stats.distinctRoots === 2 &&
      r.stats.distinctLemmas === 3 && r.stats.teachableRoots === 1,
      JSON.stringify(r.stats));

    test("Case 3: root cluster groups lemmas (כתב → כותב+מכתב); 2 root→lemma edges",
      r.clusterLemmas.length === 2 &&
      r.clusterLemmas.includes("כותב") && r.clusterLemmas.includes("מכתב") &&
      r.clusterEdges === 2,
      JSON.stringify({ clusterLemmas: r.clusterLemmas, clusterEdges: r.clusterEdges }));

    test("Case 4: status aggregation (כותב known+new→learning; root כתב→learning; michtav learning)",
      r.kotev.status === "learning" && r.rootKtv.status === "learning" &&
      r.michtav.status === "learning",
      JSON.stringify({ kotev: r.kotev.status, rootKtv: r.rootKtv.status, michtav: r.michtav.status }));

    test("Case 5: edge label = binyan for verb (כתב→כותב = paal); rankRoots freq-ordered & content-weighted",
      r.edgeKtvKotev && r.edgeKtvKotev.label === "paal" &&
      r.ranked[0] === "כתב" && r.ranked[1] === "למד" && r.ranked.indexOf("את") === -1,
      JSON.stringify({ edge: r.edgeKtvKotev, ranked: r.ranked }));

    test("Case 6: deterministic (build twice identical) + no pageerror",
      r.deterministic === true && errs.length === 0,
      JSON.stringify({ deterministic: r.deterministic, errs }));

    await pg.close(); await ctx.close();
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[kmap-data-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[kmap-data-smoke] fatal:", e); process.exit(1); });
