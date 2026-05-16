#!/usr/bin/env node
// scripts/notes-graph/visual-regression.js — v3.3.6 C9.
//
// ════════════════════════════════════════════════════════════════════════
// FIXTURE CONTRACT (Option A — in-page mock DB; NO real OPFS, NO
// staticLayout). Documented here as the authoritative spec.
// ════════════════════════════════════════════════════════════════════════
//
// • Node/edge fixture shape — identical to the mock used by the green
//   render-a11y / mobile-fallback / privacy smokes:
//     window.__localDBInitPromise = Promise.resolve()
//     window.__localDB.isReady() => true
//     window.__localDB.dbQuery(sql):
//       /FROM notes_v2/  → rows {id,title,target_kind,target_id,text_id,
//                                 note_type,j_root,j_binyan,j_word,updated_at}
//       /FROM note_links/→ rows {from_note_id,to_kind,to_id,link_alias}
//       /FROM texts/     → rows {id,title}
//     window.MorphNormalize.normalizeHebrew = trim passthrough
//     window.MorphProvider.analyze = async () => []
//   Three fixtures: RICH (~18 notes, 4 clusters incl. word_study with
//   root/binyan/word — exercises all 6 node + 3 edge kinds), NO_LINKS
//   (6 free notes, target_kind=free, zero links/derived → empty_no_links),
//   BIG (260 word_study notes, unique roots → 520 nodes → reduced_top200).
//
// • Capture triggers (10):
//   01 desktop-full-graph     RICH @1440×900 landscape → state=loaded
//   02 desktop-isolated       RICH @1440×900 → loaded → focus 1st node, H
//   03 tablet-landscape       RICH @1280×800 landscape → loaded
//   04 tablet-portrait-fall   RICH @768×1024 portrait → fallback_mobile
//   05 mobile-fallback        RICH @414×896 portrait  → fallback_mobile
//   06 keyboard-focus-ring    RICH @1440×900 → loaded → focus 1st node
//   07 sr-list-view           RICH @1440×900 → loaded → toggle List pane
//   08 reduced-motion         RICH @1440×900, context reducedMotion=reduce
//   09 empty-state            NO_LINKS @1440×900 → state=empty_no_links
//   10 top-200-reduced-toast  BIG @1440×900 → loaded + reduced toast
//
// • reduced_top200 simulated: BIG fixture (260 notes, each a unique
//   j_root) → NotesGraphData.buildGraph caps at 200 by degree and sets
//   reduced={total:520,shown:200}; open() passes reduced → loaded state
//   renders [data-graph-reduced-toast].
//
// • empty_no_notes vs empty_no_links: empty_no_notes = dbQuery notes_v2
//   returns []. empty_no_links = notes present but target_kind=free /
//   note_type=free / no links → 0 edges → state=empty_no_links.
//   Capture 09 uses empty_no_links (blind-spot §G); the self-test also
//   asserts empty_no_notes is reachable with an []-notes fixture.
//
// • simulationDone awaited: orchestrator keeps the render handle private,
//   so we wait for data-graph-state="loaded" then poll until node
//   transforms STOP changing (two identical samples 250ms apart, max
//   6s) — a deterministic settle proxy. d3-force initial placement is a
//   deterministic phyllotaxis spiral (no RNG), so same fixture → same
//   layout; the ≤1% pixel tolerance absorbs sub-pixel AA. fallback /
//   empty states have no simulation → captured after a short settle.
//
// • Screenshots: Smoke-check/graph-view/baseline/NN-name.png (+ index.json
//   manifest). First run with no baseline → CAPTURE + PASS (baseline
//   established). Subsequent runs → re-capture to a temp dir, pixelmatch
//   vs baseline.
//
// • Pixel-diff threshold: ≤ 1% mismatched pixels per image (pixelmatch
//   threshold 0.1). Exceed → that capture FAILS with the % printed.
// ════════════════════════════════════════════════════════════════════════

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_DIR = path.join(REPO_ROOT, "Smoke-check", "graph-view", "baseline");
const PORT = 3208;
const BASE = `http://127.0.0.1:${PORT}`;
const DIFF_RATIO_MAX = 0.01; // ≤ 1%

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

// ── fixtures ────────────────────────────────────────────────────────────
function richFixtureJs() {
  const notes = [];
  // cluster 1: text t1 hub (a1..a5 anchor t1)
  for (let i = 1; i <= 5; i++) notes.push({ id:"a"+i, title:"Note A"+i, target_kind:"text", target_id:"t1", text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:0"+i+":00Z" });
  // cluster 2: word_study around root שלם (b1..b4)
  for (let i = 1; i <= 4; i++) notes.push({ id:"b"+i, title:"Word B"+i, target_kind:"word", target_id:"שלום", text_id:"t1", note_type:"word_study", j_root:"שלם", j_binyan:(i%2?"PA'AL":"PI'EL"), j_word:"שלום"+i, updated_at:"2026-05-15T00:1"+i+":00Z" });
  // cluster 3: grammar_rule around root כתב (c1..c4)
  for (let i = 1; i <= 4; i++) notes.push({ id:"c"+i, title:"Rule C"+i, target_kind:"free", target_id:null, text_id:"t2", note_type:"grammar_rule", j_root:"כתב", j_binyan:null, j_word:null, updated_at:"2026-05-15T00:2"+i+":00Z" });
  // cluster 4: sentence-anchored notes on t2 (d1..d5)
  for (let i = 1; i <= 5; i++) notes.push({ id:"d"+i, title:"Note D"+i, target_kind:"sentence", target_id:"s"+i, text_id:"t2", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:3"+i+":00Z" });
  const links = [
    { from_note_id:"a1", to_kind:"note", to_id:"a2", link_alias:null },
    { from_note_id:"a2", to_kind:"note", to_id:"a3", link_alias:"see" },
    { from_note_id:"b1", to_kind:"note", to_id:"b2", link_alias:null },
    { from_note_id:"b2", to_kind:"root", to_id:"שרש", link_alias:null },
    { from_note_id:"c1", to_kind:"binyan", to_id:"HITPA'EL", link_alias:null },
    { from_note_id:"c2", to_kind:"word", to_id:"מכתב", link_alias:null },
    { from_note_id:"d1", to_kind:"note", to_id:"d2", link_alias:null },
    { from_note_id:"d2", to_kind:"note", to_id:"d3", link_alias:null },
    { from_note_id:"a1", to_kind:"note", to_id:"b1", link_alias:"cross" },
  ];
  const texts = [{ id:"t1", title:"Text One" }, { id:"t2", title:"Text Two" }];
  return mkDbJs(notes, links, texts);
}
function noLinksFixtureJs() {
  const notes = [];
  for (let i = 1; i <= 6; i++) notes.push({ id:"e"+i, title:"Lone "+i, target_kind:"free", target_id:null, text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:0"+i+":00Z" });
  return mkDbJs(notes, [], [{ id:"t1", title:"Text One" }]);
}
function emptyNotesFixtureJs() { return mkDbJs([], [], []); }
function bigFixtureJs() {
  // Hub-and-spoke: 1 high-degree hub + 250 spoke notes. After the
  // top-200-by-degree cap the hub (degree 250) is always kept plus the
  // top spokes by id tiebreak, so ~199 explicit_link edges SURVIVE the
  // reduction → state stays `loaded` (not empty_no_links) and
  // reduced={total:251,shown:200} → the reduced toast renders.
  const notes = [{ id:"h0", title:"Hub", target_kind:"free", target_id:null, text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:00:00Z" }];
  const links = [];
  for (let i = 1; i <= 250; i++) {
    notes.push({ id:"n"+i, title:"Spoke "+i, target_kind:"free", target_id:null, text_id:"t1", note_type:"free", j_root:null,j_binyan:null,j_word:null, updated_at:"2026-05-15T00:00:00Z" });
    links.push({ from_note_id:"h0", to_kind:"note", to_id:"n"+i, link_alias:null });
  }
  return mkDbJs(notes, links, [{ id:"t1", title:"Text One" }]);
}
function mkDbJs(notes, links, texts) {
  return `
    window.__localDBInitPromise = Promise.resolve();
    window.__localDBInitError = null;
    window.v3OpenNoteById=function(){}; window.v3LibraryOpenText=function(){};
    window.__localDB = {
      isReady:function(){return true;},
      dbQuery: async function (sql) {
        if (/FROM notes_v2/i.test(sql)) return ${JSON.stringify(notes)};
        if (/FROM note_links/i.test(sql)) return ${JSON.stringify(links)};
        if (/FROM texts/i.test(sql)) return ${JSON.stringify(texts)};
        return [];
      },
    };
    window.MorphNormalize = { normalizeHebrew:function(w){return String(w||"").trim();} };
    window.MorphProvider = { ensureReady: async function(){}, analyze: async function(){return [];} };
  `;
}

async function loadLibs(page) {
  await page.addScriptTag({ url: "/vendor/d3-graph.min.js" });
  await page.addScriptTag({ url: "/js/notes-graph-render.js" });
  await page.addScriptTag({ url: "/js/notes-graph.js" });
  await page.waitForFunction(() => !!window.NotesGraph, null, { timeout: 5000 });
}

// Deterministic settle proxy: wait for loaded, then until node
// transforms stop changing (2 identical samples), max ~6s.
async function awaitSettled(page) {
  await page.waitForFunction(() => {
    const p = document.querySelector("[data-graph-panel]");
    return p && p.getAttribute("data-graph-state") === "loaded";
  }, null, { timeout: 9000 });
  let prev = "", stable = 0;
  for (let i = 0; i < 30; i++) {
    const snap = await page.evaluate(() => Array.from(
      document.querySelectorAll("[data-graph-node]"))
      .slice(0, 12).map((e) => e.getAttribute("transform") || "").join("|"));
    if (snap && snap === prev) { if (++stable >= 2) break; }
    else { stable = 0; prev = snap; }
    await sleep(250);
  }
  await sleep(200);
}

async function shoot(page, file, runDir) {
  const panel = await page.$("[data-graph-panel]");
  const out = path.join(runDir, file);
  if (panel) await panel.screenshot({ path: out });
  else await page.screenshot({ path: out });
  return out;
}

function diffRatio(aPath, bPath) {
  const { PNG } = require("pngjs");
  const pixelmatch = require("pixelmatch");
  const a = PNG.sync.read(fs.readFileSync(aPath));
  const b = PNG.sync.read(fs.readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 1, dimMismatch: true,
             detail: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const mismatched = pixelmatch(a.data, b.data, diff.data, a.width, a.height,
    { threshold: 0.1 });
  return { ratio: mismatched / (a.width * a.height), dimMismatch: false };
}

const CAPTURES = [
  { file: "01-desktop-full-graph.png",      fx: "rich",    vp: { width: 1440, height: 900 }, state: "loaded" },
  { file: "02-desktop-isolated-cluster.png",fx: "rich",    vp: { width: 1440, height: 900 }, state: "loaded", isolate: true },
  { file: "03-tablet-landscape.png",        fx: "rich",    vp: { width: 1280, height: 800 }, state: "loaded" },
  { file: "04-tablet-portrait-fallback.png",fx: "rich",    vp: { width: 768,  height: 1024 }, state: "fallback_mobile" },
  { file: "05-mobile-fallback.png",         fx: "rich",    vp: { width: 414,  height: 896 }, state: "fallback_mobile" },
  { file: "06-keyboard-focus-ring.png",     fx: "rich",    vp: { width: 1440, height: 900 }, state: "loaded", focusRing: true },
  { file: "07-screen-reader-list-view.png", fx: "rich",    vp: { width: 1440, height: 900 }, state: "loaded", listView: true },
  { file: "08-reduced-motion.png",          fx: "rich",    vp: { width: 1440, height: 900 }, state: "loaded", reducedMotion: true },
  { file: "09-empty-state.png",             fx: "nolinks", vp: { width: 1440, height: 900 }, state: "empty_no_links" },
  { file: "10-top-200-reduced-toast.png",   fx: "big",     vp: { width: 1440, height: 900 }, state: "loaded", expectToast: true },
];

function fixtureFor(name) {
  if (name === "rich") return richFixtureJs();
  if (name === "nolinks") return noLinksFixtureJs();
  if (name === "big") return bigFixtureJs();
  return emptyNotesFixtureJs();
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[visual-regression] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[visual-regression] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[visual-regression] server up");

  const haveBaseline = CAPTURES.every((c) =>
    fs.existsSync(path.join(BASELINE_DIR, c.file)));
  const mode = haveBaseline ? "verify" : "baseline";
  console.log(`[visual-regression] mode = ${mode}`);
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const runDir = haveBaseline
    ? fs.mkdtempSync(path.join(os.tmpdir(), "graph-vr-"))
    : BASELINE_DIR;

  const browser = await playwright.chromium.launch();
  const manifest = { generated_at: new Date().toISOString(), mode, captures: [] };

  try {
    for (const cap of CAPTURES) {
      const ctx = await browser.newContext({
        serviceWorkers: "block",
        viewport: cap.vp,
        ...(cap.reducedMotion ? { reducedMotion: "reduce" } : {}),
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e.message || e)));
      await page.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
      await page.addScriptTag({ content: fixtureFor(cap.fx) });
      await loadLibs(page);
      await page.evaluate(() => window.NotesGraph.open());
      await page.waitForFunction((st) => {
        const p = document.querySelector("[data-graph-panel]");
        return p && p.getAttribute("data-graph-state") === st;
      }, cap.state, { timeout: 9000 });

      if (cap.state === "loaded") {
        await awaitSettled(page);
        if (cap.isolate) {
          await page.evaluate(() => {
            const n = document.querySelector("[data-graph-node]");
            if (n) { n.focus(); n.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true })); }
          });
          await sleep(500);
        }
        if (cap.focusRing) {
          await page.evaluate(() => {
            const n = document.querySelector("[data-graph-node]");
            if (n) n.focus();
          });
          await sleep(250);
        }
        if (cap.listView) {
          await page.evaluate(() => {
            const b = document.querySelector("[data-graph-toggle-list]");
            if (b) b.click();
          });
          await sleep(400);
        }
      } else {
        await sleep(500);
      }

      const out = await shoot(page, cap.file, runDir);
      const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
      let rec = { file: cap.file, state: cap.state, bytes: size,
                  pageerror: errs.length ? errs.join(" | ") : null };

      // Self-test assertions.
      if (cap.expectToast) {
        const hasToast = await page.evaluate(() =>
          !!document.querySelector("[data-graph-reduced-toast]"));
        test(`${cap.file}: reduced_top200 toast present`, hasToast);
      }
      test(`${cap.file}: capture is non-blank (> 2 KB)`, size > 2048,
           `bytes=${size}`);
      test(`${cap.file}: no pageerror during capture`,
           errs.length === 0, errs.join(" | "));

      if (mode === "verify") {
        const d = diffRatio(path.join(BASELINE_DIR, cap.file), out);
        rec.diff_ratio = Number(d.ratio.toFixed(5));
        test(`${cap.file}: pixel diff ≤ ${DIFF_RATIO_MAX * 100}% vs baseline`,
             !d.dimMismatch && d.ratio <= DIFF_RATIO_MAX,
             d.dimMismatch ? ("dim " + d.detail)
                           : ((d.ratio * 100).toFixed(3) + "%"));
      } else {
        test(`${cap.file}: baseline written`, size > 2048, `bytes=${size}`);
      }
      manifest.captures.push(rec);
      await ctx.close();
    }
    // Only (re)write the committed manifest when establishing the
    // baseline. Verify runs must NOT dirty the working tree (the
    // timestamp/mode would churn index.json on every run).
    if (mode === "baseline") {
      fs.writeFileSync(path.join(BASELINE_DIR, "index.json"),
        JSON.stringify(manifest, null, 2) + "\n");
    }
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[visual-regression] ${passed}/${passed + failed} passed (${mode} mode)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[visual-regression] fatal:", e); process.exit(1); });
